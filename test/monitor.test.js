// -----------------------------------------------------------------------------
// The monitor against the SDK's fake Gladys and the fake OpenFEMA: devices,
// states, scene triggers, counties from the house, failures, restarts, and the
// container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EVENTS_PER_CYCLE, TRIGGERS, WIDGET_KEY } from '../src/monitor.js';
import {
  BAY,
  DAY,
  HOT_SPRINGS,
  PARIS,
  START,
  create,
  createApi,
  createClock,
  createWorld,
  cycle,
  discovered,
  featureId,
  lastState,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('the house in Panama City: one device, Bay County, without polling', async (t) => {
  const w = await world(t);
  const devices = discovered(w);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].name, 'FEMA · Bay County, FL');
  assert.equal(devices[0].external_id, w.gladys.externalIds('county', BAY).device);
  assert.equal(devices[0].should_poll, false);
  assert.equal(devices[0].poll_frequency, undefined);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.connectionStatus.message, undefined);
});

test('nothing is published before the device is created, everything after', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.states.length, 0);
  const device = await create(w);
  assert.equal(lastState(w, device, 'declared'), 1);
  assert.equal(lastState(w, device, 'incident_type'), 'Ouragan · Hurricane Isaias');
  assert.equal(lastState(w, device, 'declaration_date'), '27/10/2026 (DR-4955)');
  assert.equal(lastState(w, device, 'individual_assistance'), 1);
  assert.equal(lastState(w, device, 'public_assistance'), 1);
  assert.equal(lastState(w, device, 'hazard_mitigation'), 0);
  assert.equal(lastState(w, device, 'declarations_year'), 2);
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('configured counties: one device each, the calm county at zero', async (t) => {
  const w = await world(t, { config: { counties: `${BAY}, ${HOT_SPRINGS}`, language: 'en' } });
  assert.deepEqual(
    discovered(w).map((d) => d.name),
    ['FEMA · Bay County, FL', 'FEMA · Hot Springs County, WY'],
  );
  const calm = await create(w, 1);
  assert.equal(lastState(w, calm, 'declared'), 0);
  assert.equal(lastState(w, calm, 'incident_type'), 'Fire · Red Canyon Fire');
  assert.equal(lastState(w, calm, 'declaration_date'), '08/15/2025 (FM-5608)');
  assert.equal(lastState(w, calm, 'individual_assistance'), 0);
  assert.equal(lastState(w, calm, 'declarations_year'), 0);
  // The house is not asked for when counties are typed.
  assert.equal(w.api.fccRequests.length, 0);
});

test('only changes are published, with a 12-hour heartbeat', async (t) => {
  const w = await world(t);
  await create(w);
  const after = w.fake.states.length;
  await cycle(w);
  await cycle(w);
  assert.equal(w.fake.states.length, after);
  // The SDK republishes an unchanged value past the heartbeat (its own clock).
  const calls = [];
  const original = w.gladys.publishChangedStates.bind(w.gladys);
  t.mock.method(w.gladys, 'publishChangedStates', (states, options) => {
    calls.push(options);
    return original(states, options);
  });
  await cycle(w);
  assert.deepEqual(calls, [{ heartbeat: 12 * 60 * 60 * 1000 }]);
});

test('a new declaration fires new_declaration, with the scene data', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  assert.deepEqual(w.fake.sceneEvents, [], 'what is listed at the start is not news');
  api.addDeclaration(BAY, 'EM-3655-FL', {
    femaDeclarationString: 'EM-3670-FL',
    disasterNumber: 3670,
    declarationDate: '2026-11-12T00:00:00.000Z',
    incidentType: 'Flood',
    declarationTitle: 'SEVERE STORMS AND FLOODING',
  });
  await cycle(w);
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: TRIGGERS.NEW,
      data: {
        county: w.gladys.externalIds('county', BAY).device,
        county_name: 'Bay County, FL',
        declaration_id: 'EM-3670-FL',
        incident_type_name: 'Inondation',
        title: 'Severe Storms and Flooding',
        url: 'https://www.fema.gov/disaster/3670',
        declaration_type: 'emergency',
        declaration_type_name: 'Urgence',
        incident_type: 'Flood',
        declaration_date: '12/11/2026',
        individual_assistance: false,
        summary:
          'Urgence déclarée pour Bay County, FL le 12/11/2026 : Inondation · Severe Storms and Flooding (EM-3670).',
      },
    },
  ]);
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, 1, 'fired once');
});

