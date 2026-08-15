# 📋 PASSATION — Site secondaire LaboSaisie (labosaisie-v2)

> **Pour Madara** : ouvre une nouvelle tâche Cowork **dédiée au v2**, colle ce
> document, et **joins-y l'archive `labosaisie-v2.zip`**. Ce dernier point
> n'est pas optionnel : lis la section rouge ci-dessous avant tout.
>
> La session principale (dépôt `labosaisie`, le laboratoire réel) continue
> ailleurs. Ici, on ne touche **que** au v2.

---

## 🔴 À LIRE EN PREMIER — deux choses

### 1. Le site v2 en ligne parle à la base de PRODUCTION

`https://madarasenku.github.io/labosaisie-v2/` a été publié à partir d'une
copie conforme du site principal, **avant** qu'on lui donne sa propre base.
Il pointe donc encore sur `uvxxbihlagfncraokqlg`, sans bandeau, sans rien qui
le distingue du vrai site. Quelqu'un qui ouvre ce lien saisit dans les vraies
fiches patients en croyant être sur un bac à sable.

C'est la première chose à corriger. Deux façons :

- **Publier le contenu de l'archive** (voir plus bas) — le site pointe alors
  sur sa propre base et affiche un bandeau orange.
- **Ou couper la publication en attendant** : dépôt `labosaisie-v2` →
  Settings → Pages → Source → **None**.

### 2. Le code n'existe que dans l'archive

Trois commits ont été faits dans la session du 11 août mais **n'ont jamais pu
être poussés** : le relais Git de cette session n'avait pas les dépôts dans
ses sources autorisées, et le conteneur est effacé à la fin de la session.

| Commit | Contenu | État |
|---|---|---|
| `a41c552` | passation v13.92 (dépôt principal) | perdu, à refaire |
| `6ad35c0` | site secondaire : base distincte, bandeau, cloisonnement | **dans l'archive** |
| `cdf44d9` | portail du soignant | **dans l'archive** |

👉 **`labosaisie-v2.zip` contient l'arbre complet et à jour** (69 fichiers,
version 13.93). C'est la seule copie. Joins-la à la nouvelle tâche, ou
décompresse-la et publie-la à la main.

**Pour que la nouvelle session puisse pousser toute seule** : au moment où tu
crées la tâche, attache `madarasenku/labosaisie-v2` **en écriture**. Sans ça,
le même blocage recommencera.

⚠️ **Le dépôt est PUBLIC.** Aucune donnée patient ne doit y être commitée.

---

## 🔗 COORDONNÉES

| | |
|---|---|
| **Dépôt** | `github.com/madarasenku/labosaisie-v2` — branche `main`, **public** |
| **Site** | `https://madarasenku.github.io/labosaisie-v2/` |
| **Supabase** | `ftwsxdivwoczsreiohok` · eu-west-1 · Postgres 17 · 0 $/mois |
| **Version** | 13.93 · `CACHE = cpmi-labo-V2-v68` |
| **Site principal, à ne pas toucher d'ici** | dépôt `labosaisie`, base `uvxxbihlagfncraokqlg` |

Le compte GitHub est **`madarasenku`**, pas `madarauchiwa0705`. Une session
entière a déjà été perdue sur cette confusion.

---

## 🎯 À QUOI SERT CE SITE

C'est le **banc d'essai**. Le laboratoire réel tourne sur le site principal ;
ici, on développe et on fait essayer les nouveautés avant de les reporter.
Madara a dit : « j'ai fini avec labosaisie, je veux faire un autre projet mais
avec labosaisie comme base ». Ce dépôt est ce point de départ.

Ce que le socle offre déjà, réutilisable tel quel : authentification avec
anti-bruteforce et bcrypt coût 12, cinq rôles, PWA hors-ligne, exports Excel
et PDF, générateur de QR, caisse et clôture, cahier jaune, sauvegardes
nocturnes, audit de sécurité, et 514 contrôles automatisés.

**La base ne contient aucune fiche patient réelle** — seulement les comptes,
les 25 prescripteurs, la grille tarifaire, les colonnes du cahier jaune, et
quelques patients fictifs d'essai.

---

## ✅ CE QUI EST DÉJÀ FAIT ET NE DOIT PAS ÊTRE REFAIT

### La base est clonée intégralement (côté serveur, donc conservé)

15 migrations appliquées, de `schema_base_tables` à
`realigner_les_gardes_sur_la_production` : 15 tables avec contraintes, index
et RLS, **71 fonctions** identiques à la production, les deux déclencheurs du
cahier jaune, les droits, et deux tâches pg_cron (sauvegarde à 23 h UTC,
libération des numéros verrouillés à 23 h 30).

Tout cela vit dans le projet Supabase et **survit à la fin de la session**.
Ne pas rejouer ces migrations.

