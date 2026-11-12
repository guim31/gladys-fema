// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action and
// scene messages, scene variables), in the four languages of the Gladys
// interface. Entries are strings or functions of one parameter object. German
// says "du", Spanish "usted". County names and declaration titles come from
// the Census Bureau and FEMA, in English: they are not translated.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

// The incident types of OpenFEMA (`incidentType`). An unknown one is shown as
// FEMA writes it.
export const INCIDENT_NAMES = {
  en: {
    Biological: 'Biological',
    Chemical: 'Chemical',
    'Coastal Storm': 'Coastal storm',
    'Dam/Levee Break': 'Dam or levee break',
    Drought: 'Drought',
    Earthquake: 'Earthquake',
    Fire: 'Fire',
    'Fishing Losses': 'Fishing losses',
    Flood: 'Flood',
    Freezing: 'Freezing',
    'Human Cause': 'Human cause',
    Hurricane: 'Hurricane',
    'Mud/Landslide': 'Mudslide or landslide',
    Other: 'Other',
    'Severe Ice Storm': 'Severe ice storm',
    'Severe Storm': 'Severe storm',
    Snowstorm: 'Snowstorm',
    'Straight-Line Winds': 'Straight-line winds',
    Terrorist: 'Terrorist attack',
    'Toxic Substances': 'Toxic substances',
    Tornado: 'Tornado',
    'Tropical Storm': 'Tropical storm',
    Tsunami: 'Tsunami',
    Typhoon: 'Typhoon',
    'Volcanic Eruption': 'Volcanic eruption',
    'Winter Storm': 'Winter storm',
  },
  fr: {
    Biological: 'Biologique',
    Chemical: 'Chimique',
    'Coastal Storm': 'Tempête côtière',
    'Dam/Levee Break': 'Rupture de barrage ou de digue',
    Drought: 'Sécheresse',
    Earthquake: 'Séisme',
    Fire: 'Incendie',
    'Fishing Losses': 'Pertes de pêche',
    Flood: 'Inondation',
    Freezing: 'Gel',
    'Human Cause': 'Cause humaine',
    Hurricane: 'Ouragan',
    'Mud/Landslide': 'Coulée de boue ou glissement',
    Other: 'Autre',
    'Severe Ice Storm': 'Tempête de verglas',
    'Severe Storm': 'Violent orage',
    Snowstorm: 'Tempête de neige',
    'Straight-Line Winds': 'Vents violents',
    Terrorist: 'Attentat',
    'Toxic Substances': 'Substances toxiques',
    Tornado: 'Tornade',
    'Tropical Storm': 'Tempête tropicale',
    Tsunami: 'Tsunami',
    Typhoon: 'Typhon',
    'Volcanic Eruption': 'Éruption volcanique',
    'Winter Storm': 'Tempête hivernale',
  },
  de: {
    Biological: 'Biologisch',
    Chemical: 'Chemisch',
    'Coastal Storm': 'Küstensturm',
    'Dam/Levee Break': 'Damm- oder Deichbruch',
    Drought: 'Dürre',
    Earthquake: 'Erdbeben',
    Fire: 'Brand',
    'Fishing Losses': 'Fischereiverluste',
    Flood: 'Überschwemmung',
    Freezing: 'Frost',
    'Human Cause': 'Menschliche Ursache',
    Hurricane: 'Hurrikan',
    'Mud/Landslide': 'Mure oder Erdrutsch',
    Other: 'Sonstiges',
    'Severe Ice Storm': 'Eissturm',
    'Severe Storm': 'Schweres Unwetter',
    Snowstorm: 'Schneesturm',
    'Straight-Line Winds': 'Sturmböen',
    Terrorist: 'Terroranschlag',
    'Toxic Substances': 'Giftstoffe',
    Tornado: 'Tornado',
    'Tropical Storm': 'Tropensturm',
    Tsunami: 'Tsunami',
    Typhoon: 'Taifun',
    'Volcanic Eruption': 'Vulkanausbruch',
    'Winter Storm': 'Wintersturm',
  },
  es: {
    Biological: 'Biológico',
    Chemical: 'Químico',
    'Coastal Storm': 'Tormenta costera',
    'Dam/Levee Break': 'Rotura de presa o dique',
    Drought: 'Sequía',
    Earthquake: 'Terremoto',
    Fire: 'Incendio',
    'Fishing Losses': 'Pérdidas pesqueras',
    Flood: 'Inundación',
    Freezing: 'Helada',
    'Human Cause': 'Causa humana',
    Hurricane: 'Huracán',
    'Mud/Landslide': 'Alud de lodo o deslizamiento',
    Other: 'Otro',
    'Severe Ice Storm': 'Tormenta de hielo',
    'Severe Storm': 'Tormenta severa',
    Snowstorm: 'Tormenta de nieve',
    'Straight-Line Winds': 'Vientos en línea recta',
    Terrorist: 'Atentado terrorista',
    'Toxic Substances': 'Sustancias tóxicas',
    Tornado: 'Tornado',
    'Tropical Storm': 'Tormenta tropical',
    Tsunami: 'Tsunami',
    Typhoon: 'Tifón',
    'Volcanic Eruption': 'Erupción volcánica',
    'Winter Storm': 'Tormenta invernal',
  },
};

