#!/usr/bin/env bash
# collect.sh — le journal du lab + l'historique git du lab → une télémétrie réelle.
#
# Le fichier produit (`tools/lab/real-runs.json`) a la forme du jeu de données
# du lot O1 (`src/sample/opencode-real.json`) : un objet `{ generatedAt,
# source, sessions: [...] }`. Chaque session y porte les faits RÉELS :
# ticket, session opencode (hachée), sha du commit, auteur du commit,
# nombre de messages, dates, fichiers touchés, lignes ajoutées / supprimées.
#
# Ce que ça vient chercher :
#  - `tools/lab/journal.jsonl` : ce que `run-session.sh` a écrit (ticket,
#    sessionId, sha, dates, code de sortie) ;
#  - `git log --numstat` du bac à sable : les lignes ajoutées et supprimées,
#    les fichiers touchés, l'auteur et la mention `Co-authored-by:` ;
#  - l'API opencode : le coût, les jetons et le modèle réellement utilisés.
#
# Usage :
#   bash tools/lab/collect.sh [--out <fichier>] [--dry-run]
#
# Variables d'environnement :
#   LAB_DIR   dépôt bac à sable (défaut : ~/Bureau/opencode-lab)
set -euo pipefail
export LC_ALL=C

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JOURNAL="$RACINE/tools/lab/journal.jsonl"
LAB="${LAB_DIR:-$HOME/Bureau/opencode-lab}"
SORTIE="$RACINE/tools/lab/real-runs.json"
SECONDES_API="${LAB_API_TIMEOUT:-20}"

die() { printf 'ERREUR: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-2}"; }

SECONDE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out) [ -n "${2:-}" ] || die "--out attend un chemin"; SORTIE="$2"; shift 2 ;;
    --dry-run) SECONDE=1; shift ;;
    -h|--help) usage 0 ;;
    *) die "option inconnue : $1" ;;
  esac
done

[ -d "$LAB" ] || die "bac à sable introuvable : $LAB"
[ -f "$LAB/.lab-marker" ] || die "$LAB n'est pas le bac à sable (marqueur .lab-marker absent)"
[ -f "$JOURNAL" ] || die "journal introuvable : $JOURNAL (lance run-session.sh d'abord)"

# L'assemblage : journal + git + API opencode → un JSON trié et déterministe.
# L'identifiant de session est haché (le dépôt est public), les chemins sont
# relatifs au bac à sable, aucune donnée personnelle n'est conservée.
LAB="$LAB" JOURNAL="$JOURNAL" SORTIE="$SORTIE" SECONDES_API="$SECONDES_API" \
LAB_SECONDE="$SECONDE" python3 - <<'PY'
import hashlib
import json
import os
import subprocess
import sys

LAB = os.environ["LAB"]
JOURNAL = os.environ["JOURNAL"]
SORTIE = os.environ["SORTIE"]
SECONDES_API = int(os.environ["SECONDES_API"])
SECONDE = os.environ["LAB_SECONDE"] == "1"

MENTION = "co-authored-by"


def hacher(valeur):
    """Clé publique d'une session : jamais son identifiant en clair."""
    return "oc_" + hashlib.sha256(str(valeur).encode("utf-8")).hexdigest()[:16]


def git(*arguments, **options):
    """Une commande git dans le bac à sable, sans jamais échouer bruyamment."""
    try:
        return subprocess.run(["git", "-C", LAB, *arguments], check=True,
                              capture_output=True, text=True,
                              timeout=options.get("timeout", 30)).stdout
    except (subprocess.SubprocessError, OSError):
        return ""


def api(session):
    """Les faits réels d'une session : coût, jetons, modèle (API opencode)."""
    if not session:
        return {}
    try:
        brut = subprocess.run(["opencode", "api", "GET", f"/api/session/{session}"],
                              capture_output=True, text=True,
                              timeout=SECONDES_API).stdout
        donnees = json.loads(brut).get("data") or {}
    except (subprocess.SubprocessError, OSError, ValueError):
        return {}
    jetons = donnees.get("tokens") or {}
    return {
        "costEuros": round(float(donnees.get("cost") or 0), 6),
        "tokensIn": int(jetons.get("input") or 0),
        "tokensOut": int(jetons.get("output") or 0),
        "model": donnees.get("model") or {},
        "agent": donnees.get("agent") or "",
    }


