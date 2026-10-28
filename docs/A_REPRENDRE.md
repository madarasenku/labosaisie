# À reprendre plus tard

Points mis en attente le 27/10/2026, à la demande de l'administrateur.
(Dépôt public : aucun nom de patient ni mot de passe ici.)

## Après la mise en ligne de la v13.266 (lecture des listes de plus de 1 000 lignes)

- [ ] Rouvrir l'appli (badge **v13.266**) et vérifier que juillet réapparaît dans l'Historique.
- [ ] Nouvelle sauvegarde (Administration → 💾 Sauvegarde) : environ 1 440 fiches attendues,
      pas 1 000. Copie sur clé USB / Drive. Supprimer le fichier du 19/10 (incomplet : 1 000 fiches).
- [ ] Tester le site démo `…/demo/` avec le compte `demo`.

## Sites des laboratoires clients

- [ ] Régénérer le SQL d'installation des bases clientes : celui de la v13.266 n'a pas
      les fonctions de la v13.268–269 (archive notée, suppression d'un mois archivé).

- [ ] Reporter aussi les corrections de la v13.270 (refus du serveur lus, file hors ligne)
      dans les sites clients, restés en v13.266, à leur prochaine mise à jour.

## Refus du serveur (revue du 28/10/2026, corrigé en v13.270)

Corrigé : encaissement, annulation (seule et groupée), monnaie remise, statut et « Terminé »
automatique, file hors ligne, corbeille et masquage relus, sauvegarde et archive notées.
Test : `tests/refus-serveur.test.js`. Reste à décider :

- [ ] La file hors ligne (saisies pas encore envoyées) reste dans le navigateur après la
      déconnexion. Données de santé sur le poste : à revoir avec le contrôle « données de santé ».
- [ ] Les autres blocs d'erreur vides (plus d'une centaine) concernent l'affichage et ne touchent pas
      aux données ; à revoir seulement si un écran semble figé.

## Sécurité

- [ ] Double authentification (2FA) sur GitHub, Supabase et Gmail — le plus important.
- [ ] Supprimer les comptes du personnel parti ; code de verrouillage sur les téléphones du labo.
- [ ] Déclaration ARTCI (données de santé, loi n° 2013-450). Demander aussi si l'hébergement
      des données en Irlande (Supabase, région eu-west-1) demande une autorisation de transfert.
      Un serveur au labo n'est PAS conseillé (pannes, vol, sauvegardes) : si un hébergement en
      Côte d'Ivoire devenait obligatoire, passer par un hébergeur professionnel local.
- [ ] GitHub Pro puis dépôt privé (le site reste à la même adresse : les QR imprimés continuent
      de fonctionner). Ne PAS passer le dépôt en privé sans abonnement : le site s'arrêterait.

## Protéger l'application (avant toute vente)

L'idée seule ne se protège pas : on protège le logiciel (droit d'auteur, automatique, loi
n° 2016-555) et le nom (marque). Aucune déclaration n'est obligatoire, mais il faut des preuves.

- [ ] Accord écrit avec la direction du CPMI : le logiciel appartient à son auteur, le CPMI
      l'utilise sous licence. Le plus important si l'appli a été faite au travail ou avec ses moyens.
- [ ] Preuve de date et de paternité : constat d'huissier / notaire (code + captures sur clé USB
      scellée) ou dépôt au BURIDA (demander la procédure pour un logiciel).
- [ ] Choisir un nom distinctif puis le déposer comme marque à l'OAPI via l'OIPI
      (couvre les 17 pays OAPI ; vérifier le tarif à l'OIPI). Pas de brevet possible pour un logiciel.
- [ ] Accord de confidentialité à faire signer aux prospects avant une démonstration poussée.
- [ ] Vendre des licences d'utilisation, jamais le code ; contrat de licence type.
- [ ] Structure juridique pour vendre (entreprise individuelle ou SARL, guichet unique CEPICI).
- [ ] Faire rédiger les contrats (accord CPMI, licence, confidentialité) par un conseil en
      propriété intellectuelle agréé OAPI ou un avocat.

## Version commerciale (abonnement)

L'abonnement protège le mieux : le client n'a jamais le code, les ~100 fonctions de la base
restent sur le serveur, et l'accès peut être coupé en cas d'impayé. Limites : le dépôt actuel
est public, et la partie écran est toujours téléchargée par le navigateur.

- [ ] Dépôt PRIVÉ pour la version commerciale (GitHub Pro ou dépôt séparé).
- [ ] Partie écran compressée et brouillée (minification) à chaque publication, construite
      comme le site démo (script dédié).
- [ ] Une base séparée par laboratoire client : chacun ne voit que ses données.
- [ ] Contrat d'abonnement / CGU : interdiction de copier, décompiler, revendre ; coupure de
      l'accès en cas d'impayé.

## Facultatif

- [ ] Clinique partenaire GDM : si elle fournit le fichier de son logo, refaire plus nets les deux
      comptes rendus du 27/10 (logo actuel découpé dans une photo du bulletin).
- [ ] Faire confirmer l'orthographe du nom sur le second compte rendu GDM du 27/10.
- [ ] Choix d'en-tête par clinique dans l'appli, si les dossiers pour d'autres cliniques deviennent
      fréquents (aujourd'hui : PDF fait à la main, rien dans l'appli).
