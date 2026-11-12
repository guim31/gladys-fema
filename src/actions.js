// -----------------------------------------------------------------------------
// The scene action `read_declarations` and the configuration action
// `check_now`. Both read OpenFEMA again when the last cycle is older than one
// interval, and answer with the active declarations of the followed counties
// as one sentence: something a scene can send by message or read aloud.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import { STATUS, formatTime, render, sentence } from './messages.js';

const logger = createLogger({ name: 'fema-actions' });

export const SCENE_ACTION = 'read_declarations';
export const CONFIG_ACTION = 'check_now';

function describeAll(monitor, counties, language) {
  return counties
    .map((county) =>
      sentence(
        monitor.displayName(county),
        monitor.results.get(county.fips).summary.active,
        language,
      ),
    )
    .join(' ');
}

const activeCount = (monitor, counties) =>
  counties.reduce((sum, county) => sum + monitor.results.get(county.fips).summary.active.length, 0);

/** Why there is nothing to read: no county, or OpenFEMA never answered. */
function problem(monitor) {
  if (monitor.counties.length === 0) {
    const key = { outside: 'outsideUs', down: 'geocoderDown' }[monitor.houseState];
    return render(STATUS, key ?? 'noCounty');
  }
  return render(STATUS, 'femaDown');
}

/** Scene action: outputs `text`, `active_count` and `assistance_open`. */
export async function readDeclarations(monitor) {
  const { counties, ok } = await monitor.fresh();
  if (!ok || counties.length === 0) {
    throw new Error(problem(monitor)[monitor.config.language]);
  }
  return {
    text: describeAll(monitor, counties, monitor.config.language),
    active_count: activeCount(monitor, counties),
    assistance_open: counties.some((county) => monitor.results.get(county.fips).summary.individual),
  };
}

/** Configuration action: the declarations now, in every language. */
export async function checkNow(monitor) {
  const { counties, ok } = await monitor.fresh();
  const usable = ok && counties.length > 0;
  logger.info(
    `Check requested: ${usable ? `${activeCount(monitor, counties)} active declaration(s)` : 'nothing to read'}`,
  );
  if (!usable) {
    return problem(monitor);
  }
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      render(STATUS, 'summary', {
        text: describeAll(monitor, counties, language),
        time: formatTime(monitor.lastSuccessAt, language),
      })[language],
    ]),
  );
}
