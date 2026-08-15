# 📋 PASSATION — Projet LaboSaisie (v13.103)

> **Pour Madara** : dans une nouvelle tâche Cowork, colle ce document.
> Tu n'as **rien à joindre** : tout est sur GitHub, le nouveau Claude clonera
> le dépôt. Cette passation remplace `PASSATION_v13.70.md`, qui reste dans le
> dépôt pour l'historique mais dont plusieurs chiffres sont périmés.

---

## ✅ LE SITE SECONDAIRE EST ARRÊTÉ (15 août 2026)

`labosaisie-v2` a servi de banc d'essai du 11 au 15 août. Tout ce qui en vaut
la peine a été **réuni dans ce dépôt** en v13.103, l'identité du second site
en moins (base distincte, bandeau orange, préfixes `v2_`). Sa publication
GitHub Pages est **coupée** : le dépôt reste en archive, le site n'est plus
en ligne, et le risque de saisir dans la mauvaise base a disparu avec lui.

⚠️ Deux sessions ont travaillé en parallèle sur les deux dépôts pendant
quatre jours, et une publication forcée a failli effacer douze commits. **Ne
plus faire travailler deux sessions sur le même projet en parallèle**, ou
alors sur des branches séparées. Et ne jamais contourner un refus de git du
type « stale info » : c'est exactement le garde-fou qui a servi ce jour-là.

---

## 🎯 ÉTAT DU SITE PRINCIPAL — à jour et déployé

Version **v13.103**, poussée sur GitHub Pages.
La suite de tests est verte : **576 contrôles sur 22 fichiers**.

Rien d'autre n'est en attente côté production.

---

## 🔗 COORDONNÉES

| | Site principal | Site secondaire |
|---|---|---|
| **Dépôt** | `madarasenku/labosaisie` — `main`, **public** | `madarasenku/labosaisie-v2` — `main`, **public** |
| **Site** | `https://madarasenku.github.io/labosaisie/` | `https://madarasenku.github.io/labosaisie-v2/` |
| **Supabase** | `uvxxbihlagfncraokqlg` · eu-west-1 · PG 17 | `ftwsxdivwoczsreiohok` · eu-west-1 · PG 17 |
| **Données** | 659 fiches, 4 comptes | aucune fiche patient |
| **Branche de travail** | `main` | `site-v2` (un commit par-dessus `main`) |

⚠️ Le compte GitHub est **`madarasenku`**, pas `madarauchiwa0705`. Une session
entière a déjà été perdue sur cette confusion.

⚠️ **Les deux dépôts sont PUBLICS.** Aucune donnée patient ne doit y être
commitée, jamais. Les sauvegardes se téléchargent sur le disque de l'admin ;
seule la *date* de la sauvegarde remonte en base.

**Accès Git** : un PAT fine-grained est déjà injecté dans les URL de remote
(`origin` = principal, `copie` = secondaire). Portées nécessaires :
*Contents: Read/Write* **et** *Workflows: Read/Write* — sans la seconde,
GitHub refuse tout push touchant `.github/workflows/`. Madara a explicitement
demandé de **garder ce PAT** : ne pas proposer de le révoquer.

---

## 🏥 LE PROJET

**LaboSaisie** — gestion du laboratoire du **CPMI Grand-Bassam** (Centre de
Protection Maternelle et Infantile), Côte d'Ivoire. PWA en JavaScript, adossée
à Supabase, fonctionne hors-ligne.

### Rôles
- **👑 admin** — accès total. Depuis la v13.82, **seul l'admin peut
  verrouiller** une fiche. Seul lui voit le cahier jaune, sauf partage.
- **💰 caissier** — caisse complète, historique et stats en lecture seule.
- **🔬 agent** — voit et saisit **uniquement ses propres fiches**.
- **👁 spectateur** — lecture seule stricte.

En revanche **tout le monde peut supprimer** (mise en corbeille), depuis la
v13.82 : c'était une demande explicite de Madara. La suppression est
nominative dans le journal d'audit, et son auteur peut la défaire lui-même
**pendant 24 heures** (v13.92). Passé ce délai, seul l'admin restaure.

---

## 📂 ARCHITECTURE

