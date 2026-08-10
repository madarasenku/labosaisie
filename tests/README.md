# Tests automatisés — LaboSaisie CPMI

Suite de tests de bout en bout qui pilote un vrai navigateur (Chromium via
Playwright) sur l'application réelle.

## Lancer les tests

```bash
npm install --no-save playwright
npx playwright install chromium
node tests/run.js
```

`tests/run.js` exécute tous les fichiers `*.test.js` et renvoie un code de
sortie non nul si l'un d'eux échoue — utilisable tel quel dans une CI.

Pour un seul fichier :

```bash
node tests/filtres.test.js
```

## Ce qui est couvert

| Fichier | Portée |
|---|---|
| `filtres.test.js` | Périodes, type, agent, service, statut, recherche texte, cumul de filtres, Statistiques, Caisse, Ristournes, corbeille et fiches verrouillées |
| `roles.test.js` | Cloisonnement admin / caissier / agent, caisse personnelle |
| `pwa.test.js` | Service worker, pré-cache, mode hors-ligne, bannière de mise à jour |
| `qr.test.js` | Génération des QR (reçus, Excel, PDF) — format, densité, cas limites |
| `navigation-periode.test.js` | Historique : flèches ◀ ▶ mois/semaine/jour, saut direct par mois, interdiction du futur |
| `navigation-autres-onglets.test.js` | Même navigation sur Statistiques, Caisse et Caisse personnelle |
| `deploiement.test.js` | Versionnement des actifs (`?v=`), cohérence index/login/sw, précache complet |
| `sauvegarde-examens.test.js` | Export complet (contenu, avertissement de confidentialité, réservé à l'admin), examens personnalisés partagés, alerte de sauvegarde ancienne, restauration (aller-retour, non-écrasement, découpage en lots, fichiers refusés, confirmation obligatoire) |
| `droits-verrouillage-suppression.test.js` | Verrouillage réservé à l'admin (boutons masqués, appels bloqués), suppression ouverte à tous y compris au caissier, spectateur en lecture seule |
| `actions-groupees.test.js` | Statut et encaissement groupés en un seul appel, respect des refus du serveur, échec réseau sans mensonge à l'écran, spectateur bloqué |
| `securite.test.js` | Jeton exigé pour le compteur de dossiers (avec repli local), imprévisibilité du jeton de partage, restitution fidèle de l'audit serveur, audit réservé à l'admin |
| `retour-arriere.test.js` | Instantanés nocturnes : liste des dates, analyse sans écriture, remise des fiches disparues, réparation d'une fiche isolée, confirmation obligatoire, réservé à l'admin |
| `tarifs.test.js` | Grille tarifaire partagée : base prioritaire sur le catalogue, cache hors-ligne, écriture réservée à l'admin, estimation des dossiers |
| `ristournes-prescripteurs.test.js` | Flèches sur le sélecteur de mois des Ristournes (dont le passage d'année), recherche dans la liste des prescripteurs |

## Sécurité des tests

**Aucun test ne touche la base de production.** `helpers.js` intercepte les
appels `**/rest/v1/rpc/**` et renvoie un jeu de 10 fiches : 6 dans le mois
précédent, 4 dans le mois courant (dont 2 datées d'aujourd'hui), réparties
sur 2 agents, 4 types d'analyse, 3 services et 3 statuts. Ce jeu est calibré
pour qu'un filtre correct et un filtre cassé ne donnent jamais le même
nombre de lignes.

### ⚠️ Les dates sont RELATIVES, jamais écrites en dur

La première version de ces tests figeait « aujourd'hui » au 5 août 2026.
Trois jours plus tard, les contrôles « aujourd'hui » et « cette semaine »
échouaient alors que l'application était parfaitement saine. Une suite qui
devient rouge toute seule finit par être ignorée — c'est pire que pas de
tests du tout.

`helpers.js` construit donc les dates à partir de `new Date()` et exporte
un objet `ATTENDU` dont chaque valeur est **calculée** à partir du même jeu
de données, avec la même logique que `computeHistDateRange` (semaine
démarrant le lundi, mois du 1er à aujourd'hui). Les tests comparent à
`ATTENDU.jour`, `ATTENDU.mois`, `ATTENDU.ristournesPrecedent`… et jamais à
un nombre écrit à la main.

Si tu ajoutes un contrôle qui dépend d'une date, dérive l'attendu de
`FICHES` ou de `ATTENDU`. N'écris jamais `'2026-08-05'` dans un test.

Les tests servent le dépôt sur `127.0.0.1:8099` via un petit serveur HTTP
interne — pas de dépendance à un serveur externe.

## Régressions verrouillées par cette suite

- **v13.68** — les Ristournes et le rapport d'un mois passé revenaient vides
  parce que le cache ne contenait que la période affichée dans l'Historique.
  `filtres.test.js` vérifie explicitement juillet *et* août.
- **v13.67** — un poste laissant l'application ouverte toute la journée ne
  voyait jamais les nouvelles versions. `pwa.test.js` vérifie que la bannière
  apparaît après un déploiement, et qu'elle ne recharge **jamais** sans
  confirmation (une saisie patient en cours serait perdue).
- **v13.69** — le pré-cache ne doit contenir que des ressources same-origin ;
  plus aucune dépendance CDN ne peut le mettre en échec.
- **v13.81** — une action groupée envoyait **deux** appels serveur par fiche
  (l'appel direct, plus un second déclenché par la mise à jour locale), et
  redessinait tout l'historique à chaque itération. Mesuré dans le journal
  d'audit de production : 966 appels pour 483 fiches.
  `actions-groupees.test.js` verrouille l'appel unique et, surtout, vérifie
  que l'écran n'affiche jamais un changement que la base a refusé.
- **v13.71** — le repli vers QRCode.js a été supprimé : il n'existe plus
  qu'une seule implémentation QR, donc plus de filet. `qr.test.js` vérifie
  que le générateur produit bien un PNG carré, de densité cohérente, et
  qu'il encaisse les cas limites (texte vide, texte de 5 000 caractères).

## Trois pièges rencontrés en écrivant ces tests

1. `labo_resultats.created_by` contient le **nom d'utilisateur** (texte), pas
   un identifiant numérique. Un jeu de données qui y met un `id` fait
   silencieusement disparaître toutes les fiches d'un agent.
2. Le sélecteur de mois du rapport PDF vit dans l'onglet **Comptes** et n'est
   peuplé qu'à son ouverture. Le tester sans passer par cet onglet fait
   retomber le rapport sur le mois courant sans aucune erreur.
3. **Un test vert ne prouve rien tant qu'on ne l'a pas vu rouge.** Les
   contrôles « fichier de sauvegarde refusé » passaient au vert même après
   avoir supprimé toute la validation : le code partait ensuite en erreur de
   son côté, et le test ne regardait que l'absence d'écriture. Ils comptent
   désormais **tous** les appels réseau et vérifient le message exact. Chaque
   nouveau garde-fou de cette suite a été validé en le cassant volontairement
   pour voir le test échouer. `_sb` est déclaré avec `let` : il n'existe pas
   sur `window`, il faut écrire `_sb.rpc = …` et non `window._sb.rpc = …`.

## Ce qui n'est pas couvert

Ces tests portent sur la logique client : ils ne vérifient pas le rendu
visuel, et ils ne peuvent pas prouver qu'un rôle est réellement cloisonné
**dans la base** — seulement dans l'interface.

Ce trou est désormais couvert ailleurs, et volontairement : la vérification
des permissions serveur ne peut pas vivre ici. Une suite de tests tourne en
intégration continue, sans accès à la base de production — et lui donner cet
accès serait pire que le trou qu'on cherche à boucher.

Le contrôle vit donc **dans la base elle-même**, sous la forme de la fonction
`auditer_securite`, lancée depuis Administration → Sauvegarde → Audit de
sécurité. Elle vérifie sur le serveur réel que toute fonction joignable sans
être connecté exige un jeton de session (seules exceptions assumées :
`login_user` et `get_public_result`), que toutes les tables ont la sécurité au
niveau ligne, et qu'aucun mot de passe ne reste sur un hachage bcrypt faible.
`securite.test.js` vérifie que cet audit est correctement restitué — qu'un
échec s'affiche comme un échec — mais c'est le serveur qui juge.

**À lancer après chaque déploiement touchant la base.**
