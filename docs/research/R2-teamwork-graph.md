# R2 — Le Teamwork Graph : ce qui est vérifié, ce qui reste à confirmer

SPEC §17, §19 · DP-18, DP-19. État de la recherche au 12 novembre 2026. Les
éléments marqués **vérifié** viennent de la documentation officielle lue les 10
et 11 novembre 2026 ; les éléments marqués **tiers** viennent de sources
secondaires et doivent être confirmés sur un dépôt réel avant d'être tenus pour
acquis (SPEC §19).

## 1. Ce que le graphe expose

### Les commits — vérifié

| Champ | Présent | Usage dans l'app |
|---|---|---|
| empreinte | oui | identifiant du fait de commit |
| message | oui | **lu puis écarté** : seule la présence d'une mention et le nom d'agent sont conservés (SPEC §17) |
| auteur | oui | distinction compte robot / rôle (source 2, DP-17 : jamais une personne en sortie) |
| date de création | oui | fenêtre de douze mois, ordre de collecte |
| dépôt | oui | rattachement au projet |
| adresse | oui | lien depuis l'écran |

**Aucun champ sur les fichiers touchés.** Conséquence : la « zone » d'un ticket
ne peut pas venir du graphe ; elle vient du classement (règles, modèle,
correction manuelle — DP-06).

### Les pull requests — vérifié

| Champ | Présent | Usage dans l'app |
|---|---|---|
| état (ouverte, fusionnée, refusée, brouillon) | oui | une PR ouverte ne compte pas comme relecture terminée |
| relecteurs avec leur avis (approuvé, à revoir, sans avis) | oui | **nombre** de relecteurs et avis actuels, jamais de nom affiché |
| nombre de commentaires | oui | approche de la charge de relecture |
| dates | oui | délai d'ouverture, fenêtre |
| auteur | oui | compte robot ou rôle |

**Ni taille, ni branches.** Conséquence : aucune mesure de volume de code. La
charge de relecture est approchée par les commentaires et les commits ajoutés
après l'ouverture, et cette approximation est affichée comme telle
(`ReviewFact.commitsAfterOpen`, SPEC §6, point 1.5 du plan de validation).

### Les relations — vérifié

- un **ticket Jira** est relié à des commits, des branches et des builds ;
- une **pull request** est reliée à ses commits ;
- un **utilisateur** est relié aux commits et aux pull requests qu'il a créés,
  et aux pull requests qu'il a relues ;
- **aucune relation directe entre un ticket et une pull request.**

Conséquence structurante : le chemin d'un ticket à sa relecture est
`ticket → commits → pull request`. L'app ne peut donc pas demander « les PR de
ce ticket » ; elle demande les commits du ticket, puis les PR de ces commits.
C'est ce chemin que `src/collect/graph.ts` suit, et c'est pourquoi un commit
sans PR laisse la relecture vide (`null`, jamais une exception — SPEC §19).

## 2. L'API et les droits — vérifié

- L'API du graphe est en **Preview** : une évolution est possible, d'où un
  adaptateur isolé (`src/collect/graph.ts`) et aucun type du graphe qui fuite
  dans le domaine.
- La lecture se fait **au nom d'un utilisateur** : pas d'identité applicative
  globale. Les écrans affichent donc des données qui dépendent des droits de
  celui qui les ouvre — l'écran de couverture le dit.
- **Un droit par type d'objet** (`commit`, `pull-request`, `issue`, `user`),
  accordé par l'administrateur de l'organisation.
- **Un droit manquant vide le résultat sans erreur** : c'est la recette 15, et
  c'est la raison pour laquelle une liste vide n'est jamais interprétée comme
  « aucun agent n'a travaillé ici » mais comme « on ne sait pas » (DP-19).
- Requêtes enregistrées ou requêtes prêtes à l'emploi.
- **Une app consomme l'API ou fournit un connecteur, pas les deux** : nous
  consommons l'API.

## 3. Les contraintes de plateforme qui bornent le produit — vérifié

| Contrainte | Valeur | Conséquence |
|---|---|---|
| Déclencheur planifié | jusqu'à 900 s | le recalcul nocturne des cohortes doit tenir dans cette durée, d'où le cache |
| Forge SQL | 1 Gio par installation, 5 s par SELECT | aucune liste sans `LIMIT`, aucune requête sans `WHERE`, un cache par cohorte plutôt que des jointures à la volée (SPEC §18) |
| `rovo:mcp` | Preview, un module par app, 50 outils au plus | nos neuf outils tiennent largement ; entrées simples, 55 s par action |
| Action | 55 s | la carte d'un ticket se lit depuis le cache en moins de 2 s (SPEC §20), jamais depuis une requête graphe synchrone |
| Agent lancé par automatisation | n'appelle que des actions `GET` | `record-involvement` et `report-takeover` ne peuvent pas être appelés par une automatisation : la déclaration vient de l'agent lui-même, via la skill |

## 4. Ce qui reste à confirmer

| Point | Statut | Comment le confirmer | Repli |
|---|---|---|---|
| Lecture du graphe **hors ligne**, au nom d'un utilisateur | Forge le permet pour les actions hors ligne en général ; **non vérifié pour le graphe** | déclencher une action planifiée qui lit le graphe, vérifier le résultat et le journal | collecte à l'ouverture des pages, par tranches |
| Le champ `message` contient le message **entier**, dernière ligne comprise | à confirmer | comparer trois commits connus octet par octet, dont un avec mention en dernière ligne | déclaration MCP, champ à la clôture, compte robot |
| Volume et pagination de douze mois de graphe dans une session | à confirmer | chronométrer 1 000 commits paginés, trois fois | tranches plus petites, fenêtre de six mois (DP-18) |
| Relation **incident JSM ↔ ticket** exploitable par requête | à confirmer | relier un incident à un ticket sur un site JSM et requêter dans les deux sens | liens Jira entre tickets (`IssueLink.linkedIsIncident`) |
| Survie de la mention après une **fusion par écrasement** | à confirmer | fusionner une branche signée, relire le commit final et les commits de branche | commits de la branche, encore liés au ticket |
| Le statut « brouillon » d'une PR est stable dans le temps | **tiers** | observer dix PR sur deux semaines | ignorer les brouillons dans la charge de relecture |

## 5. Ce que ces contraintes changent dans la conception

1. **Le graphe n'est jamais une source de vérité unique.** L'implication d'un
   agent vient de cinq sources arbitrées (SPEC §5) ; le graphe n'en fournit que
   deux (auteur robot, mention de commit).
2. **L'absence est une information normale.** Un droit manquant, un commit sans
   PR, un ticket sans commit : autant de `null` et de `[]`, jamais d'exception
   (SPEC §19, SPEC §21).
3. **Le graphe est lu par tranches reprises.** Le curseur de collecte existe
   parce qu'une session peut s'arrêter avant la fin (DP-18).
4. **Rien de nominatif ne traverse le graphe jusqu'à un écran.** Les relecteurs
   sont comptés, jamais nommés (DP-17, recette 12).
