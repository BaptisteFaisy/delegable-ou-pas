# Délégable ou pas ? — cahier des charges

> Codegeist 2026 · catégorie **Apps for Software Teams**
> Bonus visés : Teamwork Graph (principal), MCP, Agents Rovo, Marketplace
> Version 1 du 11 novembre 2026 · soumission avant le mardi 22 décembre 2026, 21 h (Paris)

## 1. L'idée en une phrase

L'équipe sait, d'après son propre historique et avec une statistique honnête, quel travail confier à un agent de code, lequel confier sous relecture renforcée et lequel garder — et chaque ticket porte cette recommandation, avec les tickets passés qui la fondent.

## 2. Le problème

Aujourd'hui, on délègue au jugé. Chaque développeur a son intuition, les équipes ne sont pas d'accord entre elles, et personne ne peut trancher.

- **Les chiffres disponibles ne valent pas pour vous.** Les bancs d'essai publics et les promesses des éditeurs portent sur d'autres codes, d'autres conventions, d'autres tests que les vôtres.
- **Les deux erreurs coûtent cher.** Trop déléguer : reprises, file de relecture saturée, bugs trois semaines plus tard. Trop peu : des personnes passent des jours sur ce qu'un agent fait bien en une heure.
- **La direction demande ce que les agents apportent.** Elle reçoit des anecdotes.
- **Quand on mesure, on mesure mal.** On compare tous les tickets faits avec agent à tous les autres. Mais on a confié aux agents les tickets faciles : le résultat est flatteur et faux.

Tout ce qu'il faut pour répondre existe pourtant déjà :

- Jira connaît la suite de chaque ticket : délai, réouverture, bug relié, incident ;
- le graphe d'Atlassian relie chaque ticket à ses commits, puis à ses PR et à leurs relecteurs ;
- les agents de code signent leurs commits d'une mention dans le message.

Il manque l'outil qui rapproche ces trois sources, et qui a la rigueur de dire « on ne sait pas » quand c'est le cas.

## 3. Utilisateurs

| Qui | Ce qu'il fait | Ce qu'il attend |
|---|---|---|
| Développeur | Décide de confier ou non un ticket | Un avis fondé, lisible en dix secondes |
| Tech lead | Répartit le sprint | Voir ce qui est délégable et où renforcer la relecture |
| Responsable d'ingénierie | Choisit les outils et les pratiques | Une réponse chiffrée et honnête, « on ne sait pas » compris |
| Orchestrateur ou agent | Choisit les tickets à prendre | La liste des tickets délégables |
| Achats, finance | Jugent la dépense | Ce que les agents changent réellement, par type de travail |

## 4. Vocabulaire du produit

- **Implication d'agent** : la part prise par un agent dans un ticket : aucune, assistée, pilotée, autonome, ou inconnue.
- **Résultat** : ce qui est arrivé au ticket ensuite : délai, relecture, réouverture, bug à la suite, incident.
- **Clôture propre** : un ticket clos sans réouverture, sans bug à la suite et sans incident dans les 60 jours.
- **Nature** : le genre de travail : correctif, évolution d'interface, migration de données, refonte, tests, configuration, intégration externe…
- **Cohorte** : un groupe de tickets comparables : même nature, même zone, même taille.
- **Bras** : dans une cohorte, les tickets faits avec agent d'un côté, sans agent de l'autre.
- **Effectif** : le nombre de tickets d'un bras.
- **Seuil** : l'effectif en dessous duquel l'app refuse de conclure.
- **Recommandation** : « à confier à un agent », « agent, relecture renforcée », « à garder pour un humain », ou « pas assez de recul ».
- **Fondement** : les tickets passés sur lesquels repose une recommandation.
- **Calibration** : la fréquence à laquelle les recommandations se sont révélées justes.
- **Époque** : une période où les agents de l'équipe n'ont pas changé (même outil, même modèle, mêmes consignes).
- **Essai contrôlé** : une période où le sort décide qui, de l'agent ou de l'humain, prend un ticket.

## 5. Reconnaître le travail d'un agent

Cinq sources, de la plus sûre à la moins sûre. L'app retient la meilleure disponible et l'affiche.

| Source | Ce qu'elle apprend | Limite |
|---|---|---|
| Déclaration par l'outil MCP `record-involvement` | Niveau, outil, modèle, session | Suppose que l'agent coopère |
| Auteur du commit ou de la PR : un compte robot | Travail autonome | Ne couvre que ce cas |
| Mention dans le message de commit | Un agent a co-écrit ce commit | Son absence ne prouve rien |
| Champ « Implication d'agent », rempli à la clôture | Le niveau, selon le développeur | Déclaratif |
| Date d'adoption des agents par l'équipe | Avant cette date : sans agent | Par construction |

### Les mentions de commit

