import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, MAX_COUNTIES, normalizeConfig, parseCounties } from '../src/config.js';
import { COUNTY_COUNT, countyOf } from '../src/counties.js';

test('the Census list knows every county, parish, borough and territory', () => {
  assert.ok(COUNTY_COUNT > 3200, `${COUNTY_COUNT} counties`);
  assert.deepEqual(countyOf('12005'), {
    fips: '12005',
    stateFips: '12',
    countyFips: '005',
    name: 'Bay County',
    state: 'FL',
    label: 'Bay County, FL',
  });
  assert.equal(countyOf('22071').label, 'Orleans Parish, LA');
  assert.equal(countyOf('72127').label, 'San Juan Municipio, PR');
  // Connecticut: the historical counties, as FEMA still uses them.
  assert.equal(countyOf('09009').label, 'New Haven County, CT');
  assert.equal(countyOf('12999'), null);
  assert.equal(countyOf('99001'), null);
});

test('county codes: separators, missing leading zero, duplicates, invalid ones', () => {
  assert.deepEqual(parseCounties(' 12005;6037 , 12005\n56017 '), {
    codes: ['12005', '06037', '56017'],
    invalid: [],
    dropped: [],
  });
  assert.deepEqual(parseCounties('12999, 99999, Miami, 123').invalid, [
    '12999',
    '99999',
    'Miami',
    '123',
  ]);
  const many = Array.from({ length: 10 }, (_, i) => `12${String(2 * i + 1).padStart(3, '0')}`);
  const parsed = parseCounties(many.join(','));
  assert.equal(parsed.codes.length, MAX_COUNTIES);
  assert.deepEqual(parsed.dropped, many.slice(MAX_COUNTIES));
});

test('the defaults: the county of the house, every hour, names in French', () => {
  assert.deepEqual(normalizeConfig({}), {
    counties: [],
    invalidCounties: [],
    droppedCounties: [],
    refreshMinutes: 60,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), normalizeConfig(null));
  const config = normalizeConfig({ counties: '12005', refresh_interval: '180', language: 'de' });
  assert.deepEqual(config.counties, ['12005']);
  assert.equal(config.refreshMinutes, 180);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ refresh_interval: '5', language: 'it' }).refreshMinutes, 60);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
