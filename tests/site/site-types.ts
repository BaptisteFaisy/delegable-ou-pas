/**
 * Shared shapes of the site generator: a panel is a bilingual label, a
 * bilingual summary, and whatever the domain produced. The site renders any
 * structure, so a panel never needs a bespoke type.
 */
import type { Arm, Level, Nature, Size } from '../../src/types.js';

/** Bilingual text, the only form the site accepts for a sentence. */
export interface Bilingual {
  readonly fr: string;
  readonly en: string;
}

/** One panel of the site: chrome + payload. */
export interface Panel {
  readonly label: Bilingual;
  readonly summary: Bilingual;
  readonly [key: string]: unknown;
}

/** The flat view of a sample ticket the panels aggregate. */
export interface SiteTicket {
  issueId: string;
  nature: Nature;
  zone: string;
  size: Size;
  level: Level;
  arm: Arm | null;
  clean: boolean;
  leadTimeH: number;
  closedAt: string;
  reopened: boolean;
}

/** Both arms of one cohort, plus the tickets of unknown involvement. */
export interface ArmTotals {
  readonly key: string;
  readonly agent: { clean: number; total: number; leadTimes: number[] };
  readonly human: { clean: number; total: number; leadTimes: number[] };
  readonly unknown: number;
}
