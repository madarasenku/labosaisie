# Sites des laboratoires clients

Copies de l'application à un autre nom, une par laboratoire client :

| Copie | Adresse | Configuration | État |
|---|---|---|---|
| `labo-1` | `…/labosaisie/clients/labo-1/` | `clients/config/labo-1.json` | inactive |
| `labo-2` | `…/labosaisie/clients/labo-2/` | `clients/config/labo-2.json` | inactive |

Une copie **inactive** affiche « Service en cours d'activation » au nom du laboratoire :
aucun code de l'application ne s'exécute, aucune base n'est appelée.

Chaque copie a son propre stockage du navigateur (`client-<nom>:`) et son propre cache
hors-ligne : plusieurs sites sur le même domaine ne se mélangent pas. Une copie client
**refuse** d'être branchée sur la base de production ou de test du CPMI.

## Activer un client (le jour où il signe)

1. **Base de données** — créer un projet Supabase pour ce laboratoire
   (le plan gratuit est limité à 2 projets, déjà utilisés : il faudra une offre payante).
   Puis *Database → Extensions* : activer **pg_cron** (sauvegarde de 23 h, libération des numéros).
2. **Installation** — *SQL Editor → New query* : coller TOUT le fichier
   `LaboSaisie-installation-base-client-v<version>.sql` → *Run*.
   Ce fichier est **confidentiel** (toute la partie serveur) : il est gardé par l'auteur,
   **jamais** dans ce dépôt. À la fin s'affiche le mot de passe provisoire du compte `admin`.
3. **Clés** — *Settings → API* : copier l'adresse du projet (*Project URL*) et la clé
   publique (*publishable key*).
4. **Configuration** — remplir `clients/config/<client>.json` :
   ```json
   {
     "nom": "Laboratoire Exemple",
     "nom_court": "Labo Exemple",
     "sigle": "Exemple",
     "sous_titre": "Laboratoire d’analyses médicales",
     "lieu": "Abidjan, Côte d’Ivoire",
     "prefixe_references": "EXE",
     "supabase_url": "https://xxxxxxxx.supabase.co",
     "supabase_cle": "sb_publishable_…",
     "actif": true
   }
   ```
5. **Construire et vérifier** :
   ```
   node scripts/construire-client.js <client>
   node tests/clients.test.js
   ```
   puis publier (PR → fusion) comme toute mise à jour.
6. **Remise au laboratoire** — adresse du site + compte `admin` et mot de passe provisoire
   (changé à la première connexion). Le laboratoire crée ensuite ses comptes, ses tarifs,
   ses prescripteurs et ses normes depuis l'écran Administration.

## Mettre un client à jour

- **Site** : relancer `node scripts/construire-client.js <client>` (reprend la version actuelle).
- **Base** : toute évolution de la base faite pour le CPMI doit aussi être appliquée à la base
  de chaque client actif, dans le même ordre.

## À savoir

- Certaines règles viennent du CPMI et peuvent être à adapter : horaires de permanence et de
  garde, caisse noire (réservée à un compte nommé `__compte_reserve__` dans les copies clients),
  structure « Maternité » considérée comme interne dans le registre.
- Le dépôt est public : ces copies et leurs adresses sont visibles. Pour la version commerciale,
  voir `docs/A_REPRENDRE.md` (dépôt privé, partie écran brouillée, contrat d'abonnement).