### Trois différences volontaires avec le site principal

**L'adresse Supabase et la clé publique** pointent vers `ftwsxdivwoczsreiohok`
(`js/supabase-db.js`, `login.html`, `soignant.html`).

**Un bandeau orange** est écrit **en dur dans le HTML**, avant tout script. S'il
était posé par JavaScript, il disparaîtrait précisément quand la page est à
moitié cassée — c'est-à-dire au moment où l'on risque le plus de confondre les
deux sites.

**Les clés de `localStorage` sont préfixées `v2_`.** C'est le point le moins
visible et le plus important : les deux sites vivent sur le **même domaine**
(`madarasenku.github.io`), donc le `localStorage` et le cache du service worker
y sont partagés. Sans préfixe, le jeton de session du site principal serait
relu ici et envoyé à la mauvaise base, et la file de synchronisation
hors-ligne pourrait déverser des fiches dans le mauvais projet.
👉 **Toute nouvelle clé de stockage doit être préfixée `v2_`.**

---

## 👩‍⚕️ LE PORTAIL DU SOIGNANT (la nouveauté du 11 août)

Chaque infirmier et médecin du centre a son compte et voit **ses propres
prescriptions**, sur une page à lui : `soignant.html`.

Décisions prises par Madara, à ne pas réinterpréter :

- **Périmètre** — chacun ne voit que les patients qu'il a lui-même adressés au
  laboratoire. Pas son service, pas le centre entier.
- **Moment** — les valeurs sont visibles **dès la saisie**, pour l'urgence,
  avec un avertissement obligatoire tant que la fiche n'est pas rendue. Sans
  cet avertissement, un chiffre provisoire serait recopié comme définitif :
  c'est la raison d'être du bandeau jaune dans le détail.
- **Accès** — comptes nominatifs pour les soignants du centre, **et** le
  lien/QR par patient qui existait déjà, pour les médecins extérieurs.

### Comment c'est cloisonné

Un compte de rôle `prescripteur` porte un `prescripteur_id` qui le rattache à
sa fiche dans `labo_prescripteurs`. **C'est ce lien, et lui seul, qui décide
de ce qu'il voit** — jamais le nom d'utilisateur, qui peut être ressaisi
autrement.

Deux fonctions serveur, et rien d'autre :

- `get_mes_prescriptions(token, du, au)` — la liste. Sans montant, sans
  prescripteur_id, sans valeurs d'analyse. Les dossiers verrouillés et
  supprimés en sortent.
- `get_prescription_full(token, id)` — le détail d'**une** fiche, valeurs
  comprises, avec un booléen `valide`. Chaque appel écrit une ligne
  `consultation_soignant` dans le journal d'audit : le jour où l'on demande
  qui a lu quel dossier, on peut répondre.

`prescripteur_from_token` est la garde ; elle renvoie NULL pour tous les
autres rôles et n'est **pas** exposée au navigateur.

`soignant.html` est volontairement autonome : elle ne charge ni `app.css`, ni
les modules du laboratoire, ni le cache global. Un test vérifie qu'elle
n'appelle **que** ses deux fonctions.

### ⚠️ La leçon la plus chère de cette session

**Ajouter un rôle ferme des portes autant qu'il en ouvre.** En essayant chaque
fonction du serveur avec le jeton d'un soignant — pas en relisant le code —
cinq fonctions se sont révélées ouvertes, dont **deux en écriture** : il
pouvait **créer** une fiche (`insert_resultat`) et en **supprimer** une
(`soft_delete_dossier`). Les trois autres lui donnaient la grille tarifaire,
la liste des confrères avec leurs **taux de ristourne**, et la cartographie
des dossiers supprimés ou verrouillés.

La cause était toujours la même formulation : « tout le monde **sauf** le
spectateur ». Elle marchait avec quatre rôles ; au cinquième, elle s'est
retournée. C'est désormais une **liste blanche** partout : on nomme qui a le
droit, pas qui ne l'a pas. Le helper `est_personnel_labo(token)` sert à ça.

👉 **À refaire à chaque nouveau rôle** : essayer toutes les fonctions avec son
jeton, une par une, et regarder ce qui répond autre chose qu'un refus.

### L'audit de sécurité a dû être réparé aussi

`auditer_securite` cherchait quatre noms de garde écrits en dur et signalait
donc sept fonctions parfaitement saines. Un audit qui crie au loup finit
ignoré — et ce sera le jour où il aura raison. Il **déduit** maintenant ses
gardes : niveau 1, les fonctions qui interrogent `labo_sessions` ; niveau 2,
celles qui ne sont qu'un habillage des premières. On s'arrête à deux niveaux
volontairement : au-delà, « appeler une fonction gardée » passerait pour
« vérifier le jeton », et l'audit deviendrait complaisant.

