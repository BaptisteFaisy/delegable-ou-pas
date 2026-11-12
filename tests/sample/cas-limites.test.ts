/**
 * The named edge cases of the base — SPEC §21, §22.
 *
 * One test per named ticket: the case it demonstrates is asserted on the facts
 * the game produces, never on a copy of them (SPEC §24.1). The rules come
 * from the domain wherever the domain owns them: maturity, the trial draw, the
 * move to another project, the privacy of the people.
 */
import { describe, expect, it } from 'vitest';
import { isMature, judgeable, judgeableAt } from '../../src/domain/maturity.js';
import { moveTicketToProject } from '../../src/domain/cohort.js';
import { cohortMask } from '../../src/domain/privacy.js';
import {
  sampleCards, sampleCommitFacts, sampleInvolvements, sampleLinks, sampleOutcomes,
  sampleReopenings, sampleSeeds, sampleTrialAssignments,
} from '../../src/sample/index.js';
import { cleanOf } from '../../src/sample/outcomes.js';
import { SAMPLE_ADOPTION_DATE, SAMPLE_NOW, SAMPLE_REFERENCE_DATE, addDays, daysBetween } from '../../src/sample/project.js';

const SEEDS = sampleSeeds();
const OUTCOMES = sampleOutcomes();
const INVOLVEMENTS = sampleInvolvements();
const LINKS = sampleLinks();
const REOPENINGS = sampleReopenings();
const COMMITS = sampleCommitFacts();

/** The seed of one named ticket. */
function seedOf(key: string) {
  const seed = SEEDS.find((candidate) => candidate.key === key);
  expect(seed, `${key} absent de la base`).toBeDefined();
  return seed!;
}

/** The outcome of one named ticket. */
function outcomeOf(key: string) {
  const outcome = OUTCOMES.find((candidate) => candidate.issueId === seedOf(key).id);
  expect(outcome, `${key} sans résultat`).toBeDefined();
  return outcome!;
}

/** The card of one named ticket, when the demo shows one. */
function cardOf(key: string) {
  return sampleCards().find((card) => card.issueKey === key);
}

describe('PROJ-118 — clos avant la date d\'adoption', () => {
  it('le bras « sans agent », jamais le bras agent', () => {
    const seed = seedOf('PROJ-118');
    expect(seed.closedAt < SAMPLE_ADOPTION_DATE).toBe(true);
    expect(seed.level).toBe('none');
    expect(seed.arm).toBe('human');
    expect(seed.source).toBe('adoption-date');
  });
});

describe('PROJ-412 — la carte du SPEC §8', () => {
  it('le ticket est dans la cohorte de la carte', () => {
    const seed = seedOf('PROJ-412');
    expect(seed.nature).toBe('data-migration');
    expect(seed.zone).toBe('billing');
    expect(seed.size).toBe('M');
    expect(seed.arm).toBe('agent');
    expect(cardOf('PROJ-412')).toBeDefined();
  });
});

describe('PROJ-509 — lié à un incident ouvert', () => {
  it('le lien porte l\'incident, et le garde-fou interdit de confier', () => {
    const seed = seedOf('PROJ-509');
    const link = LINKS.find((item) => item.issueId === seed.id && item.linkedIsIncident);
    expect(link, 'PROJ-509 n\'est lié à aucun incident').toBeDefined();
    const card = cardOf('PROJ-509');
    expect(card?.guardrails).toContain('open-incident');
    expect(card?.value).not.toBe('delegate');
  });
});

describe('PROJ-517 — en zone sensible', () => {
  it('le garde-fou de la zone sensible est déclenché', () => {
    const seed = seedOf('PROJ-517');
    expect(seed.zone).toBe('data-pipeline');
    const card = cardOf('PROJ-517');
    expect(card?.guardrails).toContain('sensitive-zone');
    expect(card?.value).not.toBe('delegate');
  });
});

