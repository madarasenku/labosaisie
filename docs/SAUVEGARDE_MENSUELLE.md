# Le 10 de chaque mois : sauvegarde et archive

Le mois précédent est alors entièrement saisi. Le rappel apparaît sur l'Accueil
de l'administrateur à partir du 10, tant que la sauvegarde du mois n'est pas faite.

| | 💾 Sauvegarde | 📦 Archive du mois |
|---|---|---|
| Sert à | **restaurer** la base (extrême nécessité) | **lire** : patient qui revient, contestation, contrôle |
| Contenu | toute la base, en un fichier technique `.json` | le mois précédent, en documents ouverts sans l'application |
| Où | Administration › Sauvegarde, ou bouton du rappel | même carte, ou bouton « 📦 Archive du mois » du rappel |

## Ordre conseillé

1. Se connecter **avec le second mot de passe** : sans lui, les dossiers masqués
   n'arrivent pas dans l'application et l'archive le signale (« masqués non inclus »).
2. 💾 **Sauvegarder maintenant** → fichier `labosaisie-sauvegarde-AAAAMMJJ-HHMM.json`.
3. 📦 **Archive du mois** (mois précédent proposé) → `LaboSaisie_Archive_AAAA-MM_Mois.zip`.
4. Ranger les deux fichiers sur Google Drive **et** sur une clé USB.

## Ce que contient l'archive

- `0_Sommaire.html` : tous les dossiers du mois, recherche par nom ou numéro, lien vers chaque compte rendu.
- `1_Registre_du_mois.html` : registre jour par jour, permanence et garde séparées.
- `2_Caisse_et_statistiques.html` : recette, clôture jour par jour, agents, prestations,
  prescripteurs et ristournes, réductions, non encaissés, monnaie non rendue, masqués.
- `3_Registre_et_caisse.xlsx` : les mêmes chiffres en tableur.
- `4_Rapport_activite.pdf` : le rapport d'activité mensuel.
- `Comptes-rendus/` : un compte rendu par dossier (masqués compris), identique à
  l'impression ; menu du navigateur › Imprimer pour l'imprimer ou en faire un PDF.

Le mois = les journées de service du 1er au dernier jour (la garde du dernier jour,
jusqu'à 8h le lendemain, en fait partie), comme pour la clôture de caisse.
Les dossiers supprimés n'y figurent pas.

Données médicales nominatives : ne jamais déposer ces fichiers dans ce dépôt public.