La plupart des agents ajoutent au message une ligne `Co-authored-by` à leur nom. Les formats changent d'un outil et d'une version à l'autre, et les sources publiques ne s'accordent pas sur tous. L'app fournit donc un catalogue de motifs réglable et affiche, dans ses réglages, les mentions réellement vues sur les commits de l'équipe, pour qu'elle les confirme.

### Les cinq niveaux

| Niveau | Ce qui s'est passé |
|---|---|
| Aucune | Travail humain, déclaré comme tel ou antérieur à l'adoption |
| Assistée | La personne écrit, l'agent complète et suggère |
| Pilotée | L'agent écrit, la personne le suit pas à pas |
| Autonome | L'agent travaille seul, la personne relit à la fin |
| Inconnue | Aucun élément dans un sens ni dans l'autre |

**L'absence de mention ne prouve pas l'absence d'agent.** Un ticket d'implication inconnue n'est jamais compté comme « sans agent ». Il sort des comparaisons, et sa part est affichée : « 41 % des tickets de ce projet sont d'implication inconnue ».

## 6. Mesurer ce qui arrive ensuite

| Mesure | Définition | Source | Piège |
|---|---|---|---|
| Délai | Du premier passage « En cours » à la clôture, hors statuts d'attente | Historique du ticket | Tickets oubliés ouverts : on compare des médianes |
| Relecture | Commentaires de PR, relecteurs ayant demandé des changements, commits ajoutés après l'ouverture de la PR | Graphe | Le graphe donne l'avis actuel de chaque relecteur, pas le nombre d'allers-retours |
| Réouverture | Retour d'un statut terminé vers un statut ouvert, sous 30 jours | Historique | Réouvertures administratives, écartées si elles durent moins de dix minutes |
| Bug à la suite | Bug relié par un lien « est causé par », sous 60 jours | Liens entre tickets | Dépend de la discipline de l'équipe |
| Bug voisin | Bug créé sous 30 jours sur le même composant et citant le ticket | Texte et composant | Signal faible, affiché à part, jamais dans la clôture propre |
| Incident | Incident JSM relié au ticket | Graphe ou liens | Rare, donc peu concluant seul |
| Reprise humaine | Un ticket commencé en autonome, fini en piloté ou repris par quelqu'un d'autre | Déclarations, historique | Demande une déclaration |
| Abandon | Ticket annulé après avoir commencé | Historique | — |

La mesure principale est la **clôture propre**. Elle se lit sans explication et se compte en proportion.

Un ticket clos hier ne peut pas encore être jugé. Seuls comptent ceux qui ont le recul nécessaire : 30 jours pour la réouverture, 60 pour la clôture propre.

## 7. Comparer honnêtement

C'est le cœur du produit. Huit règles, appliquées partout.

1. **On compare à l'intérieur d'une cohorte.** Même nature, même zone, même taille. Si la cohorte est trop petite, l'app remonte d'un niveau (nature et taille, toutes zones) et le dit.
2. **Un effectif minimal.** Vingt tickets par bras, réglable. En dessous : « pas assez de recul ».
3. **Jamais un taux sans son effectif et sa fourchette.** « Clôture propre : 83 % avec agent (41 tickets, entre 69 et 91 %), 86 % sans (37 tickets, entre 72 et 94 %). »
4. **Quatre conclusions possibles.** Mieux, pareil, moins bien, on ne sait pas. La dernière est une conclusion à part entière.
5. **Le biais de sélection est traité, puis signalé.** La taille et la nature sont dans la cohorte. La composition des deux bras est comparée ; s'ils diffèrent trop, l'app affiche « bras déséquilibrés » et ne conclut pas.
6. **Une époque à la fois.** Un changement d'outil, de modèle ou de consignes ouvre une nouvelle époque. On ne mélange pas les chiffres de deux époques.
7. **Aucun chiffre global sans sa décomposition.** Un total peut contredire toutes ses parties. L'app n'affiche jamais « les agents font mieux » sans la carte par cohorte.
8. **Jamais par personne.** Aucune statistique par développeur, aucun classement. Une cohorte portée par moins de trois personnes est masquée.

La méthode reste simple : fourchette classique pour une proportion, médianes pour les durées. Le vocabulaire aussi : « écart établi » ou « écart non établi ». Le mot « prouvé » est réservé à l'essai contrôlé du § 11.

## 8. La recommandation

### Ce que voit le développeur sur le ticket

```text
PROJ-412 · Migration du champ « montant » en centimes
Recommandation : agent, relecture renforcée
Cohorte : migration de données · facturation · taille M (26 tickets avec agent, 31 sans)
Clôture propre : 69 % avec agent (entre 50 et 84 %), 87 % sans (entre 71 et 95 %)
Délai médian : 1,5 jour avec agent, 3 jours sans
Ce qui a mal tourné avec agent : 5 réouvertures sur 8 pour une migration non rejouable
Tickets de référence : PROJ-207, PROJ-233, PROJ-301
Conditions : critères d'acceptation présents, test de migration exigé
Confiance : moyenne
```

