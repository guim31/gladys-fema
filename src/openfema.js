// -----------------------------------------------------------------------------
// OpenFEMA client (https://www.fema.gov/about/openfema/api): the disaster
// declarations of one county, and the FCC Area API to find the county of the
// house. Both are public US government services, without key nor account.
//
// OpenFEMA dataset `DisasterDeclarationsSummaries` (v2): one row per
// declaration and designated area. A county is designated by its state and
// county FIPS codes; a declaration for a whole state ("Statewide", county code
// 000) covers every county of the state, so both are asked for. Tribal
// declarations (county code 000 as well, named after the tribal land) are not
// county declarations and are left out.
// -----------------------------------------------------------------------------

export const OPENFEMA_URL = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';
export const FCC_AREA_URL = 'https://geo.fcc.gov/api/census/area';
export const FEMA_SITE = 'https://www.fema.gov/disaster/declarations';
export const ASSISTANCE_SITE = 'https://www.disasterassistance.gov/';
export const disasterUrl = (number) => `https://www.fema.gov/disaster/${number}`;

const TIMEOUT_MS = 30000;
// More rows than any county has ever had (the busiest are around 300).
const MAX_ROWS = 1000;
const DAY = 24 * 60 * 60 * 1000;

// The three kinds of declaration, by their FEMA code. The key is the stable
// English word of the manifest and the scene filters.
export const DECLARATION_TYPES = [
  { key: 'major_disaster', code: 'DR' },
  { key: 'emergency', code: 'EM' },
  { key: 'fire_management', code: 'FM' },
];
export const DECLARATION_TYPE_KEYS = DECLARATION_TYPES.map((type) => type.key);

const FIELDS = [
  'femaDeclarationString',
  'disasterNumber',
  'declarationType',
  'declarationDate',
  'incidentType',
  'declarationTitle',
  'ihProgramDeclared',
  'iaProgramDeclared',
  'paProgramDeclared',
  'hmProgramDeclared',
  'incidentBeginDate',
  'incidentEndDate',
  'disasterCloseoutDate',
  'lastIAFilingDate',
  'tribalRequest',
  'fipsCountyCode',
  'designatedArea',
];

export class HttpError extends Error {
  constructor(service, status) {
    super(`${service} answered HTTP ${status}`);
    this.status = status;
  }
}

