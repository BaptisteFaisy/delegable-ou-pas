# LAB — un bac à sable OpenCode réel, pas une simulation de chiffres

Le lot `lab-opencode` produit la donnée la plus proche du réel qu'on puisse
avoir : **un vrai OpenCode**, sur **un vrai dépôt git**, pour **de vrais
tickets**, avec **de vrais commits** et **une vraie télémétrie**.

Contrairement au jeu de données démo (`src/sample/`), rien ici n'est
fabriqué : chaque ligne du journal correspond à une session OpenCode qui a
réellement modifié le dépôt et réellement committé.

## Le lab

Le bac à sable vit **hors du dépôt**, dans `~/Bureau/opencode-lab/` : un
dépôt git minuscule (« mini-notes », 4 fichiers Python + 1 README) créé par
`git init` avec un commit initial. C'est un bac à sable : il n'est pas
publié, il n'a aucune dépendance, il ne touche **jamais** au dépôt du projet
ni au répertoire d'un autre agent — `run-session.sh` refuse de s'exécuter
ailleurs (il vérifie la racine git et le marqueur `.lab-marker`).

## La boucle du lab

```
ticket (tools/lab/tickets.json)
   │  run-session.sh  →  « opencode run --agent build --title "PROJ-1xx …" »
   ▼
session OpenCode réelle (modèle réel, jetons réels, durée réelle)
   │  l'agent commit, signé Co-authored-by (SPEC §5)
   ▼
commit réel dans ~/Bureau/opencode-lab  (git log, source de vérité)
   │  collect.sh  →  journal + git log --numstat + API opencode
   ▼
tools/lab/real-runs.json  (même forme que src/sample/opencode-real.json)
```

Chaque maillon est réel ; seul l'environnement (un dépôt d'un fichier au
lieu d'une vraie codebase) est simulé.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `tools/lab/tickets.json` | les tickets du lab (clé, titre, type, zone, taille, consigne) |
| `tools/lab/run-session.sh` | lance le vrai OpenCode sur un ticket, journalise la session |
| `tools/lab/collect.sh` | journal + git + API → `real-runs.json`, anonymisé et trié |
| `tools/lab/real-runs.json` | la télémétrie réelle, versionnée (identifiants hachés) |

`tools/lab/journal.jsonl` est le journal brut (`sessionId` en clair) : il
n'est **pas** versionné (voir `.gitignore`), le dépôt est public.

## Relancer le lab

Le bac à sable est une dépendance : s'il n'existe pas, le créer d'abord :

```bash
mkdir -p ~/Bureau/opencode-lab/tests && cd ~/Bureau/opencode-lab
git init -b main
# … écrire README.md, notes.py, cli.py, tests/test_notes.py … (voir « État
#   initial » ci-dessous), puis :
echo 'opencode-lab bac a sable : depot de mesure, rien d autre.' > .lab-marker
printf '__pycache__/\n*.pyc\n' > .gitignore
git config user.name "OpenCode Agent"; git config user.email "agent@opencode.invalid"
git add -A && git commit -m "init : mini-notes, bac a sable du lab OpenCode"
```

Puis jouer les sessions et rassembler la télémétrie :

```bash
bash tools/lab/run-session.sh --dry-run                    # lister, sans lancer
bash tools/lab/run-session.sh --ticket PROJ-101            # une session
bash tools/lab/run-session.sh --all                        # tout le lab
bash tools/lab/collect.sh                                  # → real-runs.json
```

Le modèle est choisi par `LAB_MODEL` (défaut `agnes/agnes-3.0-flash` — le
plus rapide et fiable ici ; le modèle par défaut d'opencode n'est pas
joignable sur cette machine). `LAB_TIMEOUT` borne chaque ticket (défaut
300 s) : un ticket trop long est noté dans le journal et le script passe au
suivant — le lab ne bloque jamais le lot.

## Ce que le lab NE reproduit PAS

L'honnêteté fait partie du résultat. Ce bac à sable ne reproduit pas :

- **le graphe Atlassian** : pas de Jira, pas d'historique de tickets, pas de
  transition de statut, pas de réouverture, pas de revue humaine. Les
  tickets sont des consignes isolées, pas un backlog réel ;
- **la revue et l'équipe** : un seul agent autonome, aucun reviewer, aucun
  conflit, aucune PR, aucune discussion ;
- **la vraie codebase** : « mini-notes » est un dépôt d'un fichier, pas un
  produit avec ses invariants, sa CI, ses dépendances ;
- **le coût réel** : le modèle de démo est gratuit, `costEuros` est donc 0 ;
- **la pression du réel** : délais, priorisation, pannes, clients.

C'est un **rasoir d'Occam** : la chaîne ticket → session → commit →
télémétrie y est intacte, tout le reste est volontairement retiré. Ce qui
en sort (fichiers touchés, lignes ajoutées/supprimées, durée, jetons,
mentions `Co-authored-by`) est exactement ce que l'app consomme.

## Sources

- Le format de `real-runs.json` reprend celui d'`opencode-real.json` (lot
  O1) : mêmes clés (`ticket`, `session`, `sha`, `author`, `mentions`,
  `messages`, dates, `files`, `additions`/`deletions`) afin que les deux
  jeux traversent le même générateur.
- Les faits de session (jetons, modèle, durée) viennent de l'API opencode,
  la seule source de vérité pour une session qui vient de se terminer.