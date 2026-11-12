// -----------------------------------------------------------------------------
// The OpenFEMA client on recorded answers (Bay County, Florida, after
// Hurricane Isaias; Hot Springs County, Wyoming, a calm county): the request,
// the parsing, and what a declaration means for the county at a given date.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countyOf } from '../src/counties.js';
import {
  declarationsUrl,
  registrationOpen,
  fetchCountyAt,
  fetchDeclarations,
  isActive,
  parseDeclarations,
  summarize,
  titleCase,
} from '../src/openfema.js';
import { BAY, DAY, HOT_SPRINGS, HOUSE, START, createApi, fixture } from './helpers/world.js';

const bay = () => parseDeclarations(fixture('openfema/bay-county-fl-2026-11-12.json'));
const calm = () => parseDeclarations(fixture('openfema/hot-springs-county-wy-2026-11-12.json'));

test('the request asks for the county and the statewide declarations of its state', () => {
  const url = declarationsUrl(countyOf(BAY));
  assert.equal(
    url.origin + url.pathname,
    'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries',
  );
  assert.equal(
    url.searchParams.get('$filter'),
    "fipsStateCode eq '12' and (fipsCountyCode eq '005' or designatedArea eq 'Statewide')",
  );
  assert.equal(url.searchParams.get('$orderby'), 'declarationDate desc');
  assert.equal(url.searchParams.get('$top'), '1000');
});

test('the declarations of Bay County are grouped, newest first, with their programs', () => {
  const declarations = bay();
  assert.equal(new Set(declarations.map((d) => d.id)).size, declarations.length);
  const [isaias, emergency] = declarations;
  assert.deepEqual(
    {
      id: isaias.id,
      number: isaias.number,
      type: isaias.type,
      incidentType: isaias.incidentType,
      title: isaias.title,
      individual: isaias.individual,
      public: isaias.public,
      mitigation: isaias.mitigation,
      deadline: new Date(isaias.registrationDeadline).toISOString().slice(0, 10),
      url: isaias.url,
    },
    {
      id: 'DR-4955-FL',
      number: 4955,
      type: 'major_disaster',
      incidentType: 'Hurricane',
      title: 'Hurricane Isaias',
      individual: true,
      public: true,
      mitigation: false,
      deadline: '2026-12-26',
      url: 'https://www.fema.gov/disaster/4955',
    },
  );
  assert.equal(emergency.id, 'EM-3655-FL');
  assert.equal(emergency.type, 'emergency');
  for (let i = 1; i < declarations.length; i += 1) {
    assert.ok(declarations[i - 1].declaredAt >= declarations[i].declaredAt);
  }
});

test('tribal declarations are not county declarations', () => {
  const body = fixture('openfema/bay-county-fl-2026-11-12.json');
  const tribal = { ...body.DisasterDeclarationsSummaries[0], femaDeclarationString: 'DR-9999-FL' };
  tribal.tribalRequest = true;
  body.DisasterDeclarationsSummaries.unshift(tribal);
  assert.ok(!parseDeclarations(body).some((d) => d.id === 'DR-9999-FL'));
});

test('an answer without the list is an error, not an empty county', () => {
  assert.throws(
    () => parseDeclarations({ error: [] }),
    /without the DisasterDeclarationsSummaries/,
  );
});

test('FEMA titles leave their capitals', () => {
  assert.equal(
    titleCase('SEVERE STORMS, STRAIGHT-LINE WINDS, AND FLOODING'),
    'Severe Storms, Straight-Line Winds, and Flooding',
  );
  assert.equal(titleCase('COVID-19 PANDEMIC'), 'COVID-19 Pandemic');
  assert.equal(titleCase("MAUI COUNTY'S FIRES"), "Maui County's Fires");
});

