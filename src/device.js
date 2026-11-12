// -----------------------------------------------------------------------------
// One Gladys device per followed county, keyed on its 5-digit FIPS code.
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js):
//   - declared               input/binary: an active declaration (see
//                            isActive in src/openfema.js);
//   - incident_type          text/text: the incident of the latest declaration,
//                            "Ouragan · Hurricane Isaias";
//   - declaration_date       text/text: its date and number, "27/10/2026 (DR-4955)";
//   - individual_assistance  input/binary: registration open for the
//                            Individual Assistance of an active declaration;
//   - public_assistance      input/binary: Public Assistance on an active one;
//   - hazard_mitigation      input/binary: Hazard Mitigation on an active one;
//   - declarations_year      counter-sensor/integer: declarations of the last
//                            365 days.
//
// Published with should_poll: false: the refresh runs in the container
// (src/monitor.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'county';
export const FEATURE_KEYS = {
  DECLARED: 'declared',
  INCIDENT: 'incident_type',
  DATE: 'declaration_date',
  INDIVIDUAL: 'individual_assistance',
  PUBLIC: 'public_assistance',
  MITIGATION: 'hazard_mitigation',
  YEAR: 'declarations_year',
};
export const MAX_COUNT = 1000;

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    device: ({ county }) => `FEMA · ${county}`,
    declared: 'Disaster declared',
    incident_type: 'Incident type',
    declaration_date: 'Declaration date',
    individual_assistance: 'Individual Assistance',
    public_assistance: 'Public Assistance',
    hazard_mitigation: 'Hazard Mitigation',
    declarations_year: 'Declarations in 12 months',
  },
  fr: {
    device: ({ county }) => `FEMA · ${county}`,
    declared: 'Catastrophe déclarée',
    incident_type: "Type d'incident",
    declaration_date: 'Date de déclaration',
    individual_assistance: 'Aide aux particuliers',
    public_assistance: 'Aide publique',
    hazard_mitigation: 'Réduction des risques',
    declarations_year: 'Déclarations sur 12 mois',
  },
  de: {
    device: ({ county }) => `FEMA · ${county}`,
    declared: 'Katastrophe erklärt',
    incident_type: 'Ereignisart',
    declaration_date: 'Datum der Erklärung',
    individual_assistance: 'Hilfe für Privatpersonen',
    public_assistance: 'Öffentliche Hilfe',
    hazard_mitigation: 'Risikominderung',
    declarations_year: 'Erklärungen in 12 Monaten',
  },
  es: {
    device: ({ county }) => `FEMA · ${county}`,
    declared: 'Desastre declarado',
    incident_type: 'Tipo de incidente',
    declaration_date: 'Fecha de declaración',
    individual_assistance: 'Asistencia individual',
    public_assistance: 'Asistencia pública',
    hazard_mitigation: 'Mitigación de riesgos',
    declarations_year: 'Declaraciones en 12 meses',
  },
};

/** External ids of the device of a county and of its features. */
export function deviceIds(gladys, fips) {
  const ids = gladys.externalIds(DEVICE_TYPE, fips);
  return {
    device: ids.device,
    ...Object.fromEntries(
      Object.entries(FEATURE_KEYS).map(([name, key]) => [name, ids.feature(key)]),
    ),
  };
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const binary = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.INPUT, TYPES.SENSOR.BINARY, {
    keep_history: true,
    min: 0,
    max: 1,
  });

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

/** The discovery payload of the device of a county (see src/counties.js). */
export function buildDevice(gladys, county, language = 'fr') {
  const ids = deviceIds(gladys, county.fips);
  const names = NAMES[language] ?? NAMES.fr;
  return {
    name: names.device({ county: county.label }),
    external_id: ids.device,
    model: `FIPS ${county.fips}`,
    should_poll: false,
    params: [],
    features: [
      binary(names.declared, ids.DECLARED),
      text(names.incident_type, ids.INCIDENT),
      text(names.declaration_date, ids.DATE),
      binary(names.individual_assistance, ids.INDIVIDUAL),
      binary(names.public_assistance, ids.PUBLIC),
      binary(names.hazard_mitigation, ids.MITIGATION),
      sensor(
        names.declarations_year,
        ids.YEAR,
        DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        TYPES.SENSOR.INTEGER,
        { keep_history: true, min: 0, max: MAX_COUNT },
      ),
    ],
  };
}
