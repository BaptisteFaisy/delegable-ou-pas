# Conventions

Règles de code du dépôt. Elles sont **opposables** : la CI les vérifie, et une PR
qui les contredit est rouge. Le cahier des charges est
[CAHIER-DES-CHARGES.md](CAHIER-DES-CHARGES.md) (le « SPEC ») ; le découpage est
dans [ARCHITECTURE.md](ARCHITECTURE.md) ; l'état réel de la chaîne dans
[CI.md](CI.md).

## Code

- **Un fichier < 500 lignes, une fonction < 50 lignes.** Au-delà, on découpe
  (module, helper, sous-composant) — jamais on ne laisse grossir. La CI lance
  `python3 tools/check-file-limits.py` et `node tools/check-function-limits.mjs`.
- **Zéro duplication.** Un helper existe une fois : on cherche l'existant avant
  d'écrire, et si un autre lot a produit le helper dont on a besoin, on le
  réutilise au lieu d'en écrire un second. Les fakes vivent dans
  `tests/helpers/`, les messages dans `src/i18n/`, les requêtes dans `src/db/`.
- **Le domaine est pur.** `src/domain/` n'importe jamais `@forge/*`, ni
  `node:fs`, ni le réseau. Aucune lecture d'horloge ni d'identifiant ambiant :
  **jamais `Date.now()`**, l'horloge et les identifiants sont injectés
  (`src/deps.ts`). C'est ce qui permet de tester les maths du SPEC (Wilson,
  médianes, seuil, masquage) en mémoire et sans réseau.
- **Typage strict** : `strict`, `noUnusedLocals`, `noUnusedParameters`. Pas de
  `any`, pas de `!` non justifié, pas de `@ts-ignore` sans la raison écrite en
  commentaire au-dessus.
- **Imports avec l'extension `.js`** : `import { wilson } from './stats.js'`.
  C'est la forme qu'exige le paquetage Forge ; une importation sans extension
  casse au déploiement, pas à la compilation.
- **Les données absentes sont normales** : une ligne manquante rend `null`, une
  liste vide rend `[]`. Jamais d'exception pour « pas encore là ». Un droit
  manquant sur le graphe vide le résultat sans erreur (SPEC §17, §19) : c'est à
  l'écran de couverture de le dire, pas au code de lever.
- **Rien ne se supprime.** On remplace, on garde l'historique : une décision
  enregistrée, une époque close, un essai arrêté restent lisibles (SPEC §20,
  §21 « les anciens chiffres restent visibles, grisés »).
- Chaque module cite en tête de fichier les `SPEC §n` et `DP-nn` qu'il réalise.
- Commentaires de code **en anglais**, `docs/` **en français**. Les chaînes
  visibles par l'utilisateur passent par i18n, jamais en dur dans un composant.

## Les trois non-négociables du produit

Vérifiés par des tests nommés d'après le comportement (SPEC §22) :

1. **Aucun taux sans son effectif et sa fourchette.** Toute proportion sort en
   `{ n, rate, ciLow, ciHigh }`, ensemble (§7 règle 3, recette 10).
2. **« On ne sait pas » est une conclusion.** Sous le seuil d'effectif, bras
   déséquilibrés ou trop d'implication inconnue : `not-enough-data`, jamais un
   chiffre seul (§7 règles 2, 4, 5).
3. **Jamais par personne.** Aucun écran, aucun outil MCP, aucun export ne rend un
   nom de personne ; `peopleCount` ne sert qu'à masquer une cohorte portée par
   moins de trois personnes (DP-17, recettes 11 et 12). Un ticket d'implication
   inconnue n'est **jamais** compté comme « sans agent » (DP-03, recette 2).

## Nommage

- Dossiers en `kebab-case` (`src/viewmodel`, `tests/acceptance/recette-01`).
- Fichiers TypeScript en **un mot** autant que possible (`stats.ts`,
  `cohort.ts`) ; quand le nom en compose plusieurs, `camelCase`
  (`graphCursor.ts`, `cohortStats.ts`).
- Types et interfaces en `PascalCase` (`CohortStat`, `InvolvementLevel`).
- Constantes de domaine en `MAJUSCULES_SOUS_TRAITS` (`WILSON_Z`,
  `MIN_SAMPLE_PER_ARM`).
- Clés de message i18n en `domaine.point` (`cohort.not-enough-data`,
  `card.reinforced-review`).
