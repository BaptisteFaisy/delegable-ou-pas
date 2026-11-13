#!/usr/bin/env bash
# refresh-real.sh — la chaîne de fraîcheur : la donnée réelle ne peut plus
# vieillir en silence.
#
# Ce qu'il fait, dans l'ordre :
#   1. récolte la base vivante des sessions dans un fichier temporaire ;
#   2. compare avec le jeu de données versionné (empreinte, pas contenu) ;
#   3. si c'est identique : rien à faire, il sort 0 (idempotent) ;
#   4. sinon : branche dédiée, nouveau jeu de données, démo régénérée,
#      commit, push, et une PR dont le `## Scope` liste les fichiers exacts.
#
# Ce qu'il ne fait jamais : pousser sur `main`, merger à la main, écraser un
# commit. La file Mergify merge seule.
#
# Usage :
#   bash tools/refresh-real.sh [--dry-run] [--repo Tradoooo/delegable-ou-pas]
set -euo pipefail
export LC_ALL=C

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPO="${REPO:-Tradoooo/delegable-ou-pas}"
BRANCHE="lot/rafraichir-donnee-reelle"
SECONDE=0

die() { printf 'ERREUR: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) SECONDE=1; shift ;;
    --repo) DEPO="${2:?repo manquant}"; shift 2 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "option inconnue : $1" ;;
  esac
done

cd "$RACINE"
[ -f src/sample/opencode-real.json ] || die "jeu de données absent"
[ -x node ] || command -v node >/dev/null || die "node absent"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

info "récolte de la base vivante"
timeout 400 node tools/opencode/harvest.mjs --out "$TMP/recolte.json" > "$TMP/recolte.log" 2>&1 \
  || { tail -5 "$TMP/recolte.log" >&2; die "la récolte a échoué"; }

empreinte() { sha256sum "$1" | cut -d' ' -f1; }
AVANT="$(empreinte src/sample/opencode-real.json)"
APRES="$(empreinte "$TMP/recolte.json")"

if [ "$AVANT" = "$APRES" ]; then
  info "la donnée réelle est à jour (empreinte $AVANT) — rien à faire"
  exit 0
fi

info "la donnée a bougé ($AVANT → $APRES)"
if [ "$SECONDE" = 1 ]; then
  info "dry-run : ni branche, ni PR"
  exit 0
fi

BRANCHE_LOCALE="lot/rafraichir-$(date +%Y%m%d-%H%M)"
git fetch origin --quiet
git checkout -q -B "$BRANCHE_LOCALE" origin/main
cp "$TMP/recolte.json" src/sample/opencode-real.json

info "régénération de la démo du site"
MAJ_DEMO=1 timeout 300 npx vitest run tests/site > "$TMP/site.log" 2>&1 \
  || { tail -20 "$TMP/site.log" >&2; die "la régénération de la démo a échoué"; }

FICHIERS="$(git diff --name-only)"
[ -n "$FICHIERS" ] || die "aucun fichier à committer"

PORTEE=""
while IFS= read -r fichier; do
  [ -n "$fichier" ] || continue
  PORTEE="${PORTEE}- \`${fichier}\`
"
done <<< "$FICHIERS"

git add -A
git commit -q -m "Rafraîchir la donnée réelle : la récolte du poste a changé"
git push -q -u origin "$BRANCHE_LOCALE"

CORPS="$(mktemp)"
{
  echo '## Scope'
  echo
  printf '%s' "$PORTEE"
  echo
  echo '## Ce que c’est'
  echo
  echo 'La récolte de la base de sessions de la machine a changé depuis la dernière'
  echo 'version publiée : ce lot la rejoue et publie le résultat. Aucun code, aucun'
  echo 'test : ce sont des données.'
  echo
  echo "- empreinte avant : \`$AVANT\`"
  echo "- empreinte après : \`$APRES\`"
} > "$CORPS"

info "ouverture de la PR"
timeout 120 gh pr create --repo "$DEPO" --base main --head "$BRANCHE_LOCALE" \
  --title "Rafraîchir la donnée réelle" --body-file "$CORPS" || die "la PR n'a pas pu être ouverte"
rm -f "$CORPS"
info "fait : la file Mergify merge la PR"