```
index.html          — structure HTML uniquement
css/app.css
js/                 — 16 modules
  donnees-analyses.js   examens, tarifs, valeurs de référence, formules
  navigation.js         navigation entre vues, données patient
  supabase-db.js        config Supabase, _dbCache, refreshDB, édition de fiche
  historique.js         historique, filtres, actions groupées, corbeille
  export-excel.js       export Excel (ExcelJS) + estBPN / getDisplayType
  prescripteurs.js      prescripteurs, filtres stats, ristournes
  saisie.js             fiche d'identification, examens, facturation
  ui-auth.js            toast, modales, authentification, comptes
  session-pwa.js        inactivité, raccourcis, PWA, thème, bannière MAJ
  stats.js              tableau de bord
  impression.js         impression directe, QR, reçu de paiement
  export-pdf.js         export PDF, rapport mensuel, tarifs
  cloture-caisse.js     clôture quotidienne (v13.84)
  cahier-jaune.js       cahier jaune (v13.86)
  qr-generator.js       bibliothèque QR embarquée — ne pas modifier
  pwa-manifest.js       manifest PWA généré
vendor/             bibliothèques hébergées localement (~1,7 Mo)
.github/workflows/  intégration continue (tests à chaque push + 06h17 UTC)
tests/              16 fichiers, 479 contrôles
sw.js               service worker — APP_VERSION 13.92, CACHE cpmi-labo-v67
```

### 🚨 RÈGLES À NE PAS ENFREINDRE

1. **Les `<script>` sont des scripts CLASSIQUES, pas des modules ES.** Le HTML
   contient des centaines de `onclick="..."` qui résolvent leurs fonctions
   dans la portée globale. Passer en modules ES les casserait tous d'un coup,
   silencieusement.

2. **L'ordre des balises `<script>` dans `index.html` est critique.** Le
   hoisting ne traverse pas les fichiers, et plusieurs instructions
   s'exécutent au chargement (dont `initSupabase()`).

3. **Tout nouveau fichier `js/` ou `css/` doit entrer dans le `PRECACHE` de
   `sw.js`**, sinon l'app casse hors-ligne. `tests/pwa.test.js` le vérifie.

4. **Bumper `APP_VERSION` et `CACHE` dans `sw.js`, et les `?v=` dans
   `index.html` et `login.html`, à chaque déploiement.**
   `tests/deploiement.test.js` refuse une version incohérente entre les trois.

5. **Ne jamais recharger la page automatiquement.** Une saisie patient en
   cours serait perdue. La bannière de mise à jour demande confirmation.

6. **Les deux sites partagent le domaine `madarasenku.github.io`**, donc le
   `localStorage` et le cache du service worker. Sur la branche `site-v2`,
   toutes les clés sont préfixées `v2_` et le cache est renommé. Toute
   nouvelle clé de stockage doit être ajoutée à cette liste, sinon le jeton de
   session traversera d'une base à l'autre.

---

