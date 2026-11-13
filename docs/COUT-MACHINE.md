# Le coût machine — ce que le poste a réellement occupé

> Lot « un coût réel ». Module : `src/domain/machine-cost.ts`.
> Tests : `tests/domain/machine-cost.test.ts` (sur le jeu réel versionné).
> Source des chiffres : `src/sample/opencode-real.json` (865 sessions récoltées
> sur ce poste), parsée par `parseDataset` de `src/collect/opencode.ts`.

## 1. Le constat

Sur la donnée réelle, **tous les modèles utilisés sont gratuits** : le coût LLM
mesuré vaut **0 €** sur les 865 sessions récoltées. C'est honnête, et c'est
aussi ce qui rend le module de coût décoratif : comparer 0 € à 0 € ne dit
rien, et un écran qui n'affiche que ça n'aide personne à décider.

La vraie dépense, elle, est **le temps machine** : **837,34 heures** d'exécution
cumulées sur le poste, et **250 672 611 jetons** consommés. Ces deux nombres
sont mesurés, reproductibles, et vérifiés par la suite de tests. C'est donc
le **coût machine** que ce lot rend mesurable — à côté du coût modèle, jamais
à sa place.

| Ce que l'on veut savoir | Ce que la donnée dit | Nature du chiffre |
| --- | --- | --- |
| Combien de sessions ont tourné | **865** | mesuré |
| Combien de temps machine ont-elles pris | **837,34 h** cumulées | mesuré |
| Combien de jetons ont-ils consommé | **250 672 611** | mesuré |
| Combien a coûté le modèle (LLM) | **0 €** | mesuré (tous les modèles sont gratuits) |
| Combien a coûté la machine | **41,87 €** à 0,05 €/h | **hypothèse** de taux, pas une mesure |
| Combien de sessions sont rattachées à un ticket | **25 sur 865** (2,89 %, entre 1,97 % et 4,23 %) | mesuré, avec son intervalle |

## 2. Ce qu'est le coût machine

Le **coût machine** d'une session est le prix du **temps machine** qu'elle a
occupé, valorisé à un taux horaire :

```
coût machine (€) = durée réelle de la session (h) × taux horaire (€/h)
```

La **durée réelle** est une mesure : elle vient de la base de collecte
(`durationMs`), pas d'une estimation. Le **taux horaire** est une
**hypothèse** : c'est l'amortissement et l'électricité du poste, divisés par
le nombre d'heures utiles. Personne ne l'a observé, tout le monde peut le
discuter.

D'où la règle du module :

- le taux horaire est **toujours un paramètre**, jamais une constante cachée
  dans le code ;
- **sans taux fourni, le coût machine est *inconnu*** (`-1`), jamais `0`.
  Confondre « pas de prix » et « gratuit » serait exactement le mensonge que
  ce projet combat ;
- le **coût modèle** (0 € ici) reste **affiché à côté**, jamais masqué ni
  remplacé. Zéro euro de LLM et zéro euro de machine ne se ressemblent pas.

## 3. Les règles de l'honnêteté

1. **Absent = `-1`, jamais `0`** (CONTRATS-REALITE §1). Une session dont la
   durée est nulle ou négative a un coût **inconnu** : sa durée n'a pas été
   mesurée, elle n'a pas valu zéro. Sur le jeu réel, **3 sessions sur 865**
   sont dans ce cas (0,35 %, entre 0,12 % et 1,01 %).
2. **Aucun chiffre sans effectif ni fourchette.** Les parts sont des
   proportions de Wilson (`src/domain/stats.ts`, jamais réécrite ici), la
   durée typique est une **médiane** avec son intervalle
   distribution-free : 0,09 h sur 862 sessions à durée connue, entre 0,082 h
   et 0,106 h.
3. **Jamais par personne.** Ni dans le module, ni dans les tests, ni dans ce
   document : pas de nom, pas de classement individuel.
4. **Le domaine est pur.** `src/domain/machine-cost.ts` ne fait ni `fs`, ni
   réseau, ni horloge : les entrées arrivent en paramètres et le jour se
   déduit du champ `debut` de la session.

## 4. Les chiffres réels

Hypothèse de taux utilisée pour l'illustration ci-dessous : **0,05 €/h**
(poste de développement, coût complet amorti). **C'est un exemple, pas une
mesure** : le module accepte n'importe quel taux, et n'en suppose aucun.

### 4.1 Le total