### La règle

| Situation dans la cohorte | Recommandation |
|---|---|
| Clôture propre équivalente ou meilleure avec agent, délai égal ou meilleur | À confier à un agent |
| Délai meilleur, mais clôture propre en retrait ou relecture nettement plus lourde | Agent, relecture renforcée |
| Clôture propre nettement plus basse avec agent, écart établi | À garder pour un humain |
| Effectif sous le seuil, bras déséquilibrés, ou trop d'implication inconnue | Pas assez de recul |

### Les garde-fous

Trois situations interdisent « à confier à un agent », quels que soient les chiffres. L'app dit laquelle.

- Le ticket est lié à un incident ouvert.
- Il touche une zone déclarée sensible.
- Il n'a pas de critères d'acceptation.

### Ce que veut dire « relecture renforcée »

Chaque projet le définit : deux relecteurs, un relecteur responsable de la zone, une preuve exigée par critère. L'app affiche la définition avec la recommandation.

### Un avis, pas un ordre

La recommandation ne bloque rien. La décision prise est enregistrée — suivie ou non, avec quel niveau d'implication — puis rapprochée du résultat. C'est ce qui nourrit la calibration.

## 9. Pour les agents et les orchestrateurs

- `list-delegable-work` rend les tickets « à confier », du plus sûr au moins sûr. Un orchestrateur n'a plus à choisir à l'aveugle.
- `should-delegate` rend la carte d'un ticket.
- Une skill fixe la conduite d'un agent : interroger `should-delegate` avant de prendre un ticket ; s'arrêter et prévenir son pilote devant « à garder pour un humain » ; annoncer les conditions devant « relecture renforcée » ; déclarer son implication à la fin.
- Un agent qui passe la main le signale par `report-takeover`, avec la raison. C'est la donnée la plus rare et la plus utile.

## 10. La calibration : l'app se note elle-même

Une app qui recommande doit montrer si ses recommandations valent quelque chose.

| Recommandation donnée | Clôture propre constatée ensuite |
|---|---|
| À confier à un agent | 88 sur 100 (112 tickets) |
| Agent, relecture renforcée | 74 sur 100 (63 tickets) |
| À garder pour un humain, mais confié quand même | 52 sur 100 (21 tickets) |

- Si « à confier » ne fait pas nettement mieux que « à garder », l'app l'écrit en tête de page : ses avis n'apportent rien sur ce projet, et elle élargit « pas assez de recul ».
- L'écran s'appelle « Peut-on croire cette app ? ». Il est accessible à tous.

## 11. L'essai contrôlé

Les cohortes réduisent le biais de sélection, elles ne l'éliminent pas. Un seul moyen l'écarte : le hasard.

1. L'équipe choisit une cohorte où la conclusion est « on ne sait pas ».
2. Pendant quatre semaines, chaque ticket admissible de cette cohorte — prêt, non urgent, hors zone sensible — reçoit un tirage : agent ou humain. Le tirage s'affiche sur le ticket.
3. Un ticket dont le tirage n'est pas respecté sort de l'essai, avec le motif.
4. L'essai s'arrête quand l'écart est établi, à la durée prévue, ou si un bras accumule les réouvertures.
5. Le résultat porte la mention « essai » : c'est le seul chiffre que l'app qualifie de prouvé.

L'essai se décide en équipe, et tout ticket peut en être retiré.

## 12. La carte de délégation

Une page par projet, pensée pour le tech lead et la direction.

- **La matrice.** Natures en lignes, zones en colonnes. Vert : à confier. Orange : relecture renforcée. Rouge : à garder. Gris : on ne sait pas. Chaque case ouvre sa cohorte.
- **Les époques.** « Depuis l'époque 3 (nouveau modèle, 14 septembre), les migrations de données sont passées du rouge à l'orange. »
- **La part délégable d'un sprint.** « 38 % des points du sprint 42 sont à confier. »
- **Ce qui ferait passer une case du rouge à l'orange.** Les causes les plus fréquentes d'échec dans la cohorte : tests absents, critères flous, zone sans conventions écrites.
- **Les écarts à la recommandation.** Tickets confiés contre l'avis et mal terminés ; tickets gardés par des humains dans des cases vertes. Sans nom de personne.

## 13. Démarrer sans historique déclaré

- **Premier jour.** L'app lit douze mois d'historique Jira et, par le graphe, les commits liés. Elle y cherche les mentions d'agent. La première carte est surtout grise, et elle le dit.
- **La date d'adoption.** L'équipe indique quand elle a commencé à utiliser des agents. Tout ce qui précède forme le bras « sans agent ».
- **Ensuite.** Les déclarations par MCP et le champ à la clôture font reculer l'inconnu. Le « taux d'implication connue » est suivi comme un indicateur de santé.
- **Pour la démonstration.** Un jeu de données d'exemple, clairement marqué comme tel.

