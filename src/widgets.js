// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `declarations`.
//
// A heading with the number of active declarations, then one row per followed
// county (a `card-list`, 8 rows at most, as many as the counties followed):
// the name of its device in Gladys as title, the latest incident as subtitle,
// a badge "Declared" (red) or "None" (green). Tapping a row opens the core's
// detail panel: the active declarations (or the latest one) with their dates
// and programs, the registration deadline, and links to their FEMA pages and
// to DisasterAssistance.gov while registration is open. The footer gives the
// source and the time of the last reading, and a link to the FEMA declarations
// page (setting `show_link`).
// Budget: 2 texts, 1 card-list, 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import { PHRASES, TYPE_NAMES, formatDate, formatDay, incidentOf, shortId } from './messages.js';
import { WIDGET_KEY } from './monitor.js';
import { ASSISTANCE_SITE, FEMA_SITE, registrationOpen } from './openfema.js';

export const TTL_SECONDS = 600;

export const TEXT = {
  waiting: {
    en: 'Waiting for OpenFEMA…',
    fr: "En attente d'OpenFEMA…",
    de: 'Warte auf OpenFEMA…',
    es: 'Esperando a OpenFEMA…',
  },
  noCounty: {
    en: 'No county followed',
    fr: 'Aucun comté suivi',
    de: 'Kein County verfolgt',
    es: 'Ningún condado seguido',
  },
  none: {
    en: 'No active declaration',
    fr: 'Aucune déclaration en cours',
    de: 'Keine laufende Erklärung',
    es: 'Ninguna declaración en curso',
  },
  one: {
    en: '1 active declaration',
    fr: '1 déclaration en cours',
    de: '1 laufende Erklärung',
    es: '1 declaración en curso',
  },
  many: {
    en: ' active declarations',
    fr: ' déclarations en cours',
    de: ' laufende Erklärungen',
    es: ' declaraciones en curso',
  },
  declared: { en: 'Declared', fr: 'Déclarée', de: 'Erklärt', es: 'Declarada' },
  calm: { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' },
  latest: { en: 'Latest', fr: 'Dernière', de: 'Letzte', es: 'Última' },
  source: {
    en: 'Source: OpenFEMA',
    fr: 'Source : OpenFEMA',
    de: 'Quelle: OpenFEMA',
    es: 'Fuente: OpenFEMA',
  },
  site: {
    en: 'FEMA declarations',
    fr: 'Déclarations FEMA',
    de: 'FEMA-Erklärungen',
    es: 'Declaraciones FEMA',
  },
  register: {
    en: 'Apply for assistance',
    fr: "Demander l'aide",
    de: 'Hilfe beantragen',
    es: 'Solicitar ayuda',
  },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** The lines of one declaration in the detail panel. */
function details(declaration, now, language) {
  const phrases = PHRASES[language];
  const programs = [
    declaration.individual && phrases.individual,
    declaration.public && phrases.public,
    declaration.mitigation && phrases.mitigation,
  ].filter(Boolean);
  const period =
    declaration.beginAt === null
      ? null
      : declaration.endAt === null
        ? `${phrases.incidentPeriod}: ${phrases.since} ${formatDay(declaration.beginAt, language)}`
        : `${phrases.incidentPeriod}: ${formatDay(declaration.beginAt, language)} – ${formatDay(declaration.endAt, language)}`;
  const register =
    registrationOpen(declaration, now) && declaration.registrationDeadline !== null
      ? phrases.register({ date: formatDay(declaration.registrationDeadline, language) })
      : null;
  return [
    `${shortId(declaration)} · ${TYPE_NAMES[language][declaration.type]} · ${formatDay(declaration.declaredAt, language)}`,
    incidentOf(declaration, language),
    period,
    programs.length > 0 ? `${phrases.programs}: ${programs.join(', ')}` : null,
    register,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The row of one county, and its detail panel. */
export function itemOf(monitor, county, language) {
  const now = monitor.now();
  const { summary } = monitor.results.get(county.fips);
  const shown = summary.active.length > 0 ? summary.active : [summary.latest].filter(Boolean);
  const headline = summary.active[0] ?? summary.latest;
  const description = shown
    .slice(0, 3)
    .map((declaration, index) =>
      summary.active.length === 0 && index === 0
        ? `${t(TEXT.latest, language)}: ${details(declaration, now, language)}`
        : details(declaration, now, language),
    )
    .join('\n\n');
  const links = shown
    .slice(0, summary.individual ? 2 : 3)
    .map((declaration) => ({ url: declaration.url, label: `FEMA ${shortId(declaration)}` }));
  if (summary.individual) {
    links.push({ url: ASSISTANCE_SITE, label: t(TEXT.register, language) });
  }
  return {
    title: clip(monitor.displayName(county), 60),
    subtitle: clip(headline ? incidentOf(headline, language) : PHRASES[language].none, 60),
    badge:
      summary.active.length > 0
        ? { text: t(TEXT.declared, language), color: WIDGET_COLORS.DANGER }
        : { text: t(TEXT.calm, language), color: WIDGET_COLORS.SUCCESS },
    ...(description ? { description, links } : {}),
  };
}

function heading(monitor, counties, language) {
  if (counties.length === 0) {
    return t(
      monitor.lastSuccessAt === null && monitor.counties.length > 0 ? TEXT.waiting : TEXT.noCounty,
      language,
    );
  }
  const count = counties.reduce(
    (sum, county) => sum + monitor.results.get(county.fips).summary.active.length,
    0,
  );
  if (count === 0) {
    return t(TEXT.none, language);
  }
  return count === 1 ? t(TEXT.one, language) : `${count}${t(TEXT.many, language)}`;
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { language = 'en', settings = {} } = {}) {
      const lang = LANGUAGES.includes(language) ? language : 'en';
      const counties = monitor.counties.filter((county) => monitor.results.has(county.fips));
      const updated = monitor.lastSuccessAt;
      const source = t(TEXT.source, lang);
      const components = [
        { type: 'text', variant: 'heading', text: heading(monitor, counties, lang) },
      ];
      if (counties.length > 0) {
        components.push({
          type: 'card-list',
          display: 'list',
          items: counties.slice(0, 8).map((county) => itemOf(monitor, county, lang)),
        });
      }
      components.push({
        type: 'text',
        variant: 'caption',
        text: updated === null ? source : `${source} · ${formatDate(updated, lang)}`,
      });
      if (settings.show_link !== false) {
        components.push({
          type: 'button',
          label: t(TEXT.site, lang),
          icon: 'external-link',
          link: { url: FEMA_SITE },
        });
      }
      return { ttl_seconds: TTL_SECONDS, components };
    },
  },
};
