# LaboSaisie — SITE SECONDAIRE (labosaisie-v2)

⚠️ **Ce dépôt n'est pas la production.** Il sert de site de secours et de banc
d'essai. Il tourne sur une base Supabase entièrement distincte : rien de ce
qui est saisi ici n'apparaît sur le site principal, et inversement.

| | Site principal | Ce site |
|---|---|---|
| Dépôt | `madarasenku/labosaisie` | `madarasenku/labosaisie-v2` |
| Projet Supabase | `uvxxbihlagfncraokqlg` | `ftwsxdivwoczsreiohok` |
| Données patients | réelles | aucune (base neuve) |

## Ce qui diffère du site principal

Le code est identique à une exception près : la branche `site-v2` du dépôt de
travail ajoute un seul commit par-dessus `main`. Trois changements, tous
destinés à empêcher une confusion entre les deux sites.

**L'adresse Supabase et la clé publique** pointent vers le second projet
(`js/supabase-db.js` et `login.html`).

**Un bandeau orange** est écrit en dur dans le HTML de `index.html` et de
`login.html`, avant tout script. S'il était posé par JavaScript, il
disparaîtrait précisément dans les situations où l'on risque le plus de se
tromper de site : script en échec, base injoignable, page à moitié chargée.

**Les clés de stockage local sont préfixées `v2_`.** C'est le point le moins
visible et le plus important. Les deux sites sont publiés sur le même domaine
(`madarasenku.github.io`), et le `localStorage` y est partagé par tout le
domaine. Sans préfixe, le jeton de session du site principal serait relu ici
et envoyé à la mauvaise base, et la file de synchronisation hors-ligne
pourrait déverser des fiches dans le mauvais projet. Le nom du cache du
service worker (`sw.js`) est renommé pour la même raison.

## Reporter une correction du site principal

```bash
git checkout site-v2
git rebase main            # rejoue le commit « site secondaire » par-dessus
node tests/run.js          # la suite doit rester verte
git push copie site-v2:main --force-with-lease
```

Le contenu de la base du second projet (comptes, prescripteurs, tarifs,
colonnes du cahier jaune) a été recopié depuis la production ; **aucune fiche
patient ne l'a été**. Les mots de passe sont les mêmes qu'en production. Les
signatures manuscrites n'ont pas été recopiées : elles se redéfinissent depuis
Administration.

Pour le reste — fonctionnement de l'application, tests, historique des
versions — voir le dépôt principal.
