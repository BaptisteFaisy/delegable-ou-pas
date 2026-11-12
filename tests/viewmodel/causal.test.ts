/**
 * Tests of `src/viewmodel/causal.ts` — SPEC §7 rule 5, §11 and §16; DP-09,
 * DP-10, DP-17, recipe 10.
 *
 * The fixture is a cohort of bugs in the API zone, medium size: twelve
 * tickets in the agent arm (ten of them closed cleanly) against ten in the
 * other arm. The exact matching pairs ten of them, and every pair goes the
 * same way, which is what makes the Rosenbaum bound readable.
 */
import { describe, expect, it } from 'vitest';

import type { MatchableTicket } from '../../src/domain/matching.js';
import { proportion } from '../../src/domain/stats.js';
import { causalView } from '../../src/viewmodel/causal.js';

/** A matchable ticket; defaults to a mid-size API bug closed in 10 h. */
function ticket(
  issueId: string,
  arm: 'agent' | 'human',
  nature: MatchableTicket['nature'] = 'bug',
  zone = 'api',
  size: MatchableTicket['size'] = 'M',
): MatchableTicket {
  return { issueId, arm, nature, zone, size, leadTimeH: 10 };
}

/** Zero-padded index, so the issue ids sort the way the fixture reads. */
function pad(index: number): string {
  return String(index).padStart(2, '0');
}

/** The two arms of the fixture: twelve tickets against ten. */
function arms(): { agent: MatchableTicket[]; human: MatchableTicket[] } {
  const agent: MatchableTicket[] = [];
  const human: MatchableTicket[] = [];
  for (let i = 1; i <= 10; i += 1) {
    agent.push(ticket(`A${pad(i)}`, 'agent'));
    human.push(ticket(`H${pad(i)}`, 'human'));
  }
  agent.push(ticket('A11', 'agent', 'feat', 'ui', 'S'));
  agent.push(ticket('A12', 'agent', 'feat', 'ui', 'S'));
  return { agent, human };
}

/** Clean closure of the fixture: the agent arm closes cleanly, the other does not. */
function cleanByIssueId(): Record<string, boolean> {
  const clean: Record<string, boolean> = {};
  for (let i = 1; i <= 10; i += 1) clean[`A${pad(i)}`] = true;
  for (let i = 1; i <= 10; i += 1) clean[`H${pad(i)}`] = false;
  return clean;
}

/** The view of the fixture, in the given language. */
function view(lang: 'fr' | 'en', overrides: Partial<Parameters<typeof causalView>[0]> = {}) {
  const { agent, human } = arms();
  return causalView(
    {
      agent,
      human,
      cleanByIssueId: cleanByIssueId(),
      observed: proportion(10, 12),
      nullValue: 0.5,
      ...overrides,
    },
    lang,
  );
}

/** Every word a visible sentence must never use to qualify an observed gap. */
const FORBIDDEN = [/\bcaus(e|es|é|ée)\b/i, /dû à/gi, /because of/gi];

describe('causalView — the answer to the director', () => {
  it('says on what the two groups are comparable and where they are not', () => {
    const projected = view('fr');
    expect(projected.comparableLines.length).toBeGreaterThan(0);
    expect(projected.comparableLines[0]).toContain('comparable sur');
    expect(projected.gapLines.length).toBeGreaterThan(0);
    expect(projected.gapLines[0]).toContain('écart standardisé');
  });

  it('renders the observed rate with its sample size and its interval (recipe 10)', () => {
    const projected = view('fr');
    expect(projected.observedLine).not.toBeNull();
    expect(projected.observedLine!.text).toContain('n = 12');
    expect(projected.observedLine!.interval).toContain('%');
  });

  it('says the tolerated selection gap and the limit beyond which it no longer holds', () => {
    const projected = view('fr');
    expect(projected.rosenbaumLine).toContain('10 paires appariées');
    expect(projected.rosenbaumLine).toContain('1.38');
    expect(projected.rosenbaumLine).toContain('l’appariement tient');
  });

  it('says the observation is not a causal answer, in both languages', () => {
    expect(view('fr').readinessLine).toContain('tirés au sort');
    expect(view('en').readinessLine).toContain('drawn at random');
  });

  it('renders without any data: no figure, no exception', () => {
    const projected = causalView(
      {
        agent: [],
        human: [],
        cleanByIssueId: {},
        observed: { n: 0, rate: 0, ciLow: 0, ciHigh: 1 },
        nullValue: 0.5,
      },
      'fr',
    );
    expect(projected.observedLine).toBeNull();
    expect(projected.noDataNotice).not.toBeNull();
    expect(projected.comparableLines).toEqual([]);
    expect(projected.gapLines).toEqual([]);
    expect(projected.usable).toBe(false);
  });

  it('never qualifies an observed gap with a causal word', () => {
    const projected = view('fr');
    const english = view('en');
    const sentences: string[] = [
      projected.title,
      projected.intro,
      ...projected.comparableLines,
      ...projected.gapLines,
      projected.referenceLine,
      projected.eValueLine,
      projected.confoundingLine,
      projected.rosenbaumLine,
      projected.readinessLine,
      english.title,
      english.intro,
      ...english.comparableLines,
      ...english.gapLines,
      english.referenceLine,
      english.eValueLine,
      english.confoundingLine,
      english.rosenbaumLine,
      english.readinessLine,
    ];
    for (const sentence of sentences) {
      for (const forbidden of FORBIDDEN) expect(sentence).not.toMatch(forbidden);
    }
  });
});