## 14. Exigences fonctionnelles

Priorités : **M** = indispensable pour la soumission, **S** = souhaitable, **C** = après le hackathon.

| N° | Exigence | Priorité |
|---|---|---|
| DP-01 | Relever l'implication d'agent de chaque ticket d'après les cinq sources, et afficher la source retenue | M |
| DP-02 | Catalogue réglable des mentions de commit, et liste des mentions vues | M |
| DP-03 | État « inconnue » distinct, jamais compté comme « sans agent » | M |
| DP-04 | Calculer délai, réouverture, bug à la suite, incident et abandon d'après l'historique et les liens | M |
| DP-05 | Mesures de relecture d'après le graphe | M |
| DP-06 | Classer la nature de chaque ticket : règles d'abord, modèle de Forge ensuite, résultat conservé | M |
| DP-07 | Cohortes nature × zone × taille, avec repli au niveau supérieur | M |
| DP-08 | Taux avec fourchette, effectif toujours affiché, seuil réglable | M |
| DP-09 | Quatre conclusions par cohorte, dont « on ne sait pas » | M |
| DP-10 | Alerte « bras déséquilibrés » | M |
| DP-11 | Carte de recommandation sur le ticket : cohorte, chiffres, tickets de référence, conditions, confiance | M |
| DP-12 | Garde-fous : incident ouvert, zone sensible, critères absents | M |
| DP-13 | Enregistrer la décision prise et la rapprocher du résultat | M |
| DP-14 | Carte de délégation et détail d'une cohorte | M |
| DP-15 | Outils MCP du § 15 | M |
| DP-16 | Agent Rovo « Conseiller de délégation » et skill | M |
| DP-17 | Aucune statistique par personne ; cohortes portées par moins de trois personnes masquées | M |
| DP-18 | Collecte du graphe pendant la session d'un utilisateur, reprise là où elle s'est arrêtée | M |
| DP-19 | Écran de couverture : implication connue, droits sur le graphe, dernière collecte | M |
| DP-20 | Jeu de données d'exemple et mode démonstration | M |
| DP-21 | Calibration et écran « Peut-on croire cette app ? » | S |
| DP-22 | Époques | S |
| DP-23 | Champ « Implication d'agent » à la clôture, prérempli d'après les mentions | S |
| DP-24 | Part délégable d'un sprint, depuis l'action de sprint | S |
| DP-25 | Champ « Recommandation » et fonction JQL `issue in delegable()` | S |
| DP-26 | Causes d'échec par cohorte, résumées d'après les commentaires de réouverture | S |
| DP-27 | Essai contrôlé | S |
| DP-28 | Collecte en arrière-plan, sans visiteur | S |
| DP-29 | Comparaison par outil et par modèle, sur décision de l'équipe | C |
| DP-30 | Coût rapporté au résultat | C |
| DP-31 | Comparaison anonymisée entre équipes | C |

## 15. Outils MCP et agent Rovo

### Outils, exposés par `rovo:mcp`

| Clé | Verbe | Entrées | Retour |
|---|---|---|---|
| `should-delegate` | GET | `issueKey` | Recommandation, raisons, conditions, confiance |
| `list-delegable-work` | GET | `jql`, `limit` | Tickets « à confier », du plus sûr au moins sûr |
| `get-delegation-evidence` | GET | `issueKey` | Cohorte, effectifs, fourchettes, tickets de référence |
| `get-delegation-map` | GET | `projectKey` | Matrice résumée, part de gris |
| `get-cohort` | GET | `projectKey`, `nature`, `zone`, `size` | Détail d'une cohorte, époque par époque |
| `get-calibration` | GET | `projectKey` | Justesse des recommandations passées |
| `record-involvement` | CREATE | `issueKey`, `level`, `client`, `model`, `session` | Implication enregistrée |
| `record-decision` | CREATE | `issueKey`, `decision`, `reason` | Décision rapprochée de la recommandation |
| `report-takeover` | UPDATE | `issueKey`, `reason` | Reprise humaine enregistrée |

Aucun outil n'accepte un nom de personne en entrée, et aucun n'en renvoie.

Les outils de lecture sont des `GET` : une règle d'automatisation peut faire calculer la répartition à l'ouverture du sprint.

### Agent « Conseiller de délégation »

Pour les humains, dans Rovo Chat :

- « Que peut-on confier aux agents dans le sprint 42 ? »
- « Pourquoi PROJ-412 est-il en relecture renforcée ? »
- « Où les agents nous font-ils perdre du temps ? »
- « Qu'est-ce qui a changé depuis le nouveau modèle ? »

