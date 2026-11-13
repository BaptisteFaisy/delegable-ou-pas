# Délégable ou pas ?

> L'équipe sait, d'après **son propre historique** et avec une statistique
> honnête, quel travail confier à un agent de code, lequel confier sous
> relecture renforcée et lequel garder — et chaque ticket porte cette
> recommandation, avec les tickets passés qui la fondent.

App **Atlassian Forge pour Jira** · Codegeist 2026, catégorie *Apps for
Software Teams* · bonus visés : Teamwork Graph (principal), MCP, Agents Rovo,
Marketplace. Le cahier des charges complet est dans
[`docs/CAHIER-DES-CHARGES.md`](docs/CAHIER-DES-CHARGES.md) ; il est cité
partout sous la forme `SPEC §n`, et ses exigences sous la forme `DP-nn`.

## Le problème

On délègue au jugé. Les bancs d'essai publics et les promesses des éditeurs
portent sur d'autres codes, d'autres conventions, d'autres tests que les vôtres.
Et quand on mesure, on mesure mal : on a confié aux agents les tickets faciles,
donc le résultat est flatteur et faux. Tout ce qu'il faut pour répondre existe
déjà — Jira connaît la suite de chaque ticket, le graphe d'Atlassian relie
chaque ticket à ses commits puis à leurs PR et à leurs relecteurs, les agents
signent leurs commits. Il manquait l'outil qui rapproche ces trois sources et
qui a la rigueur de dire **« on ne sait pas »** quand c'est le cas.

## Ce que l'app rend

| Écran | Module Forge | Ce qu'on y voit |
|---|---|---|
| Carte sur le ticket | `jira:issuePanel` | recommandation, cohorte, chiffres avec effectifs et fourchettes, tickets de référence, conditions, confiance, décision prise, implication relevée et sa source |
| Carte de délégation | `jira:projectPage` | matrice natures × zones (vert / orange / rouge / gris), époques, part délégable du sprint, causes d'échec, écarts à la recommandation |
| Détail d'une cohorte | `jira:projectPage` | les deux bras, effectifs, fourchettes, composition, tickets, époque par époque |
| Répartition du sprint | `jira:sprintAction` | tickets par recommandation, part délégable en points |
| Réglages du projet | `jira:projectSettingsPage` | mentions de commit, date d'adoption, natures, zones, tailles, seuil, zones sensibles, définition de la relecture renforcée, époques |
| Couverture | `jira:projectPage` | part d'implication connue, état de chaque droit sur le graphe, dernière collecte |
| « Peut-on croire cette app ? » | `jira:projectPage` | la calibration : la justesse des recommandations passées |
| Gadget de tableau de bord | `jira:dashboardGadget` | carte réduite et part de gris |

Neuf outils MCP (`rovo:mcp`) pour les agents et les orchestrateurs :
`should-delegate`, `list-delegable-work`, `get-delegation-evidence`,
`get-delegation-map`, `get-cohort`, `get-calibration`, `record-involvement`,
`record-decision`, `report-takeover`. Les six premiers sont des `GET` : une
règle d'automatisation peut les appeler. Un agent Rovo (« Conseiller de
délégation ») et une skill (« before-taking-work ») complètent le lot.

## Les règles non négociables

- **Aucun taux sans son effectif et sa fourchette** (intervalle de Wilson,
  z = 1,96 ; médianes pour les durées). Voir [`docs/METHODE.md`](docs/METHODE.md).
- **« On ne sait pas » est une conclusion à part entière**, affichée comme les
  autres.
- **L'absence de mention d'agent ne prouve pas l'absence d'agent** : un ticket
  d'implication inconnue ne compte jamais comme « sans agent ».
- **Jamais par personne** : aucune statistique, aucun classement, aucun nom ;
  une cohorte portée par moins de trois personnes est masquée.
- **La recommandation conseille, elle ne bloque jamais.**
- Du message de commit, l'app ne garde qu'un fait : mention trouvée ou non, et
  le nom de l'agent. Le message n'est jamais stocké.

## Développer

```bash
npm ci                  # dépendances (lock versionné)
npx tsc --noEmit        # types
npm test                # vitest, aucun réseau
python3 tools/check-file-limits.py       # fichier < 500 lignes
node tools/check-function-limits.mjs     # fonction < 50 lignes
node tools/check-manifest.mjs            # manifeste Forge
forge lint              # lint Forge (CLI Atlassian)
```

Architecture hexagonale : `src/domain/` est **pur** (aucun `@forge/*`, aucune
horloge ni identifiant non injecté), `src/ports.ts` est la seule frontière, et
les adaptateurs (`src/db/`, `src/collect/`, `src/actions/`, `src/handlers/`,
`src/viewmodel/`, `src/ui/`, `src/i18n/`, `src/sample/`) l'implémentent. Le
contrat des modules est dans [`docs/CONTRACTS.md`](docs/CONTRACTS.md), les
règles de code dans [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Chaîne de livraison

`main` est protégé : **PR obligatoire**, historique linéaire, trois checks
requis — `ci` (types, tests, gardes de taille, manifeste, docs), `ci-budget`
(verdict en 5 minutes maximum) et `couche0` (périmètre déclaré dans la PR +
motifs interdits). Les jobs tournent sur **quatre runners auto-hébergés**
`r630-delegable-ou-pas-01..04` (labels `self-hosted,Linux,X64,
delegable-ou-pas-worker,ci-node`), **déplacés le 11 novembre 2026 depuis le
dépôt `bipeur`** dont les runners r630 dormaient : dossiers réutilisés, `_work`
vidé, unités systemd utilisateur. La **file Mergify** embarque, rebase,
re-teste et merge sans clic ; un balayeur relance les PR oubliées ; un agent de
conflit (modèle InferHub) résout les PR `DIRTY` et pousse ; un triage répare une
CI rouge. Détails dans [`docs/CI.md`](docs/CI.md).
