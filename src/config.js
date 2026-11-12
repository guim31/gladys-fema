// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers.
// -----------------------------------------------------------------------------

import { countyOf } from './counties.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Minutes between two readings. A declaration is an administrative decision,
// published a few times a week across the whole country: faster would only
// ask OpenFEMA the same thing again.
export const REFRESH_INTERVALS = ['30', '60', '180', '360'];

// Counties followed at most: one device and one request each per cycle.
export const MAX_COUNTIES = 8;

export const DEFAULT_CONFIG = {
  counties: '',
  refresh_interval: '60',
  language: 'fr',
};

const tokens = (text) =>
  String(text ?? '')
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

/**
 * The 5-digit county FIPS codes of a free text ("12005, 12091"), known by the
 * Census list; `invalid` lists the rest, `dropped` those beyond MAX_COUNTIES.
 */
export function parseCounties(text) {
  const codes = [];
  const invalid = [];
  for (const token of tokens(text)) {
    // A code typed without its leading zero (6037 for Los Angeles) is accepted.
    const code = /^\d{4,5}$/.test(token) ? token.padStart(5, '0') : null;
    if (code === null || !countyOf(code)) {
      invalid.push(token);
    } else if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return { codes: codes.slice(0, MAX_COUNTIES), invalid, dropped: codes.slice(MAX_COUNTIES) };
}

const pick = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? Number(value) : Number(fallback);

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const counties = parseCounties(source.counties);
  return {
    // Empty: the county of the first located house of Gladys.
    counties: counties.codes,
    invalidCounties: counties.invalid,
    droppedCounties: counties.dropped,
    refreshMinutes: pick(
      source.refresh_interval,
      REFRESH_INTERVALS,
      DEFAULT_CONFIG.refresh_interval,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
