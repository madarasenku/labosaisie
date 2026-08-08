# Audit complet — CPMI LaboSaisie (v13.36)

_Date : 22/07/2026 · Portée : `index.html`, `caisse.html`, `login.html`, `sw.js` + base Supabase (288 dossiers, 3 utilisateurs)_

Cet audit a couvert quatre axes : sécurité applicative (XSS, auth), sécurité base de données (RLS, RPC), correction/logique métier, et intégrité des données. Les corrections déjà appliquées sont poussées sur GitHub (commit `7a18005`) et sur Supabase (migrations `harden_rls_v13_36`, `drop_duplicate_indexes_v13_36`).

---

## 1. Corrigé et déployé

### 1.1 XSS stocké dans l'historique — CRITIQUE
Le nom / la note / le médecin d'un patient étaient injectés bruts (en JSON) dans l'attribut `onmousemove` des lignes de l'historique. Un nom de patient contenant `"><img src=x onerror=…>` pouvait donc exécuter du code JavaScript dès l'affichage de la liste — y compris chez un admin — permettant le vol de la session (stockée en `localStorage`) et donc une élévation de privilèges.

Correctif : on ne passe plus que l'`id` numérique du dossier ; `showPreview()` retrouve le dossier dans le cache. Plus aucune donnée patient n'entre dans le HTML par cette voie.

### 1.2 Perte de données à l'édition d'une Parasitologie — ÉLEVÉ
`loadResultsIntoForm('Parasitologie')` remplissait des champs qui n'existent pas (`eps_aspect`, `eps_consistance`, `eps_obs`). Résultat : rouvrir un résultat de parasitologie affichait des champs vides, et le ré-enregistrement **écrasait le résultat par du vide**. Correctif : on restaure désormais les vrais champs (`para_type`, `para_resultat`, `para_espece`, `para_densite`, `pe_*`, `para_obs`…).

### 1.3 Contamination inter-patients (CRP / Widal / Groupe sanguin) — ÉLEVÉ
Les champs CRP, Widal et Groupe sanguin vivent désormais sur le panneau Sérologie, mais `collectResults('Hématologie')` les lisait quand même — et ils n'étaient jamais vidés entre deux patients. Un patient pour qui on ne faisait qu'une NFS pouvait donc hériter du CRP/Widal du patient précédent. Correctif : ces valeurs ne sont collectées que si l'examen correspondant est effectivement coché.

### 1.4 Dossiers « facture » masquant les analyses — ÉLEVÉ (corrigé au tour précédent)
Rappel : les fiches enregistrées via « Enregistrer sans saisie » portaient `type='Hématologie'` au lieu de `type='Dossier'`, masquant l'Immuno-Sérologie et les autres analyses dans l'historique et sur le reçu. Corrigé dans le code + 259 dossiers réparés en base.

### 1.5 Durcissement RLS de la base — ÉLEVÉ
La table `labo_resultats` avait des politiques `anon` « toujours vraies » en **lecture, insertion et mise à jour**. Autrement dit : n'importe qui possédant la clé publiable (visible dans le code) pouvait lire **tous** les dossiers patients, en insérer de faux, ou en modifier, **directement** via l'API REST — sans passer par le système de jeton.

L'application n'accède jamais à cette table en direct (uniquement via des fonctions `SECURITY DEFINER`). Ces politiques ont donc été supprimées ; les fonctions RPC continuent de fonctionner. Idem pour les écritures directes anon sur `labo_prescripteurs` (la lecture, seule utilisée par l'app, est conservée).

### 1.6 Nettoyage base — INFO
Suppression de deux index en double (`idx_resultats_created_at`, `idx_resultats_type`).

---

## 2. À décider / recommandé (non appliqué)

### 2.1 Contrôles de rôle côté serveur — ÉLEVÉ
Plusieurs fonctions RPC vérifient seulement que le jeton est **valide** (`uid_from_token`), pas le **rôle** ni la **propriété** du dossier. Exemple confirmé : `set_dossier_statut` permet à n'importe quel utilisateur connecté (même un simple agent) de changer le statut de **n'importe quel** dossier. De plus, le filtrage « un agent ne voit que ses fiches » est fait **côté client** : les données de tous les patients sont déjà envoyées au navigateur et lisibles dans les outils de développement.

Recommandation : ajouter les contrôles de rôle/propriété **à l'intérieur** des fonctions `SECURITY DEFINER` (comparer le rôle de l'appelant et le propriétaire de la ligne), et faire le filtrage des lignes dans `get_resultats` plutôt que dans le navigateur. C'est le chantier le plus important restant ; il touche ~40 fonctions et mérite d'être fait prudemment, une par une.

### 2.2 Jeton de session en localStorage — MOYEN
Le jeton d'authentification (et le rôle, et l'expiration) sont stockés en `localStorage`, donc lisibles par tout script et modifiables par l'utilisateur. Le correctif XSS (1.1) est la mitigation prioritaire. Idéalement, déplacer le jeton vers un cookie `httpOnly` et toujours dériver le rôle du jeton côté serveur.

### 2.3 Résultats absents de certains comptes rendus imprimés — ÉLEVÉ (médical)
Deux cas où des résultats saisis n'apparaissent pas sur le PDF/l'impression :
- **Parasitologie** : la section imprimée cherche des clés (`Aspect des selles`, `Consistance`, `Observation`) qui ne correspondent pas à celles réellement enregistrées → section vide.
- **CRP / Widal** : rendus uniquement dans la section Hématologie ; un dossier Immuno-Sérologie **sans** Hématologie n'affiche donc pas le CRP ni le Widal sur le compte rendu.

Ce sont des correctifs de rendu (sans risque de perte de données) que je peux appliquer si tu veux — je préfère les tester visuellement avec toi.

### 2.4 Doublons de numéros de dossier — MOYEN
4 numéros de dossier sont dupliqués (9 enregistrements : mêmes patient/date, à quelques secondes d'intervalle) — la voie « facture » insère un nouveau dossier sans vérifier qu'un dossier du même numéro existe déjà. Aucune suppression automatique n'a été faite (données patients). Je peux ajouter un garde-fou anti-doublon et te proposer une liste de fusion à valider.

### 2.5 Catégorisation « Goutte épaisse » et forfait prénatal — MOYEN
`ex_ge` (Goutte épaisse / TDR Paludisme, un examen de Parasitologie) et `ex_bpn` (forfait prénatal, 20 000 FCFA) sont rattachés à l'onglet `hema` → ils sont comptés et affichés sous « Hématologie ». Corrigeable, mais implique de déplacer aussi les champs de saisie.

### 2.6 Divers (FAIBLE)
Édition Bactériologie qui perd la « Date de prélèvement » ; incohérence mineure des tables de correspondance (`bpn` présent dans une seule copie) ; index inutilisés (à laisser, la base est jeune).

---

## 3. Points vérifiés — RAS
Clé Supabase committée = clé **publiable** (normal, pas de secret) · pas de service_role/mot de passe dans le code · pas de SQL concaténé côté client (tout paramétré) · service worker ne met pas en cache les réponses Supabase · `caisse.html` échappe correctement toutes les données patient · lien de partage public correctement échappé (reste à confirmer l'entropie du `share_token` côté serveur) · intégrité des données : 0 montant négatif, 0 dossier sans patient, 0 incohérence `_types`/`_examens_coches`.
