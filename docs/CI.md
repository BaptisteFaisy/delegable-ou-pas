# CI — « Délégable ou pas ? »

> **État réel et vérifié le 11 novembre 2026** sur `Tradoooo/delegable-ou-pas`
> (commandes `gh api` bornées, sorties recopiées). Ce document décrit la chaîne
> telle qu'elle tourne, pas une intention. Les règles de code qu'elle fait
> respecter sont dans [CONVENTIONS.md](CONVENTIONS.md).

## 1. Les trois checks requis

| check | workflow | ce qu'il contrôle |
|---|---|---|
| `ci` | `.github/workflows/ci.yml` | aujourd'hui : lisibilité UTF-8 et non-vide de tout `.md` / `.mdx` / `.txt` du dépôt (sanity docs), et les tests des gardes CI (`couche0` + agents `fireworks`). Dès que le lot d'outillage est sur `main` : types (`tsc --noEmit`), tests (`vitest run`), fichier > 500 lignes, fonction > 50 lignes, manifeste Forge |
| `ci-budget` | `.github/workflows/ci-budget.yml` | un job sans `timeout-minutes`, ou un job de PR borné au-delà de 5 minutes |
| `couche0` | `.github/workflows/couche0.yml` | fichier modifié hors du `## Scope` de la PR, déclaration de périmètre inutilisée, motif interdit dans les lignes ajoutées, fichier de garde modifié sans la mention `SAMVISION_ALLOW_GUARD_BUMP` |

Un quatrième check, `stale-base-guard`, est **informationnel** (§8). Les trois
autres sont exigés à la fois par le ruleset de `main` (§3) et par la file Mergify
(§5) : sans eux, une PR n'entre pas dans la file.

## 2. Étapes du job `ci`, dans l'ordre

État de `main` au 11 novembre 2026 : le dépôt porte le cahier des charges, le
contrat gelé (`src/types*.ts`, `src/ports.ts`) et la documentation ; l'outillage
applicatif (`package.json`, `tools/`, étapes `tsc` et `vitest`) vient du lot
`lot/outillage`, en file le même jour. Étapes du job `ci`, dans l'ordre :

1. `actions/checkout@v4` — `fetch-depth: 1`, `persist-credentials: false`,
   `clean: false`.
