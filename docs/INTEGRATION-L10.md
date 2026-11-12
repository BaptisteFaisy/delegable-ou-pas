# Écarts constatés à l'intégration (lot L10)

Le lot L10 recoud les interfaces sans réécrire aucun module. Ce fichier porte
la section « Écarts constatés à l'intégration » annoncée par
`docs/CONTRACTS.md` (le fichier de contrat est à sa limite de 500 lignes).

## Branchés

- **`difference.ts` (A1) → chaîne cohort/recommandation** : déjà effectif via
  `conclusion.ts` (`newcombeDifference`), consommé par `cohortStatRows`
  (`src/handlers/recompute.ts`) puis `buildCard` (`recommendFrom`). Rien à
  brancher dans `cohort.ts` : les bras y sont regroupés, pas comparés — la
  comparaison passe par la conclusion (SPEC §7 règle 4).
- **`power.ts` + `sequential.ts` (A5) → `trial.ts`** : `planTrial` (taille
  par bras, faisabilité au rythme de l'équipe, effet détectable quand la
  fenêtre fixe la taille) et `lookAtTrial` (regards corrigés par les
  frontières d'O'Brien-Fleming ; l'arrêt de sécurité du bras agent passe
  avant tout). Les fonctions gelées (`draw`, `enforceCompliance`,
  `stopReason`) sont inchangées. Tests :
  `tests/acceptance/branchement-essai.test.ts`.
- **`matching.ts` (A3) → repli de `balance.ts`** : `matchedRescue` tente
  l'appariement exact (nature × zone × taille) puis le plus proche voisin sur
  score de propension ; le repli n'est retenu que s'il rééquilibre
  (SMD < 0,1 via `balanceBeforeAfter`) et conserve au moins
  `MIN_MATCHED_SHARE` (0,5) des deux bras. `cohortStatRows` calcule alors la
  conclusion sur le sous-ensemble apparié — le plus gros gisement de cases
  grises (A3) ; sinon rien ne change et la cohorte reste à « on ne sait pas »
  (recette 7 préservée). Tests : `tests/acceptance/branchement-appariement.test.ts`.

## Non branchés — CONTRACT-NEEDED

- **`survival.ts` (A2) pour le délai** : Kaplan-Meier exige les observations
  censurées (tickets encore ouverts). `ProjectFacts` ne porte que des tickets
  clos (`outcomes`) ; aucune collecte ne produit de
  `SurvivalObservation { event: false }`.
  **CONTRACT-NEEDED** : `handlers/project-facts.ProjectFacts.openDurations`
  (durées censurées par bras), alimenté par la collecte Jira.
- **`multiplicity.ts` (A4) et `naive.ts` (B4) sur la carte de délégation** :
  `RecommendationEngine.map` rend `null` (CONTRACT-NEEDED déjà signalé par
  L4) et `DelegationMapCell` (type gelé) ne porte ni proportions ni valeur de
  p : `mapView` ne peut pas calculer les q-valeurs (BH) ni le chiffre naïf
  étiqueté. **CONTRACT-NEEDED** : `ports.RecommendationEngine.map` +
  proportions par case dans `types-advice.DelegationMapCell`.
- **`calibration-fine.ts` (A6) sur « Peut-on croire cette app ? »** :
  `CalibrationRecord.predictedProbability` et `policyVersion` n'existent ni
  dans `Calibration` (agrégats) ni dans `DecisionRow` (gelée) : impossible de
  construire les enregistrements (Brier, log-loss, AUC, courbe de fiabilité).
  **CONTRACT-NEEDED** : colonnes `predicted` / `policy_version` sur
  `types-persistence.DecisionRow`, ou une table `calibration_record`.
- **`naive.ts` sur le site public** : le lot L10 n'a pas le droit de toucher
  `site/` (travaillé en parallèle). Le branchement reste à faire par le lot
  site via `naiveAggregate` + `honestBreakdown`, étiquette « chiffre naïf »
  obligatoire (SPEC §7 règle 7).

## Comportements documentés, non corrigés (volontairement)

- **La carte cachée ne conserve que le verdict** : `agent`, `human`,
  `epochId` et `conclusion` sont vidés à la relecture
  (`src/db/recommendations.ts`, voulu par L6 — « vides plutôt qu'inventés »).
  Les chiffres rejoignent la carte par `get-delegation-evidence` (jonction
  avec `cohort_stat`). L'écran du ticket dépend du câblage runtime de
  `engine.compute` (CONTRACT-NEEDED existant de L4 : pas de résolveur
  issueId→projectId) pour afficher les chiffres du SPEC §8.
- **`Decision.taken` est dérivé à la lecture** (`followed` × avis caché,
  `mapping-advice.takenOf`, `DecisionRow` gelée sans colonne `taken`) : une
  décision enregistrée AVANT l'existence de la carte se relit `keep-human`.
  Le parcours de bout en bout (`journee-complete.test.ts`) enregistre donc la
  décision après la passe nocturne qui calcule la carte.
- **Recette 10 et parts descriptives** : la part de cases grises et la part
  délégable du sprint sont des parts descriptives, pas des taux mesurés au
  sens de la règle 3 du SPEC §7 ; elles s'affichent sans fourchette. Tous les
  taux mesurés (clôture propre, implication connue, délai médian) passent par
  le rendu unique `rateLine`/`medianText` (n + intervalle), vérifié écran par
  écran dans `tests/acceptance/recette-10.test.ts`.