**Au 11 août, l'audit du projet v2 est vierge** : aucune fonction sans
contrôle de jeton, aucune table sans RLS, aucun mot de passe faible.
À relancer après chaque déploiement touchant la base (Administration →
Sauvegarde → Audit de sécurité).

### Comptes et données d'essai déjà en place

| Compte | Rôle | Rattaché à | Mot de passe |
|---|---|---|---|
| `admin` | admin | — | celui de la production |
| `sf.athe` | prescripteur | SFDE ATHE KACOU (id 15) | `motdepasse123` |
| `dr.kouman` | prescripteur | DR KOUMAN (id 5) | `motdepasse123` |

Quatre patients fictifs (« ESSAI … ») : deux pour `sf.athe` dont un **en
cours**, un pour `dr.kouman`, et un **verrouillé** que personne ne doit voir.
C'est le jeu de démonstration du cloisonnement — ne pas le supprimer sans
raison.

Les mots de passe des comptes du laboratoire sont les **mêmes qu'en
production**. Les signatures manuscrites n'ont pas été recopiées (images
volumineuses) ; elles se redéfinissent depuis Administration.

---

## 🧪 TESTS — à lancer AVANT et APRÈS toute modification

```bash
npm install --no-save playwright && npx playwright install chromium
node tests/run.js     # ~8 min, code de sortie non nul si échec
```

**514 contrôles sur 17 fichiers**, dont `portail-soignant.test.js` (32).
Aucun test ne touche une base réelle : les appels RPC sont interceptés.

Le détail et les pièges sont dans `tests/README.md`. Les trois qui coûtent le
plus cher à redécouvrir :

- `labo_resultats.created_by` contient le **nom d'utilisateur** (texte), pas
  un id numérique.
- `refreshDB` **écrase** `restrictedBy` avec `get_restriction_status` : un jeu
  de données qui pose `restricted_by` sans alimenter ce RPC voit sa fiche
  redevenir visible, et le contrôle censé la cacher ne teste plus rien.
- Le séparateur de milliers de `toLocaleString('fr-FR')` est une **espace
  insécable étroite (U+202F)** : chercher `'20 000 FCFA'` échoue sur un
  document juste. Utiliser `/20\s?000/`.

Et la règle qui les résume : **un test vert ne prouve rien tant qu'on ne l'a
pas vu rouge.** Les quatre garde-fous du portail ont été cassés un par un pour
vérifier que le test devient rouge — et la première série a dû être refaite,
elle échouait sur un module introuvable et non sur les gardes. *Un rouge pour
la mauvaise raison ne prouve rien non plus.*

---

## 🚨 RÈGLES À NE PAS ENFREINDRE

1. **Les `<script>` sont des scripts CLASSIQUES, pas des modules ES.** Des
   centaines de `onclick="..."` résolvent leurs fonctions dans la portée
   globale ; passer en modules ES les casserait tous d'un coup, en silence.
2. **L'ordre des `<script>` dans `index.html` est critique** — le hoisting ne
   traverse pas les fichiers.
3. **Tout nouveau fichier `js/` ou `css/` doit entrer dans le `PRECACHE` de
   `sw.js`**, sinon l'app casse hors-ligne. `tests/pwa.test.js` le vérifie.
4. **Bumper `APP_VERSION` et `CACHE` dans `sw.js`, et les `?v=` dans
   `index.html`, `login.html` et `soignant.html`** à chaque déploiement.
   `tests/deploiement.test.js` refuse une version incohérente.
5. **Ne jamais recharger la page automatiquement** — une saisie patient en
   cours serait perdue.
6. **Préfixer `v2_` toute nouvelle clé de `localStorage`** (voir plus haut).
7. **Ne jamais commiter de données patient** — le dépôt est public.

---

## 💡 CE QUI RESTE À FAIRE

- **Publier le contenu de l'archive** et vérifier que le bandeau orange
  apparaît bien sur `madarasenku.github.io/labosaisie-v2/`. C'est ce qui
  referme le risque n°1.
- **Essayer le portail pour de vrai** : se connecter en `sf.athe`, puis en
  `dr.kouman`, et vérifier qu'aucun des deux ne voit les patients de l'autre
  ni la fiche verrouillée. Le dernier maillon — un navigateur qui appelle
  Supabase — n'a jamais pu être testé depuis le bac à sable de Claude, qui
  n'a pas de route réseau vers Supabase.
- **Décider du nouveau projet.** Madara veut construire autre chose sur cette
  base. Les pistes évoquées : la pharmacie du centre (stock, péremption,
  alertes de seuil — le plus gros réemploi), la caisse générale du CPMI (le
  plus petit pas), le suivi prénatal, la vaccination des enfants. Rien n'est
  tranché — lui demander, et se rappeler que la meilleure idée est souvent
  celle qui l'agace déjà, pas celle qui sonne bien.
