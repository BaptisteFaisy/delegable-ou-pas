#!/usr/bin/env bash
# publier-site.sh — publie `site/` sur la branche `gh-pages` (GitHub Pages).
#
# Usage :  bash tools/publier-site.sh            # publie depuis l'arbre courant
#          DEPOT=owner/nom bash tools/publier-site.sh
#
# Pourquoi une branche et pas un workflow Pages : le dépôt tourne déjà sur des
# runners auto-hébergés très sollicités, et la publication d'un site statique
# n'a pas besoin d'exécuter quoi que ce soit. Une branche `gh-pages` est servie
# telle quelle par GitHub Pages, sans minute de CI ni dépendance au calendrier
# des runners. La source de vérité reste `site/` sur `main` (relue par PR,
# comme le reste) ; cette branche n'en est que la copie publiée.
#
# Idempotent : si le contenu publié est identique, rien n'est poussé.
set -euo pipefail
export LC_ALL=C

DEPOT="${DEPOT:-Tradoooo/delegable-ou-pas}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="$RACINE/site"
ICONE="$RACINE/static/icon.svg"
URL="https://$(printf '%s' "$DEPOT" | cut -d/ -f1 | tr 'A-Z' 'a-z').github.io/$(printf '%s' "$DEPOT" | cut -d/ -f2)/"

die() { echo "ERREUR: $*" >&2; exit 1; }

[ -f "$SITE/index.html" ] || die "$SITE/index.html absent"
command -v git >/dev/null 2>&1 || die "git introuvable"

TMP="$(mktemp -d /tmp/site-ghpages.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Préparation de gh-pages dans $TMP"
if git -C "$RACINE" rev-parse --verify --quiet refs/remotes/origin/gh-pages >/dev/null 2>&1; then
  git clone --quiet --branch gh-pages --single-branch "git@github.com:$DEPOT.git" "$TMP/pages"
else
  mkdir -p "$TMP/pages"
  git -C "$TMP/pages" init -q -b gh-pages
  git -C "$TMP/pages" remote add origin "git@github.com:$DEPOT.git"
fi

cd "$TMP/pages"
git config user.name "BaptisteFaisy"
git config user.email "baptiste.faisy@gmail.com"

# La branche publiée ne contient QUE le site : on repart de zéro à chaque fois,
# ce qui évite d'accumuler les fichiers d'une ancienne arborescence.
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -a "$SITE"/. .
[ -f "$ICONE" ] && cp -a "$ICONE" ./icon.svg

git add -A
if git diff --cached --quiet; then
  echo "SITE-INCHANGE rien à publier"
  echo "SITE-URL $URL"
  exit 0
fi

git -c core.autocrlf=input commit -q -m "Publier le site public (source : site/ sur main)"
git push --quiet origin gh-pages
echo "SITE-PUBLIE $URL"
