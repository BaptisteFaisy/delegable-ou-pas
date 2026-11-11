# Site public — « Délégable ou pas ? »

Site statique du projet, **publié sur GitHub Pages** : il n'y a ni serveur, ni
build, ni dépendance externe, ni appel réseau. Le dépôt est public : la page
est lisible par tout le monde, sans compte et sans installation.

- Source de vérité : ce dossier (`site/`), relu par PR comme le reste du code.
- Copie publiée : branche `gh-pages`, servie par GitHub Pages.
- Publication : `bash tools/publier-site.sh` (idempotent : rien n'est poussé
  si le contenu n'a pas changé).

## Ce que montre le site

1. **L'idée** en une phrase, et le problème : on délègue au jugé, les chiffres
   publics ne valent pas pour vous, et quand on mesure on mesure mal.
2. **La démo**, rendue dans le navigateur à partir du jeu d'exemple du dépôt
   (douze mois, trois époques, un projet peuplé) :
   - la carte sur le ticket `PROJ-412` (§8), avec la cohorte, les deux bras,
     les effectifs, les fourchettes, les tickets de référence, les conditions et
     la confiance ;
   - la carte de délégation : la matrice natures × zones aux quatre couleurs ;
   - le détail d'une cohorte, les époques, la calibration (« peut-on croire
     cette app ? ») et l'écran de couverture ;
   - les neuf outils MCP, l'agent Rovo et la skill.
3. **La méthode, vérifiable à la main** : l'intervalle de Wilson à z = 1,96
  implémenté dans la page, avec une calculette et les trois jeux de chiffres du
   cahier des charges — un visiteur refait le calcul et retrouve les mêmes
   bornes.
4. **Les huit règles** de la comparaison honnête, et le vocabulaire opposable
   (« constaté », « écart établi », « établi » ; « prouvé » réservé à l'essai
   contrôlé).

## Règles du site

- **Bilingue** : français et anglais, la langue suit le bouton en haut à droite.
  La soumission Codegeist est en anglais, l'interface du produit dans les deux.
- **Marqué comme démonstration** : un bandeau et un drapeau sur chaque carte.
  Aucune donnée réelle, aucun nom de personne.
- **Jamais de taux sans son effectif et sa fourchette** : la règle vaut aussi
  pour le site, qui rend `{ n, rate, ciLow, ciHigh }` partout.
- **Aucun suivi, aucun cookie**, aucune police externe : la page se charge
  entièrement hors ligne.
- **Accessibilité** : contrastes suffisants, navigation au clavier, respect de
  `prefers-reduced-motion`.

## Arborescence

| Fichier | Rôle |
|---|---|
| `site/index.html` | la page unique, bilingue (`data-fr` / `data-en`) |
| `site/styles.css` | la feuille de style — les quatre couleurs de la carte |
| `site/donnees.js` | le jeu d'exemple et l'implémentation de Wilson |
| `site/app.js` | le rendu : carte, matrice, cohorte, calibration, couverture, calculette |
| `tools/publier-site.sh` | la publication vers `gh-pages` |

## Publier

```bash
bash tools/publier-site.sh          # depuis la racine du dépôt
```

Puis, une fois la branche `gh-pages` poussée, activer GitHub Pages si ce n'est
pas déjà fait :

```bash
gh api -X POST repos/BaptisteFaisy/delegable-ou-pas/pages \
  -f source[branch]=gh-pages -f source[path]=/ \
  --jq '.html_url'
```

L'URL publique suit le nom du dépôt :
<https://baptistefaisy.github.io/delegable-ou-pas/>.