L'agent répond avec les effectifs et les fourchettes, et dit « on ne sait pas » quand la cohorte le dit.

### Skill « before-taking-work »

La conduite du § 9, en `SKILL.md`, liée aux outils `should-delegate`, `record-involvement` et `report-takeover`. Publiée aussi en source ouverte pour les clients qui lisent des fichiers de skills.

## 16. Écrans

1. **Carte sur le ticket** (`jira:issuePanel`). La carte du § 8, la décision prise, l'implication relevée et sa source.
2. **Carte de délégation** (`jira:projectPage`). Matrice, époques, part délégable, écarts.
3. **Détail d'une cohorte.** Les deux bras, leurs effectifs, leurs fourchettes, leur composition, les tickets.
4. **Répartition du sprint** (`jira:sprintAction`). Tickets par recommandation, part délégable.
5. **Réglages du projet** (`jira:projectSettingsPage`). Mentions de commit, date d'adoption, natures, zones, tailles, seuil, zones sensibles, définition de la relecture renforcée, époques.
6. **Couverture.** Part d'implication connue, état de chaque droit sur le graphe, dernière collecte.
7. **« Peut-on croire cette app ? »** La calibration.
8. **Gadget de tableau de bord** (`jira:dashboardGadget`). Carte réduite et part de gris.

## 17. Architecture Forge

Une app installée sur Jira, qui consomme l'API Teamwork Graph.

```yaml
# Esquisse, à valider avec forge lint
modules:
  rovo:mcp:
    - key: delegable-mcp
      name: Délégable ou pas
      tools: [should-delegate, list-delegable-work, get-delegation-evidence,
              get-delegation-map, get-cohort, get-calibration,
              record-involvement, record-decision, report-takeover]
  action:                    # une entrée par outil
  rovo:agent:
  rovo:skill:
  jira:issuePanel:
  jira:projectPage:
  jira:projectSettingsPage:
  jira:sprintAction:
  jira:customField:          # « Recommandation », « Implication d'agent »
  jira:jqlFunction:          # delegable
  jira:dashboardGadget:
  trigger:                   # avi:jira:created:issue, avi:jira:updated:issue
  scheduledTrigger:          # day : résultats arrivés à maturité, cohortes, recommandations
  sql:
  llm:                       # nature des tickets, causes d'échec
permissions:
  scopes:                    # un droit read:graph par type d'objet lu : commit, pull request, ticket, utilisateur
```

### Quatre chaînes de collecte

| Chaîne | Qui l'exécute | Ce qu'elle produit |
|---|---|---|
| Historique Jira | L'app, en arrière-plan | Délai, réouverture, liens, abandon |
| Graphe | La session d'un utilisateur | Par ticket : commits liés et leur mention ; PR atteintes par ces commits ; relecteurs, avis, commentaires |
| Nature | L'app, à la création du ticket | Nature et taille, conservées par empreinte du texte |
| Statistiques | L'app, chaque nuit | Cohortes, fourchettes, conclusions, recommandations mises en cache |

### Ce qu'impose le graphe

- Il ne se lit qu'au nom d'un utilisateur connecté. La collecte tourne donc pendant qu'une page de l'app est ouverte, par tranches, et reprend là où elle s'était arrêtée.
- Un droit manquant ne produit pas d'erreur : il vide le résultat. L'écran de couverture teste chaque type d'objet sur un ticket dont la réponse est connue, pour distinguer « pas de droit » de « pas de données ».
- Aucune relation ne relie directement un ticket à une PR. Le chemin est : ticket → commit, puis PR → commit.
- L'app consomme l'API du graphe ; elle ne fournit donc pas de connecteur.

### Ce que l'app conserve

Du message de commit, l'app ne garde qu'un fait : mention trouvée ou non, et le nom de l'agent. Le message lui-même n'est pas stocké.

## 18. Modèle de données (Forge SQL)

| Table | Colonnes principales |
|---|---|
| `involvement` | issue_id, level, source, client, model, session_ref, evidence_json, decided_at |
| `signature_pattern` | id, expression, agent_name, enabled, seen_count |
| `commit_fact` | issue_id, commit_ref, has_signature, agent_name, author_is_bot, committed_at |
| `review_fact` | issue_id, pr_ref, reviewer_count, changes_requested, comment_count, commits_after_open, opened_at, merged_at |
| `outcome` | issue_id, closed_at, lead_time_h, reopened, caused_bugs, neighbor_bugs, incidents, takeover, abandoned, clean, mature_at |
| `issue_class` | issue_id, nature, zone, size, classified_by, content_hash |
| `epoch` | id, project_id, starts_at, label, client, model, instructions_version |
| `cohort_stat` | project_id, epoch_id, nature, zone, size, arm, n, clean_rate, ci_low, ci_high, median_lead_h, review_load, people_count, conclusion, computed_at |
| `recommendation` | issue_id, value, cohort_key, confidence, reasons_json, refs_json, computed_at |
| `decision` | issue_id, followed, actual_level, reason, at |
| `calibration` | project_id, epoch_id, value, n, clean_rate, ci_low, ci_high |
| `trial` | id, project_id, cohort_key, starts_at, ends_at, state |
| `trial_assignment` | trial_id, issue_id, arm, complied, excluded_reason |
| `graph_cursor` | project_id, object_type, last_issue_id, last_run_at |

