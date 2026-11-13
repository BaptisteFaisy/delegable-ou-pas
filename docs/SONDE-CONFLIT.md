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