| Grandeur | Valeur | Effectif / nature |
| --- | --- | --- |
| Sessions | 865 | mesuré |
| Sessions à durée inconnue | 3 | mesuré |
| Sessions au coût machine inconnu (taux fourni) | 3 | mesuré |
| Heures cumulées | **837,34 h** | mesuré (862 sessions à durée connue) |
| Coût machine | **41,87 €** à 0,05 €/h | **hypothèse** de taux |
| Coût modèle (LLM) | **0 €** | mesuré — tous les modèles sont gratuits |
| Jetons | **250 672 611** | mesuré |
| Sessions rattachées à un ticket | 25 sur 865 → 2,89 % (1,97 % – 4,23 %) | mesuré, intervalle de Wilson |
| Durée médiane d'une session | 0,09 h (0,082 – 0,106) sur 862 sessions | mesuré, intervalle distribution-free |
| Jours d'activité | 39 (du 21 septembre au 13 novembre 2026) | mesuré |

### 4.2 Par projet

| Projet | Sessions | Heures | Coût machine à 0,05 €/h | Coût modèle | Jetons |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bureau | 708 | 721,58 h | 36,08 € | 0 € | 223 133 433 |
| home | 109 | 106,61 h | 5,33 € | 0 € | 15 318 493 |
| Bureau/cardwake | 20 | 8,47 h | 0,42 € | 0 € | 11 750 906 |
| Bureau/opencode-lab | 26 | 0,55 h | 0,03 € | 0 € | 317 425 |
| Bureau/creux | 2 | 0,13 h | 0,01 € | 0 € | 152 354 |
| **Total** | **865** | **837,34 h** | **41,87 €** | **0 €** | **250 672 611** |

Les 3 sessions à durée inconnue sont dans le projet `home` : sa durée cumulée
(106,61 h) est donc une **borne inférieure**, pas une mesure complète.

### 4.3 Par modèle (les six premiers, sur 20)

| Modèle | Sessions | Heures | Coût machine à 0,05 €/h | Coût modèle |
| --- | ---: | ---: | ---: | ---: |
| opencode/space-bunny-free | 366 | 507,10 h | 25,36 € | 0 € |
| opencode/muse-spark-1.3-contributor-free | 254 | 236,65 h | 11,83 € | 0 € |
| opencode/deepseek-v4.1-flash-free | 37 | 60,40 h | 3,02 € | 0 € |
| inferhub/combo/cheap | 55 | 19,04 h | 0,95 € | 0 € |
| opencode/glm-5.3-flash-free | 14 | 5,36 h | 0,27 € | 0 € |
| openrouter/inclusionai/ling-3.1-flash | 8 | 2,64 h | 0,13 € | 0 € |

Les 20 modèles ont un coût modèle de **0 €** : c'est mesuré, pas supposé.

### 4.4 Par ticket

25 sessions sont rattachées à un ticket, pour 5 tickets distincts :

| Ticket | Sessions | Heures | Coût machine à 0,05 €/h | Coût modèle | Jetons |
| --- | ---: | ---: | ---: | ---: | ---: |
| PROJ-101 | 6 | 0,22 h | 0,011 € | 0 € | 151 733 |
| PROJ-102 | 6 | 0,09 h | 0,005 € | 0 € | 45 828 |
| PROJ-105 | 5 | 0,09 h | 0,005 € | 0 € | 64 520 |
| PROJ-103 | 4 | 0,07 h | 0,004 € | 0 € | 26 632 |
| PROJ-104 | 4 | 0,07 h | 0,004 € | 0 € | 24 775 |

À taux égal, le coût machine d'un ticket suit sa durée : 0,22 h pour
PROJ-101, 0,07 h pour PROJ-103. **Le coût modèle reste nul partout** : la
comparaison « agent contre humain » ne peut pas se faire sur le prix des
jetons, seulement sur le temps.

## 5. Ce que le module expose

```ts
coutSession(session, taux?)          // le coût d'une session : machine à côté du modèle
coutMachineTotal(sessions, taux?)    // le total, avec effectif et fourchettes
coutMachineParProjet(sessions, taux?)
coutMachineParModele(sessions, taux?)
coutMachineParJour(sessions, taux?)
coutMachineParTicket(sessions, taux?)
rapportCoutMachine(sessions, taux?)  // tout ce que l'écran aura à afficher
```

Le type d'entrée est `SessionCoutable`, sous-ensemble de la `SessionReelle`
du contrat gelé (CONTRATS-REALITE §1) : les champs portent les mêmes noms,
une session du contrat s'y branche sans adaptation.

## 6. Ce que ce module ne fait pas (encore)

- Il **ne s'intègre pas** encore à `src/domain/cost.ts` : ce lot crée le
  module à côté, l'intégration dans le module de coût existant sera faite
  par un autre lot.
- Il ne dit **rien** du coût humain d'un ticket : le module compare la machine
  à elle-même (par projet, par modèle, par jour, par ticket). La comparaison
  « agent contre humain » demande d'autres données.
- Le **taux horaire** reste à fixer par l'équipe. Tant qu'il n'est pas posé,
  le module affiche un coût *inconnu*, pas un coût nul.