export const TYPE_NAMES = {
  en: {
    major_disaster: 'Major disaster',
    emergency: 'Emergency',
    fire_management: 'Fire management',
  },
  fr: {
    major_disaster: 'Catastrophe majeure',
    emergency: 'Urgence',
    fire_management: "Lutte contre l'incendie",
  },
  de: {
    major_disaster: 'Großkatastrophe',
    emergency: 'Notstand',
    fire_management: 'Brandbekämpfung',
  },
  es: {
    major_disaster: 'Desastre mayor',
    emergency: 'Emergencia',
    fire_management: 'Gestión de incendios',
  },
};

// Feature values and pieces of sentences.
export const PHRASES = {
  en: {
    newSummary: ({ county, type, what, id, date }) =>
      `${type} declared for ${county} on ${date}: ${what} (${id}).`,
    assistanceSummary: ({ county, what, id, register }) =>
      `Individual Assistance open for ${county}: ${what} (${id}). ${register}`,
    none: 'No declaration',
    incident: ({ type, title }) => `${type} · ${title}`,
    declared: ({ date, id }) => `${date} (${id})`,
    active: ({ county, items }) => `${county}: ${items.join('; ')}.`,
    item: ({ type, title, id }) => `${type}, ${title} (${id})`,
    calm: ({ county }) => `${county}: no active FEMA declaration.`,
    register: ({ date }) => `Register for assistance by ${date}.`,
    registerOpen: 'Registration for assistance is open.',
    programs: 'Programs',
    individual: 'Individual Assistance',
    public: 'Public Assistance',
    mitigation: 'Hazard Mitigation',
    incidentPeriod: 'Incident period',
    since: 'since',
  },
  fr: {
    newSummary: ({ county, type, what, id, date }) =>
      `${type} déclarée pour ${county} le ${date} : ${what} (${id}).`,
    assistanceSummary: ({ county, what, id, register }) =>
      `Aide aux particuliers ouverte pour ${county} : ${what} (${id}). ${register}`,
    none: 'Aucune déclaration',
    incident: ({ type, title }) => `${type} · ${title}`,
    declared: ({ date, id }) => `${date} (${id})`,
    active: ({ county, items }) => `${county} : ${items.join(' ; ')}.`,
    item: ({ type, title, id }) => `${type}, ${title} (${id})`,
    calm: ({ county }) => `${county} : aucune déclaration FEMA en cours.`,
    register: ({ date }) => `Demande d'aide possible jusqu'au ${date}.`,
    registerOpen: "Les demandes d'aide sont ouvertes.",
    programs: 'Programmes',
    individual: 'Aide aux particuliers',
    public: 'Aide publique',
    mitigation: 'Réduction des risques',
    incidentPeriod: "Période de l'incident",
    since: 'depuis le',
  },
  de: {
    newSummary: ({ county, type, what, id, date }) =>
      `${type} für ${county} am ${date} erklärt: ${what} (${id}).`,
    assistanceSummary: ({ county, what, id, register }) =>
      `Hilfe für Privatpersonen in ${county} geöffnet: ${what} (${id}). ${register}`,
    none: 'Keine Erklärung',
    incident: ({ type, title }) => `${type} · ${title}`,
    declared: ({ date, id }) => `${date} (${id})`,
    active: ({ county, items }) => `${county}: ${items.join('; ')}.`,
    item: ({ type, title, id }) => `${type}, ${title} (${id})`,
    calm: ({ county }) => `${county}: keine laufende FEMA-Erklärung.`,
    register: ({ date }) => `Hilfeanträge bis ${date} möglich.`,
    registerOpen: 'Hilfeanträge sind möglich.',
    programs: 'Programme',
    individual: 'Hilfe für Privatpersonen',
    public: 'Öffentliche Hilfe',
    mitigation: 'Risikominderung',
    incidentPeriod: 'Ereigniszeitraum',
    since: 'seit',
  },
  es: {
    newSummary: ({ county, type, what, id, date }) =>
      `Declaración (${type}) para ${county} el ${date}: ${what} (${id}).`,
    assistanceSummary: ({ county, what, id, register }) =>
      `Asistencia individual abierta para ${county}: ${what} (${id}). ${register}`,
    none: 'Ninguna declaración',
    incident: ({ type, title }) => `${type} · ${title}`,
    declared: ({ date, id }) => `${date} (${id})`,
    active: ({ county, items }) => `${county}: ${items.join('; ')}.`,
    item: ({ type, title, id }) => `${type}, ${title} (${id})`,
    calm: ({ county }) => `${county}: ninguna declaración de FEMA en curso.`,
    register: ({ date }) => `Puede solicitar ayuda hasta el ${date}.`,
    registerOpen: 'Las solicitudes de ayuda están abiertas.',
    programs: 'Programas',
    individual: 'Asistencia individual',
    public: 'Asistencia pública',
    mitigation: 'Mitigación de riesgos',
    incidentPeriod: 'Periodo del incidente',
    since: 'desde el',
  },
};

