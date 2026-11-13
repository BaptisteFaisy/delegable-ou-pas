# DIFFS-REELS — attribuer les vrais diffs aux sessions, sans mentir

Lot « les vrais diffs » (`lot/diffs`). Ce document dit **ce que la règle
d'attribution fait**, **ce qu'elle permet**, **ce qu'elle ne permet pas**, et
**ce que la donnée réelle dit** — avec les effectifs et les fourchettes.

## 1. Le trou que ce lot ferme

La récolte OpenCode (`src/sample/opencode-real.json`, 865 sessions) porte
`additions`, `deletions` et `filesTouched` **à `0` pour toutes les sessions** :
la base SQLite du poste ne contient pas les diffs (CONTRATS-REALITE.md §2).

Conséquence : le module « signaux faibles » (`src/domain/signals.ts`) n'a
**aucune donnée réelle** à exploiter — il ne tourne que sur du fictif. Les
signaux « taille du diff » et « fichiers touchés » valent `0` partout, ce qui
les rend muets, pas faux : muets, c'est honnête ; faux, non.

La donnée des diffs, elle, existe : elle est dans l'historique git des dépôts
réels du poste (`git log --numstat`) et dans `tools/lab/real-runs.json`
(5 sessions du bac à sable, avec leurs vrais commits et leurs vraies lignes).

## 2. La règle d'attribution

Le module pur est `src/collect/diffs.ts` ; la CLI qui appelle `git` est
`tools/opencode/diffs.mjs`. Pour une session de fenêtre `[debut, fin]` :

| Commits dans la fenêtre | Attribution | `ajouts` / `suppressions` / `fichiersTouches` |
| --- | --- | --- |
| exactement **un** | `exacte` | les lignes et les fichiers de ce commit |
| **plusieurs** | `fenetre` | les lignes et les fichiers **agrégés**, et le nombre de commits retenus |
| **aucun** | `aucune` | `-1`, `-1`, `-1` |

Trois règles ne bougent pas :

1. **Jamais un commit hors de la fenêtre.** La fenêtre est une condition, pas
   une préférence : un commit du 12 novembre n'entre pas dans la session du 13.
2. **`-1` veut dire « on ne sait pas », `0` veut dire « mesuré, valait zéro ».**
   Une session sans commit n'a pas « zéro ligne ajoutée » : elle n'a pas de
   diff mesuré. Les modules qui comptent doivent distinguer les deux — c'est
   la règle « on ne sait pas est une conclusion » appliquée à la donnée
   (CONTRATS-REALITE.md §1).
3. **L'ambiguïté est comptée, pas cachée.** Le cas `fenetre` expose le nombre
   de commits retenus : un lecteur doit pouvoir voir qu'une fenêtre à deux
   commits n'est pas une preuve.

Un cas particulier : un commit qui contient un **fichier binaire** ne donne
pas de lignes comptables. Le total de lignes est alors incomplet, donc il
vaut `-1` — le fichier touché, lui, reste compté (`git numstat` sort
`-\t-\t<fichier>` pour un binaire).

## 3. Ce que ça permet

- **Un vrai volume de travail** pour les sessions d'un dépôt git : lignes
  ajoutées / supprimées et fichiers touchés, mesurés, plus le niveau
  d'attribution qui dit à quel point la mesure est fiable.
- **Un signal « signaux faibles »nourri par du réel** : la taille du diff et
  le nombre de fichiers ne sont plus des zéros de façade, mais des mesures
  assorties de leur intervalle.
- **Un recoupement vérifiable** : le module, appliqué à l'historique réel du
  bac à sable et aux fenêtres réelles des 5 sessions du lab, retrouve
  **exactement** les chiffres versionnés dans `tools/lab/real-runs.json`
  (1/1/1, 33/1/2, 18/1/1, 20/2/1, 14/3/2 — additions/suppressions/fichiers).
  C'est le test `tests/collect/diffs.test.ts`.

## 4. Ce que ça ne permet pas