def commit(sha):
    """Le commit réel : fichiers touchés, lignes, auteur, mention d'agent."""
    if not sha:
        return {}, [], {"additions": 0, "deletions": 0}
    fichiers, lignes = [], {"additions": 0, "deletions": 0}
    for ligne in git("show", "--numstat", "--format=", sha).splitlines():
        morceaux = ligne.split("\t")
        if len(morceaux) != 3:
            continue
        ajoutes, supprimes, chemin = morceaux
        fichiers.append(chemin)
        if ajoutes.isdigit():
            lignes["additions"] += int(ajoutes)
        if supprimes.isdigit():
            lignes["deletions"] += int(supprimes)
    entete = git("show", "-s", "--format=%an%x00%ae%x00%B", sha).split("\0")
    auteur = entete[0] if entete else ""
    courriel = entete[1] if len(entete) > 1 else ""
    message = entete[2] if len(entete) > 2 else ""
    mentions = [ligne.strip() for ligne in message.splitlines()
                if MENTION in ligne.lower()]
    return {"author": f"{auteur} <{courriel}>" if courriel else auteur,
            "mentions": mentions}, fichiers, lignes


def lire_journal():
    with open(JOURNAL, encoding="utf-8") as source:
        return [json.loads(ligne) for ligne in source if ligne.strip()]


sessions = []
for entree in lire_journal():
    sha = entree.get("sha") or ""
    details, fichiers, lignes = commit(sha)
    faits = api(entree.get("sessionId") or "")
    modele = faits.get("model") or {}
    sessions.append({
        "id": hacher(entree.get("sessionId") or entree.get("ticket")),
        "project": "opencode-lab",
        "title": entree.get("title") or entree.get("ticket"),
        "agent": faits.get("agent") or entree.get("agent") or "build",
        "model": {"provider": modele.get("providerID") or "",
                  "id": modele.get("id") or entree.get("model") or ""},
        "costEuros": faits.get("costEuros", 0),
        "tokensIn": faits.get("tokensIn", 0),
        "tokensOut": faits.get("tokensOut", 0),
        "additions": lignes["additions"],
        "deletions": lignes["deletions"],
        "filesTouched": len(fichiers),
        "durationMs": 0,
        "startedAt": entree.get("startedAt") or "",
        "endedAt": entree.get("endedAt") or "",
        "issueKey": entree.get("ticket"),
        "ticket": entree.get("ticket"),
        "session": hacher(entree.get("sessionId") or entree.get("ticket")),
        "sha": sha,
        "author": details.get("author") or "",
        "mentions": details.get("mentions") or [],
        "messages": int(entree.get("messages") or 0),
        "files": fichiers,
        "exitCode": int(entree.get("exitCode") or 0),
        "timedOut": bool(entree.get("timedOut")),
    })

# Les dates de début et de fin sont ISO : on les compare en millisecondes.
def millisecondes(iso):
    from datetime import datetime
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return 0


for session in sessions:
    debut, fin = millisecondes(session["startedAt"]), millisecondes(session["endedAt"])
    session["durationMs"] = max(0, fin - debut)

sessions.sort(key=lambda s: (s["ticket"] or "", s["startedAt"] or ""))
sortie = {
    "generatedAt": max((s["endedAt"] for s in sessions), default=""),
    "source": "opencode-lab",
    "sessions": sessions,
}

if SECONDE:
    print(json.dumps(sortie, indent=2, ensure_ascii=False))
    sys.exit(0)

with open(SORTIE, "w", encoding="utf-8") as cible:
    json.dump(sortie, cible, indent=2, ensure_ascii=False)
    cible.write("\n")
print(f"{len(sessions)} session(s) → {SORTIE}")
PY

info "Télémétrie : $SORTIE"
