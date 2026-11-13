# Sonde de conflit — variante B

Cette ligne vient de la branche B et intègre aussi l'intention de la branche A.
Elle contredit volontairement la variante A pour produire un conflit de fusion
réel sur le même fichier et la même ligne, et prouver que l'agent de conflit de
la file (`pr-auto-merge` + `conflict_agent.py`, branché sur le routeur InferHub)
résout et pousse la PR : elle passe de DIRTY à mergée sans qu'un humain
n'écrive une ligne.

---

# Sonde 2026-11-13 — variantes A et B

Cette ligne vient de la branche A. Elle affirme qu'aucune automatisation ne peut
réconcilier deux intentions contraires : un humain doit toujours trancher.

Cette ligne vient de la branche B. Elle affirme qu'un agent peut réconcilier deux
intentions contraires, pousser la résolution et laisser la file merger seule.

La sonde B est relancée après la réinscription des runners du dépôt : elle
doit être réconciliée par l'agent de conflit, sans intervention humaine.

---

# Sonde Mergify 2026-11-13

Vérification du produit **Workflow Automation** sur l'organisation `Tradoooo`,
après le transfert : la commande `@mergifyio rebase` et la forme `/queue`
répondent-elles, ou refusent-elles le produit ?

## Réponse (13 novembre 2026, 15:14Z)

| commande | réponse |
|---|---|
| `/queue` | **prise en charge** — la PR #97 est entrée en file et mergée (`d49860a`) |
| `@mergifyio rebase` | **refusée** : « The product [Workflow Automation] needs to be activated » |

La file Mergify, elle, fonctionne : c'est elle qui a mergé les PR #92, #95 et
#96 le même jour, en moins d'une minute de queue.

**Ce produit n'est pas nécessaire au dépôt.** Le refus porte sur la seule
action `rebase` de Mergify ; le dépôt ne s'en sert pas : le balayeur
`pr-auto-merge` rebase lui-même avec son PAT (§6) et l'agent de conflit
résout les conflits (§7). Une action Mergify facultative manquant ne bloque
donc rien — les PR Merge Queue, `merge_group`, `check_run`, `check_suite`,
`pull_request`, `issue_comment`, `workflow_run` sont tous présents sur
l'installation de l'organisation.