async function getJson(fetchImpl, url, service) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`${service} unreachable (${err.cause?.code ?? err.name ?? err.message})`, {
      cause: err,
    });
  }
  const text = await response.text();
  if (response.status !== 200) {
    throw new HttpError(service, response.status);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${service} answered something that is not JSON`, { cause: err });
  }
}

/** The OpenFEMA request of one county (exported for the tests' fake API). */
export function declarationsUrl(county) {
  const url = new URL(OPENFEMA_URL);
  url.searchParams.set(
    '$filter',
    `fipsStateCode eq '${county.stateFips}' and ` +
      `(fipsCountyCode eq '${county.countyFips}' or designatedArea eq 'Statewide')`,
  );
  url.searchParams.set('$select', FIELDS.join(','));
  url.searchParams.set('$orderby', 'declarationDate desc');
  url.searchParams.set('$top', String(MAX_ROWS));
  return url;
}

const time = (value) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

// Small words FEMA titles keep in lower case once out of their capitals.
const SMALL_WORDS = new Set(['a', 'and', 'of', 'the', 'in', 'on', 'to', 'for', 'or', 'from']);

/** "SEVERE STORMS, STRAIGHT-LINE WINDS, AND FLOODING" → "Severe Storms, Straight-Line Winds, and Flooding". */
export function titleCase(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[a-z0-9]+(?:'[a-z]+)?/g, (word, offset) =>
      offset > 0 && SMALL_WORDS.has(word)
        ? word
        : /^covid/.test(word)
          ? word.toUpperCase()
          : word[0].toUpperCase() + word.slice(1),
    );
}

/**
 * One declaration from its rows (a declaration designating the county and the
 * whole state has two): the programs of any row count.
 */
function declarationOf(rows) {
  const [first] = rows;
  const any = (field) => rows.some((row) => row[field] === true);
  const type = DECLARATION_TYPES.find((entry) => entry.code === first.declarationType);
  return {
    id: first.femaDeclarationString,
    number: first.disasterNumber,
    type: type?.key ?? 'major_disaster',
    incidentType: String(first.incidentType ?? '').trim() || 'Other',
    title: titleCase(first.declarationTitle),
    declaredAt: time(first.declarationDate),
    beginAt: time(first.incidentBeginDate),
    endAt: time(first.incidentEndDate),
    closedAt: time(first.disasterCloseoutDate),
    // The last day to register for Individual Assistance (null without it).
    registrationDeadline: time(rows.find((row) => row.lastIAFilingDate)?.lastIAFilingDate),
    // Individuals and Households (IH) replaced the older IA program in 2002.
    individual: any('ihProgramDeclared') || any('iaProgramDeclared'),
    public: any('paProgramDeclared'),
    mitigation: any('hmProgramDeclared'),
    url: disasterUrl(first.disasterNumber),
  };
}

/** The declarations of the rows of OpenFEMA, newest first. */
export function parseDeclarations(body) {
  const rows = body?.DisasterDeclarationsSummaries;
  if (!Array.isArray(rows)) {
    throw new Error('OpenFEMA answered without the DisasterDeclarationsSummaries list');
  }
  const groups = new Map();
  for (const row of rows) {
    if (!row?.femaDeclarationString || row.tribalRequest === true) {
      continue;
    }
    if (!groups.has(row.femaDeclarationString)) {
      groups.set(row.femaDeclarationString, []);
    }
    groups.get(row.femaDeclarationString).push(row);
  }
  return [...groups.values()]
    .map(declarationOf)
    .filter((declaration) => declaration.declaredAt !== null)
    .sort((a, b) => b.declaredAt - a.declaredAt || b.number - a.number);
}

/** Every declaration of the county (and of its state as a whole), newest first. */
export async function fetchDeclarations(fetchImpl, county) {
  return parseDeclarations(await getJson(fetchImpl, declarationsUrl(county), 'OpenFEMA'));
}

/**
 * The 5-digit FIPS code of the county at these coordinates, null outside the
 * United States. Three decimals (about 100 m) are enough to find a county and
 * are all that leaves the house.
 */
export async function fetchCountyAt(fetchImpl, latitude, longitude) {
  const url = new URL(FCC_AREA_URL);
  url.searchParams.set('lat', latitude.toFixed(3));
  url.searchParams.set('lon', longitude.toFixed(3));
  // The 2020 census geography: the county codes OpenFEMA uses.
  url.searchParams.set('censusYear', '2020');
  url.searchParams.set('format', 'json');
  const body = await getJson(fetchImpl, url, 'FCC Area API');
  const fips = body?.results?.[0]?.county_fips;
  return typeof fips === 'string' && /^\d{5}$/.test(fips) ? fips : null;
}

// --- What a declaration means for the county now --------------------------------

// A declaration is "recent" this long after it is made, whatever its dates.
export const RECENT_DAYS = 30;
// An incident period without an end date is taken as open this long at most
// (fire management declarations never get one).
const OPEN_ENDED_DAYS = { fire_management: 30, default: 365 };

/** The end of the day of a FEMA date (dates are given at midnight UTC). */
const endOfDay = (at) => at + DAY;

/**
 * Active: not closed out, and declared in the last 30 days, or its incident
 * period still open, or its Individual Assistance registration still open.
 */
export function isActive(declaration, now) {
  const { closedAt, declaredAt, endAt, registrationDeadline, type } = declaration;
  if (closedAt !== null && closedAt <= now) {
    return false;
  }
  if (now - declaredAt <= RECENT_DAYS * DAY) {
    return true;
  }
  if (registrationDeadline !== null && endOfDay(registrationDeadline) > now) {
    return true;
  }
  if (endAt !== null) {
    return endOfDay(endAt) > now;
  }
  const days = OPEN_ENDED_DAYS[type] ?? OPEN_ENDED_DAYS.default;
  return now - declaredAt <= days * DAY;
}

// Without a deadline from FEMA yet, registration is taken as open this long
// after the declaration (FEMA usually gives 60 days to register).
export const REGISTRATION_DAYS = 60;

/** Individual Assistance registration open now on this declaration. */
export const registrationOpen = (declaration, now) =>
  declaration.individual &&
  (declaration.registrationDeadline === null
    ? now - declaration.declaredAt <= REGISTRATION_DAYS * DAY
    : endOfDay(declaration.registrationDeadline) > now);

/** The summary of a county: what the device and the widget show. */
export function summarize(declarations, now) {
  const active = declarations.filter((declaration) => isActive(declaration, now));
  const yearAgo = now - 365 * DAY;
  return {
    active,
    latest: declarations[0] ?? null,
    individual: active.some((declaration) => registrationOpen(declaration, now)),
    public: active.some((declaration) => declaration.public),
    mitigation: active.some((declaration) => declaration.mitigation),
    lastYear: declarations.filter((declaration) => declaration.declaredAt >= yearAgo).length,
  };
}
