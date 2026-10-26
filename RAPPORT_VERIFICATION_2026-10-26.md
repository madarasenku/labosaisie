# Vérification quotidienne LaboSaisie — 26/10/2026

**Verdict : ⚠️ points à surveiller, rien de bloquant.** Rien n'a été publié ni modifié en production.

| Contrôle | État | Détail |
|---|---|---|
| Erreurs | ✅ | Aucune erreur base ni réponse d'API en échec sur 24 h |
| Doublons | ✅ | Aucun numéro de dossier en double |
| Caisse | ✅ | Aucune anomalie de montant ; 4 fiches en 24 h, dernière hier 21h17 |
| Sauvegardes | ✅ | `labo-daily-backup` (23h00) et `liberation-numeros-verrouilles` (23h30) réussis |
| Sécurité | ⚠️ | Aucune alerte ERROR ; 4 fonctions d'aide appelables sans jeton (voir ci-dessous) |
| Tests automatiques | ⚠️ | Local : 128 fichiers verts. GitHub : test planifié échoué le 25/10 à 11h37 (voir ci-dessous) |
| Version en ligne | ✅ | 13.263 partout ; lien de test 13.263-t1 ; Pages publié |

## Points à surveiller

1. **Test planifié GitHub échoué (25/10, 11h37)** : délai de 30 s dépassé au chargement d'une page (`actions-groupees.test.js`). Le même commit avait réussi à 9h35 et passe en local. Probablement une lenteur du serveur GitHub (non re-testé sur GitHub). Rien à faire sauf récidive.
2. **Fonctions d'aide appelables par « anon » sans jeton** : `_compte_hors_perimetre`, `_resp_hors_perimetre`, `_username_hors_resp`, `trg_noter_maj`. Aucune règle d'accès ne les utilise ; elles ne sont appelées que par d'autres fonctions sécurisées.

## Correction préparée (non appliquée)

- Branche : `claude/auto-correctif-20261026`
- Fichier : `docs/sql/2026-10-26_verrouiller_fonctions_aide.sql` (REVOKE + retour arrière inclus)
- Prochaine étape : l'appliquer d'abord sur la base de test (`ftwsxdivwoczsreiohok`), vérifier le lien de test ; la production uniquement sur demande explicite.