// Connection status of the Configuration screen, and messages of the actions.
export const STATUS = {
  en: {
    initFailed: 'Initialization failed, check the integration logs.',
    femaDown: 'OpenFEMA does not answer: the declarations are not updated.',
    noCounty:
      'No county: type a county FIPS code, or give your house a location in Gladys (Settings, Houses).',
    outsideUs: 'No US county at the location of your house: type a county FIPS code.',
    geocoderDown: 'The county of your house cannot be found now (FCC Area API): try again later.',
    invalidCounties: ({ values }) => `Ignored (not a county FIPS code): ${values}.`,
    droppedCounties: ({ values }) => `Ignored (8 counties at most): ${values}.`,
    summary: ({ text, time }) => `${text} Checked at ${time}.`,
  },
  fr: {
    initFailed: "L'initialisation a échoué, consultez les logs de l'intégration.",
    femaDown: 'OpenFEMA ne répond pas : les déclarations ne sont pas mises à jour.',
    noCounty:
      'Aucun comté : saisissez un code FIPS de comté, ou indiquez la position de votre maison dans Gladys (Paramètres, Maisons).',
    outsideUs:
      'Aucun comté américain à la position de votre maison : saisissez un code FIPS de comté.',
    geocoderDown:
      "Le comté de votre maison est introuvable pour l'instant (FCC Area API) : réessai plus tard.",
    invalidCounties: ({ values }) => `Ignoré (pas un code FIPS de comté) : ${values}.`,
    droppedCounties: ({ values }) => `Ignoré (8 comtés au plus) : ${values}.`,
    summary: ({ text, time }) => `${text} Vérifié à ${time}.`,
  },
  de: {
    initFailed: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    femaDown: 'OpenFEMA antwortet nicht: Die Erklärungen werden nicht aktualisiert.',
    noCounty:
      'Kein County: Trage einen County-FIPS-Code ein oder gib deinem Haus in Gladys einen Standort (Einstellungen, Häuser).',
    outsideUs: 'Kein US-County am Standort deines Hauses: Trage einen County-FIPS-Code ein.',
    geocoderDown:
      'Das County deines Hauses ist gerade nicht zu finden (FCC Area API): später neuer Versuch.',
    invalidCounties: ({ values }) => `Ignoriert (kein County-FIPS-Code): ${values}.`,
    droppedCounties: ({ values }) => `Ignoriert (höchstens 8 Countys): ${values}.`,
    summary: ({ text, time }) => `${text} Geprüft um ${time}.`,
  },
  es: {
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    femaDown: 'OpenFEMA no responde: las declaraciones no se actualizan.',
    noCounty:
      'Ningún condado: introduzca un código FIPS de condado o indique la ubicación de su casa en Gladys (Ajustes, Casas).',
    outsideUs:
      'Ningún condado de EE. UU. en la ubicación de su casa: introduzca un código FIPS de condado.',
    geocoderDown:
      'El condado de su casa no se encuentra por ahora (FCC Area API): se reintentará más tarde.',
    invalidCounties: ({ values }) => `Ignorado (no es un código FIPS de condado): ${values}.`,
    droppedCounties: ({ values }) => `Ignorado (8 condados como máximo): ${values}.`,
    summary: ({ text, time }) => `${text} Comprobado a las ${time}.`,
  },
};

/** One entry of a message table, in every language: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

/** Several multi-language texts joined, language by language. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages
        .filter(Boolean)
        .map((message) => message[language])
        .join(' '),
    ]),
  );
}

const locale = (language) => (language === 'en' ? 'en-US' : language);

/**
 * A FEMA date (a calendar day, given at midnight UTC), e.g. "10/27/2026" or
 * "27/10/2026": read in UTC, or the day before would show west of Greenwich.
 */
export function formatDay(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(time));
}

/** A moment in the user's time zone (TZ, set by the Gladys supervisor), e.g. "13/10 18:35". */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A time of day, e.g. "18:35". */
export function formatTime(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** The incident type in words, or as FEMA writes it when unknown. */
export const incidentName = (incidentType, language) =>
  INCIDENT_NAMES[language]?.[incidentType] ?? incidentType;

/** "Ouragan · Hurricane Isaias". */
export const incidentOf = (declaration, language) =>
  PHRASES[language].incident({
    type: incidentName(declaration.incidentType, language),
    title: declaration.title,
  });

/** "DR-4955": the FEMA number without the state, which the county says. */
export const shortId = (declaration) => declaration.id.replace(/-[A-Z]{2}$/, '');

/** The active declarations of one county as one sentence. */
export function sentence(countyLabel, active, language) {
  const phrases = PHRASES[language];
  if (active.length === 0) {
    return phrases.calm({ county: countyLabel });
  }
  return phrases.active({
    county: countyLabel,
    items: active.map((declaration) =>
      phrases.item({
        type: TYPE_NAMES[language][declaration.type],
        title: declaration.title,
        id: shortId(declaration),
      }),
    ),
  });
}
