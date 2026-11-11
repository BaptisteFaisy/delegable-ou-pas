import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const GARDE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'tools',
  'check-function-limits.mjs',
);

const ARBRES: string[] = [];

type Resultat = { code: number; sortie: string };

/** Lance le garde sur une racine et rend le code de sortie + la sortie. */
function lancerGarde(racine: string): Resultat {
  try {
    const sortie = execFileSync(process.execPath, [GARDE, '--racine', racine], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, sortie };
  } catch (err) {
    const echec = err as { status?: number | null; stdout?: string; stderr?: string };
    return {
      code: echec.status ?? 1,
      sortie: `${echec.stdout ?? ''}${echec.stderr ?? ''}`,
    };
  }
}

/** Écrit des fichiers dans une arborescence temporaire et rend sa racine. */
function arbreTemporaire(fichiers: Record<string, string>): string {
  const racine = mkdtempSync(join(tmpdir(), 'garde-fonctions-'));
  ARBRES.push(racine);
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    const cible = join(racine, chemin);
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, contenu, 'utf8');
  }
  return racine;
}

/** Fonction TypeScript de exactement `lignesCode` lignes de code. */
function fonctionDeTaille(lignesCode: number): string {
  const corps = Array.from(
    { length: lignesCode - 4 },
    (_, i) => `  total += ${i};`,
  ).join('\n');
  return [
    'export function mesure(): number {',
    '  let total = 0;',
    corps,
    '  return total;',
    '}',
  ].join('\n');
}

afterEach(() => {
  while (ARBRES.length > 0) {
    rmSync(ARBRES.pop() as string, { recursive: true, force: true });
  }
});

describe('garde de taille des fonctions', () => {
  it('attrape une fonction de 60 lignes', () => {
    const racine = arbreTemporaire({ 'src/mesure.ts': fonctionDeTaille(60) });
    const resultat = lancerGarde(racine);
    expect(resultat.code).toBe(1);
    expect(resultat.sortie).toContain('mesure.ts:1');
    expect(resultat.sortie).toContain('mesure()');
    expect(resultat.sortie).toContain('60 lignes');
  });

  it('laisse passer une fonction de 10 lignes', () => {
    const racine = arbreTemporaire({ 'src/mesure.ts': fonctionDeTaille(10) });
    const resultat = lancerGarde(racine);
    expect(resultat.code).toBe(0);
    expect(resultat.sortie).toContain('0 fonction(s) hors limite');
  });

  it('ne compte ni les commentaires ni les chaînes multilignes', () => {
    const commentaires = Array.from(
      { length: 60 },
      (_, i) => `  // commentaire ${i}`,
    ).join('\n');
    const texte = Array.from({ length: 30 }, (_, i) => `ligne ${i}`).join('\n');
    const source = [
      'export function bruitee(): string {',
      commentaires,
      `  return \`${texte}\`;`,
      '}',
    ].join('\n');
    // 63 lignes physiques, mais seulement 3 lignes de code.
    const racine = arbreTemporaire({ 'src/bruit.ts': source });
    const resultat = lancerGarde(racine);
    expect(resultat.code).toBe(0);
    expect(resultat.sortie).toContain('0 fonction(s) hors limite');
  });

  it('ignore les fichiers générés', () => {
    const racine = arbreTemporaire({
      'src/api.generated.ts': fonctionDeTaille(80),
      'src/types.d.ts': fonctionDeTaille(80),
    });
    const resultat = lancerGarde(racine);
    expect(resultat.code).toBe(0);
  });
});
