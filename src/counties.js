// -----------------------------------------------------------------------------
// The US counties and county equivalents (parishes, boroughs, Puerto Rico
// municipios, territories), by 5-digit FIPS code: state code (2 digits) then
// county code (3 digits). From the Census Bureau 2020 list, the vintage FEMA
// still uses (Connecticut keeps its eight historical counties there).
//
// It validates the codes typed in the configuration without asking anyone, and
// names the devices.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./counties.json', import.meta.url), 'utf8'));

const COUNTIES = new Map();
for (const [state, { fips, counties }] of Object.entries(data.states)) {
  for (const [code, name] of Object.entries(counties)) {
    COUNTIES.set(`${fips}${code}`, { name, state });
  }
}

/**
 * @param {string} fips 5 digits
 * @returns {{ fips: string, stateFips: string, countyFips: string, name: string,
 *   state: string, label: string } | null}
 */
export function countyOf(fips) {
  const county = COUNTIES.get(String(fips));
  if (!county) {
    return null;
  }
  return {
    fips: String(fips),
    stateFips: String(fips).slice(0, 2),
    countyFips: String(fips).slice(2),
    name: county.name,
    state: county.state,
    label: `${county.name}, ${county.state}`,
  };
}

export const COUNTY_COUNT = COUNTIES.size;
