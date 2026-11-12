# Site public — « Délégable ou pas ? »

Site statique du projet, **publié sur GitHub Pages** et lisible par tout le monde,
sans compte ni installation : <https://baptistefaisy.github.io/delegable-ou-pas/>

Il n'y a ni serveur, ni build, ni dépendance externe, ni appel réseau, ni cookie.

## Ce que le site montre

**Toutes les fonctionnalités du produit**, pas une sélection :

- les **8 écrans** du SPEC §16 : carte sur le ticket, carte de délégation, détail
  d'une cohorte, répartition du sprint, réglages du projet, couverture,
  « Peut-on croire cette app ? », gadget de tableau de bord ;
- **16 panneaux de fonctionnalités** : les cinq sources d'implication, le
  catalogue de mentions de commit, l'écart testé sur la différence (Newcombe +
  TOST), l'analyse de survie du délai (Kaplan-Meier + log-rank), la correction de
  multiplicité (Benjamini-Hochberg), l'appariement des bras déséquilibrés, la
  puissance d'essai calculée avant, les regards séquentiels, l'essai contrôlé, le
  chiffre naïf contre sa décomposition, la calibration fine (Brier, log-loss,
  AUC, courbe de fiabilité), les conditions exécutables, la collecte priorisée
  par valeur d'information, le repli sans droit sur le graphe, les époques, et
  l'anonymat ;
- les **9 outils MCP** et deux appels réels rendus tels quels ;
- la **méthode vérifiable à la main** : l'intervalle de Wilson à z = 1,96 est
  implémenté dans la page, avec une calculette et les jeux de chiffres du cahier
  des charges.

## Comment les chiffres arrivent là

```
src/domain/*, src/collect/*, src/sample/*     le vrai code de l'app
        │  exécuté par tests/site/demo-data.test.ts
        ▼
site/demo-data.json                           8 écrans + 16 panneaux + MCP
        │  lu par fetch() au chargement
        ▼
site/app.js → rendu-commun.js / rendu-graphes.js
              → rendu-ecrans.js / rendu-panneaux.js
```

**Aucun chiffre n'est écrit à la main dans le site.** Le générateur appelle les
modules réels sur le jeu d'exemple de `src/sample/`, donc le site montre
exactement ce que l'app montrerait en mode démonstration. Un test rejoue la
génération et compare au fichier versionné : **une PR qui change le domaine sans
régénérer le site devient rouge**.

```bash
MAJ_DEMO=1 npx vitest run tests/site    # régénérer site/demo-data.json
npx vitest run tests/site               # vérifier qu'il est à jour
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `site/index.html` | la page unique, bilingue (`data-fr` / `data-en`), et les **32 ancres gelées** |
| `site/styles.css` | les styles : les quatre couleurs de la carte, panneaux, badges, courbes |
| `site/app.js` | charge le JSON, construit la navigation, dispatche, gère la langue, repli |
| `site/rendu-commun.js` | rendu **structurel** : objet → liste de définitions, tableau → table, et toute proportion avec son effectif et sa fourchette |
| `site/rendu-graphes.js` | les dessins en **SVG écrit à la main** : Kaplan-Meier, courbe de fiabilité, jauge, note de multiplicité |
| `site/rendu-ecrans.js` | les 8 écrans |
| `site/rendu-panneaux.js` | les 16 panneaux et leurs verdicts |
| `site/donnees.js` | **gelé** : calculette de Wilson et jeux de chiffres de référence |
| `site/demo-data.json` | généré, versionné |
| `tests/site/**` | le générateur, ses panneaux, et les tests des rendus (socle DOM minimal, sans navigateur) |
| `tools/publier-site.sh` | publication vers `gh-pages`, idempotent |

Le rendu est **structurel** : il affiche toute la structure du JSON. Une donnée
produite par le domaine ne peut donc pas disparaître silencieusement du site —
c'est voulu, c'est ce qui rend la garde de fraîcheur utile.

## Publier

```bash
bash tools/publier-site.sh      # pousse site/ sur la branche gh-pages
```

La branche publiée n'est qu'une copie : la source de vérité est `site/` sur
`main`, relue par PR comme le reste du code. Une branche plutôt qu'un workflow
Pages : le site est statique, il n'a rien à exécuter, et les runners
auto-hébergés du dépôt sont déjà occupés par la CI.

## Règles du site

- **Bilingue** : français et anglais, bascule en haut à droite ; la soumission
  Codegeist est en anglais.
- **Marqué comme démonstration** : bandeau en tête, drapeau sur chaque panneau.
- **Aucun taux sans son effectif et sa fourchette** : un test des rendus refuse
  toute proportion qui sortirait nue (même règle que le produit, SPEC §7 règle 3).
- **Aucun nom de personne** : le générateur le vérifie en parcourant les clés.
- **Accessibilité** : contrastes suffisants, focus visible, `prefers-reduced-motion`.
- Fichier < 500 lignes, fonction < 50 lignes, comme partout ailleurs dans le dépôt.
