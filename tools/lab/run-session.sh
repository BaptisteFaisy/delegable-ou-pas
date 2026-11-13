#!/usr/bin/env bash
# run-session.sh — le lab : un vrai OpenCode sur un vrai ticket, dans un bac à sable git.
#
# Usage :
#   bash tools/lab/run-session.sh --dry-run            # liste les tickets, ne lance rien
#   bash tools/lab/run-session.sh --ticket PROJ-101    # une session
#   bash tools/lab/run-session.sh --all                # toutes les sessions, dans l'ordre
#
# Variables d'environnement :
#   LAB_DIR      dépôt bac à sable (défaut : ~/Bureau/opencode-lab)
#   LAB_MODEL    modèle opencode (défaut : agnes/agnes-3.0-flash — rapide et
#                fiable ; le modèle par défaut d'opencode n'est pas joignable
#                sur cette machine)
#   LAB_TIMEOUT  secondes par ticket (défaut : 300 — au-delà, le ticket est
#                noté et le script passe au suivant)
#
# Le script ne travaille QUE dans le bac à sable : il refuse de s'exécuter
# ailleurs (le dépôt du projet, un worktree, un autre dépôt). Le journal
# `tools/lab/journal.jsonl` reçoit une ligne JSON par session — même en cas
# d'interruption : une session avortée est notée, jamais perdue.
set -euo pipefail
export LC_ALL=C

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TICKETS="$RACINE/tools/lab/tickets.json"
JOURNAL="$RACINE/tools/lab/journal.jsonl"
LAB="${LAB_DIR:-$HOME/Bureau/opencode-lab}"
MODELE="${LAB_MODEL:-agnes/agnes-3.0-flash}"
TIMEOUT_S="${LAB_TIMEOUT:-300}"

