# LaboSaisie CPMI — Dossier de passation complet (contexte pour une autre IA)

> Ce document donne à une IA (ou à un développeur) tout le contexte nécessaire pour
> comprendre, faire évoluer et déboguer l'application **LaboSaisie CPMI** sans accès
> à l'historique de conversation précédent. Lire ce fichier EN ENTIER avant de toucher
> au code.
>
> Date de rédaction : 2026-08-25 · Version applicative : **v13.130** · Cache SW : **cpmi-labo-v104**

---

## 1. Vue d'ensemble

**LaboSaisie CPMI** est une **PWA (Progressive Web App)** de gestion d'un laboratoire
d'analyses médicales (Centre CPMI, Grand-Bassam, Côte d'Ivoire). Interface **en français**.
Elle gère : la saisie des dossiers patients, la saisie des résultats d'analyses,
l'impression/PDF des comptes-rendus, la caisse (encaissement), les prescripteurs et
leurs ristournes, un cahier comptable, la sauvegarde, et un système de rôles/permissions.

- **Pas de build step.** Vanilla JS, chargé par `<script>` classiques. 22 modules dans `js/`.
- **Frontend** : HTML/CSS/JS statique, hébergé sur **GitHub Pages**.
  - Dépôt : `github.com/madarasenku/labosaisie`, branche `main`.
- **Backend** : **Supabase** (PostgreSQL managé).
  - Project ref : `uvxxbihlagfncraokqlg`.
  - **Tout** l'accès aux données passe par des **fonctions RPC `SECURITY DEFINER`**
    (voir §4). Il n'y a **aucun** accès direct aux tables depuis le client.
- **Authentification maison** : jetons (tokens) opaques stockés dans `labo_sessions`,
  validés côté serveur. Ce n'est PAS Supabase Auth.

### Fichiers HTML (pages)
- `index.html` — application principale (SPA à onglets). ~131 Ko.
- `login.html` — page de connexion.
- `soignant.html` — portail prescripteur/soignant (consultation de ses prescriptions).

---

## 2. Modèle de sécurité (IMPORTANT)

C'est le point le plus important à comprendre avant de modifier quoi que ce soit.

1. **RLS activé sur les 18 tables, SANS aucune policy** → accès direct = **deny-all**.
   Le client ne peut donc jamais lire/écrire une table directement, même avec la clé anon.
2. **Tout passe par des RPC `SECURITY DEFINER`** (fonctions Postgres exécutées avec les
   droits du propriétaire). Chaque RPC reçoit un `p_token text` en premier argument et
   commence par valider ce token.
3. **Validation du token** : `uid_from_token(p_token)` renvoie le `user_id` si le token
   existe dans `labo_sessions` **et** `expires_at > now()` (expiration vérifiée côté serveur).
   Fonctions dérivées : `role_from_token`, `username_from_token`, `is_admin_token`,
   `prescripteur_from_token`, `est_personnel_labo`.
4. **Mots de passe** : bcrypt via l'extension `pgcrypto` (`crypt()` / `gen_salt('bf')`).
   Jamais de mot de passe en clair stocké.
