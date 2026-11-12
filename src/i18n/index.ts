/**
 * Internationalisation (SPEC §20 "Interface bilingue", SPEC §7 rule 4).
 *
 * One catalogue per language, split by domain in sibling files and merged here.
 * Three rules hold the whole module:
 * - every visible string exists in English and in French, with exactly the same
 *   keys (a test compares the two catalogues and fails on any difference);
 * - a missing key renders the key itself, never `undefined` (SPEC §20);
 * - "we don't know" has its own label, like the three other conclusions
 *   (SPEC §7 rule 4).
 *
 * Pure module: no `@forge/*` import, no clock. A viewmodel receives a
 * `Translate` and never picks a language by itself.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { ACTIONS_EN, ACTIONS_FR } from './actions.js';
import { COVERAGE_EN, COVERAGE_FR } from './coverage.js';
import { DOCS_EN, DOCS_FR } from './docs.js';
import { RECOMMENDATION_EN, RECOMMENDATION_FR } from './recommendation.js';
import { STATS_EN, STATS_FR } from './stats.js';
import { UI_EN, UI_FR } from './ui.js';

/** The two languages of the interface: English is the submission language (SPEC §20). */
export type Lang = 'en' | 'fr';

/** Every message of the app, merged from the domain catalogues. */
const EN = {
  ...RECOMMENDATION_EN,
  ...STATS_EN,
  ...UI_EN,
  ...ACTIONS_EN,
  ...COVERAGE_EN,
  ...DOCS_EN,
} as const;

/** The French catalogue must carry exactly the keys of the English one. */
const FR = {
  ...RECOMMENDATION_FR,
  ...STATS_FR,
  ...UI_FR,
  ...ACTIONS_FR,
  ...COVERAGE_FR,
  ...DOCS_FR,
} satisfies Readonly<Record<keyof typeof EN, string>>;

/** A message key: `domain.point`, the union of the English catalogue keys. */
export type MessageKey = keyof typeof EN;

/** English messages, as the contract declares them. */
export const MESSAGES_EN: Readonly<Record<string, string>> = EN;

/** French messages, as the contract declares them. */
export const MESSAGES_FR: Readonly<Record<string, string>> = FR;

/** Parameters of a message: `{name}` placeholders replaced by these values. */
export type MessageParams = Readonly<Record<string, string | number>>;

/** What a screen calls to get a visible string; pure, no language choice inside. */
export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** Replaces every `{name}` placeholder; an absent parameter keeps its placeholder. */
function interpolate(template: string, params?: MessageParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+(?:[.-]\w+)*)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** The catalogue of one language. */
function catalogue(lang: Lang): Readonly<Record<string, string>> {
  return lang === 'fr' ? MESSAGES_FR : MESSAGES_EN;
}

/**
 * Translates one key. A key absent from the chosen catalogue falls back to the
 * English one, then to the key itself: a screen never renders `undefined`
 * (SPEC §20).
 */
export function translate(lang: Lang, key: MessageKey, params?: MessageParams): string {
  const template = catalogue(lang)[key] ?? MESSAGES_EN[key] ?? String(key);
  return interpolate(template, params);
}

/** Builds the `Translate` a viewmodel receives (SPEC §20). */
export function createTranslator(lang: Lang): Translate {
  return (key: MessageKey, params?: MessageParams) => translate(lang, key, params);
}

/**
 * Maps a Jira locale (e.g. "fr-FR", "en-US") to one of the two languages of the
 * app (SPEC §20): French when the locale says so, English otherwise — English
 * is the submission language and the fallback.
 */
export function langOfLocale(locale: string): Lang {
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
