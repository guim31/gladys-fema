// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_INTERVALS } from '../src/config.js';
import { DECLARATION_TYPE_KEYS } from '../src/openfema.js';
import { CONFIG_ACTION, SCENE_ACTION } from '../src/actions.js';
import { TRIGGERS, WIDGET_KEY } from '../src/monitor.js';
import { WIDGETS } from '../src/widgets.js';
import { BAY, createApi, createWorld, cycle } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionValues = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

test('identity: name, image, cover, cloud transport, categories, country', () => {
  assert.equal(manifest.name, 'FEMA Disasters');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-fema:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-fema/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['environment', 'security']);
  assert.deepEqual(manifest.countries, ['US']);
});

test('the county defaults to the house: the manifest declares the location', () => {
  assert.equal(manifest.location, true);
});

test('Gladys 5.3.0 at least: countries, and the device selects of the scene triggers', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
});

test('every manifest action, scene action and widget has its handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions), [CONFIG_ACTION]);
  assert.deepEqual(handlerKeys('action:'), [CONFIG_ACTION]);
  assert.deepEqual(keysOf(manifest.scene_actions), [SCENE_ACTION]);
  assert.deepEqual(handlerKeys('sceneAction:'), [SCENE_ACTION]);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
});

test('the outputs of read_declarations are the declared ones', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { data } = await world.fake.sceneAction(SCENE_ACTION, {});
  const declared = field(manifest.scene_actions, SCENE_ACTION).outputs;
  assert.deepEqual(Object.keys(data.outputs).sort(), keysOf(declared).sort());
  for (const output of declared) {
    assert.equal(typeof data.outputs[output.key], output.type, output.key);
  }
});

test('the scene triggers the monitor fires are declared, with their filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [TRIGGERS.NEW, TRIGGERS.ASSISTANCE]);
  const api = createApi();
  const world = await createWorld({ api });
  t.after(() => world.app.stop());
  api.addDeclaration(BAY, 'DR-4955-FL', {
    femaDeclarationString: 'DR-4971-FL',
    disasterNumber: 4971,
    declarationDate: '2026-11-12T00:00:00.000Z',
  });
  await cycle(world);
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW, TRIGGERS.ASSISTANCE],
  );
  const created = world.fake.discoveredDevices.map((device) => device.external_id);
  for (const event of world.fake.sceneEvents) {
    const trigger = field(manifest.scene_triggers, event.key);
    const keys = [...new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)])];
    assert.deepEqual(Object.keys(event.data).sort(), keys.sort(), `${event.key}: data keys`);
    for (const variable of trigger.variables) {
      const value = event.data[variable.key];
      assert.ok(value === null || typeof value === variable.type, `${event.key}.${variable.key}`);
    }
    // The county filter is a device of the integration (source: devices).
    assert.equal(field(trigger.fields, 'county').source, 'devices');
    assert.ok(created.includes(event.data.county));
  }
  const types = field(field(manifest.scene_triggers, TRIGGERS.NEW).fields, 'declaration_type');
  assert.deepEqual(optionValues(types), DECLARATION_TYPE_KEYS);
  assert.ok(DECLARATION_TYPE_KEYS.includes(world.fake.sceneEvents[0].data.declaration_type));
});

test('the widget settings are the ones the code reads', () => {
  const widget = field(manifest.widgets, WIDGET_KEY);
  assert.deepEqual(keysOf(widget.settings), ['show_link']);
  assert.equal(field(widget.settings, 'show_link').default, true);
});

test('config_schema defaults and options are the ones of the code', () => {
  for (const entry of manifest.config_schema) {
    if (entry.default !== undefined) {
      assert.deepEqual(DEFAULT_CONFIG[entry.key], entry.default, entry.key);
    }
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((entry) => entry.type !== 'section')
      .map((entry) => entry.key)
      .sort(),
  );
  assert.deepEqual(optionValues(field(manifest.config_schema, 'language')), LANGUAGES);
  assert.deepEqual(
    optionValues(field(manifest.config_schema, 'refresh_interval')),
    REFRESH_INTERVALS,
  );
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((entry) => entry.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('no number field (the form has no step): county codes are a parsed string', () => {
  assert.deepEqual(
    allFields.filter((entry) => entry.type === 'number'),
    [],
  );
});

test('actions: no field at all (the core applies no default, #3154 and #3155)', () => {
  for (const action of manifest.actions) {
    assert.equal(action.fields, undefined, action.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
