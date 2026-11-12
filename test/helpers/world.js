// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake OpenFEMA serving the
// recorded declarations of test/fixtures (filtered the way the real API does),
// a fake FCC Area API, a manual clock, a temporary /data, and the integration
// wired on top through registerHandlers. Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'America/Chicago';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// The declarations were recorded on 12/11/2026 around 08:10 UTC.
export const START = Date.parse('2026-11-12T10:00:00Z');
export const DAY = 24 * 60 * 60 * 1000;

// Bay County, Florida: Hurricane Isaias, declared on 27/10/2026 (DR-4955), with
// Individual Assistance open until 26/12/2026.
export const BAY = '12005';
// Hot Springs County, Wyoming: a calm county, nothing declared in 12 months.
export const HOT_SPRINGS = '56017';

// A house in Panama City, Florida (public coordinates of the city hall area).
export const HOUSE = {
  id: 'house-1',
  name: 'Home',
  selector: 'home',
  latitude: 30.159,
  longitude: -85.66,
};
export const PARIS = { ...HOUSE, latitude: 48.853, longitude: 2.349 };

/**
 * Fake OpenFEMA and FCC. `api.down`: 'network' (connection refused), a status
 * (503) or false; `api.fccDown` likewise for the FCC Area API.
 */
export function createApi() {
  const rows = {
    [BAY]: fixture('openfema/bay-county-fl-2026-11-12.json').DisasterDeclarationsSummaries,
    [HOT_SPRINGS]: fixture('openfema/hot-springs-county-wy-2026-11-12.json')
      .DisasterDeclarationsSummaries,
  };
  const api = {
    rows,
    down: false,
    fccDown: false,
    // County FIPS codes OpenFEMA fails on (503), the others answering.
    downCounties: new Set(),
    requests: [],
    fccRequests: [],

    /** A new declaration for a county, copied from a recorded one. */
    addDeclaration(fips, fromId, changes) {
      const row = structuredClone(rows[fips].find((r) => r.femaDeclarationString === fromId));
      Object.assign(row, changes);
      rows[fips].unshift(row);
      return row;
    },

    /** Change a recorded declaration (an amendment). */
    amend(fips, id, changes) {
      for (const row of rows[fips].filter((r) => r.femaDeclarationString === id)) {
        Object.assign(row, changes);
      }
    },

    search(url) {
      const filter = url.searchParams.get('$filter');
      const match =
        /^fipsStateCode eq '(\d{2})' and \(fipsCountyCode eq '(\d{3})' or designatedArea eq 'Statewide'\)$/.exec(
          filter,
        );
      if (!match) {
        return null;
      }
      return structuredClone(rows[`${match[1]}${match[2]}`] ?? []);
    },

    async fetch(input) {
      const url = new URL(input);
      if (url.hostname === 'geo.fcc.gov') {
        api.fccRequests.push(url);
        if (api.fccDown === 'network') {
          throw new TypeError('fetch failed');
        }
        if (api.fccDown) {
          return { status: api.fccDown, text: async () => 'Service Unavailable' };
        }
        const near = (lat, lon) =>
          Math.abs(Number(url.searchParams.get('lat')) - lat) < 0.01 &&
          Math.abs(Number(url.searchParams.get('lon')) - lon) < 0.01;
        const body = near(HOUSE.latitude, HOUSE.longitude)
          ? fixture('fcc/bay-county-fl.json')
          : fixture('fcc/outside-us.json');
        return { status: 200, text: async () => JSON.stringify(body) };
      }
      api.requests.push(url);
      if (api.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (api.down) {
        return { status: api.down, text: async () => 'Service Unavailable' };
      }
      const county = /'(\d{2})'.*'(\d{3})'/.exec(url.searchParams.get('$filter') ?? '');
      if (county && api.downCounties.has(`${county[1]}${county[2]}`)) {
        return { status: 503, text: async () => 'Service Unavailable' };
      }
      const found = url.pathname.endsWith('/v2/DisasterDeclarationsSummaries')
        ? api.search(url)
        : null;
      if (found === null) {
        return { status: 400, text: async () => '{"error":[]}' };
      }
      return {
        status: 200,
        text: async () =>
          JSON.stringify({ metadata: { count: 0 }, DisasterDeclarationsSummaries: found }),
      };
    },
  };
  return api;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.api] from createApi
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] true: the monitor's own timer runs (mock it)
 */
export async function createWorld({
  config = {},
  devices = [],
  houses = [HOUSE],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-fema-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, { store, fetch: api.fetch, timers, now: clock.now });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock, store, dataDir };
}

/** The discovered devices (last publication). */
export const discovered = (world) => world.fake.discoveredDevices;

/** Create a discovered device in Gladys (the first by default), as the user would. */
export async function create(world, index = 0) {
  const device = world.fake.discoveredDevices[index];
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** The last state published on one feature of a device. */
export function lastState(world, device, key) {
  const id = featureId(device, key);
  const states = world.fake.states.filter((s) => s.device_feature_external_id === id);
  const last = states.at(-1);
  return last === undefined ? undefined : (last.text ?? last.state);
}

/** Run one refresh cycle, `minutes` later. */
export async function cycle(world, minutes = 60) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.runCycle();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
