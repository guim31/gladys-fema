// -----------------------------------------------------------------------------
// The monitor: reads the FEMA declarations of the followed counties every
// `refresh_interval` minutes, publishes the states of their devices, fires the
// scene triggers and serves the widget and the actions.
//
// Followed counties: the FIPS codes of the configuration, or else the county
// of the first located house of Gladys, found through the FCC Area API (the
// coordinates, rounded to about 100 m, are sent once, then again only when the
// house moves).
//
// Triggers, per county: "new declaration" when a declaration made in the last
// 90 days appears, "Individual Assistance opened" when a declaration offers
// it (at once, or by a later amendment). The declarations already there when a
// county is first followed fire nothing: they are not news. What was seen is
// kept under /data, so a restart fires nothing either.
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat
// every 12 hours. The coordinates of the house are never logged.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { countyOf } from './counties.js';
import { MAX_COUNT, buildDevice, deviceIds } from './device.js';
import {
  ASSISTANCE_SITE,
  fetchCountyAt,
  fetchDeclarations,
  registrationOpen,
  summarize,
} from './openfema.js';
import {
  PHRASES,
  STATUS,
  TYPE_NAMES,
  formatDay,
  incidentName,
  incidentOf,
  join,
  render,
  shortId,
} from './messages.js';

const logger = createLogger({ name: 'fema' });

export const WIDGET_KEY = 'declarations';
export const TRIGGERS = { NEW: 'new_declaration', ASSISTANCE: 'individual_assistance_opened' };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_TIMINGS = {
  heartbeatMs: 12 * HOUR,
  // A declaration older than this is never news (FEMA publishes within days).
  newsMaxAgeMs: 90 * DAY,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
  // The houses of Gladys are read again this often (no update event).
  housesMaxAgeMs: HOUR,
};

