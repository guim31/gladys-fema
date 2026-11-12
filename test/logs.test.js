// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, the county of the house, a new declaration, OpenFEMA lost and
// back, a user action), never one line per refresh cycle; a failure that
// repeats at every cycle is logged once, plus one line when it is over. Never
// the coordinates of the house.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_ACTION } from '../src/actions.js';
import { BAY, HOUSE, captureLogs, create, createApi, createWorld, cycle } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('the start is two info lines: the start and the county of the house', async (t) => {
  const lines = captureLogs(t, 'info');
  await world(t);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [fema] Started: FEMA declarations read every 60 min',
    '[INFO] [fema] County of the house: Bay County, FL',
  ]);
});

test('normal refresh cycles write nothing at info', async (t) => {
  const w = await world(t);
  await create(w);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 4; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(lines, []);
});

test('a new declaration is one info line', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const lines = captureLogs(t, 'info');
  api.addDeclaration(BAY, 'EM-3655-FL', {
    femaDeclarationString: 'EM-3672-FL',
    disasterNumber: 3672,
    declarationDate: '2026-11-12T00:00:00.000Z',
  });
  await cycle(w);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [fema] New declaration for Bay County, FL: EM-3672-FL Hurricane Isaias',
  ]);
});

test('OpenFEMA down: one line when lost, one when back, nothing in between', async (t) => {
  const api = createApi();
  const w = await world(t, { api });
  const lines = captureLogs(t, 'info');
  api.down = 503;
  for (let i = 0; i < 3; i += 1) {
    await cycle(w);
  }
  api.down = false;
  await cycle(w);
  assert.deepEqual(lines.map(strip), [
    '[WARN] [fema] OpenFEMA unreachable: OpenFEMA answered HTTP 503',
    '[INFO] [fema] OpenFEMA answers again',
  ]);
});

test('a user action is one info line', async (t) => {
  const w = await world(t);
  const lines = captureLogs(t, 'info');
  await w.fake.action(CONFIG_ACTION);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [fema-actions] Check requested: 1 active declaration(s)',
  ]);
});

test('LOG_LEVEL=debug shows the cycles, never the coordinates of the house', async (t) => {
  const lines = captureLogs(t, 'debug');
  const w = await world(t);
  await cycle(w);
  assert.ok(lines.some((line) => line.text.includes('Refresh cycle')));
  const text = lines.map((line) => line.text).join('\n');
  assert.ok(!text.includes(String(HOUSE.latitude)));
  assert.ok(!text.includes(String(HOUSE.longitude)));
});