die() { printf 'ERREUR: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

# --- état de la session en cours (pour le journal, même en cas de coupure) ---
EN_COURS=0
C_TICKET="" C_TITRE="" C_SESSION="" C_SHA="" C_DEBUT="" C_FIN=""
C_CODE=0 C_EXPIRE=0 C_COMMIT=0 C_MESSAGES=0 C_MODEL="$MODELE" C_DIRTY=0

# Le lab doit être LE bac à sable : un dépôt git à la racine de LAB_DIR,
# marqué par `.lab-marker`, et qui n'est ni le dépôt du projet ni un
# worktree de celui-ci.
verifier_lab() {
  [ -d "$LAB" ] || die "bac à sable introuvable : $LAB (LAB_DIR)"
  [ -f "$LAB/.lab-marker" ] || die "$LAB n'est pas le bac à sable (marqueur .lab-marker absent)"
  local sommet
  sommet="$(git -C "$LAB" rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$sommet" ] || die "$LAB n'est pas un dépôt git"
  [ "$(cd "$sommet" && pwd -P)" = "$(cd "$LAB" && pwd -P)" ] \
    || die "$LAB n'est pas la racine du dépôt git"
  local racine_projet
  racine_projet="$(cd "$RACINE" && pwd -P)"
  [ "$(cd "$sommet" && pwd -P)" != "$racine_projet" ] \
    || die "le bac à sable ne peut pas être le dépôt du projet"
  case "$(cd "$sommet" && pwd -P)/" in
    "$racine_projet"/*) die "le bac à sable ne peut pas être dans le dépôt du projet" ;;
  esac
}

# Les tickets de `tools/lab/tickets.json`, un par ligne, champs séparés par
# des tabulations : clé, titre, type, zone, taille, consigne.
tickets_tsv() {
  python3 - "$TICKETS" "${1:-ALL}" <<'PY'
import json
import sys

chemin, cle = sys.argv[1], sys.argv[2]
avec = json.load(open(chemin, encoding="utf-8"))
for ticket in avec["tickets"]:
    if cle != "ALL" and ticket["key"] != cle:
        continue
    champs = [ticket["key"], ticket["title"], ticket["type"], ticket["zone"],
              ticket["size"], ticket["instruction"]]
    print("\t".join(str(c).replace("\t", " ").replace("\n", " ") for c in champs))
PY
}

# La consigne complète envoyée à opencode : la consigne du ticket, puis les
# règles du bac à sable (dont la signature du commit, SPEC §5).
composer_consigne() {
  local cle="$1" titre="$2" consigne="$3"
  cat <<EOF
$consigne

Règles du bac à sable (elles font partie du travail) :
- Tu travailles dans le dépôt git local « mini-notes », un bac à sable jetable
  (répertoire $LAB). Ne touche à AUCUN autre dépôt, aucun autre répertoire,
  aucun service externe, aucune API distante. N'installe rien.
- Fais le travail toi-même, directement : ne délègue pas à un sous-agent.
- Le changement doit rester minuscule (quelques lignes) et les tests doivent
  passer : \`python3 -m unittest discover -s tests\`.
- Termine par UN SEUL commit git (git add + git commit) dont le message
  commence par « $cle $titre » et dont la DERNIÈRE ligne est exactement :
  Co-authored-by: OpenCode <noreply@opencode.ai>
- Ne pousse rien, ne crée aucune branche, n'utilise aucune commande
  destructive (ni reset, ni checkout --, ni clean).
EOF
}

# Une ligne de journal par session : le ticket, la session opencode, le sha
# réel du commit, les dates, le code de sortie.
journal_ajouter() {
  JOURNAL="$JOURNAL" C_TICKET="$C_TICKET" C_TITRE="$C_TITRE" \
  C_SESSION="$C_SESSION" C_SHA="$C_SHA" C_DEBUT="$C_DEBUT" C_FIN="$C_FIN" \
  C_CODE="$C_CODE" C_EXPIRE="$C_EXPIRE" C_COMMIT="$C_COMMIT" \
  C_MESSAGES="$C_MESSAGES" C_MODEL="$C_MODEL" C_DIRTY="$C_DIRTY" \
    python3 - <<'PY'
import json
import os

env = os.environ
entree = {
    "ticket": env["C_TICKET"],
    "title": env["C_TITRE"],
    "sessionId": env["C_SESSION"],
    "sha": env["C_SHA"],
    "startedAt": env["C_DEBUT"],
    "endedAt": env["C_FIN"],
    "exitCode": int(env["C_CODE"] or 0),
    "timedOut": env["C_EXPIRE"] == "1",
    "committed": env["C_COMMIT"] == "1",
    "messages": int(env["C_MESSAGES"] or 0),
    "agent": "build",
    "model": env["C_MODEL"],
    "dirtyFiles": int(env["C_DIRTY"] or 0),
}
with open(env["JOURNAL"], "a", encoding="utf-8") as sortie:
    sortie.write(json.dumps(entree, ensure_ascii=False) + "\n")
PY
}

# Une interruption (Ctrl-C, killed) ne doit pas perdre la session : elle est
# notée au journal avant de sortir.
interruption() {
  local code="$1"
  if [ "$EN_COURS" -eq 1 ]; then
    C_FIN="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    C_CODE="$code"
    journal_ajouter || true
  fi
  exit "$code"
}
trap 'interruption 143' TERM
trap 'interruption 130' INT

# L'agent peut être interrompu (SIGINT) alors que son `git commit` finit
# encore dans le dépôt : on laisse l'état git se stabiliser avant de mesurer,
# sinon le commit réel passerait pour un ticket sans commit.
stabiliser() {
  local pause=1 limite=20 etat precedent=""
  while [ "$pause" -le "$limite" ]; do
    etat="$(git -C "$LAB" rev-parse HEAD)|$(git -C "$LAB" status --porcelain | tr -d '\n')"
    [ "$etat" = "$precedent" ] && return 0
    precedent="$etat"
    sleep 1
    pause=$((pause + 1))
  done
  return 0
}

# Une session : opencode travaille, puis on vérifie que le dépôt a changé.
executer_ticket() {
  local cle="$1" titre="$2" consigne="$3"
  local avant apres statut_porc session messages dossier sortie code
  avant="$(git -C "$LAB" rev-parse HEAD)"
  C_TICKET="$cle"; C_TITRE="$titre"; C_SHA=""; C_SESSION=""
  C_DEBUT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; C_FIN=""
  C_CODE=0; C_EXPIRE=0; C_COMMIT=0; C_MESSAGES=0; C_MODEL="$MODELE"; C_DIRTY=0
  EN_COURS=1

  dossier="$(mktemp -d /tmp/lab-opencode.XXXXXX)"
  sortie="$dossier/session.jsonl"

  info "$cle — $titre"
  set +e
  ( cd "$LAB" && timeout --kill-after=10 "$TIMEOUT_S" opencode run \
      --agent build \
      --model "$MODELE" \
      --format json \
      --title "$cle $titre" \
      "$(composer_consigne "$cle" "$titre" "$consigne")" ) >"$sortie" 2>"$dossier/err.log" </dev/null
  code=$?
  set -e
  C_FIN="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  C_CODE="$code"

  session="$(grep -o '"sessionID":"[^"]*"' "$sortie" 2>/dev/null | head -1 | cut -d'"' -f4 || true)"
  messages="$(grep -o '"messageID":"[^"]*"' "$sortie" 2>/dev/null | sort -u | wc -l | tr -d ' ')"
  C_SESSION="$session"
  C_MESSAGES="$messages"

  stabiliser

  apres="$(git -C "$LAB" rev-parse HEAD)"
  statut_porc="$(git -C "$LAB" status --porcelain || true)"
  C_DIRTY="$(printf '%s' "$statut_porc" | grep -c . || true)"

  if [ "$apres" != "$avant" ]; then
    C_SHA="$apres"
    C_COMMIT=1
  fi
  [ "$code" -eq 124 ] && C_EXPIRE=1

  journal_ajouter
  EN_COURS=0

  if [ "$C_EXPIRE" -eq 1 ]; then
    info "$cle : délai de ${TIMEOUT_S}s dépassé, ticket noté et passage au suivant"
  elif [ "$C_COMMIT" -eq 1 ]; then
    info "$cle : commit $C_SHA"
  elif [ "$C_DIRTY" -gt 0 ]; then
    info "$cle : fichiers modifiés sans commit — noté"
  else
    info "$cle : rien n'a changé — noté"
  fi
  rm -rf "$dossier"
}

mode="${1:-}"
cle=""
case "$mode" in
  --dry-run)
    info "Tickets du lab (aucune session lancée)"
    while IFS=$'\t' read -r k t ty zo sz _; do
      printf '  %-9s %-11s %-6s %-24s %s\n' "$k" "$ty" "$sz" "$zo" "$t"
    done < <(tickets_tsv ALL)
    exit 0
    ;;
  --ticket)
    [ -n "${2:-}" ] || die "--ticket attend une clé (PROJ-101)"
    cle="$2"
    ;;
  --all)
    ;;
  -h|--help) usage 0 ;;
  "") usage 2 ;;
  *) die "option inconnue : $mode" ;;
esac

[ -f "$TICKETS" ] || die "tickets introuvables : $TICKETS"
verifier_lab
[ -w "$RACINE/tools/lab" ] || die "journal non inscriptible : $JOURNAL"

if [ -n "$cle" ]; then
  lignes="$(tickets_tsv "$cle")"
  [ -n "$lignes" ] || die "ticket inconnu : $cle"
  printf '%s\n' "$lignes" | while IFS=$'\t' read -r k t _ty _zo _sz consigne; do
    executer_ticket "$k" "$t" "$consigne"
  done
else
  while IFS=$'\t' read -r k t _ty _zo _sz consigne; do
    executer_ticket "$k" "$t" "$consigne"
  done < <(tickets_tsv ALL)
fi

info "Journal : $JOURNAL"
