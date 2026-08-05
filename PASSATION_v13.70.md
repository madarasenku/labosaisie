# 📋 PASSATION — Projet LaboSaisie (v13.70)

> **Pour Madara** : dans une nouvelle tâche Cowork, colle ce document.
> Tu n'as **rien à joindre** : tout est sur GitHub, le nouveau Claude clonera le dépôt.

---

## 🎯 ÉTAT ACTUEL — tout est à jour et déployé

Aucune tâche en attente. Version **v13.70**, commit `c432c9c`, déployée sur
GitHub Pages avec le statut `success`.

**⚠️ Une seule chose à confirmer côté humain** : ouvrir
https://madarasenku.github.io/labosaisie/ et vérifier que l'application se
charge. Le bac à sable de Claude n'a pas accès à ce domaine (allowlist
réseau), donc ce dernier maillon n'a pas pu être vérifié automatiquement.

---

## 🔗 COORDONNÉES DU PROJET

| | |
|---|---|
| **Dépôt** | `https://github.com/madarasenku/labosaisie` — branche `main`, **public** |
| **Site** | `https://madarasenku.github.io/labosaisie/` |
| **Supabase** | Project ID `uvxxbihlagfncraokqlg` · eu-west-1 · Postgres 17 |
| **Tables** | `labo_resultats`, `labo_users`, `labo_sessions`, `labo_bruteforce`, `labo_audit_log` |

⚠️ **Attention** : l'ancienne passation indiquait le compte
`madarauchiwa0705` — **c'est faux**, le dépôt appartient à `madarasenku`.
Une session entière a été perdue à cause de cette erreur.

**Accès Git** : le proxy Git d'Anthropic n'autorisait pas ce dépôt. Il a
fallu un **PAT fine-grained** (portée `labosaisie`, *Contents: Read/Write*),
créé le 5 août 2026 et **expirant le 4 septembre 2026**. Prévoir d'en
regénérer un. Astuce qui a marché : préfixer les commandes git de
`no_proxy=github.com NO_PROXY=github.com` pour contourner le proxy.

---

## 🏥 LE PROJET

**LaboSaisie** — gestion de laboratoire pour le **CPMI Grand-Bassam**
(Centre de Protection Mère et Infantile), Côte d'Ivoire. Application web
PWA, fonctionne hors-ligne. ~620 fiches en base, 4 comptes utilisateurs.

### Rôles (3 niveaux + spectateur)
- **👑 admin** — accès total : saisie, historique complet, caisse, ristournes,
  gestion des comptes, corbeille, fiches verrouillées, rapport PDF mensuel.
- **💰 caissier** — caisse complète, historique et stats en lecture seule.
  Ne voit ni la saisie ni la gestion des comptes.
- **🔬 agent** — voit et saisit **uniquement ses propres fiches**, avec une
  caisse personnelle simplifiée.
- **👁 spectateur** — lecture seule.

Fonctions clés : `isAdmin()`, `isCaissier()`, `isSpectateur()`.

---

## 📂 ARCHITECTURE (depuis v13.70)

Le fichier unique de 18 193 lignes a été découpé. Structure actuelle :

```
index.html          1 807 lignes  — structure HTML uniquement
css/app.css         1 637 lignes
js/                14 modules, 14 886 lignes au total
  donnees-analyses.js   définitions d'examens, tarifs, valeurs de référence, formules
  navigation.js         navigation entre vues, données patient
  supabase-db.js        config Supabase, _dbCache, refreshDB, édition de fiche
  historique.js         historique, filtres, actions en masse
  export-excel.js       export Excel (ExcelJS)
  prescripteurs.js      prescripteurs, filtres stats, ristournes
  saisie.js             fiche d'identification, examens, facturation
  ui-auth.js            toast, modales, authentification, gestion des comptes
  session-pwa.js        inactivité, raccourcis clavier, PWA, thème, bannière MAJ
  stats.js              tableau de bord statistiques
  impression.js         impression directe, QR, reçu de paiement
  export-pdf.js         export PDF, rapport mensuel, configuration des tarifs
  qr-generator.js       bibliothèque QR embarquée (tierce, ne pas modifier)
  pwa-manifest.js       manifest PWA généré
vendor/             bibliothèques hébergées localement (1,7 Mo)
tests/              suite de tests automatisés
sw.js               service worker
```

### 🚨 RÈGLES À NE PAS ENFREINDRE

1. **Les `<script>` sont des scripts CLASSIQUES, pas des modules ES.**
   Le HTML contient **259 gestionnaires inline** (`onclick="..."`) qui
   résolvent leurs fonctions dans la portée globale. Passer en modules ES
   les casserait tous d'un coup, silencieusement.

