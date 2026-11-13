# Télémétrie OpenCode — la vraie donnée, branchée sur l'app

Ce document dit ce qu'est la source, ce qu'on en tire, comment la régénérer,
et **ce qu'elle ne dit pas**. La honnêteté fait partie du résultat : une
donnée absente n'est pas une mesure.

## Ce qu'est OpenCode

OpenCode est un agent de code qui tourne **en local** : un agent qui lit un
dépôt, exécute des commandes, écrit des fichiers, et garde la trace de
chaque session. Sur cette machine il est installé dans
`~/.local/bin/opencode` (version 2.1.1).

L'intérêt pour « Délégable ou pas ? » est simple : **la télémétrie existe
déjà, chez nous, dans un format structuré**. Pas une estimation, pas un
tableur : des sessions avec un agent, un modèle, un coût, des jetons et une
durée.

## Où est la donnée

La base de vérité est une base SQLite :

```
~/.local/share/opencode/opencode.db
```

Elle est **écrite par OpenCode, jamais par nous**. Le script de récolte
l'ouvre en lecture seule (`file:…?mode=ro` + `readOnly: true`) ; il n'a
jamais le droit d'écrire dedans.

Les tables utilisées :

| Table | Ce qu'on y prend |
|---|---|
| `session` | `id`, `directory`, `title`, `agent`, `model`, `cost`, `tokens_input`, `tokens_output`, `summary_additions`, `summary_deletions`, `summary_files`, `time_created`, `time_updated` |
| `part` | les textes des messages, pour retrouver une clé de ticket (`PROJ-<n>`) |

`time_created` / `time_updated` sont en **millisecondes** : la durée réelle
d'une session est `time_updated - time_created`.

## Ce que la récolte produit

`tools/opencode/harvest.mjs` (Node, sans dépendance) fait le travail de
terrain ; `src/collect/opencode.ts` (domaine pur) transforme le résultat en
faits. Le script :

1. lit la base en lecture seule ;
2. **retient** les sessions dont le répertoire de travail existe encore et
   se trouve dans l'espace de travail (le `--home`, par défaut la maison) —
   les répertoires d'essai (`/tmp`) et les répertoires disparus sont écartés,
   avec la raison affichée dans le résumé ;
3. lit le modèle, le coût, les jetons, les lignes ajoutées/supprimées, les
   fichiers touchés, les horodatages ;
4. retrouve, quand elle existe, la **clé de ticket** (`PROJ-<n>`) dans le
   titre ou dans les messages de la session ;
5. **anonymise** et **trie**, puis écrit `src/sample/opencode-real.json`.

### Le fichier versionné

```json
{ "generatedAt": "…", "source": "opencode", "sessions": [ … ] }
```

Une session par ligne, pour que le diff reste lisible. Le fichier est
**déterministe** : même base ⇒ même fichier, octet pour octet. Le tri est fait
sur la clé publique (le hash), et `generatedAt` est déduit des données (la
fin de la dernière session retenue), pas de l'heure du passage du script —
c'est ce qui évite que la garde de fraîcheur du site flotte à chaque
régénération.

### L'anonymat (le dépôt est public)

| Ce qui entrait | Ce qui sort |
|---|---|
| `ses_…` (identifiant de session) | `oc_<16 caractères de hash>` (sha256, stable) |
| `/home/qui/Bureau/projet-x` | `Bureau/projet-x` (relatif à la maison) |
| un email, une clé d'API, un jeton | `[…]` |
| un chemin absolu dans un titre | `[…]` |
| le nom d'utilisateur, dans un titre | `[…]` |

Les titres de session sont **gardés** : ils disent le travail réellement
demandé (« Audit catalogue MP-PCSI-PSI-PT », « Corriger le crash au
démarrage »). Seuls les fragments qui ressemblent à un identifiant sont
remplacés. Un garde-fou final vérifie chaque titre avant écriture : si un
motif resemble encore à une donnée personnelle, le titre entier passe à
`[…]`.

## Brancher la donnée sur le domaine

`src/collect/opencode.ts` est **pur** (ni `fs`, ni `sqlite`, ni réseau) :

