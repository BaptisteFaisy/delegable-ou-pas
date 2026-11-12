---
name: before-taking-work
description: >-
  Checks whether a ticket is worth taking with an agent, records the
  involvement while working, and reports a takeover instead of hiding it.
tools:
  - should-delegate
  - record-involvement
  - report-takeover
---

# Before taking work

SPEC §9, §15 · DP-01, DP-03, DP-13. This skill is the conduct of a coding agent
that picks up a Jira ticket. It is written for an agent, in English (open
source, SPEC §15), with a French summary at the end.

## When this skill runs

Before an agent takes a ticket, and before it hands the ticket back. Not
after the fact: the involvement declared at the end is the one the app can
trust (SPEC §5, source 1 `mcp-declaration`).

## Step 1 — ask before taking the ticket

Call `should-delegate` with the ticket key. Read the recommendation:

- **`delegate`** — take the ticket. Work normally.
- **`delegate-with-review`** — take the ticket **and announce the conditions**
  before starting: how many reviewers, whether a zone owner is required, and
  what evidence each acceptance criterion needs. Copy the conditions into the
  ticket as a comment, so a human can check them later (SPEC §8).
- **`keep-human`** — **stop and warn your pilot.** Do not take the ticket. Say
  which cohort produced the verdict, with its sample size and interval, and
  what went wrong in that cohort before. Wait for a human decision
  (SPEC §8, DP-13: an advice, not an order — but you do not overrule it
  silently).
- **`not-enough-data`** — the app does not know. Tell your pilot that the
  ticket is grey, say why (thin arm, unbalanced arms, too much unknown
  involvement), and ask whether to take it anyway. If the pilot says yes,
  declare the involvement carefully at the end: a grey ticket is exactly where
  the next figure comes from.

A guardrail overrides everything: an open incident on the ticket, a sensitive
zone, or missing acceptance criteria mean « not now », whatever the figures say
(SPEC §8, DP-12). Say which guardrail fired.

## Step 2 — work, and keep the evidence structured

- Never paste a person's name, an e-mail or a free-text quote into the
  declaration: the app stores structured keys only (SPEC §17, SPEC §20).
- Never store a commit message. The mention in the commit is enough
  (SPEC §17).
- If you take over work started by someone else, say so (step 4).

## Step 3 — declare the involvement when you are done

Call `record-involvement` with:

- the ticket key;
- the level you really reached: `assisted` (you helped a human), `driven` (you
  drove, a human reviewed every step) or `autonomous` (you drove and closed);
- your client name, your model, and the session reference;
- the evidence keys, not a quote.

Do not declare `none`: that level means « no agent took part », and only a
human source can say it (SPEC §5, DP-03). If you do not know, leave it out —
an undeclared ticket stays honestly `unknown` instead of polluting a rate.

## Step 4 — report a takeover instead of hiding it

If you could not finish, if a human had to take the ticket back, or if you
restarted work another agent had started, call `report-takeover` with the
ticket key and the reason:

- `blocked` — you could not go further;
- `quality` — a human judged the result not good enough;
- `scope` — the ticket changed while you worked on it;
- `handover` — another agent or another person took it over.

A takeover is a measure, not a fault (SPEC §6 « Reprise humaine »). Hiding it
makes the cohort lie.

## What you never do

- You never take a `keep-human` ticket without a human decision.
- You never invent a level to look better: `autonomous` on work a human drove
  is a false figure, and the calibration will show it (SPEC §10, DP-21).
- You never name a person in a declaration, a comment or a reason.
- You never close a ticket whose acceptance criteria are missing: ask for them
  first (SPEC §8).

---

## Résumé français

**Avant de prendre un ticket** : appeler `should-delegate`. Devant
« à confier à un agent », prendre le ticket. Devant « relecture renforcée »,
annoncer les conditions (nombre de relecteurs, responsable de zone, preuve par
critère) avant de commencer. Devant « à garder pour un humain », **s'arrêter et
prévenir son pilote**, sans prendre le ticket. Devant « pas assez de recul »,
dire que la case est grise et demander.

**À la fin** : déclarer son implication avec `record-involvement` (niveau réel,
client, modèle, session, clés structurées — jamais un nom de personne, jamais
une citation). Ne jamais déclarer « aucun agent » à la place d'une source
humaine.

**En cas de reprise** : appeler `report-takeover` avec la raison. Une reprise
est une mesure, pas une faute ; la cacher fait mentir la cohorte.