describe('PROJ-523 — sans critères d\'acceptation', () => {
  it('le garde-fou des critères manquants est déclenché', () => {
    const seed = seedOf('PROJ-523');
    expect(seed.hasDescription).toBe(false);
    const card = cardOf('PROJ-523');
    expect(card?.guardrails).toContain('missing-acceptance-criteria');
    expect(card?.value).not.toBe('delegate');
  });
});

describe('PROJ-531 — commits mêlés, signés et non signés', () => {
  it('niveau assisted, et une part signée sur la moitié des commits', () => {
    const seed = seedOf('PROJ-531');
    expect(seed.level).toBe('assisted');
    const commits = COMMITS.filter((commit) => commit.issueId === seed.id);
    expect(commits.length).toBeGreaterThan(1);
    const signed = commits.filter((commit) => commit.hasSignature).length;
    expect(signed).toBeGreaterThan(0);
    expect(signed).toBeLessThan(commits.length);
  });
});

describe('PROJ-540 — l\'agent muet', () => {
  it('implication inconnue, et jamais compté « sans agent »', () => {
    const seed = seedOf('PROJ-540');
    expect(seed.level).toBe('unknown');
    expect(seed.arm).toBe('unknown');
    const involvement = INVOLVEMENTS.find((item) => item.issueId === seed.id);
    expect(involvement?.level).toBe('unknown');
    const figures = SEEDS.filter((other) => other.family === seed.family);
    expect(figures.filter((other) => other.arm === 'human')).toHaveLength(0);
    expect(COMMITS.filter((commit) => commit.issueId === seed.id).every((commit) => !commit.hasSignature)).toBe(true);
  });
});

describe('PROJ-548 — réouverture administrative de 8 minutes', () => {
  it('la réouverture est écartée et la clôture propre tient', () => {
    const seed = seedOf('PROJ-548');
    const reopening = REOPENINGS.find((item) => item.issueId === seed.id);
    expect(reopening, 'PROJ-548 n\'a pas de réouverture').toBeDefined();
    expect(reopening?.durationMin).toBe(8);
    expect(reopening?.counts).toBe(false);
    expect(cleanOf(seed)).toBe(true);
    expect(outcomeOf('PROJ-548').clean).toBe(true);
  });
});

describe('PROJ-555 — bug voisin', () => {
  it('un signal faible : le lien existe, la clôture propre tient', () => {
    const seed = seedOf('PROJ-555');
    const link = LINKS.find((item) => item.issueId === seed.id && item.linkedIsBug);
    expect(link, 'PROJ-555 n\'a pas de bug voisin').toBeDefined();
    expect(link?.type).toBe('relates-to');
    expect(cleanOf(seed)).toBe(true);
  });
});

describe('PROJ-562 — bug relié par « est causé par »', () => {
  it('ce n\'est pas une clôture propre', () => {
    const seed = seedOf('PROJ-562');
    const link = LINKS.find((item) => item.issueId === seed.id && item.type === 'caused-by');
    expect(link, 'PROJ-562 n\'a pas de bug à la suite').toBeDefined();
    expect(cleanOf(seed)).toBe(false);
    expect(outcomeOf('PROJ-562').clean).toBe(false);
  });
});

describe('PROJ-571 — rouvert sous 30 jours', () => {
  it('ce n\'est pas une clôture propre, et il est jugeable au bout de 30 jours', () => {
    const seed = seedOf('PROJ-571');
    expect(seed.failure.reopened).toBe(true);
    expect(cleanOf(seed)).toBe(false);
    expect(outcomeOf('PROJ-571').clean).toBe(false);
    const outcome = outcomeOf('PROJ-571');
    expect(judgeableAt(outcome).slice(0, 10)).toBe(addDays(outcome.closedAt, 30).slice(0, 10));
    expect(daysBetween(outcome.closedAt, judgeableAt(outcome))).toBe(30);
  });
});