5. **Anti-force-brute** : table `labo_bruteforce` (compteur d'essais + `locked_until`).
   `login_user` incrémente/verrouille. (Une table `labo_login_attempts` existe aussi.)
6. **Clé cliente** : SEULE la clé **anon/publishable** de Supabase est dans le client
   (c'est normal et sans danger vu le modèle RLS deny-all). **Jamais** de `service_role`
   dans le code client.
7. **Durcissement appliqué (audit)** : `log_action`, `run_daily_backup`,
   `liberer_numeros_verrouilles` ont eu leur EXECUTE **révoqué** pour `anon`,
   `authenticated`, `public` (ils étaient appelables anonymement → risque de forgerie
   du journal d'audit et de mutations non autorisées). Plusieurs fonctions ont reçu
   `SET search_path = public` (elles avaient un search_path mutable).

> ⚠️ Règle d'or : **toute** nouvelle opération sur les données doit être une RPC
> `SECURITY DEFINER` qui (a) valide le token, (b) vérifie le rôle/appartenance, (c) fait
> l'action. Ne jamais exposer une table en accès direct.

---

## 3. Schéma de la base (tables `public`)

| Table | Rôle | Colonnes clés |
|---|---|---|
| `labo_resultats` | Dossiers patients + résultats (cœur métier) | `id`, `type` ('Dossier' en format unifié v6+), `patient` jsonb, `resultats` jsonb, `created_at`, `created_by`, `montant`, `prescripteur_id`, `est_bpn`, `restricted_by`, `deleted_at`, `deleted_by`, `restricted_at` |
| `labo_users` | Comptes | `id`, `username` (unique), `password_hash`, `role` (agent/caissier/spectateur/admin/prescripteur), `must_change_password`, `signature`, `prescripteur_id` |
| `labo_sessions` | Jetons de session | `token` (PK), `user_id`, `created_at`, `expires_at`, `coffre_until` |
| `labo_prescripteurs` | Médecins prescripteurs | `id`, `nom`, `specialite`, `structure`, `telephone`, `taux_ristourne`, `actif` |
| `labo_clotures` | **Journées verrouillées** | `jour` (date, PK), `verrouille_par`, `verrouille_le` |
| `labo_audit_log` | Journal d'audit | `ts`, `user_id`, `username`, `action`, `target_id`, `details` jsonb |
| `labo_bruteforce` / `labo_login_attempts` | Anti-force-brute | `username`, compteurs, `locked_until` |
| `labo_tarifs` | Grille tarifaire (singleton id=1) | `grille` jsonb |
| `labo_examens_custom` | Examens personnalisés (singleton) | `liste` jsonb |
| `labo_refs_config` | Valeurs de référence (singleton) | `refs` jsonb |
| `labo_coffre` | Code coffre-fort (singleton) | `code_hash`, `essais`, `bloque_jusqu` |
| `labo_cahier_colonnes` / `labo_cahier_ecritures` / `labo_cahier_partage` | Cahier comptable ("cahier jaune") | écritures par jour/colonne |
| `labo_sauvegardes` | Historique des sauvegardes | `effectuee_le`, `nb_fiches`, `format` |
| `labo_resultats_backup` | Snapshots quotidiens des dossiers | `snapshot_date` + copie de `labo_resultats` |

### Modèle de données `labo_resultats.resultats` (jsonb)

Format **unifié** (`type = 'Dossier'`). L'objet `resultats` contient :

**Métadonnées préfixées par `_`** (traitées à part par `get_resultats_light`, voir §4) :
- `_types` : liste des types d'analyse présents (ex. `["Hématologie","Biochimie"]`)
- `_montants` : montant par analyse
- `_examens_coches` : examens cochés (sélectionnés) pour ce dossier
- `_examens_prix` : prix par examen
- `_facture_seule` : dossier facturé sans résultats à saisir
- `_reception_seule` : dossier en réception seule (exclu de la saisie en série)
- `_saisi_serie` : **marqueur** `{ [cleGrille]: true }` posé quand un paramètre a été
  saisi via la grille "saisie en série" (voir §6.4 et §7 pour le pourquoi)

**Sous-objets par analyse** (résultats réels) : `Hématologie`, `Biochimie`,
`Immuno-Sérologie`, `Groupe sanguin`, etc.

> Point subtil crucial : `get_resultats_light` ne renvoie QUE les clés `_…`, jamais les
> sous-résultats. C'est pourquoi le marqueur de complétude de la série doit être une clé
> `_…` (sinon un dossier déjà saisi "réapparaît" comme non saisi dans la grille — voir §7).

---

## 4. Fonctions RPC (Postgres, schéma `public`)

Toutes en `SECURITY DEFINER` sauf mention contraire. Premier argument = `p_token` (sauf
helpers internes). Liste exhaustive au 2026-08-25 :

**Auth / session**
`login_user(username, password)` (bcrypt + anti-force-brute) · `logout_token` ·
`refresh_token` · `uid_from_token` · `username_from_token` · `role_from_token` ·
`is_admin_token` · `is_admin(user_id)` · `prescripteur_from_token` · `est_personnel_labo` ·
`check_first_login` · `change_password` · `log_disconnect` · `verify_password` (interne).

**Utilisateurs (admin)**
`create_user_admin` · `list_users_admin` · `update_user_admin` · `delete_user_admin` ·
`unlock_user` · `set_user_signature` · `get_my_signature`.

**Dossiers / résultats**
`insert_resultat(token, type, patient, resultats, montant, prescripteur_id, est_bpn)` ·
`update_resultat(token, id, patient DEFAULT NULL, resultats DEFAULT NULL, montant DEFAULT NULL, prescripteur_id DEFAULT NULL, est_bpn DEFAULT NULL)` — **tous les params optionnels + `coalesce(p_X, existant)`** (voir §7, corrige la saisie série) ·
`get_resultats` · `get_resultat_full(token,id)` · `get_resultats_light(token, date_from, date_to, limit)` (ne renvoie que les clés `_…` par `jsonb_object_agg` where key ~ '^_') ·
`get_public_result(share_token)` · `update_dossier_patient` · `update_note_dossier` ·
`set_dossier_statut` · `set_statut_lot` · `soft_delete_dossier` · `restore_dossier` ·
`delete_resultat_admin` · `clear_resultats_admin` · `toggle_restriction` (masquage ;
propriétaire OU admin) · `get_restriction_status` · `set_reception_seule(token, ids[], value)` ·
`get_deleted_status`.

**Caisse**
`encaisser_lot(token, ids[])` · `caissier_exists(token)` (permet aux agents d'encaisser
eux-mêmes s'il n'existe aucun caissier).

**Verrouillage de journée** (voir §6.5)
`verrouiller_journee(token, jour)` · `deverrouiller_journee(token, jour)` (admin seul) ·
`verrouiller_jusqua(token, jour)` (plage dense depuis le 1er dossier jusqu'à `jour`) ·
`list_clotures(token)`. Helper : `jour_dossier(patient, created_at)` = date effective du
dossier. Trigger : `trg_bloque_jour_verrouille`.

**Prescripteurs**
`get_prescripteurs` · `insert_prescripteur` · `update_prescripteur_admin` ·
`deactivate_prescripteur` · `get_mes_prescriptions(token, date_from, date_to)` ·
`get_prescription_full(token, id)` (scopé par `prescripteur_id` du token — **pas d'IDOR**).

**Cahier comptable ("cahier jaune")**
`get_cahier_jaune` · `ajouter_ecriture_cahier` · `modifier_ecriture_cahier` ·
`supprimer_ecriture_cahier` · `gerer_colonne_cahier` · `definir_partage_cahier` ·
`mon_acces_cahier` · `reporter_bpn_au_cahier`.

**Coffre-fort**
`etat_coffre` · `coffre_ouvert` · `definir_code_coffre` · `fermer_coffre`.

**Config**
`get_tarifs` / `save_tarifs` · `get_examens_custom` / `save_examens_custom` ·
`get_refs_config` / `save_refs_config`.

**Sauvegarde / instantanés**
`run_daily_backup` (EXECUTE révoqué anon) · `enregistrer_sauvegarde` ·
`derniere_sauvegarde` · `liste_instantanes` · `comparer_instantane` ·
`restaurer_depuis_instantane` · `restaurer_fiche_depuis_instantane` · `restaurer_fiches` ·
`restaurer_prescripteurs`.

**Audit / journal**
`log_action` (EXECUTE révoqué anon) · `get_audit_log` · `purge_audit_log` ·
`auditer_securite(token)`.

**Divers**
`get_next_dossier_num(month_year, token)` · `liberer_numeros_verrouilles` (EXECUTE révoqué anon) ·
`est_bpn_interne` (interne).

---

## 5. Rôles et permissions

| Rôle | Peut |
|---|---|
| `admin` | Tout. Seul à **déverrouiller** une journée, purger l'audit, gérer utilisateurs/tarifs, suppression définitive. |
| `caissier` | Encaissement, caisse, consultation. |
| `agent` | Saisie de dossiers et résultats. **Ne voit que ses propres dossiers** (`created_by`). Peut masquer/supprimer **ses** dossiers en groupe. Peut **encaisser lui-même** s'il n'existe aucun caissier. Peut verrouiller (mais pas déverrouiller). |
| `spectateur` | Consultation **uniquement des journées verrouillées** (`labo_clotures`). Filtrage appliqué **côté serveur** dans `get_resultats_light` + côté client. |
| `prescripteur` | Portail `soignant.html` : voit **uniquement ses** prescriptions (scopé par `prescripteur_id`). |

---

## 6. Fonctionnalités métier principales

### 6.1 Saisie d'identification + résultats
`js/saisie.js`. Création du dossier patient (fiche identif), puis saisie des résultats
des examens **cochés**. Depuis v13.114/115 : la page de saisie n'affiche **que** les
examens cochés, sur une seule page, sans lignes verrouillées ni changement d'onglet.
`enregistrerFicheIdentif` écrit `_reception_seule` le cas échéant. v13.129 : on vérifie
la valeur de retour d'`insert/updateRecordRemote` avant d'afficher le toast de succès
(sinon faux positif "enregistré").

### 6.2 Paillasse (multi-dossiers)
`js/paillasse.js`. Ouvrir **plusieurs dossiers simultanément**, les remplir
progressivement ; signal "prêt à enregistrer + imprimer" quand un dossier est complet.
Depuis l'historique, on peut **ajouter un dossier à la paillasse** pour le modifier/compléter.
Utilisable **en même temps** que la saisie en série.

### 6.3 Saisie en série (grille) — `js/grille.js`
Grille "une ligne par patient, une colonne par paramètre" pour saisir au fil de la sortie
machine, puis enregistrer le lot. Registre `GRILLE_EXAMS` keyé par :
`nfs, crp, gly, crea, transa, vih, hbs, hcv, tpha, toxo, rube, gs`. Chaque entrée :
`{label, type, exId, coche (regex), filled, cols[{k,lab,dom,kind:'num'|'sel',opts}], postSet}`.
- **Urée** : calculée = `créatinine / 44.4` (config `crea.postSet`). TSH et Urée retirées
  comme colonnes autonomes.
- `grillePending(key)` filtre par date (`_grilleDate`, défaut = aujourd'hui), réception
  seule (`_grilleInclureReception`), correspondance de la coche, et **exclut les dossiers
  déjà saisis** via le marqueur `_saisi_serie[key]`.
- `grilleBuildResults` rejoue chaque ligne dans le **vrai formulaire** (fixe `p_sexe`/`p_age`,
  coche uniquement `exId`, remplit les champs, `dispatch('input')`, `calcConstantes`/
  `calcFLAbsolues`, `ensureInterpFresh`) puis `collectResults(cfg.type)`.
- `grilleSaveAll` pose `newRes._saisi_serie = { ...base._saisi_serie, [_grilleKey]: true }`.

### 6.4 Réception seule + filtres série
Un dossier "réception seule" (`_reception_seule`) est **exclu** de la grille série (cas
d'un agent qui enregistre sans saisir). v13.125 : filtre par date (défaut aujourd'hui)
+ flag réception seule. v13.126 : action groupée pour marquer des patients "réception
seule" (`set_reception_seule` + `historique.js` `bulkReceptionSeule`).

### 6.5 Verrouillage de journée ("geler les sommes du jour")
Choix retenu : **gel total** (tout le dossier de la journée) ; **admin + celui qui fait
la caisse** peuvent verrouiller, **admin seul** peut déverrouiller.
- Table `labo_clotures` + trigger `trg_bloque_jour_verrouille` (BEFORE INSERT/UPDATE/DELETE
  sur `labo_resultats`).
- Trigger **affiné** (migration `verrou_journee_autorise_resultats`) : sur une journée
  verrouillée il bloque uniquement l'**argent** (`montant`, `paiement_status`), la
  **suppression** (`deleted_at`), le **masquage** (`restricted_by`) et les INSERT/DELETE ;
  mais il **autorise** une mise à jour **résultats seuls**. (Nécessaire pour pouvoir saisir
  des résultats sur d'anciens dossiers "facture seule" de journées déjà verrouillées.)
- Client : `js/cloture-caisse.js` → `_cloturesVerr` (Set), `jourVerrouille()`,
  `chargerClotures`, `verrouillerJournee`, `deverrouillerJournee`, `verrouillerJusqua`,
  bannière + boutons dans `renderCloture`.
- Spectateur : ne voit que les journées verrouillées (client + serveur).

---

## 7. Bug résolu récemment : échec d'enregistrement en série

Symptôme signalé : « je n'arrive pas à enregistrer par lot quand je finis les saisies en
série » puis « on écrit échec de mise à jour » (pour la journée du jour).

**Trois causes empilées, toutes corrigées :**
1. **Trigger de journée verrouillée** trop large : il bloquait aussi la complétion de
   résultats sur d'anciens dossiers de journées verrouillées. → migration
   `verrou_journee_autorise_resultats` (le trigger n'autorise que les MAJ résultats-seuls).
2. **Re-détection dans la grille** : `get_resultats_light` ne renvoie pas les
   sous-résultats, donc un dossier fraîchement saisi **réapparaissait** comme non saisi.
   → v13.130 : marqueur `_saisi_serie` (clé `_…` préservée par le light load).
3. **`update_resultat` exigeait les 7 params sans défaut** et faisait `patient = p_patient`
   inconditionnellement. Or l'appel "résultats seuls" (`updateRecordRemote(id, rec, {onlyResultats:true})`
   dans `js/supabase-db.js`) **omet** `p_patient`/`p_prescripteur_id` → échec PostgREST
   (ou écrasement du patient). → migration `update_resultat_params_optionnels` : params
   `DEFAULT NULL` + `coalesce(p_X, existant)` dans le `SET`. **Vérifié** : une MAJ
   résultats-seuls sur une journée verrouillée réussit et le patient est préservé.

> Ces trois correctifs sont **déjà actifs** (serveur) et livrés (client v13.130).

---

## 8. Déploiement

**Processus obligatoire à chaque mise en ligne :**
1. Incrémenter `APP_VERSION` **et** `CACHE` dans `sw.js` (ex. `13.130` / `cpmi-labo-v104`).
2. Propager la même `?v=` dans `index.html`, `login.html`, `soignant.html`
   (le test `tests/deploiement.test.js` échoue si les trois divergent).
3. Lancer `node tests/deploiement.test.js` (+ les tests concernés, voir §9).
4. Pousser sur `main` (GitHub Pages déploie automatiquement) :
   `git -c http.proxy= -c https.proxy= push origin main`.
5. Vérifier en ligne via un WebFetch de `sw.js?cb=<timestamp>` (cache-buster) que
   `APP_VERSION`/`CACHE` sont bien à jour.

**Stratégie SW** (`sw.js`) : Network-First avec fallback cache. Les appels `supabase.co`
et les requêtes non-GET ne sont **jamais** interceptés (toujours réseau). Les modules js/
portent `?v=APP_VERSION` pour éviter qu'un `index.html` neuf serve un `.js` périmé.

---

## 9. Tests

Harnais **Playwright** maison dans `tests/` (~45 fichiers `*.test.js`). Helpers dans
`tests/helpers.js` : `serve`, `openApp`, `createReporter`, `setField`. Lancer un test :
`node tests/<fichier>.test.js`. Chromium pré-installé (`/opt/pw-browsers/chromium`,
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).

Tests notables : `deploiement.test.js` (cohérence des versions), `securite.test.js`,
`roles.test.js`, `cloture-verrouillage.test.js`, `spectateur-journees-verrouillees.test.js`,
`droits-verrouillage-suppression.test.js`, `enregistrement-jour-verrouille.test.js`,
la famille `grille-*.test.js` (série), `paillasse-*.test.js`.

> ⚠️ Piège : les tests grille doivent poser `_grilleDate = ''` avant d'ouvrir la grille
> (sinon le filtre date par défaut = aujourd'hui masque les dossiers de test à dates fixes).

---

## 10. Audit de sécurité (résumé)

Un audit complet a été mené (rapport HTML séparé livré au propriétaire). Bilan :
**0 critique, 2 hautes, 7 moyennes, 8 basses, 2 déjà corrigées.** Corrections serveur
déjà appliquées (voir §2, migration `durcissement_securite_audit`). Points ouverts notables
côté client :
- **H-1 (XSS)** dans `js/impression.js` : `printDiv.innerHTML = html` (~l.454) injecté dans
  le DOM principal ; `table()`/`row()` (~l.543-554) et `Profil Hb`/`Commentaire Hb`
  (~l.575-576) n'échappent pas le texte libre ; `escHTML()` n'échappe pas l'apostrophe.
- **H-2** dans `js/session-pwa.js` : `setPaiementStatus` en fire-and-forget
  (`update_dossier_patient`) — seul `journee_verrouillee` est reverté.
- **M-7** : `generateRefUnique` (~l.113-125 de `impression.js`) — 4 caractères
  `Math.random` → risque de collision.

Un correctif planifié (tâche programmée) prépare 6 corrections d'audit sur une branche
`fix/audit-6-corrections` (préparation seule, sans déploiement).

---

## 11. Comment reprendre le travail (checklist pour l'IA)

1. Ne jamais contourner le modèle RLS/RPC (§2). Toute nouvelle donnée = nouvelle RPC
   `SECURITY DEFINER` validant le token + le rôle.
2. Avant de modifier le schéma : `list_tables` puis `list_migrations`. Utiliser
   `apply_migration` (jamais de DDL via requête brute).
3. Toute évolution UI = respecter la structure `resultats` jsonb (§3), en particulier
   les clés `_…` (les seules renvoyées par `get_resultats_light`).
4. Déployer selon §8 (bump version + cache, propager `?v=`, tests, push, vérif live).
5. Lancer les tests Playwright pertinents avant push (§9).
6. Le français est la langue de toute l'UI et des messages.

---

## 12. Fichiers `js/` (aide-mémoire)

`saisie.js` (saisie identif + résultats) · `paillasse.js` (multi-dossiers) ·
`grille.js` (saisie en série) · `historique.js` (liste/actions groupées : bulkDelete,
bulkReceptionSeule, bulkLock/bulkUnlock, updateBulkToolbar) · `supabase-db.js` (couche
d'accès : `insert/updateRecordRemote`, `estJourVerrouille`, filtrage spectateur) ·
`session-pwa.js` (session, statut paiement) · `cloture-caisse.js` (caisse + verrouillage
journée) · `impression.js` + `export-pdf.js` + `export-excel.js` (comptes-rendus) ·
`donnees-analyses.js` (référentiel des analyses/examens) · `prescripteurs.js` ·
`stats.js` · `cahier-jaune.js` · `coffre.js` · `sauvegarde.js` · `ui-auth.js` ·
`navigation.js` · `periode-nav.js` · `qr-generator.js` · `pwa-manifest.js`.

---

*Fin du dossier de passation. Les fichiers `PASSATION_*.md` et `docs/AUDIT_*.md` à la racine
donnent l'historique détaillé des versions antérieures.*
