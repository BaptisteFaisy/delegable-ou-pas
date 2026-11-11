# Délégable ou pas ? — architecture

> Comment l'app tient sa promesse : dire, d'après l'historique de l'équipe et
> avec une statistique honnête, quel ticket confier à un agent, lequel confier
> sous relecture renforcée, lequel garder — et citer les tickets passés qui
> fondent chaque recommandation.
> Le cahier des charges est [CAHIER-DES-CHARGES.md](CAHIER-DES-CHARGES.md)
> (le « SPEC ») ; les renvois `§n` pointent vers ses sections, `DP-nn` vers ses
> exigences (§14). Le manifeste est déclaré dans [`manifest.yml`](../manifest.yml) ;
> l'état de la recherche plateforme est dans
> [`research/R1-modules-forge.md`](research/R1-modules-forge.md).

## 1. Trois plans, une règle

```text
┌──────────────────────────── runtime Forge ────────────────────────────┐
│ écrans UI Kit 2 · 9 outils MCP · agent + skill Rovo · champs · JQL     │
│ déclencheurs (ticket créé/modifié, nuit) · Forge SQL · Forge LLMs      │
└──────────────────────────────┬────────────────────────────────────────┘
                               │ ports (src/ports.ts, contrat gelé)
┌──────────────────────────────▼───────────────┐   ┌────────────────────────┐
│ domaine pur (src/domain)                     │   │ adaptateurs            │
│ signatures · implication · résultat · nature │◀──│ src/db     Forge SQL   │
│ cohortes · Wilson · conclusions · balance    │   │ src/collect Jira +     │
│ recommandation · garde-fous · calibration    │   │             graphe+LLM │
│ essai · anonymat                             │   │ src/actions, handlers  │
└──────────────────────────────────────────────┘   │ src/viewmodel, src/ui  │
                                                    └────────────────────────┘
```

Le domaine ne sait pas qu'il tourne dans Forge : il reçoit des données et des
ports, jamais `@forge/*`, jamais le réseau, jamais `Date.now()` (l'horloge et
les identifiants sont injectés). **Pourquoi ce découpage :**

- **Les maths sont le produit.** Score de Wilson à z = 1,96, médianes, seuil
  d'effectif, bras déséquilibrés, masque d'anonymat : tout cela doit se tester
  en mémoire, sans réseau, en quelques secondes, sur les chiffres du SPEC
  (§7 règle 3 : 83 % sur 41 → [69 % ; 91 %]).
- **Les adaptateurs bougent, le domaine non.** L'API du graphe est en Preview
  (SPEC §19) : ses droits, sa pagination et son comportement hors ligne sont
  précisément ce qui peut changer. Le domaine ne doit jamais en dépendre.
- **Les limites plateforme se contournent par la mise en cache, pas par la
  logique.** Une action est bornée à 55 s et un `SELECT` à 5 s (§6 ci-dessous) :
  la réponse vient du cache nocturne, le calcul se fait ailleurs.
- **L'honnêteté est testable.** « On ne sait pas » est une conclusion comme une
  autre (§7 règle 4) : c'est une valeur de retour du domaine, pas une branche
  d'erreur dans un écran.

## 2. Les points d'entrée

`src/index.ts` ne fait que câbler ces fonctions : aucune logique n'y vit (lot L7).

| Module Forge | Fonction | Rôle |
|---|---|---|
| `jira:issuePanel`, `jira:projectPage`, `jira:projectSettingsPage`, `jira:sprintAction`, `jira:dashboardGadget` | `resolver` | les écrans du SPEC §16, via le resolver unique |
| `action` × 9 + `rovo:mcp` | `fn-<outil>` | les neuf outils pour agents et orchestrateurs (§15) |
| `rovo:agent`, `rovo:skill` | — | « Conseiller de délégation » et conduite `before-taking-work` (§15) |
| `jira:jqlFunction` | `jqlDelegable` | `issue in delegable()` (DP-25) |
| `jira:customField` × 2 | — | « Recommandation », « Implication d'agent » en lecture seule, rendus depuis une propriété de ticket indexée |
| `trigger` (`avi:jira:created:issue`, `avi:jira:updated:issue`) | `onEvent` | chaîne « Nature » : classement à la création, réexamen si le texte change |
| `scheduledTrigger` (`day`, fonction bornée à 900 s) | `onScheduled` | chaîne « Statistiques » : maturité, cohortes, recommandations en cache |

Les neuf fonctions `fn-*` partagent un même export `index.dispatch`, qui aiguille
sur `context.moduleKey` : une `action` est une fonction Forge ordinaire
`(payload, context)`, pas un resolver. Aucune clé de fonction orpheline n'est
déclarée — chaque clé est référencée par un module.