- Clés de module du manifeste en `kebab-case`, préfixées par ce qu'elles
  décrivent (`delegation-card-panel`, `fn-should-delegate`).

## Tests

- **Un test par comportement, nommé d'après le comportement** :
  `it('affiche « pas assez de recul » quand un bras compte 12 tickets')`, pas
  `it('testCohort2')`.
- Aucun réseau : les tests du domaine n'utilisent **que** les fakes de
  `tests/helpers/` (horloge fixe, base en mémoire, graphe fictif).
- Les chiffres de référence du SPEC sont des cas de test : 83 % sur 41 →
  [69 % ; 91 %], 86 % sur 37 → [72 % ; 94 %], 69 % sur 26 → [50 % ; 84 %]
  (§7 règle 3, §8).
- La recette du SPEC §22 (16 points) est couverte point par point dans
  `tests/acceptance/recette-NN` ; chaque exigence `DP-nn` a au moins un test qui
  la nomme.
- Les données sensibles au temps utilisent l'horloge injectée : un test ne dépend
  jamais de la date du jour (maturité 30 j / 60 j, époques).

## Messages

- Toute chaîne visible existe **en anglais et en français** (`src/i18n/`),
  l'interface est bilingue et la soumission est en anglais (§20).
- Un message nomme **la donnée et ce qui est attendu** : « La cohorte
  « migration de données · facturation » compte 12 tickets avec agent, il en faut
  20 pour conclure. » Jamais « une erreur est survenue », jamais un code brut.
- Un message d'échec dit toujours lequel des quatre états s'applique : mieux,
  pareil, moins bien, **on ne sait pas**.

## Commits et PR

- **Une PR = un lot.** Le message de commit dit ce qui change (pas « wip »), en
  français.
- Le corps contient la section **`## Scope`**, en puces
  `` - `chemin` — raison `` : un motif est un fichier exact, un dossier
  (`src/domain` couvre `src/domain/**`) ou un glob. **Tout fichier modifié doit
  être déclaré, et toute déclaration doit servir** — une déclaration inutile est
  refusée comme « périmètre surdimensionné » (garde `couche0`).
- Les fichiers de garde (`.github/workflows/ci.yml`, `.github/couche0/`,
  `.github/ci-budget/`, `.github/workflows/pr-auto-merge.yml`) exigent la ligne
  **en texte libre** `SAMVISION_ALLOW_GUARD_BUMP` dans le corps.
- **Le merge est fait par la file Mergify, jamais à la main.** Le frein manuel
  est l'étiquette `hold` (ou `intervention-humaine`) : aucune saisine d'agent,
  aucun merge automatique.
- Un changement de contrat — types partagés, ports, `manifest.yml` — se fait
  **seul**, dans une PR dédiée, avec `CONTRACT-CHANGE` dans le corps. Un lot
  d'implémentation ne modifie jamais un fichier partagé : il définit ce qui lui
  manque dans son propre module et le signale (`CONTRACT-NEEDED: …`).

## Git

- `main` est protégé : pas de push direct, tout passe par une PR (ruleset
  « PR obligatoire, checks requis »).
- Branches : `lot/<nom>` pour un lot, `fix/<sujet>` pour une correction.
- Une PR devenue `DIRTY` est résolue par l'agent de conflit : on ne force rien à
  la main. Une poussée forcée reste exceptionnelle et se fait **avec bail**
  (`--force-with-lease`), jamais en écrasement sec.
- **Aucune dépendance npm ajoutée sans raison écrite** dans le corps de la PR.
  Le socle (TypeScript, vitest, `@forge/*`) vient du lot L0.

## CI

- Le verdict tombe en **5 minutes maximum** : `timeout-minutes: 5` sur chaque
  job, `concurrency` par PR, `fetch-depth: 1`. Un run trop long n'est pas
  « lent », il est cassé : on optimise ou on découpe, **jamais** on n'allonge un
  timeout.
- Les runners sont auto-hébergés et persistants : `node_modules` est conservé
  (`git clean -ffdx -e /node_modules`), le cache npm est partagé, et
  l'installation n'a lieu que si `package-lock.json` a changé.
- En local, la même vérification que la CI :
  `npx tsc --noEmit && npx vitest run && python3 tools/check-file-limits.py && node tools/check-function-limits.mjs`.
- Le détail des checks, de la file et des procédures de dépannage est dans
  [CI.md](CI.md).
