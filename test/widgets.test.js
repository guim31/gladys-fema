// -----------------------------------------------------------------------------
// The `declarations` widget, its actions (scene and configuration), checked
// with the SDK's validateWidgetContent and the core's budget (8 components,
// 2 texts at most).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { CONFIG_ACTION, SCENE_ACTION } from '../src/actions.js';
import { WIDGET_KEY } from '../src/monitor.js';
import { BAY, HOT_SPRINGS, PARIS, create, createApi, createWorld } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, options = {}) {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { language: 'en', ...options });
  assert.equal(ack.success, true, ack.error);
  const { content: body } = ack.data;
  validateWidgetContent(body);
  assert.ok(body.components.length <= 8);
  assert.ok(body.components.filter((c) => c.type === 'text').length <= 2);
  return body;
}

test('two counties: a heading, one row each, the source and the FEMA link', async (t) => {
  const w = await world(t, { config: { counties: `${BAY},${HOT_SPRINGS}` } });
  const body = await content(w);
  assert.deepEqual(
    body.components.map((c) => c.type),
    ['text', 'card-list', 'text', 'button'],
  );
  assert.equal(body.components[0].text, '1 active declaration');
  const [bay, calm] = body.components[1].items;
  assert.equal(bay.title, 'Bay County, FL');
  assert.equal(bay.subtitle, 'Hurricane · Hurricane Isaias');
  assert.deepEqual(bay.badge, { text: 'Declared', color: 'danger' });
  assert.match(
    bay.description,
    /^DR-4955 · Major disaster · 10\/27\/2026\nHurricane · Hurricane Isaias\n/,
  );
  assert.match(bay.description, /Programs: Individual Assistance, Public Assistance/);
  assert.match(bay.description, /Register for assistance by 12\/26\/2026\./);
  assert.deepEqual(
    bay.links.map((link) => link.url),
    ['https://www.fema.gov/disaster/4955', 'https://www.disasterassistance.gov/'],
  );
  assert.deepEqual(calm.badge, { text: 'None', color: 'success' });
  assert.match(calm.description, /^Latest: FM-5608 · Fire management · 08\/15\/2025/);
  assert.match(body.components[2].text, /^Source: OpenFEMA · /);
});

test('the row shows the name given in Gladys, and the link can be hidden', async (t) => {
  const w = await world(t);
  const device = await create(w);
  await w.fake.deviceUpdated({ ...device, name: 'Our county' });
  const body = await content(w, { language: 'fr', settings: { show_link: false } });
  assert.equal(body.components[1].items[0].title, 'Our county');
  assert.equal(body.components[1].items[0].badge.text, 'Déclarée');
  assert.equal(body.components[0].text, '1 déclaration en cours');
  assert.ok(!body.components.some((c) => c.type === 'button'));
});

test('no county: the widget says so, in every language', async (t) => {
  const w = await world(t, { houses: [PARIS] });
  for (const language of ['en', 'fr', 'de', 'es']) {
    const body = await content(w, { language });
    assert.equal(body.components[0].variant, 'heading');
    assert.ok(body.components[0].text.length > 0);
    assert.ok(!body.components.some((c) => c.type === 'card-list'));
  }
});

test('read_declarations: one sentence, the count, the assistance flag', async (t) => {
  const w = await world(t, { config: { counties: `${BAY},${HOT_SPRINGS}`, language: 'en' } });
  const { data } = await w.fake.sceneAction(SCENE_ACTION, {});
  assert.deepEqual(data.outputs, {
    text: 'Bay County, FL: Major disaster, Hurricane Isaias (DR-4955). Hot Springs County, WY: no active FEMA declaration.',
    active_count: 1,
    assistance_open: true,
  });
});

test('read_declarations fails clearly when OpenFEMA never answered', async (t) => {
  const api = createApi();
  api.down = 503;
  const w = await world(t, { api, config: { language: 'fr' } });
  const ack = await w.fake.sceneAction(SCENE_ACTION, {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /OpenFEMA ne répond pas/);
});

test('check_now answers in the four languages', async (t) => {
  const w = await world(t);
  const { data } = await w.fake.action(CONFIG_ACTION);
  const message = data.message ?? data;
  assert.deepEqual(Object.keys(message), ['en', 'fr', 'de', 'es']);
  assert.match(
    message.fr,
    /^Bay County, FL : Catastrophe majeure, Hurricane Isaias \(DR-4955\)\. Vérifié à /,
  );
  for (const text of Object.values(message)) {
    assert.ok(text.length <= 200, text);
  }
});
