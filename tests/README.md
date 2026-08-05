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

## Sécurité des tests

**Aucun test ne touche la base de production.** `helpers.js` intercepte les
appels `**/rest/v1/rpc/**` et renvoie un jeu de données fixe : 10 fiches,
6 en juillet 2026 et 4 en août 2026, réparties sur 2 agents, 4 types
d'analyse, 3 services et 3 statuts. Ce jeu est calibré pour qu'un filtre
correct et un filtre cassé ne donnent jamais le même nombre de lignes.

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

## Deux pièges rencontrés en écrivant ces tests

1. `labo_resultats.created_by` contient le **nom d'utilisateur** (texte), pas
   un identifiant numérique. Un jeu de données qui y met un `id` fait
   silencieusement disparaître toutes les fiches d'un agent.
2. Le sélecteur de mois du rapport PDF vit dans l'onglet **Comptes** et n'est
   peuplé qu'à son ouverture. Le tester sans passer par cet onglet fait
   retomber le rapport sur le mois courant sans aucune erreur.

## Ce qui n'est pas couvert

Ces tests portent sur la logique client. Ils ne vérifient ni les permissions
réelles côté serveur, ni les politiques RLS, ni le rendu visuel. Un test qui
passe ne garantit pas qu'un rôle est correctement cloisonné **dans la base** —
seulement dans l'interface.