2. **L'ordre des balises `<script>` dans index.html est critique.**
   Le hoisting ne traverse pas les fichiers : 14 instructions s'exécutent
   immédiatement au chargement (dont `initSupabase()`) et doivent rester
   après leurs déclarations.

3. **Tout nouveau fichier js/ ou css/ doit être ajouté au `PRECACHE` de
   `sw.js`**, sinon l'app casse hors-ligne. `tests/pwa.test.js` vérifie que
   les modules de `js/`, ceux référencés par `index.html` et ceux pré-cachés
   coïncident — il échouera si tu oublies.

4. **Bumper `CACHE` dans `sw.js` à chaque déploiement** (actuellement
   `cpmi-labo-v44`). La détection de nouvelle version côté client ne dépend
   pas de ce bump (elle surveille l'ETag), mais la purge des anciens caches si.

---

## 🧪 TESTS — les lancer AVANT et APRÈS toute modification

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/run.js
```

**66 contrôles** sur 3 fichiers (`filtres`, `roles`, `pwa`). Code de sortie
non nul en cas d'échec. **Aucun test ne touche la production** : les appels
`**/rest/v1/rpc/**` sont interceptés et renvoient un jeu fixe de 10 fiches.

Voir `tests/README.md` pour le détail.

---

## ⚠️ PIÈGES DÉCOUVERTS À LA DURE

1. **`labo_resultats.created_by` contient le NOM D'UTILISATEUR (texte)**,
   pas un id numérique. `getCalcDB()` compare `r.createdBy === _currentUser.username`.
   Conséquence : `login_user` doit renvoyer le nom **tel qu'enregistré** en
   base, jamais celui saisi — sinon un agent ne voit plus ses propres fiches.

2. **Le sélecteur de mois du rapport PDF vit dans l'onglet Comptes** et n'est
   peuplé qu'à son ouverture (`populateMoisAnneeSelectors()`). Générer le
   rapport sans passer par cet onglet le fait retomber silencieusement sur le
   mois courant.

3. **`_dbCache` contient TOUTES les fiches** depuis v13.68, et chaque vue
   filtre côté client. Ne pas réintroduire de filtrage date côté serveur dans
   `refreshDB` : c'était la cause du bug des ristournes d'un mois passé.

4. **Ne jamais recharger la page automatiquement.** Une saisie patient en
   cours serait perdue. La bannière de mise à jour demande confirmation.

---

## 📜 CE QUI A ÉTÉ FAIT LE 5 AOÛT 2026

- **v13.67** — bannière « Nouvelle version disponible » pour les postes qui
  laissent l'app ouverte toute la journée (détection par ETag, aucun numéro
  de version à maintenir). Correction d'un pré-cache en tout-ou-rien qui
  échouait entièrement si un seul CDN était injoignable.
- **v13.68** — **bug corrigé** : les ristournes et le rapport d'un mois passé
  revenaient vides, car le cache ne contenait que la période affichée dans
  l'Historique. Effet de bord positif : les filtres sont devenus instantanés
  (1 seul appel serveur par session au lieu d'un par clic).
- **v13.69** — bcrypt coût 6 → 12 avec re-hachage transparent au login ;
  login insensible à la casse ; les 6 bibliothèques + la police Poppins
  passent du CDN à `vendor/` ; suppression de `caisse.html` (page orpheline) ;
  création de la suite de tests.
- **v13.70** — découpage du monolithe.

### Migrations Supabase appliquées (ne pas rejouer)
`raise_get_resultats_light_limit` · `harden_auth_v13_69` · `drop_dead_overloads_v13_69`

### ⚠️ Incident à connaître
Au début de la session, le `index.html` v13.34 de l'ancienne passation a été
poussé par erreur, écrasant la v13.66 (128 commits). Détecté et **entièrement
restauré** (commits `846ad0f` puis `a488702`). Leçon retenue : **toujours
comparer la version du dépôt avant d'écraser un fichier.**

---

## 💡 PISTES POUR LA SUITE (aucune n'est urgente)

- **Les 4 comptes ont encore un hash bcrypt en coût 6.** C'est normal : la
  migration se fait à la prochaine connexion réelle de chacun. À vérifier
  dans quelques jours (`select left(password_hash,7) from labo_users`).
- Deux bibliothèques QR coexistent (`vendor/qrcode-1.0.0.min.js` et
  `js/qr-generator.js`) — redondance à trancher.
- Étendre les tests : ils couvrent la logique client, pas les permissions
  RLS réelles ni le rendu visuel.
- `AUDIT_v13.36.md` à la racine est daté ; le mettre à jour ou l'archiver.
- Aucune CI configurée : `node tests/run.js` pourrait tourner sur chaque push
  via GitHub Actions.
