# CONTRATS-REALITE — les briques « donnée réelle »

Contrat gelé le 13 novembre 2026 pour les dix lots qui rendent l'app
**auto-hébergée et prouvée**. Tout lot qui touche à la réalité passe par les
types ci-dessous : pas de second vocabulaire, pas de second format.

## 1. La session unifiée

Un agent, quel qu'il soit, a produit des **sessions**. Toutes les sessions,
quelle que soit leur origine, se décrivent avec la même forme :

```ts
/** Origine de la session : le client qui l'a réellement exécutée. */
export type Client = 'opencode' | 'claude-code' | 'codex' | 'copilot' | 'inconnu';

export interface Modele {
  readonly provider: string;   // 'opencode', 'anthropic', 'openai'…
  readonly id: string;          // 'space-bunny-free', 'claude-opus-4-6'…
}

/** D'où viennent les lignes ajoutées / supprimées / fichiers touchés. */
export type Attribution = 'exacte' | 'fenetre' | 'aucune';

export interface SessionReelle {
  readonly id: string;            // '<client>_' + 16 caractères hexadécimaux
  readonly client: Client;
  readonly projet: string;        // relatif, jamais un chemin absolu
  readonly titre: string;
  readonly agent: string;         // 'build', 'general', 'explore'… ou ''
  readonly modele: Modele;
  readonly coutEuros: number;     // coût réel du modèle, 0 s'il est gratuit
  readonly jetonsEntree: number;
  readonly jetonsSortie: number;
  readonly ajouts: number;        // -1 quand la donnée n'est pas connue
  readonly suppressions: number;  // -1 quand la donnée n'est pas connue
  readonly fichiersTouches: number; // -1 quand la donnée n'est pas connue
  readonly dureeMs: number;
  readonly debut: string;         // ISO 8601
  readonly fin: string;           // ISO 8601
  readonly cleTicket: string | null; // 'PROJ-101' ou null
  readonly attribution: Attribution;
}
```

**Règle du `-1`** : une valeur absente est `-1`, jamais `0`. Zéro veut dire
« mesuré, valait zéro » ; `-1` veut dire « on ne sait pas ». Les modules qui
comptent doivent distinguer les deux — c'est la règle « on ne sait pas est une
conclusion » appliquée à la donnée.

## 2. Les sources, et leur honnêteté

| Source | Ce qu'elle apporte | Ce qu'elle n'apporte pas |
| --- | --- | --- |
| `~/.local/share/opencode/opencode.db` | sessions, modèle, jetons, durée | **aucun diff** (`ajouts`/`fichiers` valent 0 : la base ne les porte pas) |
| `~/.claude/projects/**/*.jsonl` | sessions d'un autre client | les mêmes trous, sous une autre forme |
| `~/.codex/` | sessions Codex | à confirmer |
| `tools/lab/real-runs.json` | sessions du bac à sable : **diff et commit réels** | 5 sessions seulement |
| un dépôt git (`git log --numstat`) | **les vrais diffs**, les vraies mentions d'agent, les vraies dates | ne dit pas quelle session a produit quel commit |

La ligne qui compte : **une session ne devient pas « celle de l'agent » parce
qu'elle est proche dans le temps**. L'attribution par fenêtre temporelle est
acceptable si elle est **marquée** (`attribution: 'fenetre'`), et refusée sinon.

## 3. Les modules du lot (qui écrit quoi)

| Module | Rôle |
| --- | --- |
| `src/domain/coverage.ts` | couverture **réelle** : combien de sessions connues, rattachées à un ticket, par projet et par modèle — avec effectifs et intervalle |
| `src/domain/data-quality.ts` | anomalies de la donnée : sessions sans agent, sans jetons, durée nulle, durée aberrante, diffs inconnus |
| `src/collect/diffs.ts` | attribution des **vrais diffs** à une session, via l'historique git du projet |
| `src/collect/claude-code.ts` | lecteur des sessions d'un client autre qu'OpenCode |
| `src/collect/git-history.ts` | l'historique d'un dépôt comme **graphe réel** : tickets, mentions d'agent, diffs, dates |
| `src/domain/machine-cost.ts` | le coût **machine** réel d'une session (les modèles sont gratuits, la machine ne l'est pas) |
| `src/domain/backtest.ts` | rejouer l'historique et comparer ce que l'app aurait dit à ce qui s'est passé |

## 4. Les règles, sans exception

1. **`src/domain/` est pur** : aucun `fs`, aucun chemin, aucune horloge non
   injectée, aucun réseau. Les entrées arrivent en paramètres.
2. **Un fichier < 500 lignes, une fonction < 50 lignes.** Au-delà : on
   découpe. Les gardes le vérifient (`python3 tools/check-file-limits.py`,
   `node tools/check-function-limits.mjs`).
3. **Aucun chiffre sans son effectif et sa fourchette.** L'intervalle de
   Wilson du dépôt (`src/domain/stats.ts`) se réutilise tel quel ; on ne
   réimplémente pas une formule.
4. **Jamais par personne.** Aucun nom, aucun classement individuel, dans les
   modules comme dans les tests.
5. **La donnée réelle est la donnée versionnée** : `src/sample/opencode-real.json`
   (865 sessions) et `tools/lab/real-runs.json` (5 sessions du lab). Les tests
   s'en servent **tels quels** ; un test qui construit sa propre fixture ne
   prouve rien sur le réel.
6. **Aucun réseau** dans la CI, aucun accès à la base vivante dans les tests :
   la base vivante se prouve par `tools/prove-real.mjs`, pas par la suite.

## 5. La publication

- Branche : `lot/<nom-du-lot>` (jamais `main`).
- Le corps de la PR commence par `## Scope` et liste **le chemin exact** de
  chaque fichier touché (une puce par fichier, chemin complet). La garde
  `couche0` refuse sinon.
- **Jamais de merge manuel** : la file Mergify merge seule ; le balayeur
  `pr-auto-merge` rebase et résout les conflits.
- **Jamais de push sur `main`**, jamais de `--force` (sauf `--force-with-lease`).
- Les fichiers générés (`src/sample/opencode-real.json`, `site/demo-data.json`)
  sont **hors périmètre** des lots : ils sont régénérés à la fin, une fois,
  par le lot d'intégration.

## 6. Ce qui est déjà fait (ne pas le refaire)

- `tools/prove-real.mjs` : huit preuves en direct, reçu `docs/PREUVES-REELLES.md`.
- `tests/collect/opencode-real.test.ts` : neuf tests sur le jeu réel.
- `tools/lab/` : le bac à sable, `run-session.sh`, `collect.sh`.
- `tools/opencode/harvest.mjs` + `source-db.mjs` : la récolte et la lecture du
  schéma de la base.
