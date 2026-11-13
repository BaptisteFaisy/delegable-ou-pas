# Scénario de la vidéo — moins de 5 minutes, en anglais

SPEC §23 · DP-20. Minutage imposé par le SPEC, plan par plan : ce qu'on voit à
l'écran, la voix off (en anglais, langue de la soumission), et les données du
jeu de démonstration qui apparaissent. Les chiffres cités ici viennent du jeu
(`docs/DEMO-DATA.md`), jamais d'une note manuscrite.

**Règles de tournage**

- Voix off en anglais ; l'interface est montrée en anglais, un plan au moins la
  montre en français (SPEC §20 « Langues »).
- Le bandeau **DÉMO — données fictives** doit être lisible sur chaque plan qui
  montre le jeu d'exemple (DP-20).
- Aucun plan ne montre un nom de personne : des rôles et `agent-bot-1`.
- Le site de démonstration n'a pas de dépôt : le plan 9 est tourné sur un site
  relié à un dépôt, et le plan 8 le dit à voix haute (SPEC §24).

---

## Plan 1 · 0:00 – 0:30 — « Should an agent take this ticket? »

**À l'écran.** Trois développeurs (plans serrés, visages ou mains, jamais de
badge nominatif), le même ticket à l'écran : `PROJ-412 · Migration of the amount
field to cents`. Trois réponses différentes en surimpression : *« Sure, it's
scripted »* · *« No way, it's not replayable »* · *« Depends who's reviewing »*.

**Voix off.**
> “Should an agent take this ticket? Ask three engineers, get three answers.
> Nobody is wrong. Nobody knows — because nobody has ever measured it.”

## Plan 2 · 0:30 – 1:00 — le chiffre naïf, puis sa décomposition

**À l'écran.** Un titre plein écran : *« Agents close tickets faster »* (le
chiffre naïf, étiqueté `naive figure — chiffre naïf`). Puis la carte par
cohorte qui se déplie : la même mesure, cohorte par cohorte, et une case qui
contredit les autres. Puis le panneau du site public qui met les deux côte à
côte : **le comparateur naïf / honnête** — à gauche le total que tout le monde
cite, à droite sa décomposition par cohorte, et la preuve chiffrée du biais de
sélection.

**Voix off.**
> “Here is the number everyone quotes: agents close tickets faster. And here is
> the same number, split by cohort — same nature, same zone, same size. The
> total is not wrong. It is just not the whole story: the easy tickets went to
> the agents. We never show a total without its breakdown — the public site
> puts the naive figure and the honest one side by side, so you can see which
> cohorts contradict the headline.”

## Plan 3 · 1:00 – 1:50 — la carte sur un ticket

**À l'écran.** Le panneau de `PROJ-412`, dans l'ordre de lecture :

- cohorte : *data migration · billing · size M — 26 tickets with an agent, 31
  without* ;
- *Clean closure: 69 % with an agent (between 50 and 84 %), 87 % without
  (between 71 and 95 %)* ;
- *Median lead time: 1.5 days with an agent, 3 days without* ;
- *What went wrong with an agent: 5 reopenings out of 8, on a migration that
  cannot be replayed* ;
- *Reference tickets: PROJ-207, PROJ-233, PROJ-301* ;
- conditions, confiance, et le bandeau de démonstration.

**Voix off.**
> “This is the card a developer sees before taking the ticket. Every rate comes
> with its sample size and its interval — never a bare percentage. The advice
> names the cohort it rests on, the tickets behind the figures, and what went
> wrong before. And when the data is thin, it says so.”

*(Note de montage : la carte du domaine mergé affiche « pas assez de recul »
sur ce ticket — l'écart n'est ni établi ni équivalent. La voix off ne dit
jamais « prouvé » ni « moins bien » : elle lit ce que l'app affiche. Voir
`docs/DEMO-DATA.md` §6.)*

## Plan 4 · 1:50 – 2:30 — la carte de délégation

**À l'écran.** La matrice natures × zones : une case verte, une orange, une
rouge, et beaucoup de gris. Clic sur la rouge (40 % [21 ; 62] contre 86 %
[65 ; 96], écart établi) ; clic sur une grise (« on ne sait pas », 25 cohortes
sur 36). Bascule d'époque : époque 2 → époque 3 (*new model, 14 September*).

**Voix off.**
> “One page for the tech lead: what can be handed over, what must stay with a
> human, and what we do not know yet. Red means the gap is established. Grey
> means we cannot conclude — and “we don't know” is an answer, not a bug. Switch
> epochs and the same cell moves: we never mix two tool generations in one
> figure.”

## Plan 5 · 2:30 – 3:00 — un orchestrateur demande par MCP

**À l'écran.** Un client MCP appelle `list-delegable-work` sur le sprint 42,
puis `should-delegate` sur un ticket : la **même** carte que dans le panneau.
Puis la skill `before-taking-work` : l'agent s'arrête devant *keep human* et
prévient son pilote.

**Voix off.**
> “The same advice is available to machines. An orchestrator asks what it can
> take, gets the same card the human sees — one type, one source, no
> divergence. And when the answer is “keep this for a human”, the agent stops
> and tells its pilot instead of taking the ticket anyway.”

## Plan 6 · 3:00 – 3:25 — « Can you trust this app? »

**À l'écran.** L'écran de calibration : les avis donnés, et la clôture propre
observée ensuite, avis par avis — y compris les avis ignorés. Puis, sur le site
public, le panneau **« la donnée réelle »** : les sessions d'agent réellement
exécutées, en agrégats, marquées *real data, anonymised*.

**Voix off.**
> “Can you trust this app? It measures itself. Every recommendation is followed
> by what actually happened, including the tickets where the team went against
> the advice. When the app says “delegate” and the closures are not clean, you
> see it here before you see it in production. And the panels you just scrolled
> are not screenshots: the real sessions behind the last one were harvested on a
> workstation, anonymised at the source, and published as aggregates only.”

## Plan 7 · 3:25 – 3:55 — l'essai contrôlé

**À l'écran.** L'essai `trial-demo-001`, état *running*, sur la cohorte
*external integration · api · M* (époque 3) : le tirage, le respect du tirage,
le compteur de réouvertures, et le motif d'arrêt.

**Voix off.**
> “When a cohort stays grey and the decision matters, we stop guessing: we run
> a controlled trial. Randomised draw, reproducible from its seed, and a ticket
> that leaves the trial as soon as the draw is not respected. This is the only
> place in the product where the word “proven” is allowed.”

## Plan 8 · 3:55 – 4:15 — ce qui ferait passer une case du rouge à l'orange

**À l'écran.** La case rouge de la migration, puis la liste des causes
d'échec les plus fréquentes de la cohorte (réouvertures sur migration non
rejouable, tests absents, critères flous, zone sans conventions écrites), et à
côté les garde-fous : incident ouvert, zone sensible, critères d'acceptation
absents.

**Voix off.**
> “A red cell is not a verdict, it is a to-do list. These are the causes of
> failure in this cohort. Fix the replayability, add the missing acceptance
> criteria, and the same work moves from “keep it for a human” to “hand it over
> with a hardened review”. And some doors stay closed whatever the numbers say:
> an open incident, a sensitive zone, missing acceptance criteria.”

## Plan 9 · 4:15 – 4:50 — l'architecture

**À l'écran.** Trois vignettes : **Teamwork Graph** (commits, pull requests,
relecteurs — tournée sur un site relié à un dépôt), **Forge SQL** (le cache des
cohortes, 1 Gio par installation, 5 s par SELECT), **`rovo:mcp`** (les neuf
outils). Puis l'écran de couverture qui guide les droits, droit par droit.

**Voix off.**
> “Under the hood: the Teamwork Graph for commits and pull requests — one right
> per object type, and a missing right empties the result instead of throwing.
> Forge SQL for the nightly cache, so a card opens in under two seconds. And
> `rovo:mcp` for the nine tools. On the demo site there is no repository, so
> there is no commit in the graph — the coverage screen tells you exactly that,
> and this shot is the real collection, on a site linked to a repository.”

**Fondu final.** Le bandeau de démonstration, puis : *« Should an agent take
this ticket? Now you can answer with a number — and its interval. »*

---

## Récapitulatif du minutage

| Temps | Plan | Donnée du jeu montrée |
|---|---|---|
| 0:00 – 0:30 | 1 | `PROJ-412` |
| 0:30 – 1:00 | 2 | chiffre naïf + décomposition par cohorte |
| 1:00 – 1:50 | 3 | cohorte 26/31, 69 % [50 ; 84] contre 87 % [71 ; 95], 1,5 j contre 3 j, 5 réouvertures sur 8, PROJ-207/233/301 |
| 1:50 – 2:30 | 4 | matrice verte/orange/rouge/grise, 25 cohortes grises sur 36, bascule d'époque |
| 2:30 – 3:00 | 5 | `list-delegable-work` sprint 42, `should-delegate`, skill `before-taking-work` |
| 3:00 – 3:25 | 6 | calibration |
| 3:25 – 3:55 | 7 | `trial-demo-001`, état `running` |
| 3:55 – 4:15 | 8 | causes d'échec et garde-fous |
| 4:15 – 4:50 | 9 | graphe, Forge SQL, `rovo:mcp`, écran de couverture |