test('Individual Assistance added by an amendment fires individual_assistance_opened', async (t) => {
  const api = createApi();
  const w = await world(t, { config: { language: 'en' }, api });
  // EM-3655 had no Individual Assistance; an amendment opens it.
  api.amend(BAY, 'EM-3655-FL', {
    ihProgramDeclared: true,
    lastIAFilingDate: '2027-01-10T00:00:00.000Z',
  });
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, 1);
  const [event] = w.fake.sceneEvents;
  assert.equal(event.key, TRIGGERS.ASSISTANCE);
  assert.equal(event.data.declaration_id, 'EM-3655-FL');
  assert.equal(event.data.deadline, '01/10/2027');
  assert.equal(event.data.registration_url, 'https://www.disasterassistance.gov/');
  assert.equal(
    event.data.summary,
    'Individual Assistance open for Bay County, FL: Tropical storm · Hurricane Isaias (EM-3655). Register for assistance by 01/10/2027.',
  );
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, 1);
});

test('a new declaration with Individual Assistance fires both triggers, in order', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  api.addDeclaration(BAY, 'DR-4955-FL', {
    femaDeclarationString: 'DR-4970-FL',
    disasterNumber: 4970,
    declarationDate: '2026-11-12T00:00:00.000Z',
  });
  await cycle(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW, TRIGGERS.ASSISTANCE],
  );
});

test('an old declaration published late is not news', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  api.addDeclaration(BAY, 'DR-4828-FL', {
    femaDeclarationString: 'DR-4830-FL',
    disasterNumber: 4830,
  });
  await cycle(w);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a restart fires nothing for what was seen before (kept under /data)', async (t) => {
  const api = createApi();
  const first = await createWorld({ api });
  api.addDeclaration(BAY, 'EM-3655-FL', {
    femaDeclarationString: 'EM-3671-FL',
    disasterNumber: 3671,
    declarationDate: '2026-11-12T00:00:00.000Z',
  });
  await cycle(first);
  assert.equal(first.fake.sceneEvents.length, 1);
  await first.app.stop();
  const clock = createClock(START + 2 * DAY);
  const second = await world(t, { api, dataDir: first.dataDir, clock });
  assert.deepEqual(second.fake.sceneEvents, []);
});

test('a burst of declarations is capped per cycle', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  for (let i = 0; i < MAX_EVENTS_PER_CYCLE + 5; i += 1) {
    api.addDeclaration(BAY, 'EM-3655-FL', {
      femaDeclarationString: `EM-${3700 + i}-FL`,
      disasterNumber: 3700 + i,
      declarationDate: '2026-11-11T00:00:00.000Z',
    });
  }
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, MAX_EVENTS_PER_CYCLE);
  // The rest comes at the next cycle, nothing twice.
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, MAX_EVENTS_PER_CYCLE + 5);
  const ids = w.fake.sceneEvents.map((e) => e.data.declaration_id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a scene event Gladys refused is sent again at the next cycle', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  t.mock.method(w.gladys, 'publishSceneEvent', (key, data) =>
    refuse ? Promise.reject(new Error('HTTP 503')) : original(key, data),
  );
  api.addDeclaration(BAY, 'EM-3655-FL', {
    femaDeclarationString: 'EM-3673-FL',
    disasterNumber: 3673,
    declarationDate: '2026-11-12T00:00:00.000Z',
  });
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, 0);
  refuse = false;
  await cycle(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => e.data.declaration_id),
    ['EM-3673-FL'],
  );
});

test('houses unreadable after a restart: what was seen is not forgotten', async (t) => {
  const api = createApi();
  const first = await createWorld({ api });
  await first.app.stop();
  api.addDeclaration(BAY, 'EM-3655-FL', {
    femaDeclarationString: 'EM-3674-FL',
    disasterNumber: 3674,
    declarationDate: '2026-11-12T00:00:00.000Z',
  });
  const second = await createWorld({ api, dataDir: first.dataDir, connect: false });
  t.after(() => second.app.stop());
  const getHouses = second.gladys.getHouses.bind(second.gladys);
  let down = true;
  t.mock.method(second.gladys, 'getHouses', () =>
    down ? Promise.reject(new Error('HTTP 503')) : getHouses(),
  );
  await second.gladys.connect();
  await second.app.ready;
  await second.monitor.running;
  assert.deepEqual(discovered(second), []);
  down = false;
  await cycle(second);
  // Bay County was known: the declaration made meanwhile is news.
  assert.deepEqual(
    second.fake.sceneEvents.map((e) => e.data.declaration_id),
    ['EM-3674-FL'],
  );
});

