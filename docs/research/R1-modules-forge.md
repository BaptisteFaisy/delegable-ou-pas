# R1 — Modules Forge et Teamwork Graph : état de la recherche

> Recherche documentaire du SPEC §19 (relevés des 10 et 11 novembre 2026),
> complétée le **11 novembre 2026** par les vérifications hors ligne faites sur
> le [`manifest.yml`](../../manifest.yml) de ce dépôt (§4).
> Ce document sépare trois états : **vérifié dans la documentation officielle**,
> **connu par des sources tierces et à confirmer**, **à valider par un
> prototype**. Rien ici ne remplace un essai sur un vrai site relié à un dépôt.

---

## 1. Vérifié dans la documentation

### 1.1 Le manifeste Forge

Le schéma embarqué par la CLI est `@forge/manifest` **13.9.0**. Sur le bloc
`app`, il n'admet que : `description`, `id`, `runtime`, `compatibility`,
`access`, `licensing`, `features`, `connect`, `storage`, `package` — avec
`additionalProperties: false` et `id`, `runtime` obligatoires.

- **Il n'y a pas de clé `app.name`** : le nom affiché d'une app se saisit à la
  création (`forge create`) et se modifie dans la console développeur. Un
  manifeste qui déclare `app.name` est refusé par le schéma (constat du §4).
- **`app.id`** est un ARI de forme `ari:cloud:ecosystem::app/<uuid>` ;
  `forge lint` refuse un identifiant d'app qui n'a pas la forme d'un UUID v4,
  d'où un identifiant provisoire de forme valide en attendant `forge create`.
- **`app.runtime`** (`name`, `architecture`, `memoryMB`) et
  **`app.compatibility`** sont bien reconnus par le schéma 13.9.0 — alors que le
  schéma 1.5.1 des dépôts frères ne les connaissait pas : un manifeste validé
  contre 1.5.1 n'est pas automatiquement valide contre 13.9.0, et l'inverse non
  plus.

### 1.2 Les objets du graphe : commit et pull request

- **Commit externe.** Champs : empreinte, message, auteur, date de création,
  dépôt, adresse. **Aucun champ sur les fichiers** — impossible de savoir quels
  fichiers un commit touche sans passer par le dépôt lui-même.
- **Pull request externe.** Champs : état (ouverte, fusionnée, refusée,
  brouillon), relecteurs avec leur avis (approuvé, à revoir, sans avis), nombre
  de commentaires, dates, auteur. **Ni taille ni branches.**

### 1.3 Les types de relations

- Un ticket Jira est relié à des **commits**, des **branches** et des **builds**.
- Une PR est reliée à **ses commits**.
- Un utilisateur est relié aux commits et PR qu'il a créés, et aux PR qu'il a
  relues.
- **Aucune relation directe entre un ticket et une PR.** Le seul chemin est
  `ticket → commit`, puis `PR → commit` : la collecte des PR dépend donc de la
  collecte préalable des commits (ARCHITECTURE.md §4).

### 1.4 L'API du graphe : Preview, et ses règles

- En **Preview**.
- Lecture **au nom d'un utilisateur**.
- Deux formes : requêtes enregistrées, ou requêtes prêtes à l'emploi.
- **Un droit par type d'objet**, accordé par l'administrateur de l'organisation.
- **Un droit manquant vide le résultat sans erreur** : un zéro silencieux est
  indiscernable d'une absence de données — d'où l'écran de couverture qui teste
  chaque type d'objet sur un ticket dont la réponse est connue (SPEC §16.6,
  recette 15).
- **Une app consomme l'API ou fournit un connecteur, pas les deux.** Celle-ci
  consomme : aucun connecteur n'est exposé.

### 1.5 `rovo:mcp` et `action`

- **`rovo:mcp`** : Preview, **un seul module par app**, **50 outils au plus**.
  Chaque outil doit désigner une clé du module `action` du même manifeste.
  L'exposition à un client MCP externe est désactivée par défaut : un
  administrateur l'active par site.
- **`action`** : entrées **simples** uniquement (`string`, `integer`, `number`,
  `boolean` — ni tableau ni objet), bornée à **55 s**. Verbes `GET`, `CREATE`,
  `UPDATE`, `DELETE`, `TRIGGER`.