| Fonction | Ce qu'elle dit |
|---|---|
| `involvementFromSession` | niveau `autonomous` pour l'agent `build`, `driven` sinon ; source `mcp-declaration` (la plus sûre du SPEC §5) ; client `opencode` ; **modèle réellement utilisé** |
| `outcomeFromSession` | délai = **durée réelle** de la session, en heures ; `clean` et `reopened` à `false` |
| `costFromSession` | **coût réel** en euros et volume de jetons (entrée + sortie) |
| `summarise` | sessions, coût total, jetons, durée totale, répartition par modèle, sessions rattachées à un ticket |
| `parseDataset` | lit le JSON sans faire confiance à sa forme |

Pourquoi `autonomous` : une session OpenCode, c'est un agent qui a fait le
travail. Pourquoi `driven` pour les autres : les agents `general` et
`explore` travaillent **sur consigne**, pas seuls. Pourquoi `mcp-declaration` :
c'est une déclaration d'agent, la source la plus sûre du SPEC §5 — bien plus
sûre qu'un nom d'auteur lu dans un commit.

## Le relevé réel (cette machine)

Le jeu de données versionné a été récolté sur les sessions de la machine :

- **681 sessions** retenues (sur 691 dans la base) ;
- **coût total : 0 €** — toutes les sessions retenues ont tourné sur des
  modèles gratuits ; les deux sessions payantes vivaient dans des
  répertoires d'essai, écartés du jeu public ;
- **228 749 390 jetons** (entrée + sortie) ;
- **768,09 heures** de travail réel ;
- **0 session** rattachée à une clé de ticket (aucun `PROJ-<n>` dans les
  titres ni dans les messages de la machine) ;
- répartition par modèle : `opencode/space-bunny-free` (366),
  `opencode/muse-spark-1.3-contributor-free` (254),
  `opencode/deepseek-v4.1-flash-free` (24),
  `openrouter/dots-studio/dots-3-note-preview:free` (11),
  `openrouter/inclusionai/ling-3.1-flash` (8), puis des modèles à une
  session ou trois.

## Régénérer

```sh
node tools/opencode/harvest.mjs --dry-run   # résumé, n'écrit rien
node tools/opencode/harvest.mjs             # écrit src/sample/opencode-real.json
```

Options : `--db <base>`, `--out <fichier>`, `--home <répertoire>`,
`--from-json <fichier>` (pour travailler sur des sessions brutes en JSON,
utilisé par les tests) et `--dry-run`.

Le script n'a besoin que de `node:sqlite` (Node 22.5 ou plus) et du module
`node:fs`. Il n'écrit jamais dans la base.

## Ce que ces données **ne disent pas**

C'est la partie la plus importante du document.

- **Rien sur la réouverture.** La base ne dit pas si un ticket a été rouvert
  après sa clôture. `reopened` vaut donc `false` : donnée absente, pas
  mesure (SPEC §20).
- **Rien sur la propreté d'une clôture.** Pas de « bug à la suite », pas
  d'incident, pas de lien de graphe : `clean` vaut `false` pour la même
  raison.
- **Pas de revue.** Aucun compte rendu de revue lisible, donc aucune
  indication de « reprise humaine » ni de « ticket pris en charge par
  quelqu'un ».
- **Pas de ticket fiable.** La clé de ticket sort d'un motif `PROJ-<n>`
  trouvé dans un texte libre : c'est un indice, pas une preuve de
  rattachement. Sur cette machine, il n'y en a aucune.
- **Pas de coût représentatif.** Le coût dépend des modèles employés ; sur
  des modèles gratuits, il est nul. Le chiffre est réel, il n'est pas
  représentatif d'une équipe qui paie ses modèles.
- **Le répertoire de travail n'est pas un dépôt.** `Bureau` signifie
  « travail lancé depuis le dossier `Bureau` », pas « dépôt `Bureau` ».
- **Pas d'association ticket ↔ session.** Sans clé de ticket, on ne sait pas
  à quel ticket rattacher une session ; l'app ne l'invente pas.

## Pourquoi c'est malgré tout la source la plus proche du réel

C'est la **seule** source d'implication d'agent qui soit vraie, datée et
mesurée : un agent a travaillé, pendant tant de temps, avec tel modèle, pour
tel coût. Les autres sources (mention de commit, auteur robot, date
d'adoption) sont des *indices* reconstruites après coup ; ici, la preuve est
l'enregistrement lui-même.

C'est aussi pourquoi le domaine reste prudent : `involvementFromSession`
donne un niveau et une source, et rien d'autre. Le reste — réouverture,
propreté, ticket — reste inconnu tant que la donnée ne le dit pas.
