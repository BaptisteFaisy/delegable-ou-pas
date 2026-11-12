# R3 — Les mentions d'agent dans les messages de commit

SPEC §5, §17, §19 · DP-02. État des sources publiques au 12 novembre 2026, leurs
**désaccords**, et pourquoi l'app ne parie sur aucun d'eux : le catalogue est
réglable et confirmable par l'équipe.

## 1. Ce que disent les sources publiques

Quatre outils sont cités par les sources publiques comme ajoutant une ligne
`Co-authored-by` au message de commit : **Claude Code**, **Codex**, **Cursor**
et **Copilot**. C'est l'état retenu par le SPEC §19, rubrique « connu par des
sources tierces, à confirmer sur les dépôts de l'équipe ».

| Outil | Ce que les sources publiques indiquent | Fiabilité |
|---|---|---|
| Claude Code | une ligne `Co-authored-by` ajoutée au message, désactivable par réglage | **désaccord** : l'adresse citée diffère selon les sources |
| Codex | une ligne `Co-authored-by` ajoutée au message | **désaccord** : l'adresse citée diffère selon les sources |
| Cursor | une ligne `Co-authored-by` ajoutée au message | concordant entre sources, non vérifié sur dépôt |
| Copilot | une ligne `Co-authored-by` pour l'assistance en ligne ; **format de l'agent autonome non confirmé** | le plus incertain des quatre |

Ce qui est sûr, c'est le **désaccord** : au moins un outil est cité avec des
adresses différentes selon les sources, et le format utilisé par l'agent
autonome de Copilot n'est confirmé nulle part de façon stable. Trois causes
reviennent dans les sources :

1. **les formats changent** d'une version à l'autre de l'outil ;
2. **les équipes les désactivent** (réglage « ne pas ajouter de co-auteur »), ou
   les filtres de messages de commit les retirent ;
3. **la fusion par écrasement** peut réécrire le message final et emporter la
   mention (point 1.6 du `docs/VALIDATION-PLAN.md`).

## 2. Pourquoi l'app ne parie sur aucun format

Si la reconnaissance automatique reposait sur une liste figée d'adresses, trois
échecs suffiraient à fausser toutes les statistiques : un outil qui change de
format, une équipe qui désactive le co-auteur, une fusion par écrasement. Et
l'échec serait **silencieux** : les tickets retomberaient dans « sans agent »,
ce qui est exactement l'erreur que le produit interdit (DP-03 : une implication
inconnue ne compte jamais comme « sans agent »).

D'où trois décisions de conception.

### 2.1 La mention n'est que la troisième source sur cinq

L'arbitrage retient la meilleure source disponible (SPEC §5, DP-01) :

| Rang | Source | Ce qui la fonde |
|---|---|---|
| 1 | déclaration MCP | l'agent déclare lui-même son niveau, son client, son modèle, sa session |
| 2 | compte robot auteur | l'auteur du commit est un compte robot de l'organisation |
| 3 | **mention de commit** | une ligne `Co-authored-by` reconnue par le catalogue |
| 4 | champ à la clôture | un champ personnalisé Jira renseigné par l'équipe |
| 5 | date d'adoption | avant la date déclarée, « sans agent » par construction |

Une mention absente ne fait donc pas tomber un ticket dans « sans agent » : il
tombe dans « inconnue », et l'écran le dit. Sur le jeu de démonstration,
**42 % des tickets sont en implication inconnue** — c'est l'ordre de grandeur
attendu d'une équipe réelle qui débute, et l'app l'affiche au lieu de le
masquer (`docs/DEMO-DATA.md`, FIG-07).

### 2.2 Le catalogue est réglable, et il montre ce qu'il voit

Le catalogue vit en base (`signature_pattern`, SPEC §18) : un motif par ligne,
avec son expression, le nom d'agent qu'il publie, un booléen d'activation et un
**compteur d'occurrences vues** (`seen_count`).

Conséquence pour l'équipe : l'écran de réglages liste les motifs réellement
rencontrés, avec leur nombre d'occurrences et la dernière date de rencontre. Un
motif à zéro occurrence depuis des semaines est un signal — soit l'outil a
changé de format, soit l'équipe ne l'utilise plus. Un motif inconnu qui
apparaît se règle en une ligne, sans redéploiement.

Le jeu de démonstration livre un catalogue de quatre motifs
(`sampleSignaturePatterns()`), un par outil cité par les sources publiques, tous
publiant le même compte robot `agent-bot-1` : le jeu ne nomme aucun outil réel
dans ses données (SPEC §20 « Neutralité » : aucune comparaison entre outils sans
décision explicite de l'équipe).

### 2.3 Le message est lu, puis écarté

La reconnaissance lit le message et ne conserve que deux faits : « mention
trouvée ou non » et « nom d'agent lu » (`CommitFact.hasSignature`,
`CommitFact.agentName`, SPEC §17). Le message lui-même n'est jamais stocké,
jamais affiché, jamais envoyé à un écran ou à un outil MCP. Une citation libre
n'a pas sa place dans une statistique : les preuves sont des **clés
structurées** (`mention:agent-bot-1`, `author:agent-bot-1`, `tool:code-agent`).

## 3. Ce qu'il faut confirmer sur un dépôt réel

| Question | Test | Ce qui change si la réponse est mauvaise |
|---|---|---|
| Le champ `message` contient-il la **dernière ligne** ? | lire trois commits connus, dont un avec mention en dernière ligne | la source 3 disparaît ; il reste les sources 1, 2, 4 |
| La mention survit-elle à une **fusion par écrasement** ? | fusionner une branche signée, relire le commit final et les commits de branche | lire les commits de branche, encore liés au ticket |
| Quels formats cette équipe produit-elle **vraiment** ? | laisser tourner le catalogue une semaine, lire les occurrences vues | régler les motifs depuis l'écran, sans redéploiement |
| Un compte **robot** existe-t-il dans l'organisation ? | demander à l'administrateur ; vérifier l'auteur des commits d'agent | activer la source 2, plus sûre que la source 3 |

## 4. Ce que nous ne faisons pas

- **Aucun classement d'outils.** Le nom d'agent lu sert à retrouver le motif qui
  l'a produit, pas à comparer des produits entre eux (SPEC §20 « Neutralité »).
- **Aucune déduction par auteur humain.** Un compte robot est un rôle déclaré
  par l'organisation ; un développeur n'est jamais déduit « avec agent » parce
  qu'il commit vite, tard, ou beaucoup (DP-17 : aucune statistique par
  personne).
- **Aucune confiance aveugle dans une source tierce.** Tant qu'un format n'est
  pas vu sur le dépôt de l'équipe, il n'est pas dans le catalogue par défaut :
  il est proposé, et l'équipe le confirme (SPEC §19).
