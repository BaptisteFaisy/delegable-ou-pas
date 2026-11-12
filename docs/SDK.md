# SDK et API versionnée — « Délégable ou pas ? »

L'app n'a de valeur que par ce qu'un **agent** peut en faire. Ce document
décrit le contrat que consomme un orchestrateur : une enveloppe versionnée, les
neuf outils publiés, le cycle d'orchestration, et la politique de versionnement.

Source : `src/mcp/schema.ts` (enveloppe, version) et `src/mcp/orchestration.ts`
(cycle, kit). Tests : `tests/mcp/schema.test.ts`.

## 1. L'enveloppe

Toute réponse voyage dans une enveloppe :

```jsonc
{
  "schemaVersion": "1.1.0",     // version du schéma de la réponse
  "tool": "should-delegate",     // l'outil qui a répondu
  "computedAt": "2026-12-01T09:00:00Z",
  "dataFingerprint": "…",        // empreinte des données sur lesquelles la réponse a été calculée
  "result": { /* … la charge utile … */ }
}
```

- `result` vaut `null` quand l'outil **n'a pas pu répondre** : une donnée
  absente est normale, ce n'est pas une erreur (SPEC §20).
- `dataFingerprint` est l'empreinte des données utilisées ; elle est produite
  par le module de preuve reproductible (`src/domain/proof.ts`), pas par
  l'enveloppe. Deux réponses de même empreinte sont **rejouables**.
- `computedAt` dit quand la réponse a été calculée, pas quand elle a été
  demandée.

## 2. La compatibilité

```ts
const verdict = checkCompatibility(envelope.schemaVersion);
if (!verdict.compatible) throw new Error(verdict.message.fr);
```

| Version | Règle | Effet sur l'appelant |
|---|---|---|
| **majeure** (`2.0.0`) | une rupture | l'appelant doit s'adapter ; `checkCompatibility` le dit |
| **mineure** (`1.1.0`) | un ajout | l'appelant 1.0 continue de fonctionner |

`supports(version)` dit si ce build comprend encore une version qu'il a produite
auparavant. Les versions comprises sont listées dans
`SUPPORTED_SCHEMA_VERSIONS`.

## 3. Les neuf outils et le cycle

Chaque outil sert une étape du cycle d'un agent (SPEC §9, §15, §27) :

| Étape | Outil | Verbe | Ce qu'il répond |
|---|---|---|---|
| conseil | `should-delegate` | GET | avis, raisons, conditions, confiance |
| conseil | `list-delegable-work` | GET | les tickets à confier, du plus sûr au moins sûr |
| conditions | `record-involvement` | CREATE | déclare son niveau d'implication |
| conditions | `record-decision` | CREATE | enregistre la décision et sa raison |
| preuve | `get-delegation-evidence` | GET | cohorte, effectifs, fourchettes, tickets de référence |
| carte | `get-delegation-map` | GET | la matrice et la part de gris |
| cohorte | `get-cohort` | GET | une cohorte en détail, époque par époque |
| calibration | `get-calibration` | GET | la justesse des recommandations passées |
| passation | `report-takeover` | UPDATE | passe la main, avec la raison |

Le kit ne nomme **que des outils publiés** : un test (`kitMatchesRegistry`)
échoue si la liste dérive du registre. Les verbes sont ceux du SPEC §15 — les
six lectures sont des `GET`, donc une règle d'automatisation peut les appeler.

## 4. L'exemple, en vingt lignes

`kitExample()` renvoie un client qui marche, à copier tel quel :

```ts
const advice = await call('should-delegate', { issueKey: 'PROJ-412' });
if (advice.result?.value === 'keep-human') throw new Error('à garder pour un humain');
const evidence = await call('get-delegation-evidence', { issueKey: 'PROJ-412' });
await call('record-involvement', { issueKey: 'PROJ-412', level: 'driven', client: 'orchestrator' });
```

L'ordre compte : **on demande le conseil avant de prendre le ticket**. C'est la
conduite de la skill « before-taking-work », et l'exemple la respecte — un test
le vérifie.

## 5. Ce que l'API ne fait pas

- Elle ne rend **jamais** un nom de personne, ni en entrée ni en sortie
  (SPEC §7 règle 8, DP-17).
- Elle ne rend **jamais** un taux sans son effectif et sa fourchette : toute
  proportion sort en `{ n, rate, ciLow, ciHigh }` (SPEC §7 règle 3).
- Elle ne rend pas de « cause » : un écart observé est **compatible** avec les
  données, pas causé par l'agent ; le module d'inférence causale (§ E2) donne la
  limite à ce propos.
- Elle ne renvoie pas de décision à prendre à la place de l'appelant : les
  outils de lecture donnent des faits et des avis, les outils d'écriture
  enregistrent ce que l'agent a décidé.
