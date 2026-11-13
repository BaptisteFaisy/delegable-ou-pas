/**
 * Tests du module « les vrais diffs » (`src/collect/diffs.ts`).
 *
 * Les échantillons de `git log --numstat` sont **recopiés ici** : ce sont les
 * vraies sorties du dépôt bac à sable (`~/Bureau/opencode-lab`), coupées dans
 * le fichier de test — jamais générées à l'exécution. Un test qui fabriquerait
 * sa propre sortie git ne prouverait rien du réel (CONTRATS-REALITE.md §4
 * règle 5).
 *
 * Le recoupement final se fait sur `tools/lab/real-runs.json` : les 5 sessions
 * du bac à sable ont leurs **vrais** diffs versionnés ; le module, appliqué à
 * l'historique réel et aux fenêtres réelles, doit retrouver exactement les
 * mêmes chiffres.
 *
 * Aucun réseau, aucune base vivante : tout vient des fichiers versionnés.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attribuerDiffs, commitsDansFenetre, parseGitLogNumstat } from '../../src/collect/diffs.js';
import type { CommitLu } from '../../src/collect/diffs.js';

const LAB_RUNS = fileURLToPath(new URL('../../tools/lab/real-runs.json', import.meta.url));

/**
 * Sortie RÉELLE de `git log --numstat --no-merges --date=iso-strict
 * --format='commit %H%x09%aI%x09%an'` sur le dépôt bac à sable
 * (`~/Bureau/opencode-lab`, 6 commits) — recopiée telle quelle.
 */
const ECHANTILLON_GIT_LOG = [
  'commit dd9d053d81138064ec46f3e9f3e3fd9fd646749e\t2026-11-13T18:59:11+01:00\tOpenCode Agent',
  '',
  '11\t3\tnotes.py',
  '3\t0\ttests/test_notes.py',
  'commit 7a73551e56f402bd921d5055434edd63dfc20e77\t2026-11-13T18:58:14+01:00\tOpenCode Agent',
  '',
  '20\t2\tREADME.md',
  'commit abce112e144ebc1104f6f3431f260f7b3fcb058c\t2026-11-13T18:57:44+01:00\tOpenCode Agent',
  '',
  '18\t1\ttests/test_notes.py',
  'commit 1c08945c3608553378894b2d5e0124ee4bf1d022\t2026-11-13T18:56:39+01:00\tOpenCode Agent',
  '',
  '22\t0\tnotes.py',
  '11\t1\ttests/test_notes.py',
  'commit 1bd51fd5cd2b10bc11a32399cbff3f1d55b38011\t2026-11-13T18:54:48+01:00\tOpenCode Agent',
  '',
  '1\t1\tcli.py',
  'commit 9c46bd188c4fe4a7828f8806d20ace87eeb2511a\t2026-11-12T22:11:10+01:00\tOpenCode Agent',
  '',
  '2\t0\t.gitignore',
  '1\t0\t.lab-marker',
  '34\t0\tREADME.md',
  '30\t0\tcli.py',
  '32\t0\tnotes.py',
  '20\t0\ttests/test_notes.py',
].join('\n');

/** L'historique réel du bac à sable, lu par le module. */
function commitsDuLab(): readonly CommitLu[] {
  return parseGitLogNumstat(ECHANTILLON_GIT_LOG);
}

/** Les 5 sessions réelles du bac à sable, telles que versionnées. */
function sessionsDuLab(): readonly {
  id: string;
  additions: number;
  deletions: number;
  filesTouched: number;
  startedAt: string;
  endedAt: string;
}[] {
  const brut = JSON.parse(readFileSync(LAB_RUNS, 'utf8')) as {
    sessions: { id: string; additions: number; deletions: number; filesTouched: number; startedAt: string; endedAt: string }[];
  };
  return brut.sessions;
}

describe('lecture d’un git log --numstat réel', () => {
  it('lit tous les commits de l’historique réel', () => {
    const commits = commitsDuLab();
    expect(commits).toHaveLength(6);
    expect(commits[0].sha).toBe('dd9d053d81138064ec46f3e9f3e3fd9fd646749e');
    expect(commits[0].auteur).toBe('OpenCode Agent');
    expect(commits[0].date).toBe('2026-11-13T18:59:11+01:00');
  });

  it('compte les lignes et les fichiers de chaque commit', () => {
    const commits = commitsDuLab();
    expect(commits[0].ajouts).toBe(14);
    expect(commits[0].suppressions).toBe(3);
    expect(commits[0].fichiers).toEqual(['notes.py', 'tests/test_notes.py']);
    expect(commits[0].lignesInconnues).toBe(false);
    expect(commits[3].ajouts).toBe(33);
    expect(commits[3].fichiers).toEqual(['notes.py', 'tests/test_notes.py']);
  });

  it('ne confond pas un commit et une ligne de numstat', () => {
    const commits = commitsDuLab();
    expect(commits.every((commit) => /^[0-9a-f]{40}$/.test(commit.sha))).toBe(true);
    expect(commits.every((commit) => commit.fichiers.length > 0)).toBe(true);
  });
});