- **Pas de preuve d authorship.** Une session « exacte » est une session dont
  la fenêtre contient un commit : le commit peut avoir été écrit par un agent,
  par un humain, ou par les deux. L'attribution est **temporelle**, elle ne dit
  rien de qui a écrit le code. C'est exactement la limite que le contrat pose
  (CONTRATS-REALITE.md §2 : « une session ne devient pas "celle de l'agent"
  parce qu'elle est proche dans le temps »).
- **Pas de couverture des sessions hors dépôt.** Une session lancée dans un
  dossier qui n'est pas un dépôt git n'a aucun historique à interroger : son
  attribution reste `aucune`, ses valeurs restent `-1`.
- **Pas de remontée de projet.** Une session lancée depuis `~/Bureau` (le
  dossier parent, qui n'est pas un dépôt) a pu travailler dans n'importe quel
  dépôt enfant. La clé de projet ne dit pas lequel : par prudence, ces sessions
  restent `aucune`. Les enrichir exigerait de savoir **quel** dépôt a été
  touché — le travail du module « l'historique d'un dépôt comme graphe réel »
  (`src/collect/git-history.ts`), pas celui-ci.
- **Pas de reconstruction de la commande.** Les lignes sont celles du commit,
  pas celles de l'agent : un refactor ou un revert se compte comme il est.

## 5. Ce que la donnée réelle dit

Sur la version versionnée du 13 novembre 2026 (865 sessions), réparties par clé
de projet :

| Clé de projet | Sessions | Le dossier est-il un dépôt git ? |
| --- | --- | --- |
| `Bureau` | 708 (81,8 % ; 79,1 % – 84,3 %) | non — dossier parent de plusieurs dépôts |
| `home` (dossier personnel) | 109 (12,6 % ; 10,6 % – 15,0 %) | non |
| `Bureau/opencode-lab` | 26 | oui |
| `Bureau/cardwake` | 20 | oui |
| `Bureau/creux` | 2 | oui |

Intervalles de Wilson (méthode du dépôt, `src/domain/stats.ts`, z = 1,96).

Bilan :

- **48 sessions sur 865 (5,5 % ; 4,2 % – 7,3 %)** sont dans un répertoire
  qui est un dépôt git : ce sont les seules dont les diffs peuvent être
  attribués aujourd'hui.
- **817 sessions sur 865 (94,5 % ; 92,7 % – 95,8 %)** sont dans un répertoire
  qui n'est pas un dépôt : leur attribution reste `aucune`, leurs valeurs
  restent `-1`. Parmi elles, **109** portent la clé de projet `home`
  (dossier personnel) : aucune n'a de dépôt, l'attribution `aucune` est donc
  certaine, pas prudente.

> **Note d'honnêteté.** Le chiffre avancé au départ pour ce lot — « 70
> sessions sur 865 dans des projets non git » — **ne se retrouve pas** dans la
> version courante du jeu de données : la récolte du 13 novembre 2026 compte
> **109** sessions à la clé `home` sur 865, et **48** sessions dans un dépôt
> git. Ce document retient les chiffres **vérifiés** sur le fichier versionné,
> effectifs et fourchettes à l'appui ; l'écart est signalé plutôt que
> recopié.

## 6. La CLI, et ce qu'elle a produit sur une exécution réelle

```
node tools/opencode/diffs.mjs --repo <dépôt> --sessions <json> --out <json> [--dry-run]
```

La CLI lit `git log --numstat --no-merges` du dépôt donné, apparie les
sessions **dont le projet est ce dépôt** à leur fenêtre `[debut, fin]`, et
écrit **uniquement** dans `--out`. Elle refuse d'écrire un fichier généré
(`src/sample/opencode-real.json`, `site/demo-data.json`,
`tools/lab/real-runs.json` : hors périmètre des lots, CONTRATS-REALITE.md §5).
Ni le chemin du dépôt ni le nom d'un auteur de commit ne sortent dans les
données produites : seule la clé de projet relative (`Bureau/cardwake`) et les
comptes figurent dans le fichier écrit.

Exécutions réelles du 13 novembre 2026 sur les 865 sessions versionnées :

| Dépôt | Sessions du dépôt | `exacte` | `fenetre` | `aucune` |
| --- | --- | --- | --- | --- |
| `Bureau/opencode-lab` | 26 | 5 | 0 | 21 |
| `Bureau/cardwake` | 20 | 3 | 1 | 16 |
| `Bureau/creux` | 2 | 1 | 0 | 1 |
| `Bureau/delegable-ou-pas` | 0 | 0 | 0 | 0 |

Sur les 48 sessions d'un dépôt git : **9 `exacte`** (18,8 % ; 10,2 % – 31,9 %),
**1 `fenetre`** (2,1 % ; 0,4 % – 10,9 %), **38 `aucune`** (79,2 % ;
65,7 % – 88,3 %). Sur les 865 sessions lues, **10** portent un diff attribué
(1,2 % ; 0,6 % – 2,1 %).

Deux remarques honnêtes :

- Les 38 sessions `aucune` des dépôts git ne sont pas des échecs : ce sont
  des sessions dont la fenêtre ne contient **aucun** commit (l'agent a
  travaillé sans committer, ou a committé dans un autre dépôt). Leur diff
  reste inconnu, donc `-1`.
- Le dépôt `Bureau/delegable-ou-pas` n'a **aucune** session OpenCode dans le
  jeu récolté : la CLI y lit 86 commits et n'enrichit personne. C'est le
  résultat honnête, pas une erreur d'exécution.

## 7. Ce qui reste à faire

- Relier les sessions des dossiers parents aux dépôts enfants qu'elles ont
  réellement touchés (`src/collect/git-history.ts`), pour sortir les 708
  sessions `Bureau` de l'`aucune` — sans le faire par simple proximité
  temporelle.
- Récolter les diffs là où ils existent déjà (la base d'un autre client, les
  journaux du lab), pour réduire les `-1`.
- Utiliser les mesures `exacte` pour calibrer les signaux faibles
  (`src/domain/signals.ts`) sur des données réelles : tant que la précision
  n'est pas mesurée, le signal reste muet.

## Fichiers du lot

- `src/collect/diffs.ts` — module pur : parse `git log --numstat`, attribue.
- `tools/opencode/diffs.mjs` — CLI : appelle `git`, apparie, écrit.
- `tests/collect/diffs.test.ts` — tests sur échantillons réels + recoupement
  avec `tools/lab/real-runs.json`.
- `docs/DIFFS-REELS.md` — ce document.