`people_count` ne sert qu'à masquer les cohortes trop étroites. Aucune table de statistiques ne contient d'identifiant de personne.

## 19. Contraintes vérifiées et points à valider

### Vérifié dans la documentation (10 et 11 novembre 2026)

- **Commit dans le graphe.** Champs : empreinte, message, auteur, date de création, dépôt, adresse. Aucun champ sur les fichiers.
- **PR dans le graphe.** Champs : état (ouverte, fusionnée, refusée, brouillon), relecteurs avec leur avis (approuvé, à revoir, sans avis), nombre de commentaires, dates, auteur. Ni taille ni branches.
- **Relations.** Un ticket Jira est relié à des commits, des branches et des builds. Une PR est reliée à ses commits. Un utilisateur est relié aux commits et PR qu'il a créés et aux PR qu'il a relues. Aucune relation directe entre un ticket et une PR.
- **API du graphe.** En Preview ; lecture au nom d'un utilisateur ; requêtes enregistrées ou requêtes prêtes à l'emploi ; un droit par type d'objet, accordé par l'administrateur de l'organisation ; un droit manquant vide le résultat sans erreur ; une app consomme l'API ou fournit un connecteur, pas les deux.
- **Agir hors ligne au nom d'un utilisateur** existe dans Forge, avec des droits déclarés à cet effet. Je n'ai pas vérifié que cela vaut pour le graphe.
- **`rovo:mcp`** : Preview, un module par app, 50 outils au plus. **Action** : entrées simples, 55 s. Un agent lancé par automatisation n'appelle que les actions `GET`.
- **Déclencheur planifié** : jusqu'à 900 s. **Forge SQL** : 1 Gio par installation, 5 s par SELECT.

### Connu par des sources tierces, à confirmer sur les dépôts de l'équipe

- Claude Code, Codex, Cursor et Copilot ajoutent une ligne `Co-authored-by` au message de commit. Les adresses citées diffèrent selon les sources pour au moins un outil, et le format de l'agent autonome de Copilot n'est pas confirmé.

### À valider par un prototype la première semaine

| Point | Pourquoi | Solution de repli |
|---|---|---|
| Le champ `message` contient-il le message entier, dernière ligne comprise | Fonde la reconnaissance automatique | Déclaration MCP, champ à la clôture, compte robot |
| Volume et pagination des requêtes sur le graphe, dans le temps d'une session | Lecture de douze mois | Tranches plus petites, fenêtre de six mois |
| Graphe lisible hors ligne au nom d'un utilisateur | Collecte sans visiteur | Collecte à l'ouverture des pages |
| Relation entre incident JSM et ticket, exploitable par requête | Mesure « incident » | Liens Jira entre tickets |
| Nombre d'allers-retours de relecture | Le graphe ne donne que l'avis actuel | Commentaires et commits après l'ouverture de la PR |
| Fusion par écrasement : la mention survit-elle dans le commit final | Reconnaissance | Commits de la branche, encore liés au ticket |
| Taille des tickets disponible | Cohortes | Taille estimée d'après la durée des tickets semblables |
| Qualité du classement de nature | Cohortes | Type de ticket et étiquettes |
| Effectifs réels d'une équipe moyenne sur six mois | Tout le produit | Cohortes plus larges, et « on ne sait pas » |

## 20. Exigences non fonctionnelles

- **Honnêteté.** Aucun taux sans effectif ni fourchette. « On ne sait pas » s'affiche comme les autres conclusions.
- **Pas un outil de notation.** Aucune donnée par personne dans les écrans, les exports ou les outils.
- **Sobriété.** Les messages de commit sont lus puis écartés ; l'app garde des faits et des comptes.
- **Explicabilité.** Chaque recommandation cite sa cohorte, ses chiffres et ses tickets de référence.
- **Rapidité.** Carte du ticket en moins de 2 s, depuis le cache ; recalcul chaque nuit.
- **Neutralité.** Aucune comparaison entre outils sans décision explicite de l'équipe.
- **Retenue.** La recommandation conseille ; elle ne bloque jamais.
- **Langues.** Interface en anglais et en français ; soumission en anglais.

## 21. Cas limites