describe('PROJ-611 — déplacé de projet', () => {
  it('il change de cohorte, il garde son implication et son résultat', () => {
    const seed = seedOf('PROJ-611');
    expect(seed.movedFromProject).toBe('proj-other-002');
    const involvement = INVOLVEMENTS.find((item) => item.issueId === seed.id);
    const moved = moveTicketToProject({
      issueId: seed.id,
      projectId: 'proj-other-002',
      level: involvement?.level ?? 'unknown',
      issueClass: { issueId: seed.id, nature: seed.nature, zone: seed.zone, size: seed.size, classifiedBy: 'rules', contentHash: '', sizeEstimated: false },
    }, 'proj-demo-001');
    expect(moved.level).toBe(involvement?.level ?? 'unknown');
    expect(moved.issueClass.nature).toBe(seed.nature);
    expect(outcomeOf('PROJ-611').clean).toBe(cleanOf(seed));
  });
});

describe('PROJ-701 — dans l\'essai contrôlé, tirage respecté', () => {
  it('il reste dans l\'essai', () => {
    const seed = seedOf('PROJ-701');
    const assignment = sampleTrialAssignments().find((item) => item.issueId === seed.id);
    expect(assignment, 'PROJ-701 n\'a pas de tirage').toBeDefined();
    expect(assignment?.complied).toBe(true);
    expect(assignment?.excludedReason).toBe('');
  });
});

describe('PROJ-706 — dans l\'essai, tirage non respecté', () => {
  it('il sort de l\'essai avec le motif', () => {
    const seed = seedOf('PROJ-706');
    const assignment = sampleTrialAssignments().find((item) => item.issueId === seed.id);
    expect(assignment, 'PROJ-706 n\'a pas de tirage').toBeDefined();
    expect(assignment?.complied).toBe(false);
    expect(assignment?.excludedReason).toContain('tirage non respecté');
  });
});

describe('PROJ-812 — reprise humaine déclarée', () => {
  it('la reprise est vraie, et aucun nom de personne n\'apparaît', () => {
    const seed = seedOf('PROJ-812');
    expect(seed.failure.takeover).toBe(true);
    expect(outcomeOf('PROJ-812').takeover).toBe(true);
    expect(JSON.stringify(seed)).not.toMatch(/@[a-z]+\.|displayName|email/i);
  });
});

describe('PROJ-820 — abandonné après démarrage', () => {
  it('le ticket est abandonné, et sa clôture n\'est pas propre', () => {
    const seed = seedOf('PROJ-820');
    expect(seed.failure.abandoned).toBe(true);
    expect(seed.closedStatus).toBe('Abandonné');
    expect(seed.status).toBe('Abandonné');
    expect(outcomeOf('PROJ-820').clean).toBe(false);
  });
});

describe('PROJ-902 — clos il y a 10 jours', () => {
  it('pas encore mûr : il sort du taux de clôture propre', () => {
    const outcome = outcomeOf('PROJ-902');
    expect(outcome.closedAt).toBe('2026-11-20T12:00:00Z');
    expect(isMature(outcome, SAMPLE_NOW)).toBe(false);
    expect(judgeable([outcome], SAMPLE_NOW)).toHaveLength(0);
    expect(SAMPLE_REFERENCE_DATE).toBe('2026-11-30');
  });
});

describe('PROJ-950 — sans commit (documentation)', () => {
  it('nature à part, hors des cohortes de code', () => {
    const seed = seedOf('PROJ-950');
    expect(seed.nature).toBe('no-code');
    expect(seed.commits).toBe(0);
    expect(COMMITS.filter((commit) => commit.issueId === seed.id)).toHaveLength(0);
  });
});

describe('la cohorte masquée', () => {
  it('moins de trois personnes : la cohorte est masquée', () => {
    const seed = seedOf('PROJ-611');
    const roles = new Set(SEEDS.filter((other) => other.family === seed.family).map((other) => other.role));
    expect(cohortMask(roles.size).masked).toBe(true);
  });
});