## 3. Les quatre chaînes de collecte (SPEC §17)

| Chaîne | Qui l'exécute | Ce qu'elle produit | Où cela s'écrit (§18) |
|---|---|---|---|
| **Historique Jira** | L'app, en arrière-plan | Délai, réouverture, liens « est causé par », abandon | `outcome` |
| **Graphe** | La session d'un utilisateur | Par ticket : commits liés et leur mention ; PR atteintes par ces commits ; relecteurs, avis, commentaires | `commit_fact`, `review_fact`, `graph_cursor` |
| **Nature** | L'app, à la création du ticket | Nature et taille, conservées par empreinte du texte | `issue_class`, `signature_pattern` |
| **Statistiques** | L'app, chaque nuit | Cohortes, fourchettes, conclusions, recommandations mises en cache | `cohort_stat`, `recommendation`, `calibration` |

Les déclarations d'agent (`record-involvement`, champ à la clôture) alimentent
`involvement` en continu ; les décisions prises alimentent `decision`, puis la
calibration les rapproche du résultat (§10).

## 4. Ce qu'impose le graphe

Cinq contraintes, vérifiées dans la documentation le 11 novembre 2026
(SPEC §17, §19 ; détail dans R1). Elles façonnent la collecte plus que tout le
reste :

1. **Lecture au nom d'un utilisateur connecté.** Le graphe ne se lit pas avec
   l'identité de l'app. La collecte tourne donc pendant qu'une page de l'app est
   ouverte — c'est l'écran de répartition du sprint qui la porte.
2. **Par tranches, avec reprise sur curseur.** Une session ne dure pas douze
   mois d'historique : chaque tranche écrit son avancement dans `graph_cursor`
   (`project_id`, `object_type`, `last_issue_id`, `last_run_at`) et la suivante
   repart de là (DP-18).
3. **Un droit manquant vide le résultat, sans erreur.** Un zéro silencieux est
   indiscernable d'une absence de données : l'écran de couverture teste donc
   chaque type d'objet sur un ticket dont la réponse est connue, et affiche
   « pas de droit » plutôt qu'un zéro (§16.6, recette 15).
4. **Aucun lien direct ticket → PR.** Le chemin est `ticket → commit`, puis
   `PR → commit`. Une PR n'est atteinte que par les commits qui la composent :
   c'est ce qui rend la mesure de relecture dépendante de la collecte des
   commits, et jamais l'inverse.
5. **L'app consomme l'API, elle ne fournit pas de connecteur.** Les deux rôles
   sont exclusifs : rien dans ce dépôt n'expose de connecteur de graphe.

## 5. Ce que l'app conserve, et ce qu'elle écarte

Du message de commit, l'app ne garde qu'**un fait** : mention trouvée ou non, et
le nom de l'agent (`commit_fact.has_signature`, `commit_fact.agent_name`). Le
message lui-même n'est jamais stocké, jamais envoyé au modèle de Forge — le
module `llm` ne traite que le texte des tickets (nature, causes d'échec).

Deux autres retenues, opposables (DP-17, SPEC §18, §20) :

- **Aucune statistique par personne.** Aucune table de statistiques ne contient
  d'identifiant de personne ; `cohort_stat.people_count` ne sert qu'à masquer une
  cohorte portée par moins de trois personnes (recette 11).
- **Aucun outil MCP n'accepte ni ne renvoie un nom de personne** (§15, recette 12).

## 6. Les limites chiffrées qui dessinent l'architecture

| Limite plateforme | Valeur (SPEC §19) | Conséquence sur la conception |
|---|---|---|
| `rovo:mcp` | Preview, **un module par app**, **50 outils** au plus | Les neuf outils tiennent dans un seul module `delegable-mcp` ; aucun outil ajouté sans retirer le précédent |
| `action` | **55 s**, entrées simples (`string`, `integer`, `number`, `boolean`) | Les outils lisent le cache nocturne, jamais ne recalculent ; les listes passent par une chaîne JQL, pas par un tableau |
| `action` appelée par une automatisation | **`GET` seulement** | Les six outils de lecture sont des `GET` : la répartition du sprint peut être calculée à l'ouverture du sprint (§15) |
| `scheduledTrigger` | **900 s** au plus | La fonction `onScheduled` est bornée à `timeoutSeconds: 900` ; le recalcul nocturne traite par projet et reprend au tour suivant s'il n'a pas fini |
| Forge SQL | **1 Gio** par installation, **5 s par `SELECT`** | L'app stocke des faits et des comptes, pas des textes ; les agrégats sont pré-calculés dans `cohort_stat`, la carte du ticket lit une ligne (§20 : moins de 2 s) |

## 7. Le flux, du ticket à la calibration

```text
  un ticket Jira                  les sources de l'équipe
        │                                │
        │  trigger avi:jira:created      │  graphe (session utilisateur,
        ▼                                ▼  par tranches, reprise sur curseur)
┌───────────────┐   ┌──────────────────────────────────────────┐
│   COLLECTE    │◀──│ historique Jira · commits + mentions ·   │
│               │   │ PR atteintes par ces commits · relecteurs │
└──────┬────────┘   └──────────────────────────────────────────┘
       │ faits : involvement, commit_fact, review_fact, outcome, issue_class
       ▼
┌───────────────┐  nuit (scheduledTrigger, ≤ 900 s)
│   COHORTE     │  nature × zone × taille, une époque à la fois
│               │  repli au niveau supérieur si trop petite (§7 règle 1)
└──────┬────────┘  bras déséquilibrés → pas de conclusion (§7 règle 5)
       │ cohort_stat : n, taux, fourchette de Wilson, médiane, conclusion
       ▼
┌───────────────┐  garde-fous : incident ouvert, zone sensible,
│ RECOMMANDATION│  critères d'acceptation absents (§8)
└──────┬────────┘  → « à confier », « relecture renforcée », « à garder »,
       │             « pas assez de recul »
       ▼
┌───────────────┐  panneau du ticket, champs, MCP, agent Rovo
│   DÉCISION    │  la personne suit l'avis ou s'en écarte, et le dit
└──────┬────────┘  decision(followed, actual_level, reason)
       │  rapprochée du résultat, une fois le ticket mûr (30 j / 60 j)
       ▼
┌───────────────┐  « Peut-on croire cette app ? » (§10)
│  CALIBRATION  │  si « à confier » ne fait pas mieux que « à garder »,
└───────────────┘  l'app l'écrit en tête de page et élargit « pas assez de recul »
```

La boucle est fermée : la calibration ne sert pas à communiquer, elle règle le
comportement de l'app (seuil élargi quand ses avis n'apportent rien).

