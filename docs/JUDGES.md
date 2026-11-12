# Comment tester en 10 minutes — guide des juges

SPEC §24 · DP-20. Quatre étapes, dans l'ordre. Aucune installation, aucun
dépôt à cloner pour les trois premières.

> **À lire avant de commencer.** Le site de démonstration que nous fournissons
> **n'a pas de dépôt de code** : le Teamwork Graph n'y contient donc **ni commit
> ni pull request** (SPEC §24). Sur ce site, l'écran de couverture le dit, et
> les cartes s'appuient sur ce qui existe partout : les tickets, leurs
> historiques, leurs liens. Pour voir la collecte réelle du graphe, regardez la
> vidéo (`docs/VIDEO-SCRIPT.md`, plan 8) ou l'étape 4 ci-dessous, sur un site
> relié à un dépôt.

## Étape 1 — le mode démonstration (4 minutes)

Ouvrez le projet d'exemple `PROJ`. Un bandeau dit **DÉMO — données fictives /
DEMO — fictional dataset** : le jeu est marqué comme tel partout (SPEC §13,
DP-20), aucun risque de le confondre avec des données réelles.

Le jeu contient douze mois d'historique, trois époques et 882 tickets
(`docs/DEMO-DATA.md` donne tous les effectifs ; `tests/sample/docs.test.ts` les
recalcule à chaque exécution).

Ce qu'il faut regarder, dans cet ordre :

1. **La carte sur le ticket `PROJ-412`** — « Migration du champ « montant » en
   centimes ». On y lit : la cohorte (migration de données · facturation ·
   taille M), les deux bras avec leurs effectifs et leurs fourchettes
   (26 avec agent, 31 sans ; 69 % entre 50 et 83 contre 87 % entre 71 et 95),
   les délais médians (1,5 jour contre 3 jours), ce qui a mal tourné
   (5 réouvertures sur 8 pour une migration non rejouable), les tickets de
   référence (PROJ-207, PROJ-233, PROJ-301) et la confiance.
2. **La carte de délégation** — la matrice natures × zones. Les quatre couleurs
   y sont : une case **verte** (tests · web-ui), une **orange** (migration en
   zone sensible), une **rouge** (migration · facturation, époque 2) et beaucoup
   de **gris** : 23 cohortes sur 26 disent « on ne sait pas ». Changez d'époque
   et regardez la case des migrations bouger.
3. **Le détail d'une cohorte** — ouvrez la case rouge : l'écart est **établi**
   (40 % contre 86 %, fourchettes disjointes). Ouvrez la case du §7 (corrections
   · api · M) : 83 % contre 86 %, fourchettes largement chevauchantes → l'app
   dit « écart non établi », et **ne conclut pas**.
4. **Le cas « bras déséquilibrés »** — intégration externe · api · L, époque 2 :
   22 tickets avec agent, 3 sans. L'app affiche « bras déséquilibrés » et ne
   conclut pas (SPEC §7 règle 5).
5. **Les garde-fous** (SPEC §8) — `PROJ-455` (incident ouvert), `PROJ-457`
   (zone sensible), `PROJ-458` (pas de critères d'acceptation) : aucun ne peut
   recevoir « à confier à un agent », et la carte dit pourquoi.
6. **La calibration** — les avis donnés, et ce qui s'est réellement passé
   ensuite (SPEC §10).

## Étape 2 — l'agent Rovo et ses quatre questions (3 minutes)

Dans Rovo Chat, ouvrez l'agent **« Conseiller de délégation »**
(`static/agent/prompt.md`). Les quatre amorces de conversation sont les quatre
questions du SPEC §15 :

| Question | Ce qu'une bonne réponse contient |
|---|---|
| *What can we hand to agents in sprint 42?* | la liste des tickets « à confier » du sprint, chacun avec sa cohorte, son effectif et sa fourchette, et le nombre de tickets gris |
| *Why is PROJ-412 in reinforced review?* | la cohorte, les deux bras chiffrés, les délais médians, les causes d'échec, la définition de la relecture renforcée du projet |
| *Where are agents wasting our time?* | les cases rouges et orange, avec effectifs et fourchettes, et la mention explicite des cases grises |
| *What changed since the new model?* | une comparaison **époque par époque** (jamais mélangées), et la distinction « écart établi » / « écart non établi » |

Ce que l'agent ne doit **jamais** faire : citer un taux sans son effectif et sa
fourchette, nommer une personne, dire « prouvé » hors d'un essai contrôlé, ou
transformer un « on ne sait pas » en verdict.

## Étape 3 — le client MCP (2 minutes)

Les neuf outils sont exposés en `rovo:mcp`. Les deux à essayer :

- **`should-delegate`** sur `PROJ-412` : la même carte que dans le panneau du
  ticket — un seul type de sortie, donc jamais deux réponses différentes
  (SPEC §16.1).
- **`list-delegable-work`** sur le sprint 42 : ne rend **que** des tickets
  « à confier » (recette 13). Aucun outil ne renvoie de nom de personne
  (recette 12).

La skill **« before-taking-work »** (`static/skill/SKILL.md`) montre la conduite
attendue d'un agent de code : interroger avant de prendre, s'arrêter devant
« à garder pour un humain », annoncer les conditions devant « relecture
renforcée », déclarer son implication à la fin, signaler une reprise.

## Étape 4 — vos données réelles (le reste du temps)

Sur un site **relié à un dépôt** :

1. Installez l'app, ouvrez l'**écran de couverture** : il interroge le graphe en
   direct sur les objets présents partout (tickets, utilisateurs, sprints) et
   affiche, droit par droit, ce qui est accordé, manquant ou inconnu. Un droit
   manquant **vide le résultat au lieu de lever une erreur** (SPEC §19,
   recette 15) — et l'écran dit quoi demander à l'administrateur de
   l'organisation.
2. Déclarez la **date d'adoption** des agents : tout ce qui précède forme le
   bras « sans agent » (SPEC §13).
3. Lancez la **collecte** : douze mois d'historique Jira, puis le graphe par
   tranches reprises où elles se sont arrêtées (DP-18).
4. Réglez le **catalogue de mentions** de commit : les motifs vus sont listés
   avec leur nombre d'occurrences, l'équipe confirme ou corrige (DP-02,
   `docs/research/R3-agent-commit-mentions.md`).

## Ce que nous revendiquons — et ce que nous ne revendiquons pas

- Nous revendiquons : des chiffres toujours accompagnés de leur effectif et de
  leur fourchette ; « on ne sait pas » comme conclusion à part entière ; aucune
  statistique par personne ; des garde-fous qui priment sur les chiffres ; un
  essai contrôlé comme seule voie vers le mot « prouvé ».
- Nous ne revendiquons pas : une mesure parfaite de l'implication des agents.
  Sur le jeu, **42 % des tickets ont une implication inconnue** — c'est l'ordre
  de grandeur réel d'une équipe qui débute, et l'app le dit au lieu de le
  masquer (DP-03).
