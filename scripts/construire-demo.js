#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   LaboSaisie — construction du site de DÉMONSTRATION (dossier demo/)

   Le site démo sert à montrer l'application à d'autres laboratoires :
   • copie FIGÉE de la production au moment où l'on lance ce script :
     il ne change que quand on le relance (le lien de test /preview/
     reste libre pour les vérifications avant mise en production) ;
   • branché sur la base de TEST (jamais sur la production) ;
   • nom neutre « Laboratoire Démo » à la place du CPMI de Grand-Bassam,
     sur les écrans comme sur les documents imprimés ;
   • stockage du navigateur séparé (préfixe « demo: ») : sur un même
     téléphone, se connecter à la démo ne touche pas à la session de la
     vraie application, qui vit sur le même domaine ;
   • bandeau permanent « Démonstration — données fictives ».

   Usage : node scripts/construire-demo.js [dossier de sortie]
   Puis vérifier : node tests/demo.test.js
   ═══════════════════════════════════════════════════════════════ */
const path = require('path');
const { RACINE, bases, construireCopie } = require('./lib-copie');

const SORTIE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(RACINE, 'demo');

const BANDEAU = '<div id="demo-bandeau" aria-hidden="true" style="position:fixed;top:0;left:50%;transform:translateX(-50%);'
  + 'z-index:100000;pointer-events:none;background:#7c3aed;color:#fff;font:700 11px/1.5 system-ui,sans-serif;'
  + 'padding:2px 12px;border-radius:0 0 8px 8px;letter-spacing:.4px;white-space:nowrap">'
  + 'DÉMONSTRATION — données fictives</div>'
  + '<style>@media print{#demo-bandeau{display:none!important}}</style>';

const { VERSION_COPIE, base } = construireCopie({
  sortie: SORTIE,
  marque: { long: 'Laboratoire Démo', LONG: 'LABORATOIRE DÉMO', court: 'Labo Démo', sigle: 'Démo',
            sousTitre: 'Laboratoire de démonstration', sousTitreBr: 'Laboratoire<br>de démonstration',
            lieu: 'Côte d’Ivoire', prefixeRef: 'DEMO' },
  base: bases().TEST,
  prefixeStockage: 'demo:',
  commentaireStockage: 'Site de démonstration : stockage du navigateur séparé de la vraie application (même domaine).',
  suffixeVersion: '-demo',
  prefixeCache: 'labo-DEMO-',
  bandeau: BANDEAU,
  inactive: false,
  notice: (v, h) => 'Site de démonstration construit depuis la version ' + v + ' (base de test ' + h + ').\n'
    + 'Ne pas modifier à la main : relancer node scripts/construire-demo.js\n',
});
console.log('Site démo construit dans ' + path.relative(RACINE, SORTIE) + '/ — version ' + VERSION_COPIE + ', base ' + base.hote);