## 🧪 TESTS — à lancer AVANT et APRÈS toute modification

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/run.js          # ~8 minutes, code de sortie non nul si échec
```

**Aucun test ne touche la production** : les appels `**/rest/v1/rpc/**` sont
interceptés. Le détail de la couverture est dans `tests/README.md`, qui
contient aussi les **cinq pièges** rencontrés en les écrivant. Les trois qui
coûtent le plus cher à redécouvrir :

- `labo_resultats.created_by` contient le **nom d'utilisateur** (texte), pas
  un id numérique. Un jeu de données qui y met un id fait silencieusement
  disparaître toutes les fiches d'un agent.
- `refreshDB` **écrase** `restrictedBy` avec le RPC `get_restriction_status`.
  Un jeu qui pose `restricted_by` sans alimenter ce RPC voit sa fiche
  redevenir visible — et le contrôle « les verrouillés sont hors recette » ne
  teste alors plus rien.
- Le séparateur de milliers de `toLocaleString('fr-FR')` est une **espace
  insécable étroite (U+202F)**. Chercher `'20 000 FCFA'` échoue sur un
  document parfaitement juste. Utiliser `/20\s?000/`. *Je suis tombé deux fois
  dans celui-là, la seconde après l'avoir moi-même documenté.*

Et la règle qui les résume : **un test vert ne prouve rien tant qu'on ne l'a
pas vu rouge.** Chaque garde-fou de cette suite a été validé en le cassant
volontairement. `_sb` est déclaré avec `let` : il n'existe pas sur `window`,
il faut écrire `_sb.rpc = …`.

---

## 🔒 SÉCURITÉ SERVEUR

Les tests couvrent la logique client ; ils ne peuvent pas prouver qu'un rôle
est cloisonné **dans la base**. Ce contrôle vit donc dans la base elle-même :
la fonction **`auditer_securite`**, lancée depuis Administration → Sauvegarde
→ Audit de sécurité. Elle vérifie sur le serveur réel que toute fonction
joignable sans être connecté exige un jeton (seules exceptions assumées :
`login_user` et `get_public_result`), que toutes les tables ont RLS, et
qu'aucun mot de passe ne reste sur un bcrypt faible.

**À lancer après chaque déploiement touchant la base.** Au 11 août, les deux
projets passent l'audit sans aucune remarque, et les 4 comptes sont en
bcrypt coût 12.

⚠️ Piège vérifié à la dure : un `REVOKE ... FROM anon` peut n'avoir **aucun
effet** si le droit vient de `PUBLIC` (`=X/postgres` dans `proacl`). Écrire
`revoke ... from public, anon, authenticated`, et **vérifier** plutôt que
supposer. Trois fonctions que j'avais moi-même écrites étaient exposées sans
jeton, dont une que j'avais pourtant déjà supprimée et qui était réapparue.

### Tâches planifiées (pg_cron), identiques sur les deux projets
| Heure UTC | Fonction | Rôle |
|---|---|---|
| `0 23 * * *` | `run_daily_backup()` | instantané nocturne, 15 jours de rétention |
| `30 23 * * *` | `liberer_numeros_verrouilles()` | libère le numéro d'un dossier verrouillé depuis 14 jours |

---

## 💛 LE CAHIER JAUNE — la partie la moins évidente

C'est la reproduction du cahier Excel du laboratoire, où l'on note l'argent
qui revient au personnel. Un **bilan prénatal interne** facturé 10 000 FCFA se
répartit 5 000 pour les sages-femmes, 5 000 pour le labo — d'où le report
automatique de 10 000 dans la colonne `SFPMI`, par les déclencheurs
`trg_bpn_cahier_insert` / `trg_bpn_cahier_update`.

Trois décisions qui ne se devinent pas en lisant le code :

- **Le report ne remonte pas avant le 10 août 2026.** Les mois antérieurs sont
  déjà tenus dans le cahier Excel : reporter l'historique créerait des doublons
  avec un registre papier qu'on ne voit pas d'ici.
- **Le montant reporté est le montant réel du dossier, pas 10 000 en dur.**
  Le tarif catalogue du BPN est 20 000 ; les écarts constatés sont des
  réductions consenties volontairement, et elles doivent se retrouver telles
  quelles dans le cahier.
- **Les BPN internes restent visibles et comptés dans la caisse.** La v13.89
  les avait masqués partout ; ça les a fait disparaître de « À encaisser » et
  le caissier ne pouvait plus les encaisser. Rollback en v13.91. Les fiches
  **verrouillées**, elles, sortent bien de la recette du jour — c'est voulu.

Le partage est décidé par l'admin (Cahier jaune → Partage) : profils
autorisés et période. Par défaut, personne d'autre que l'admin ne voit
l'onglet.

---

## 🚫 LES DOSSIERS VERROUILLÉS NE SE TOUCHENT PAS

Un dossier verrouillé l'est **volontairement**, par l'administrateur, qui est
le seul à pouvoir le faire depuis la v13.82. Il sort de la recette du jour,
de « À encaisser », du cahier jaune et de tout comptage — **c'est le
comportement voulu, pas un bug**.

Donc : ne pas les régulariser, ne pas les encaisser, ne pas les compter, et
**ne pas les signaler comme une anomalie**. Un dossier sans statut de
paiement qui est verrouillé n'est pas un oubli : c'est un dossier mis de
côté.

Madara a dû le redire plusieurs fois. Si un état des lieux fait apparaître
des fiches verrouillées, la bonne réponse est de les écarter en silence.

---

## ⚠️ AUTRES PIÈGES DÉCOUVERTS À LA DURE

0. **Supabase rejette tout UPDATE/DELETE sans WHERE — mais seulement par
   l'API.** Le rôle `postgres` (appels directs, `execute_sql`, l'éditeur SQL)
   n'a pas ce garde-fou ; les rôles `anon`/`authenticated` (le navigateur) si.
   Piège maximal : une fonction SECURITY DEFINER avec un `update … set … ;`
   sans WHERE répond **`ok`** depuis un test SQL et **`400 — UPDATE requires a
   WHERE clause`** depuis l'application. Ne jamais valider une fonction
   joignable par le client uniquement en SQL : la tester par le chemin réel,
   ou relire chaque UPDATE/DELETE. (`definir_code_coffre`, v13.106.)


1. **`setval` n'est PAS transactionnel.** Un `setval` exécuté dans une
   transaction annulée laisse quand même la séquence déplacée. La séquence des
   dossiers a sauté à 9 999 001 comme ça, et il a fallu la remettre à la main.

2. **`labo_resultats.id` est `GENERATED ALWAYS AS IDENTITY`** : toute
   restauration doit passer par `OVERRIDING SYSTEM VALUE`, puis recaler la
   séquence.

3. **`est_bpn` vaut `false` sur les 41 fiches prénatales existantes.** La
   détection d'un BPN passe par le libellé de l'examen coché (`/pr[ée]natal/i`),
   pas par cette colonne.

4. **Une fonction RPC doit renvoyer la ligne, pas `'ok'`.** Un mock de test
   qui renvoyait `'ok'` pour `update_resultat` a mis `patient: undefined` dans
   le cache et fait tomber tout l'Historique. Le vrai défaut n'était pas le
   mock : le client faisait confiance à la réponse du serveur sans la
   contrôler. Un garde-fou a été ajouté dans `updateRecordRemote`.

5. **`_dbCache` contient TOUTES les fiches** depuis la v13.68, chaque vue
   filtre côté client. Ne pas réintroduire de filtrage par date côté serveur
   dans `refreshDB` : c'était la cause du bug des ristournes d'un mois passé.

6. **Une action groupée doit faire UN appel serveur, pas un par fiche.**
   Mesuré dans le journal d'audit de production : 966 appels pour 483 fiches.
   Et l'écran ne doit jamais afficher un changement que la base a refusé —
   `tests/actions-groupees.test.js` verrouille les deux.

---

## 📜 CE QUI A ÉTÉ FAIT DEPUIS LA v13.70

**v13.71 → v13.78** — nettoyage du repli QR, durcissements divers.

**v13.79** — retour arrière depuis les instantanés nocturnes : lister les
dates, comparer sans rien écrire, remettre les fiches disparues, réparer une
fiche isolée.

**v13.80** — durcissement du serveur et audit de sécurité permanent. Fuite de
données corrigée dans `get_public_result` : il renvoyait 13 champs, il en
renvoie 6, en liste blanche stricte.

**v13.81** — actions groupées en un seul appel (voir piège 6).

**v13.82** — verrouillage réservé à l'admin, suppression ouverte à tous.

**v13.83** — un dossier verrouillé rend son numéro au bout de deux semaines,
avec une trace dans l'audit : sans elle, deux dossiers portant le même numéro
deviendraient inexplicables.

**v13.84 → v13.85** — clôture de caisse quotidienne, imprimable et signable,
avec le détail nominatif (nom, âge, prescripteur, examens, somme payée) et
« BPN » affiché à la place des cinq analyses du forfait.

**v13.86 → v13.88** — le cahier jaune : onglet, détail nominatif avec numéro
d'ordre mensuel, correction et suppression d'une écriture.

**v13.89 → v13.91** — masquage des BPN internes, puis **rollback** (voir plus
haut). C'est la seule régression fonctionnelle de la série, signalée par
Madara en une phrase : « je ne vois pas les bpn ».

**v13.92** — restauration par l'auteur pendant 24 h, et partage du cahier
jaune décidé par l'admin (profils + période).

**Non commité sur `main`** — la branche `site-v2` : base Supabase distincte,
bandeau d'identification, cloisonnement du `localStorage`.

### Régularisation du 10 août
Les **106 dossiers impayés** (607 500 FCFA) étaient tous verrouillés, et un
dossier verrouillé sort de « À encaisser » : le caissier ne pouvait pas les
voir. Ils ont été passés payés + rendus, datés chacun à sa propre date, avec
un marqueur `regularisation: true` pour qu'ils restent identifiables.

---

## 💡 PISTES POUR LA SUITE

- **Pousser la branche `site-v2`** (voir la section rouge en haut). C'est le
  seul point réellement ouvert.
- **Sauvegarde manuelle** : la dernière remonte au 9 août (635 fiches). Elle
  se fait depuis Administration → Sauvegarde, et le fichier descend sur le
  disque de l'admin — il n'est jamais commité.
- **Signatures manuscrites du second projet** : non recopiées (images base64
  volumineuses). Elles se redéfinissent depuis Administration.
- Étendre les tests au rendu visuel — le seul angle mort qui reste.