test('a scan request publishes the devices again', async (t) => {
  const w = await world(t);
  const before = w.fake.requests.filter((r) => r.path.includes('discover')).length;
  await w.fake.scanRequest();
  const after = w.fake.requests.filter((r) => r.path.includes('discover')).length;
  assert.equal(after, before + 1);
});

test('one county failing: still connected, the others fresh', async (t) => {
  const api = createApi();
  const w = await world(t, { api, config: { counties: `${BAY},${HOT_SPRINGS}` } });
  api.downCounties.add(HOT_SPRINGS);
  await cycle(w);
  assert.equal(w.monitor.lastSuccessAt, w.clock.now());
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.match(w.fake.connectionStatus.message.en, /OpenFEMA does not answer/);
});

test('a county added to the configuration starts without triggers', async (t) => {
  const w = await world(t, { config: { counties: HOT_SPRINGS } });
  await w.fake.configUpdated({ counties: `${HOT_SPRINGS},${BAY}` });
  await w.monitor.running;
  assert.equal(discovered(w).length, 2);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('invalid county codes are ignored and said in the status', async (t) => {
  const w = await world(t, { config: { counties: '12999, 99999, 56017' } });
  assert.equal(discovered(w).length, 1);
  const status = w.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(status.message.en, 'Ignored (not a county FIPS code): 12999, 99999.');
  assert.deepEqual(Object.keys(status.message), ['en', 'fr', 'de', 'es']);
  // Only the valid county is asked for.
  assert.equal(w.api.requests.length, 1);
});

test('a house abroad: no device, and the status says to type a county', async (t) => {
  const w = await world(t, { houses: [PARIS] });
  assert.deepEqual(discovered(w), []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /No US county at the location/);
  assert.equal(w.api.requests.length, 0);
});

test('no located house: the status says how to choose a county', async (t) => {
  const w = await world(t, { houses: [] });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /^Aucun comté/);
});

test('the FCC down at the start, then back: the county comes with it', async (t) => {
  const api = createApi();
  api.fccDown = 503;
  const w = await world(t, { api });
  assert.deepEqual(discovered(w), []);
  assert.match(w.fake.connectionStatus.message.en, /FCC Area API/);
  api.fccDown = false;
  await cycle(w);
  assert.equal(discovered(w).length, 1);
  assert.equal(w.fake.connectionStatus.connected, true);
  // Asked once more, then never again while the house stays put.
  await cycle(w, 120);
  assert.equal(api.fccRequests.length, 2);
});

test('OpenFEMA down: the last values stay, the status says so, then recovers', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const device = await create(w);
  api.down = 503;
  await cycle(w);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /OpenFEMA does not answer/);
  assert.equal(lastState(w, device, 'declared'), 1);
  api.down = false;
  await cycle(w);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.connectionStatus.message, undefined);
});

test('the container reads OpenFEMA on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const api = createApi();
  const w = await world(t, { api, timers: true });
  const before = api.requests.length;
  t.mock.timers.tick(60 * 60 * 1000);
  await w.monitor.running;
  assert.equal(api.requests.length, before + 1);
});

test('onPoll fallback: read again only after half an interval', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const device = await create(w);
  const before = api.requests.length;
  await w.fake.poll(device);
  assert.equal(api.requests.length, before);
  w.clock.advance(31 * 60 * 1000);
  await w.fake.poll(device);
  assert.equal(api.requests.length, before + 1);
});

test('a renamed device refreshes the widget (it shows the Gladys names)', async (t) => {
  const w = await world(t);
  const device = await create(w);
  w.clock.advance(60 * 1000);
  const before = w.fake.widgetRefreshes.length;
  await w.fake.deviceUpdated({ ...device, name: 'My county' });
  assert.equal(w.fake.widgetRefreshes.length, before + 1);
});

test('a reconnection publishes the devices and the states again', async (t) => {
  const w = await world(t);
  const device = await create(w);
  const declared = featureId(device, 'declared');
  const before = w.fake.states.filter((s) => s.device_feature_external_id === declared).length;
  w.clock.advance(60 * 1000);
  await w.monitor.resync(w.monitor.config);
  const after = w.fake.states.filter((s) => s.device_feature_external_id === declared).length;
  assert.ok(after > before);
});