describe('attribution par fenêtre', () => {
  it('un seul commit dans la fenêtre : attribution exacte', () => {
    const attribution = attribuerDiffs(commitsDuLab(), {
      debut: '2026-11-13T17:54:29Z',
      fin: '2026-11-13T17:54:50Z',
    });
    expect(attribution.attribution).toBe('exacte');
    expect(attribution.ajouts).toBe(1);
    expect(attribution.suppressions).toBe(1);
    expect(attribution.fichiersTouches).toBe(1);
    expect(attribution.commitsRetenus).toBe(1);
    expect(attribution.ambiguite).toBe(false);
    expect(attribution.shas).toEqual(['1bd51fd5cd2b10bc11a32399cbff3f1d55b38011']);
  });

  it('plusieurs commits dans la fenêtre : attribution fenêtre, ambiguïté comptée', () => {
    const attribution = attribuerDiffs(commitsDuLab(), {
      debut: '2026-11-13T17:57:00Z',
      fin: '2026-11-13T17:59:30Z',
    });
    expect(attribution.attribution).toBe('fenetre');
    expect(attribution.commitsRetenus).toBe(3);
    expect(attribution.ambiguite).toBe(true);
    expect(attribution.ajouts).toBe(52);
    expect(attribution.suppressions).toBe(6);
    expect(attribution.fichiersTouches).toBe(3);
  });

  it('aucun commit dans la fenêtre : on ne sait pas, donc -1', () => {
    const attribution = attribuerDiffs(commitsDuLab(), {
      debut: '2026-11-13T17:50:00Z',
      fin: '2026-11-13T17:53:00Z',
    });
    expect(attribution.attribution).toBe('aucune');
    expect(attribution.ajouts).toBe(-1);
    expect(attribution.suppressions).toBe(-1);
    expect(attribution.fichiersTouches).toBe(-1);
    expect(attribution.commitsRetenus).toBe(0);
  });

  it('ne retient jamais un commit hors de la fenêtre', () => {
    const retenus = commitsDansFenetre(commitsDuLab(), {
      debut: '2026-11-13T17:54:51Z',
      fin: '2026-11-13T17:55:00Z',
    });
    expect(retenus).toHaveLength(0);
    const attribution = attribuerDiffs(commitsDuLab(), {
      debut: '2026-11-13T17:54:51Z',
      fin: '2026-11-13T17:55:00Z',
    });
    expect(attribution.attribution).toBe('aucune');
    expect(attribution.shas).toEqual([]);
  });

  it('une fenêtre illisible ne retient rien (on ne prouve pas ce qu’on ne sait pas)', () => {
    const attribution = attribuerDiffs(commitsDuLab(), { debut: '', fin: '' });
    expect(attribution.attribution).toBe('aucune');
    expect(attribution.commitsRetenus).toBe(0);
  });

  it('un fichier binaire donne des lignes inconnues (-1), pas un faux zéro', () => {
    const binaire: CommitLu = {
      sha: 'a'.repeat(40),
      auteur: 'OpenCode Agent',
      date: '2026-11-13T17:54:48Z',
      ajouts: 0,
      suppressions: 0,
      fichiers: ['image.png'],
      lignesInconnues: true,
    };
    const attribution = attribuerDiffs([binaire], {
      debut: '2026-11-13T17:54:29Z',
      fin: '2026-11-13T17:54:50Z',
    });
    expect(attribution.attribution).toBe('exacte');
    expect(attribution.ajouts).toBe(-1);
    expect(attribution.suppressions).toBe(-1);
    expect(attribution.fichiersTouches).toBe(1);
  });
});

describe('recoupement avec la donnée réelle du bac à sable', () => {
  it('retrouve les vrais diffs des 5 sessions du lab', () => {
    const commits = commitsDuLab();
    const sessions = sessionsDuLab();
    expect(sessions).toHaveLength(5);
    for (const session of sessions) {
      const attribution = attribuerDiffs(commits, { debut: session.startedAt, fin: session.endedAt });
      expect(attribution.attribution).toBe('exacte');
      expect(attribution.ajouts).toBe(session.additions);
      expect(attribution.suppressions).toBe(session.deletions);
      expect(attribution.fichiersTouches).toBe(session.filesTouched);
    }
  });

  it('la première session du lab : 1 ligne ajoutée, 1 fichier touché', () => {
    const session = sessionsDuLab()[0];
    const attribution = attribuerDiffs(commitsDuLab(), {
      debut: session.startedAt,
      fin: session.endedAt,
    });
    expect(attribution.ajouts).toBe(1);
    expect(attribution.fichiersTouches).toBe(1);
    expect(attribution.commitsRetenus).toBe(1);
  });
});
