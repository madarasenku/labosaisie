# Site de démonstration

Adresse : `…/labosaisie/demo/` (même site GitHub Pages que la production).

## À quoi il sert

Montrer l'application à d'autres laboratoires, sans exposer le CPMI ni ses données.

- **Base de TEST** (`ftwsxdivwoczsreiohok`), jamais la production.
- **Nom neutre** : « Laboratoire Démo » sur les écrans, comptes rendus, enveloppes, reçus.
- **Bandeau** permanent « DÉMONSTRATION — données fictives » (masqué à l'impression).
- **Stockage séparé** : toutes les clés du navigateur sont préfixées `demo:`. Sur un même
  téléphone, se connecter à la démo ne touche pas à la session de la vraie application.
- **Figé** : il ne suit PAS les mises à jour. Le lien de test `/preview/` reste réservé
  aux vérifications avant mise en production.

## Comptes

| Identifiant | Rôle |
|---|---|
| `demo` | Agent — à donner pour un essai libre |
| `demo_admin` | Administrateur — démo accompagnée seulement |

Les mots de passe ne sont **pas** écrits ici (dépôt public) : ils sont dans la
fonction `demo_reinitialiser()` de la base de test, qui les rétablit chaque nuit.

## Mettre la démo à jour

```
node scripts/construire-demo.js   # régénère demo/ depuis la version actuelle
node tests/demo.test.js           # vérifie : base de test, aucun « CPMI », stockage séparé
```

Le script refuse de terminer s'il reste une référence à la base de production ou au CPMI.

## Remise à zéro (base de test)

Fonction `public.demo_reinitialiser()`, programmée chaque nuit à 3 h (pg_cron) :
remet les 30 dossiers modèles (`labo_demo_modele`, recalés sur la date du jour),
efface ce que les comptes démo ont saisi, rétablit les comptes démo et les réglages
(tarifs, normes, examens) modifiés depuis un compte démo.

Lancer à la main (éditeur SQL du projet de test) : `select public.demo_reinitialiser();`