- **Un agent lancé par une automatisation Jira n'appelle que des actions `GET`** :
  c'est pourquoi les six outils de lecture du SPEC §15 sont déclarés `GET`
  (la répartition du sprint peut être calculée à l'ouverture du sprint), et les
  trois outils d'écriture `CREATE` / `UPDATE`.
- **`rovo:agent`** : `name` plafonné à **30 caractères**, prompt obligatoire (en
  ligne ou via `resource:<clé>;<chemin>`), liste d'actions référençant des clés
  `action`.

### 1.6 `scheduledTrigger` et Forge SQL

- **Déclencheur planifié** : intervalles autorisés `fiveMinute`, `hour`, `day`,
  `week` ; exécution bornée à **900 s** (le `timeoutSeconds` se déclare sur le
  module `function` référencé, pas sur le déclencheur). Un run en échec n'est pas
  rejoué avant le tour suivant.
- **Forge SQL** : **1 Gio** par installation, **5 s par `SELECT`** (10 s par
  écriture), pas de clé étrangère formelle, pas de transaction multi-requêtes
  documentée. Le module `sql` du manifeste n'accepte que `key`, `engine`
  (`mysql`) et `dareCompliant` : **aucune table ne se déclare dans le
  manifeste**, le DDL vit en code et s'exécute par `migrationRunner`.

### 1.7 Agir hors ligne au nom d'un utilisateur

Le mécanisme **existe dans Forge**, avec des droits déclarés à cet effet.
**Il n'est pas vérifié pour le graphe** : le schéma 13.9.0 n'expose pas de bloc
`permissions.runtime`, et rien dans la documentation du graphe ne dit qu'une
identité différée y est acceptée. En conséquence, la collecte du graphe est
conçue pour tourner **dans une session utilisateur ouverte**, par tranches avec
reprise sur curseur — c'est le point 3 du §3.

---

## 2. Connu par des sources tierces, à confirmer sur les dépôts de l'équipe

- **Claude Code, Codex, Cursor et Copilot** ajoutent au message de commit une
  ligne `Co-authored-by` à leur nom.
- **Les adresses citées diffèrent selon les sources** pour au moins un outil :
  aucun motif n'est retenu comme acquis sur la foi d'un blog ou d'un forum.
- **Le format de l'agent autonome de Copilot n'est pas confirmé** (le
  comportement diffère entre l'assistance dans l'éditeur et l'agent qui travaille
  seul).
- Les formats changent d'un outil **et d'une version** à l'autre.

Conséquence de conception : la reconnaissance ne repose jamais sur une liste
figée. Le catalogue de motifs est **réglable** (`signature_pattern` : expression,
nom d'agent, actif, nombre d'occurrences vues) et l'écran de réglages affiche les
mentions **réellement vues** sur les commits de l'équipe, pour qu'elle les
confirme (SPEC §5, DP-02). Les motifs tiers ne sont qu'une amorce ; la première
collecte sur un vrai dépôt fait foi. Et l'absence de mention ne prouve rien :
`unknown` n'est jamais compté comme « sans agent » (DP-03).

---

## 3. Les neuf points à valider par un prototype la première semaine

| # | Point | Pourquoi | Solution de repli |
|---|---|---|---|
| 1 | Le champ `message` contient-il le message **entier**, dernière ligne comprise | Fonde toute la reconnaissance automatique : les mentions `Co-authored-by` sont en fin de message | Déclaration par MCP `record-involvement`, champ à la clôture, compte robot auteur |
| 2 | **Volume et pagination** des requêtes sur le graphe, dans le temps d'une session | Douze mois d'historique à lire pendant qu'une page est ouverte | Tranches plus petites, fenêtre réduite à six mois |
| 3 | Graphe lisible **hors ligne au nom d'un utilisateur** | Collecte sans visiteur (DP-28), donc sans dépendre d'une page ouverte | Collecte à l'ouverture des pages (ce que fait l'architecture aujourd'hui) |
| 4 | Relation entre **incident JSM** et ticket, exploitable par requête | Mesure « incident » de la clôture propre (SPEC §6) | Liens Jira entre tickets |
| 5 | **Nombre d'allers-retours** de relecture | Le graphe ne donne que l'avis **actuel** de chaque relecteur, pas l'historique | Commentaires et commits ajoutés après l'ouverture de la PR |
| 6 | **Fusion par écrasement** : la mention survit-elle dans le commit final | Un squash peut perdre la dernière ligne du message | Commits de la branche, encore liés au ticket |
| 7 | **Taille des tickets** disponible | Troisième axe des cohortes (nature × zone × taille) | Taille estimée d'après la durée des tickets semblables |
| 8 | **Qualité du classement de nature** par le modèle | Premier axe des cohortes ; un classement bruité mélange des travaux incomparables | Type de ticket et étiquettes, règles avant modèle (DP-06) |
| 9 | **Effectifs réels** d'une équipe moyenne sur six mois | Tout le produit : sous 20 tickets par bras, la conclusion est « pas assez de recul » | Cohortes plus larges (repli au niveau supérieur), et « on ne sait pas » assumé |

Les points 1, 2, 3 et 6 conditionnent la collecte ; 7 et 8 conditionnent les
cohortes ; 9 conditionne l'utilité réelle. Un prototype sur un vrai projet relié
à un dépôt les tranche tous en quelques jours (SPEC §25, semaine du 11 au
17 novembre).

---

## 4. Vérifications hors ligne faites sur ce dépôt (11 novembre 2026)

**La CLI Forge ne peut pas tourner ici.** Deux constats, à ne pas confondre :

- `~/.local/opt/bin/forge` est bien la CLI Atlassian (`@forge/cli` **15.1.0**),
  mais elle refuse de démarrer : `Error: Unsupported Node.js version. The CLI
  requires Node.js ^22.23.4 || ^24.22.1 || >=26.12.1, but you're using Node.js
  v26.9.0.` — sortie exacte de `forge lint` et de `forge --version`.
- `~/.local/bin/forge` est **un homonyme** : `forge` de Foundry, qui « lint » du
  Solidity. Il répond `nothing to lint` sans rien vérifier. Un vert obtenu avec
  ce binaire ne vaut rien.

Le manifeste a donc été validé autrement, en trois passes reproductibles :

1. **YAML** : `python3 -c "import yaml;yaml.safe_load(open('manifest.yml'))"` —
   chargement sans erreur.
2. **Schéma JSON** : validation Ajv (draft-07) contre
   `@forge/manifest/out/schema/manifest-schema.json` en **13.9.0**, le schéma
   qu'embarque la CLI 15.1.0. Deux défauts corrigés à cette occasion :
   `app.name` (clé refusée par le schéma, §1.1) et un ARI d'app nul
   (`00000000-…`, remplacé par un UUID de forme v4). Verdict final :
   **conforme**.
3. **Cohérence interne** : 41 contrôles — 13 fonctions toutes référencées par un
   module (aucune orpheline), 9 actions exactement avec les clés du §15, 6 `GET` /
   2 `CREATE` / 1 `UPDATE`, entrées simples et complètes, un seul `rovo:mcp`
   listant exactement les 9 actions, noms `rovo:agent` (24 caractères) et
   `rovo:mcp` (16) sous le plafond de 30, ressources référencées déclarées,
   modules Jira du §16 présents, deux champs personnalisés, fonction JQL
   `delegable`, événements de déclencheur et intervalle autorisés,
   `timeoutSeconds: 900`, module `sql` sans clé hors schéma, 17 scopes uniques
   dont 4 `read:graph`, et les 14 tables du §18 listées avec leurs colonnes.

**Les scopes sont vérifiés contre les listes officielles**, et non devinés : les
17 droits déclarés figurent tous dans les listes de `@forge/manifest` 13.9.0, et
les quatre droits de graphe
(`read:graph:commit:external`, `read:graph:pull-request:external`,
`read:graph:issue:jira`, `read:graph:user:atlassian`) dans
`out/scopes/teamwork-graph-scopes.json`. À noter : le schéma JSON accepte
`permissions.scopes` comme un simple tableau de chaînes — **la validité d'un nom
de scope n'est pas vérifiée par le schéma**, elle l'est au déploiement. C'est
donc la confrontation aux listes de scopes, et le premier `forge deploy`, qui
font foi.

Reste ouvert : tout ce que seul un déploiement ou un prototype peut trancher —
les neuf points du §3, et le comportement réel du graphe en Preview.

---

## 5. Liens (SPEC §29)

- [Commit externe, Teamwork Graph](https://developer.atlassian.com/platform/teamwork-graph/api-reference/object-types/ExternalCommit/)
- [Pull request externe, Teamwork Graph](https://developer.atlassian.com/platform/teamwork-graph/api-reference/object-types/ExternalPullRequest/)
- [Types de relations, Teamwork Graph](https://developer.atlassian.com/platform/teamwork-graph/api-reference/relationship-types/overview/)
- [Permissions Forge, agir hors ligne au nom d'un utilisateur](https://developer.atlassian.com/platform/forge/manifest-reference/permissions/)
- Mentions de commit des agents, sources tierces :
  [forum Cursor](https://forum.cursor.com/t/disable-auto-co-authored-by-cursor-on-agent-commits-or-make-it-opt-in/168258/8),
  [notes sur Codex](https://codex.danielvaughan.com/2026-04-30/agent-fingerprints-pull-requests-codex-cli-git-hygiene/),
  [guide de traçabilité](https://cc.bruniaux.com/guide/ai-traceability/)
- [Module Rovo MCP](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/),
  [module Action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/),
  [module Rovo Agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/)
- [Déclencheur planifié](https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/)
- [Modules Jira](https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-jira/)
- [Limites d'invocation](https://developer.atlassian.com/platform/forge/limits-invocation/)
  et [limites SQL](https://developer.atlassian.com/platform/forge/limits-sql/)
- [Codegeist 2026](https://codegeist2026.devpost.com/) et son
  [règlement](https://codegeist2026.devpost.com/rules)