- Ticket aux commits mêlés, certains signés et d'autres non : niveau déclaré s'il existe, sinon « assistée », avec la part signée affichée.
- Agent qui ne signe pas et ne déclare rien : « inconnue ».
- Ticket sans commit (configuration, documentation) : hors des cohortes de code, nature à part.
- Équipe de trois personnes : la plupart des cohortes sont masquées ; l'app ne montre que le niveau du projet et l'explique.
- Cohorte où tout est désormais confié aux agents : plus de bras humain. L'app compare à l'époque précédente et propose un essai.
- Changement de modèle au milieu de la fenêtre : nouvelle époque ; les anciens chiffres restent visibles, grisés.
- Ticket resté ouvert trois mois : la médiane l'absorbe.
- Équipe qui ne relie jamais ses bugs : la clôture propre repose sur les réouvertures et les incidents, et l'écran de couverture le signale.
- Recommandation ignorée, bon résultat : compté dans la calibration, comme le reste.
- Total favorable, cohortes défavorables : le total n'est jamais affiché seul.
- Ticket déplacé de projet : il garde son implication et son résultat, et change de cohorte.

## 22. Recette

1. Un ticket dont un commit porte une mention d'agent est classé « avec agent », source « mention de commit ».
2. Un ticket sans aucun élément est classé « inconnue » et n'entre dans aucun bras.
3. Un ticket clos avant la date d'adoption entre dans le bras « sans agent ».
4. Un ticket rouvert sous 30 jours n'est pas une clôture propre.
5. Un ticket clos il y a dix jours n'entre pas encore dans le taux de clôture propre.
6. Une cohorte de 12 et 15 tickets affiche « pas assez de recul ».
7. Deux bras de composition trop différente affichent « bras déséquilibrés », sans conclusion.
8. Une cohorte à l'écart établi en défaveur des agents produit « à garder pour un humain » sur un nouveau ticket semblable.
9. Un ticket lié à un incident ouvert ne reçoit jamais « à confier à un agent », et la carte dit pourquoi.
10. Aucun écran n'affiche un taux sans son effectif et sa fourchette.
11. Une cohorte portée par deux personnes est masquée.
12. Aucun outil MCP ne renvoie de nom de personne.
13. `list-delegable-work` ne renvoie que des tickets « à confier ».
14. Un changement d'époque sépare les statistiques.
15. Un droit manquant sur le graphe apparaît à l'écran de couverture, au lieu d'un zéro silencieux.
16. Dans un essai, un tirage non respecté sort le ticket de l'essai.

## 23. Scénario de la vidéo (moins de 5 minutes, en anglais)

| Temps | Contenu |
|---|---|
| 0:00 – 0:30 | « Should an agent take this ticket? » Trois développeurs, trois réponses. Personne ne sait. |
| 0:30 – 1:00 | Le chiffre naïf : les agents ferment plus vite. Puis la décomposition : ils avaient reçu les tickets faciles. |
| 1:00 – 1:50 | La carte sur un ticket : cohorte, chiffres avec fourchettes, tickets de référence, conditions |
| 1:50 – 2:30 | La carte de délégation : vert, orange, rouge, gris. « "We don't know" is an answer. » |
| 2:30 – 3:00 | Un orchestrateur demande par MCP ce qu'il peut prendre |
| 3:00 – 3:25 | « Can you trust this app? » : la calibration |
| 3:25 – 3:55 | L'essai contrôlé |
| 3:55 – 4:15 | Ce qui ferait passer une case du rouge à l'orange |
| 4:15 – 4:50 | Architecture : Teamwork Graph, Forge SQL, `rovo:mcp` |

## 24. Comment les juges testeront

Le site de démonstration fourni ne comprend pas de dépôt de code. Le graphe n'y contient donc ni commit ni PR.

1. **Mode démonstration.** Un jeu de données d'exemple, marqué comme tel : douze mois, trois époques, un projet Jira peuplé de tickets. Carte sur les tickets, carte de délégation, détail des cohortes, calibration.
2. **Agent Rovo.** Les quatre questions du § 15.
3. **Client MCP.** `should-delegate` et `list-delegable-work` sur le projet d'exemple.
4. **Données réelles.** Sur un site relié à un dépôt, l'écran de couverture guide l'attribution des droits, puis la collecte démarre.

Conséquence pour le bonus Teamwork Graph : les juges ne verront pas, sur leur site, de commits lus dans le graphe. La vidéo doit donc montrer la collecte réelle sur un site relié à un dépôt, et l'écran de couverture doit interroger le graphe en direct sur les objets présents partout (tickets, utilisateurs, sprints).

## 25. Plan jusqu'au 22 décembre