// Scene events fired by one cycle at most: the core takes 300 a minute.
export const MAX_EVENTS_PER_CYCLE = 20;

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch: fetchImpl, timers = true, now, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.data = emptyData();
    // The followed counties (src/counties.js), and their last successful reading.
    this.counties = [];
    this.results = new Map();
    this.lastSuccessAt = null;
    this.lastCycleAt = -Infinity;
    // The house, its county and how it was found: ok, none, outside, down.
    this.house = undefined;
    this.houseReadAt = -Infinity;
    this.houseCounty = { key: null, fips: null };
    this.houseState = 'ok';
    this.statusMessage = undefined;
    this.discovered = null;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    // null: the first successful cycle always nudges the widget.
    this.signature = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1 && saved.counties && typeof saved.counties === 'object') {
      this.data = { ...emptyData(), ...saved };
    }
    this.warnAboutConfig();
    logger.info(`Started: FEMA declarations read every ${config.refreshMinutes} min`);
    this.schedule();
    this.runCycle();
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    this.houseReadAt = -Infinity;
    this.discovered = null;
    await this.publishDiscovered();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates();
    this.requestRefresh();
  }

  async reconfigure(config) {
    // A cycle already running finishes with the old configuration, whole.
    await this.running;
    const languageChanged = config.language !== this.config?.language;
    this.config = config;
    this.houseReadAt = -Infinity;
    logger.info('Configuration saved');
    this.warnAboutConfig();
    if (languageChanged) {
      this.discovered = null;
    }
    this.schedule();
    await this.runCycle();
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.config.refreshMinutes * MINUTE);
    this.cycleTimer.unref?.();
  }

  warnAboutConfig() {
    const { invalidCounties, droppedCounties } = this.config;
    if (invalidCounties.length > 0) {
      logger.warn(`Not a county FIPS code, ignored: ${invalidCounties.join(', ')}`);
    }
    if (droppedCounties.length > 0) {
      logger.warn(`More than 8 counties, ignored: ${droppedCounties.join(', ')}`);
    }
  }

  /** Publish the devices of the followed counties, when they changed. */
  async publishDiscovered() {
    const key = JSON.stringify([this.config.language, this.counties.map((c) => c.fips)]);
    if (key === this.discovered) {
      return;
    }
    await this.gladys.publishDiscoveredDevices(
      this.counties.map((county) => buildDevice(this.gladys, county, this.config.language)),
    );
    this.discovered = key;
  }

  /** The device of a county as Gladys has it (created by the user), or undefined. */
  createdDevice(fips) {
    const id = deviceIds(this.gladys, fips).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === id);
  }

  /** The name of a county as the user sees it: the name of its device in Gladys. */
  displayName(county) {
    return this.createdDevice(county.fips)?.name || county.label;
  }

  // --- Counties ----------------------------------------------------------------

  /** The followed counties: the configured ones, else the county of the house. */
  async resolveCounties() {
    if (this.config.counties.length > 0) {
      this.houseState = 'ok';
      return this.config.counties.map(countyOf);
    }
    const house = await this.readHouse();
    if (!house) {
      this.houseState = 'none';
      return [];
    }
    const key = `${house.latitude.toFixed(3)},${house.longitude.toFixed(3)}`;
    if (key !== this.houseCounty.key) {
      try {
        const fips = await fetchCountyAt(this.fetch, house.latitude, house.longitude);
        this.houseCounty = { key, fips };
        this.recovered('geocoder', 'The FCC Area API answers again');
        if (fips && countyOf(fips)) {
          logger.info(`County of the house: ${countyOf(fips).label}`);
        }
      } catch (err) {
        this.failed('geocoder', 'warn', `Cannot find the county of the house: ${err.message}`);
        // The county found before, if any, is kept until the API answers.
        if (this.houseCounty.fips === null) {
          this.houseState = 'down';
          return [];
        }
      }
    }
    const county = this.houseCounty.fips ? countyOf(this.houseCounty.fips) : null;
    this.houseState = county ? 'ok' : 'outside';
    return county ? [county] : [];
  }

  async readHouse() {
    if (this.now() - this.houseReadAt >= this.timings.housesMaxAgeMs) {
      try {
        const houses = await this.gladys.getHouses();
        this.house =
          houses.find(
            (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude),
          ) ?? null;
        this.houseReadAt = this.now();
        this.recovered('houses', 'The houses of Gladys are readable again');
      } catch (err) {
        this.failed('houses', 'warn', `Cannot read the houses of Gladys: ${err.message}`);
      }
    }
    return this.house ?? null;
  }

  // --- Cycles ------------------------------------------------------------------

  runCycle() {
    if (this.running || this.stopped) {
      return this.running;
    }
    this.running = this.cycle()
      .catch((err) => this.failed('cycle', 'error', 'Refresh cycle failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    this.lastCycleAt = this.now();
    this.counties = await this.resolveCounties();
    await this.publishDiscovered();
    for (const fips of this.results.keys()) {
      if (!this.counties.some((county) => county.fips === fips)) {
        this.results.delete(fips);
      }
    }
    let failure = null;
    let fired = 0;
    for (const county of this.counties) {
      try {
        const declarations = await fetchDeclarations(this.fetch, county);
        this.results.set(county.fips, {
          declarations,
          summary: summarize(declarations, this.now()),
        });
        fired += await this.detectChanges(county, declarations, MAX_EVENTS_PER_CYCLE - fired);
      } catch (err) {
        failure = err;
      }
    }
    this.forgetUnfollowed();
    this.store.save(this.data);
    if (failure) {
      this.failed('openfema', 'warn', `OpenFEMA unreachable: ${failure.message}`);
    } else if (this.counties.length > 0) {
      this.recovered('openfema', 'OpenFEMA answers again');
    }
    if (this.results.size > 0 && !failure) {
      this.lastSuccessAt = this.now();
    }
    logger.debug(`Refresh cycle: ${this.counties.length} county(ies) read`);
    this.recovered('cycle', 'Refresh cycles work again');
    await this.publishStates();
    await this.updateConnectionStatus();
    const signature = JSON.stringify(
      [...this.results].map(([fips, { summary }]) => [
        fips,
        summary.latest?.id ?? null,
        summary.active.map((declaration) => declaration.id),
        summary.individual,
      ]),
    );
    if (signature !== this.signature) {
      this.signature = signature;
      this.requestRefresh();
    }
  }

  /** A county no longer followed is forgotten: followed again, it starts afresh. */
  forgetUnfollowed() {
    for (const fips of Object.keys(this.data.counties)) {
      if (!this.counties.some((county) => county.fips === fips)) {
        delete this.data.counties[fips];
      }
    }
  }

  /** Fire the scene triggers of a county, and remember what was seen. Returns the count fired. */
  async detectChanges(county, declarations, budget) {
    const now = this.now();
    const recent = declarations
      .filter((declaration) => now - declaration.declaredAt <= this.timings.newsMaxAgeMs)
      // Oldest first: the scenes get the declarations in the order they were made.
      .reverse();
    const entry = this.data.counties[county.fips];
    const remember = (known) =>
      Object.fromEntries(
        recent.map((declaration) => [
          declaration.id,
          {
            declaredAt: declaration.declaredAt,
            individual:
              registrationOpen(declaration, now) || known?.[declaration.id]?.individual === true,
          },
        ]),
      );
    if (!entry) {
      // First reading of this county: what FEMA lists now is not news.
      this.data.counties[county.fips] = { known: remember() };
      logger.debug(`${county.label}: ${recent.length} recent declaration(s) taken as known`);
      return 0;
    }
    const changes = [];
    for (const declaration of recent) {
      const before = entry.known[declaration.id];
      if (!before) {
        changes.push({ key: TRIGGERS.NEW, declaration });
      }
      if (registrationOpen(declaration, now) && before?.individual !== true) {
        changes.push({ key: TRIGGERS.ASSISTANCE, declaration });
      }
    }
    entry.known = remember(entry.known);
    let fired = 0;
    for (const change of changes) {
      if (fired >= budget) {
        logger.debug(`${changes.length - fired} more change(s) not sent to the scenes`);
        break;
      }
      await this.fire(county, change);
      fired += 1;
    }
    return fired;
  }

  async fire(county, { key, declaration }) {
    logger.info(
      key === TRIGGERS.NEW
        ? `New declaration for ${county.label}: ${declaration.id} ${declaration.title}`
        : `Individual Assistance opened for ${county.label}: ${declaration.id}`,
    );
    try {
      await this.gladys.publishSceneEvent(key, this.eventData(county, key, declaration));
      this.recovered('scene', 'Scene triggers work again');
    } catch (err) {
      this.failed('scene', 'warn', `Firing the scene trigger failed: ${err.message}`);
    }
  }

  /** The flat data of a scene event (fields, then variables of the manifest). */
  eventData(county, key, declaration) {
    const language = this.config.language;
    const phrases = PHRASES[language];
    const now = this.now();
    const deadline =
      declaration.registrationDeadline === null
        ? null
        : formatDay(declaration.registrationDeadline, language);
    const common = {
      county: deviceIds(this.gladys, county.fips).device,
      county_name: county.label,
      declaration_id: declaration.id,
      incident_type_name: incidentName(declaration.incidentType, language),
      title: declaration.title,
      url: declaration.url,
    };
    if (key === TRIGGERS.ASSISTANCE) {
      return {
        ...common,
        deadline,
        summary: phrases.assistanceSummary({
          county: county.label,
          what: incidentOf(declaration, language),
          id: shortId(declaration),
          register: deadline ? phrases.register({ date: deadline }) : phrases.registerOpen,
        }),
        registration_url: ASSISTANCE_SITE,
      };
    }
    return {
      ...common,
      declaration_type: declaration.type,
      declaration_type_name: TYPE_NAMES[language][declaration.type],
      incident_type: declaration.incidentType,
      declaration_date: formatDay(declaration.declaredAt, language),
      individual_assistance: registrationOpen(declaration, now),
      summary: phrases.newSummary({
        county: county.label,
        type: TYPE_NAMES[language][declaration.type],
        what: incidentOf(declaration, language),
        id: shortId(declaration),
        date: formatDay(declaration.declaredAt, language),
      }),
    };
  }

  // --- States ------------------------------------------------------------------

  /** The states of the device of a county, from its last successful reading. */
  statesOf(fips) {
    const result = this.results.get(fips);
    if (!result) {
      return [];
    }
    const ids = deviceIds(this.gladys, fips);
    const language = this.config.language;
    const phrases = PHRASES[language];
    const { active, latest, individual, mitigation, lastYear } = result.summary;
    return [
      { device_feature_external_id: ids.DECLARED, state: active.length > 0 ? 1 : 0 },
      {
        device_feature_external_id: ids.INCIDENT,
        text: latest ? incidentOf(latest, language) : phrases.none,
      },
      {
        device_feature_external_id: ids.DATE,
        text: latest
          ? phrases.declared({ date: formatDay(latest.declaredAt, language), id: shortId(latest) })
          : phrases.none,
      },
      { device_feature_external_id: ids.INDIVIDUAL, state: individual ? 1 : 0 },
      { device_feature_external_id: ids.PUBLIC, state: result.summary.public ? 1 : 0 },
      { device_feature_external_id: ids.MITIGATION, state: mitigation ? 1 : 0 },
      { device_feature_external_id: ids.YEAR, state: Math.min(lastYear, MAX_COUNT) },
    ];
  }

  async publishStates(only) {
    const states = this.counties
      .filter((county) => (only ? county.fips === only : true))
      .filter((county) => this.createdDevice(county.fips))
      .flatMap((county) => this.statesOf(county.fips));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  async updateConnectionStatus() {
    const parts = [];
    if (this.failing.has('openfema')) {
      parts.push(render(STATUS, 'femaDown'));
    }
    if (this.config.counties.length === 0) {
      const house = { none: 'noCounty', outside: 'outsideUs', down: 'geocoderDown' }[
        this.houseState
      ];
      if (house) {
        parts.push(render(STATUS, house));
      }
    }
    if (this.config.invalidCounties.length > 0) {
      parts.push(
        render(STATUS, 'invalidCounties', { values: this.config.invalidCounties.join(', ') }),
      );
    }
    if (this.config.droppedCounties.length > 0) {
      parts.push(
        render(STATUS, 'droppedCounties', { values: this.config.droppedCounties.join(', ') }),
      );
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    const connected =
      !this.failing.has('openfema') && this.counties.length > 0 && this.lastSuccessAt !== null;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------

  /** The followed county of a device of this integration, or undefined. */
  countyOfDevice(device) {
    return this.counties.find(
      (county) => deviceIds(this.gladys, county.fips).device === device?.external_id,
    );
  }

  async onDeviceCreated(device) {
    const county = this.countyOfDevice(device);
    if (!county) {
      return;
    }
    if (!this.results.has(county.fips)) {
      await this.runCycle();
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates(county.fips);
    this.requestRefresh();
  }

  /** Renamed or deleted: the widget shows the names given in Gladys. */
  onDeviceChanged(device) {
    if (this.countyOfDevice(device)) {
      this.requestRefresh();
    }
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    if (!this.countyOfDevice(device)) {
      return;
    }
    // Read again only if the last cycle is older than half the interval.
    if (this.now() - this.lastCycleAt >= (this.config.refreshMinutes * MINUTE) / 2) {
      await this.runCycle();
    } else {
      await this.publishStates();
    }
  }

  /** The readings, read again if the last cycle is older than one interval. */
  async fresh() {
    if (this.now() - this.lastCycleAt >= this.config.refreshMinutes * MINUTE) {
      await this.runCycle();
    } else {
      await this.running;
    }
    return {
      counties: this.counties.filter((county) => this.results.has(county.fips)),
      ok: this.lastSuccessAt !== null,
    };
  }

  // --- Widget -------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }
}

function emptyData() {
  return { version: 1, counties: {} };
}