test('Bay County on 12/11/2026: Isaias is active through its Individual Assistance', () => {
  const summary = summarize(bay(), START);
  assert.deepEqual(
    summary.active.map((d) => d.id),
    ['DR-4955-FL'],
  );
  assert.equal(summary.latest.id, 'DR-4955-FL');
  assert.equal(summary.individual, true);
  assert.equal(summary.public, true);
  assert.equal(summary.mitigation, false);
  // DR-4955 and EM-3655 (Isaias), declared in October 2026.
  assert.equal(summary.lastYear, 2);
});

test('after the registration deadline, Bay County is calm again', () => {
  const summary = summarize(bay(), Date.parse('2026-12-27T12:00:00Z'));
  assert.deepEqual(summary.active, []);
  assert.equal(summary.individual, false);
  assert.equal(summary.public, false);
  assert.equal(summary.lastYear, 2);
  // The last registration day counts, in every time zone of the country.
  assert.equal(summarize(bay(), Date.parse('2026-12-26T23:30:00Z')).individual, true);
});

test('the calm county: nothing active, nothing in 12 months, the latest still known', () => {
  const summary = summarize(calm(), START);
  assert.deepEqual(summary.active, []);
  assert.equal(summary.lastYear, 0);
  assert.equal(summary.latest.id, 'FM-5608-WY');
  assert.equal(summary.latest.title, 'Red Canyon Fire');
});

test('active: recent, incident open, registration open; never once closed out', () => {
  const base = {
    type: 'major_disaster',
    declaredAt: START - 100 * DAY,
    endAt: START - 50 * DAY,
    closedAt: null,
    registrationDeadline: null,
    individual: false,
  };
  assert.equal(isActive(base, START), false);
  assert.equal(isActive({ ...base, declaredAt: START - 10 * DAY }, START), true);
  assert.equal(isActive({ ...base, endAt: START + DAY }, START), true);
  assert.equal(isActive({ ...base, endAt: null }, START), true);
  assert.equal(isActive({ ...base, endAt: null, declaredAt: START - 400 * DAY }, START), false);
  // Fire management declarations never get an end date.
  assert.equal(isActive({ ...base, type: 'fire_management', endAt: null }, START), false);
  assert.equal(isActive({ ...base, registrationDeadline: START + DAY }, START), true);
  assert.equal(
    isActive({ ...base, declaredAt: START - DAY, closedAt: START - 1000 }, START),
    false,
  );
});

test('fetchDeclarations: the fake API, then its failures', async () => {
  const api = createApi();
  const declarations = await fetchDeclarations(api.fetch, countyOf(HOT_SPRINGS));
  assert.equal(declarations.length, 5);
  api.down = 503;
  await assert.rejects(fetchDeclarations(api.fetch, countyOf(BAY)), /OpenFEMA answered HTTP 503/);
  api.down = 'network';
  await assert.rejects(fetchDeclarations(api.fetch, countyOf(BAY)), /OpenFEMA unreachable/);
  const notJson = async () => ({ status: 200, text: async () => '<html>' });
  await assert.rejects(fetchDeclarations(notJson, countyOf(BAY)), /not JSON/);
});

test('fetchCountyAt: the county of a US house, null abroad, three decimals sent', async () => {
  const api = createApi();
  assert.equal(await fetchCountyAt(api.fetch, HOUSE.latitude + 0.00012, HOUSE.longitude), BAY);
  assert.equal(api.fccRequests[0].searchParams.get('lat'), '30.159');
  assert.equal(api.fccRequests[0].searchParams.get('censusYear'), '2020');
  assert.equal(await fetchCountyAt(api.fetch, 48.853, 2.349), null);
  api.fccDown = 500;
  await assert.rejects(fetchCountyAt(api.fetch, 30, -85), /FCC Area API answered HTTP 500/);
});

test('Individual Assistance without a deadline yet: open for 60 days after the declaration', () => {
  const declaration = {
    individual: true,
    registrationDeadline: null,
    declaredAt: START - 59 * DAY,
  };
  assert.equal(registrationOpen(declaration, START), true);
  assert.equal(registrationOpen({ ...declaration, declaredAt: START - 61 * DAY }, START), false);
  assert.equal(registrationOpen({ ...declaration, individual: false }, START), false);
});