2. Nettoyage du workspace : `git clean -ffdx` (les runners sont persistants, un
   sous-dossier parasite d'un run précédent fausserait le sanity docs).
3. Sanity docs : tout `.md` / `.mdx` / `.txt` est lu en UTF-8 et doit être non
   vide — un document illisible ou vide est une erreur.
4. Tests des gardes CI : `.github/couche0/test_check_couche0.py` puis les cinq
   bancs de `.github/fireworks/` (`conflict_agent`, `test_agent`, `scope_agent`,
   `union_journal`, `quota`). Les gardes se testent elles-mêmes, en bibliothèque
   standard, sans réseau.

Le lot d'outillage (PR `lot/outillage`, en vol le 11 novembre) ajoute entre les
étapes 2 et 3 : conservation de `node_modules`
(`git clean -ffdx -e /node_modules -e /.npm-state -e /dist -e /build`),
installation npm conditionnée par l'empreinte de `package-lock.json`,
`npx tsc --noEmit`, `npx vitest run --passWithNoTests`,
`python3 tools/check-file-limits.py`, `node tools/check-function-limits.mjs`,
puis `node tools/check-manifest.mjs` (toléré absent tant que `manifest.yml` ou le
script manque).

Déclencheurs de `ci` : `pull_request`, `merge_group` (le commit temporaire du lot
en file), `workflow_dispatch`. **Pas de `push` sur `main`** : sur la branche
protégée, seul `ci-budget` se rejoue après un merge — vérifié sur le dernier
commit de `main`, où `ci-budget` est le seul des trois checks présent.

## 3. Le ruleset de `main`

Vérifié par `gh api repos/Tradoooo/delegable-ou-pas/rulesets/27036463` :

- identifiant **27036463**, nom « main — PR obligatoire, checks requis
  (ci, ci-budget, couche0) », cible `branch`, `enforcement: active`, porté sur
  `refs/heads/main` ;
- règles : `deletion` et `non_fast_forward` (la branche ne se supprime ni ne se
  réécrit), `pull_request` (**0 approbation exigée**, `dismiss_stale_reviews_on_push`,
  méthodes de fusion autorisées `merge`, `squash`, `rebase`),
  `required_linear_history` (historique linéaire — la file fusionne en `rebase`),
  `required_status_checks` sur `ci`, `ci-budget`, `couche0`
  (`strict_required_status_checks_policy: false`) ;
- **un seul contournement** : `bypass_actors` = intégration `actor_id 10562`,
  mode `exempt`. C'est l'application Mergify — vérifié : les PR #2 et #4 portent
  `mergedBy: app/mergify`. Autrement dit, **personne ne merge à la main**, ni
  humain ni agent.

## 4. Les quatre runners auto-hébergés

Ils sont **au niveau du dépôt**, pas au niveau de l'organisation : c'est la
condition qui tient la CI debout depuis le transfert vers `Tradoooo`.

- Le dépôt est **public**, et le groupe de runners de l'organisation
  (`Default`) porte `allows_public_repositories = false` : ses runners
  (`r630-ci-01..06`, qui ont bien l'étiquette `delegable-ou-pas-worker`) ne
  peuvent **pas** servir ce dépôt. Les jobs resteraient `queued` indéfiniment,
  sans erreur visible.
- Les quatre runners sont donc enregistrés sur le dépôt lui-même :
  `r630-delegable-ou-pas-01..04`, étiquette `delegable-ou-pas-worker`,
  répertoires `~/actions-runner-delegable-ou-pas-0N` sur le serveur **r630**.
- GitHub **désinscrit** un runner qui ne se connecte plus : le registre peut
  être vide alors que les dossiers existent encore. D'où le script
  `~/bin/start-delegable-runner` sur le r630, appelé par les unités systemd
  utilisateur `actions-runner-delegable-ou-pas-0N.service` : si `run.sh` meurt
  autrement que sur un `SIGTERM` demandé, il ré-inscrit le runner puis
  repart. `Restart=always` couvre le reste.
- Les workflows sélectionnent sur `[self-hosted, linux, x64,
  delegable-ou-pas-worker]` (`ci`, `couche0`, `triage-rouge`,
  `pr-auto-merge`) ou `[self-hosted, delegable-ou-pas-worker]`
  (`ci-budget`, `stale-base-guard`). La casse ne compte pas : `linux` et
  `Linux` désignent la même étiquette.
- Runners persistants : `node_modules` et le cache npm survivent d'un run à
  l'autre, d'où le budget de 5 minutes (§9) sans réinstallation à chaque PR.

**Le symptôme à reconnaître** : des checks qui restent `queued` alors que le
dépôt a des commits récents et que la CI a déjà tourné. Ce n'est pas la
machine, c'est le registre :

```bash
timeout 30 gh api repos/Tradoooo/delegable-ou-pas/actions/runners \
  --jq '.total_count, (.runners[] | "\(.name) \(.status) busy=\(.busy)")'
```

Un `total_count` à `0`, ou des runners `offline`, se répare en ré-inscrivant
(§11) puis en relançant l'unité systemd.

## 5. La file Mergify

Configuration dans `.mergify.yml`, produit **Merge Queue** activé par API sur le
dépôt (les checks `Mergify Merge Queue` et `Mergify Merge Protections` sont
publiés sur les PR — constaté sur la PR #3). La variable de dépôt
`MERGIFY_QUEUE=1` dit au balayeur que la file tient les merges et qu'il doit
s'effacer.

```yaml
queue_rules:
  - name: default
    queue_conditions: [check-success = ci, check-success = ci-budget,
                       check-success = couche0, -conflict, -draft, base = main]
    batch_size: { min: 1, max: 3 }
    batch_max_wait_time: "30 seconds"
    max_checks_retries: 1
    merge_method: rebase
    update_method: rebase
merge_queue:
  max_parallel_checks: 2
merge_protections_settings:
  auto_merge_conditions: true
```

À retenir :

- **`batch_size` de 1 à 3** : un lot part seul s'il est seul, sinon la file
  groupe jusqu'à trois PR et les teste sur l'arbre fusionné ;
- **`merge_method: rebase` et `update_method: rebase`** : cohérent avec
  `required_linear_history` du ruleset — jamais de bulle de merge ;
- **`max_parallel_checks: 2`** : la spéculation de la file reste bornée à deux
  lots pour ne pas affamer la CI des PR ouvertes (quatre runners au total) ;
- **auto-embarquement** : `auto_merge_conditions: true` met en file toute PR qui
  satisfait les conditions, sans intervention ;
- deux priorités par étiquette : `urgent` (haute) et `priority-low` (basse) ;
- l'étiquette **`hold`** est le frein manuel : elle sort la PR de l'automatisme.

## 6. Le balayeur `pr-auto-merge`

`.github/workflows/pr-auto-merge.yml` — deux jobs (`discover`, `sweep` en
matrice, 8 PR au plus par run), un seul groupe de concurrence
`pr-auto-merge` **sans annulation** : un balayage examine toutes les PR ouvertes,
donc deux balayages simultanés ne feraient que se doubler.

- **Déclencheurs** : `pull_request` sur `ready_for_review` et `edited` (une
  réécriture du corps — le `## Scope` posé par l'agent de périmètre — réarme
  `couche0`), `push` sur `main`, cron `*/5` en filet, et `workflow_run` à la fin
  de `CI` (la voie rapide).
- **Découverte des PR oubliées** : le balayage ne dépend d'aucun événement
  d'auteur — il relit l'ensemble des PR ouvertes à chaque passage, donc une PR
  verte dont personne ne s'occupe finit par être embarquée.
- **Embarquement** : une PR dont les trois checks sont verts est mise en file
  (commentaire `@mergifyio queue`) ; une PR en retard est rebasée ; une PR
  `DIRTY` passe à l'agent de conflit (§7).
- **Relance** : pour une PR bloquée, un check tombé pour de l'infrastructure
  (job perdu, checkout, cache, runner) est rejoué — **deux fois au plus par tête**,
  avec marqueur en commentaire ; un échec réel (test rouge) n'est jamais relancé,
  un commentaire nomme l'étape en cause, une fois par tête.
- **Périmètre manquant** : `couche0` rouge sur le `## Scope` déclenche l'agent de
  périmètre (`.github/fireworks/scope_agent.py`), qui rédige la déclaration
  depuis le diff et la vérifie avec le garde de `main` **avant** d'écrire le
  corps. Le garde n'est pas assoupli pour autant.
- **Authentification** : le secret `AUTOMERGE_PAT` (un vrai jeton utilisateur) —
  `GITHUB_TOKEN` ne suffit ni pour l'auto-merge ni pour des poussées qui
  relancent la CI. Toute poussée se fait **avec bail** (`--force-with-lease`),
  jamais d'écrasement d'un push d'auteur arrivé entre-temps. Les brouillons sont
  rebasés mais jamais mergés ; les forks sont exclus.
- Un seul balayage par couple (tête, base, état de fusion, empreinte des checks) :
  l'empreinte vit dans un commentaire unique mis à jour sur place.

## 7. L'agent de conflit

`.github/fireworks/conflict_agent.py`, appelé par le balayeur dans son clone
quand un rebase bute : il fait résoudre chaque conflit élémentaire par un modèle,
recopie le reste du fichier intact, termine le rebase, **pousse avec bail** et
rend compte en commentaire — sans intervention humaine. Codes de sortie :
`0` poussé, `1` échec commenté, `2` rien à faire.

- **Routeur InferHub** : branché par les variables de dépôt
  `FIREWORKS_BASE_URL=https://api.inferhub.dev/v1/chat/completions` et
  `FIREWORKS_MODEL=combo/cheap` (les défauts du script pointent encore
  l'API Fireworks et `minimax-m3p1-flash` ; ce sont les variables du dépôt qui
  font foi). La clé vient du secret `FIREWORKS_API_KEY`.
- **Saisine bornée** : empreinte par tête de PR + cooldown 20 min, plafond
  10 saisines/heure et 3 saisines par PR en 30 min, 100 fichiers au plus,
  200 Ko par fichier, 20 blocs de conflit, budget 240 s. Les conflits sous
  `.github/`, les binaires et les fichiers trop lourds sont refusés d'office.
- **Coupe-circuit** : la variable `FIREWORKS_AGENT_RESOLVE=0` arrête l'agent sans
  toucher au code (elle vaut `1` aujourd'hui).
- **Journaux en ajout pur** (`CHANGELOG.md`, `CHANGELOG`) : réunis sans modèle
  par `union_journal.py` — deux entrées écrites en tête de fichier ne sont pas un
  désaccord. C'est ce qui a arrêté une boucle de rebasages constatée sur un dépôt
  frère.
- **Porte de compilation** (`compilation_gate.py`) : une résolution qui ne
  compile pas n'est jamais poussée. Coupe-circuit `CONFLICT_COMPILE_GATE=0`.
- Étiquettes : `hold` et `intervention-humaine` interdisent toute saisine ;
  un succès pose `agent-conflit`. Le modèle ne voit que les bords du conflit.
- Recette à blanc : `python3 conflict_agent.py resolve --dry-run --repo
  Tradoooo/delegable-ou-pas --pr N` affiche les prompts sans rien appeler.

## 8. Les autres workflows

| workflow | rôle | porte de merge ? |
|---|---|---|
| `triage-rouge.yml` | à la fin d'un run `CI` : sort la classe ou le test tombé, le rapproche du diff, le relance **seul** (vert seul = dépendance d'ordre entre tests, pas le code de la PR), publie le verdict en commentaire une fois par tête, puis passe la main à l'agent de réparation avec ce verdict comme indice | non — il reste vert quoi qu'il arrive, pour ne jamais ajouter un check rouge au-dessus d'un rouge |
| `stale-base-guard.yml` | mesure le retard de la branche sur `main` : `warning` puis `exit 0` | non — informationnel |

Le juge `triage_test.py` est lu sur `main`, jamais sur la branche de la PR : un
juge ne s'écrit pas dans le prétoire.

## 9. Le budget : 5 minutes

Chaque job porte `timeout-minutes: 5` et la garde `ci-budget`
(`.github/ci-budget/check_timeouts.py`, bibliothèque standard) échoue si un job
d'un workflow déclenché sur `pull_request` dépasse 5 minutes ou n'a aucun
timeout. `concurrency` par PR, `fetch-depth: 1`. **On n'allonge jamais un
timeout** : on optimise ou on découpe.

Mesures réelles du 11 novembre 2026 (PR #1, #2, #4, dépôt de documentation) :

| check | durée constatée |
|---|---|
| `ci` | 20 s, 41 s, 20 s |
| `couche0` | 8 s à 11 s |
| `ci-budget` | 10 s à 35 s |
| `stale-base-guard` | 7 s |

Le verdict complet tombe donc en moins d'une minute aujourd'hui ; la marge
jusqu'aux 5 minutes est celle que prendront `tsc` et `vitest` une fois le code
posé.

## 10. Variables et secrets du dépôt (constatés le 11 novembre 2026)

`gh variable list` :

| variable | valeur | effet |
|---|---|---|
| `MERGIFY_QUEUE` | `1` | la file Mergify tient les merges, le balayeur s'efface |
| `FIREWORKS_AGENT_RESOLVE` | `1` | agent de conflit armé (`0` = coupe-circuit) |
| `FIREWORKS_BASE_URL` | `https://api.inferhub.dev/v1/chat/completions` | routeur du modèle |
| `FIREWORKS_MODEL` | `combo/cheap` | modèle interrogé |

`gh secret list` : `AUTOMERGE_PAT` (rebase, embarquement, poussées qui relancent
la CI), `FIREWORKS_API_KEY` (clé du routeur). Aucun autre secret ; aucune clé
n'est écrite dans un fichier du dépôt.

## 11. Ajouter un runner

1. Sur r630, récupérer le jeton d'enregistrement du dépôt :
   `gh api -X POST repos/Tradoooo/delegable-ou-pas/actions/runners/registration-token --jq .token`.
2. **Réutiliser un dossier d'agent existant** s'il y en a un (pas de
   re-téléchargement du paquet) ; sinon décompresser l'archive `actions-runner`
   dans `~/actions-runner-delegable-ou-pas-0N`.
3. Vider le workspace `_work` de l'agent (les restes d'un run précédent faussent
   le sanity docs) — **dans le dossier de l'agent uniquement**, jamais au-dessus.
4. Enregistrer avec les **étiquettes** des runners existants :
   `./config.sh --url https://github.com/Tradoooo/delegable-ou-pas --token <jeton> --name r630-delegable-ou-pas-0N --labels self-hosted,linux,x64,delegable-ou-pas-worker --work _work --unattended --disableupdate --replace`.
5. Installer l'unité systemd utilisateur qui appelle le script de
   ré-inscription (`~/bin/start-delegable-runner N`, cf. §4), puis la démarrer :
   `systemctl --user enable --now actions-runner-delegable-ou-pas-0N.service`.
   Pas de `./svc.sh` : le service systemd ne sait pas ré-inscrire un runner
   désinscrit, et c'est précisément le panne que l'on a rencontrée.
6. Vérifier l'enregistrement, borné :
   `timeout 60 gh api repos/Tradoooo/delegable-ou-pas/actions/runners --jq '.runners[]|"\(.name) \(.status)"'`
   — le nouveau doit être `online`.
7. Ne pas toucher aux sélecteurs des workflows : `[self-hosted, linux, x64,
   delegable-ou-pas-worker]` ramasse déjà la nouvelle machine.

## 12. Diagnostiquer une PR rouge

1. **Lire le verdict** :
   `timeout 120 gh pr checks <n> --repo Tradoooo/delegable-ou-pas` puis
   `timeout 120 gh run view --log-failed` sur le run en échec (les lignes
   `::error::` nomment le fichier ou le contrôle fautif).
2. **`couche0` rouge** → le plus souvent le périmètre : comparer les fichiers du
   diff (`gh pr view <n> --json files --jq '.files[].path'`) aux puces du
   `## Scope`. Deux causes, deux remèdes : un fichier non déclaré (ajouter la
   puce exacte), ou une déclaration inutilisée (retirer la puce trop large). Un
   motif interdit dans les lignes ajoutées se corrige dans le code, jamais en
   assouplissant le garde ; un fichier de garde modifié exige la ligne libre
   `SAMVISION_ALLOW_GUARD_BUMP`. `gh pr edit <n> --body …` suffit : le type
   `edited` réarme `couche0` seul.
3. **`ci-budget` rouge** → un job sans `timeout-minutes` ou au-delà de 5 min :
   découper le job. Ne jamais monter la borne.
4. **`ci` rouge** → relire l'étape fautive (§2). Sur un doute d'infrastructure
   (checkout, cache, runner perdu), le balayeur relance déjà deux fois par tête ;
   au-delà, c'est un échec réel.
5. **PR `DIRTY`** → ne rien forcer : l'agent de conflit (§7) la résout et pousse.
   Vérifier l'état avec
   `timeout 60 gh pr view <n> --repo Tradoooo/delegable-ou-pas --json state,mergeable,mergeStateStatus`.
6. **PR verte qui ne merge pas** → regarder la file : conditions non satisfaites
   (`-draft`, `base ≠ main`), étiquette `hold`, ou lot déjà pris dans un groupe.
   Le commentaire d'empreinte du balayeur dit lequel.
7. **Trois échecs déterministes identiques** sur la même entrée : arrêter,
   laisser la branche poussée, remonter l'erreur exacte et le numéro de PR.