| Semaine | Objectif |
|---|---|
| 11 – 17 nov. | Les validations du § 19 sur un vrai projet relié à un dépôt : message complet, volume, droits |
| 18 – 24 nov. | Implication, résultats, nature, cohortes, fourchettes |
| 25 nov. – 1er déc. | Recommandation, carte sur le ticket, garde-fous, décision enregistrée |
| 2 – 8 déc. | Carte de délégation, détail de cohorte, écran de couverture, jeu de données d'exemple |
| 9 – 15 déc. | Outils MCP, agent Rovo, skill, calibration, époques ; gel des fonctionnalités le 15 |
| 16 – 22 déc. | Recette, vidéo, instructions pour les juges, soumission, dépôt Marketplace |

## 26. Risques

| Risque | Parade |
|---|---|
| Effectifs trop faibles : tout est gris | Repli sur des cohortes plus larges, essai contrôlé ; un gris honnête vaut mieux qu'un vert faux |
| Lu comme un classement des personnes | Aucune donnée par personne, cohortes étroites masquées, rappel dans l'interface |
| Biais de sélection | Cohortes, alerte de déséquilibre, essai contrôlé |
| Mentions de commit absentes | Cinq sources, taux d'implication connue suivi |
| Corrélation prise pour une cause | Vocabulaire : « constaté », « établi » ; « prouvé » réservé à l'essai |
| Droits sur le graphe non accordés | Écran de couverture, mode Jira seul avec déclarations |
| Recommandation suivie aveuglément | Raisons et fondement toujours affichés, calibration publique |
| Juges sans dépôt, donc usage du graphe difficile à constater | Mode démonstration, collecte réelle filmée, écran de couverture qui interroge le graphe en direct |

## 27. La vision poussée à l'extrême

- **Le bon agent pour le bon ticket.** Par cohorte, l'app dit quel outil et quel modèle suffisent : « pour ce genre de ticket, le modèle économique donne le même résultat ».
- **La délégabilité devient une propriété du code.** Chaque zone a sa couleur, et l'app dit ce qui la ferait changer : tests manquants, conventions non écrites, critères flous. C'est un plan d'investissement, suivi dans le temps.
- **La file de nuit.** Un ticket prêt, autorisé, sans collision, relisible et délégable part seul le soir. Le matin, un bilan dit ce qui a été fait, prouvé, ou laissé.
- **Un essai permanent.** Une petite part des tickets est toujours tirée au sort, pour que la carte reste juste quand les modèles changent.
- **La prévision.** « Au rythme actuel, 55 % du backlog sera délégable dans six mois » : de quoi dimensionner l'équipe et la relecture.
- **Entre équipes.** Comparaison anonymisée : que font différemment celles dont les migrations sont vertes ?
- **Des faits face aux éditeurs.** L'organisation négocie ses outils avec ses propres résultats, pas avec les leurs.

## 28. Liens avec les autres cahiers des charges

- **Brief de contexte (02)** : la présence de critères d'acceptation est une condition de la recommandation.
- **Permis d'agir (06)** : le capital de confiance note un profil d'agent ; ici on note un genre de travail. Les zones sensibles sont communes.
- **Fait, preuve à l'appui (07)** : la relecture renforcée peut exiger une preuve par critère.
- **Chantiers en collision (09)** : un orchestrateur croise `list-clear-work` et `list-delegable-work`.
- **Le coût réel de la dette (05)** : les cases rouges durables désignent des zones où la dette empêche de déléguer.

## 29. Sources

- [Commit externe, Teamwork Graph](https://developer.atlassian.com/platform/teamwork-graph/api-reference/object-types/ExternalCommit/)
- [Pull request externe, Teamwork Graph](https://developer.atlassian.com/platform/teamwork-graph/api-reference/object-types/ExternalPullRequest/)
- [Types de relations, Teamwork Graph](https://developer.atlassian.com/platform/teamwork-graph/api-reference/relationship-types/overview/)
- [Permissions Forge, agir hors ligne au nom d'un utilisateur](https://developer.atlassian.com/platform/forge/manifest-reference/permissions/)
- Mentions de commit des agents, sources tierces : [forum Cursor](https://forum.cursor.com/t/disable-auto-co-authored-by-cursor-on-agent-commits-or-make-it-opt-in/168258/8), [notes sur Codex](https://codex.danielvaughan.com/2026/04/30/agent-fingerprints-pull-requests-codex-cli-git-hygiene/), [guide de traçabilité](https://cc.bruniaux.com/guide/ai-traceability/)
- [Module Rovo MCP](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/), [module Action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/), [module Rovo Agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/)
- [Déclencheur planifié](https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/)
- [Modules Jira](https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-jira/)
- [Limites d'invocation](https://developer.atlassian.com/platform/forge/limits-invocation/) et [limites SQL](https://developer.atlassian.com/platform/forge/limits-sql/)
- [Codegeist 2026](https://codegeist2026.devpost.com/) et son [règlement](https://codegeist2026.devpost.com/rules)