## 8. Les modules du manifeste et le lot qui les réalise

Découpage de [LOTS.md](../../delegable-ou-pas-lots/LOTS.md) ; les chemins de code
sont indicatifs (chaque lot reste dans les siens).

| Module du manifeste | Clé(s) déclarée(s) | SPEC | Lot |
|---|---|---|---|
| `function` | `resolver`, `onEvent`, `onScheduled`, `jqlDelegable`, `fn-*` (9) | §17 | L0 (manifeste), L7 (code) |
| `action` | les 9 outils (`should-delegate` … `report-takeover`) | §15 | L0 (manifeste), L7 (code) |
| `rovo:mcp` | `delegable-mcp` | §15, §19 | L0 (manifeste), L7 (code) |
| `rovo:agent` | `delegation-advisor` | §15 | L0 (manifeste), L9 (prompt) |
| `rovo:skill` | `before-taking-work` | §9, §15 | L0 (manifeste), L9 (`static/skill`) |
| `jira:issuePanel` | `delegation-card-panel` | §16.1 | L8 |
| `jira:projectPage` | `delegation-map-page` (carte, cohorte, couverture, calibration) | §16.2, §16.3, §16.6, §16.7 | L8 |
| `jira:projectSettingsPage` | `delegation-settings` | §16.5 | L8 |
| `jira:sprintAction` | `sprint-delegation-split` (porte la collecte en session) | §16.4, §17 | L8, L6 |
| `jira:dashboardGadget` | `delegation-gadget` | §16.8 | L8 |
| `jira:customField` | `recommendation-field`, `involvement-field` | §5, §16 | L8, L5 |
| `jira:jqlFunction` | `delegable` | DP-25 | L7 |
| `trigger` | `issue-events` (créé, modifié) | §17 | L6, L7 |
| `scheduledTrigger` | `nightly-recompute` (`day`) | §7, §17 | L4, L7 |
| `sql` | `main` (moteur `mysql`) — les 14 tables du §18, plus `settings` et `coverage` (contrat gelé), vivent en DDL dans `src/db/schema.ts` | §18 | L5 |
| `llm` | `issue-classifier` (famille `claude`) | §17, DP-06, DP-26 | L6 |
| `resources` | `main` (UI Kit 2), `agent-prompt`, `icon` | §16 | L8, L9, L0 |
| `permissions.scopes` | 13 droits Jira + 4 droits `read:graph` (commit, pull request, ticket, utilisateur) | §17, §19 | L0 |

Les écrans « Détail d'une cohorte » (§16.3), « Couverture » (§16.6) et « Peut-on
croire cette app ? » (§16.7) sont des vues de la page projet, pas des modules
séparés : un module de plus, c'est une surface d'installation et de droits en
plus, pour aucun écran de plus.
