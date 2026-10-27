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

   Usage : node scripts/construire-demo.js
   Puis vérifier : node tests/demo.test.js
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'demo');
const FICHIERS = ['index.html', 'login.html', 'soignant.html', 'confidentialite.html', '404.html', 'sw.js'];
const DOSSIERS = ['css', 'js', 'vendor'];

const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');

// ── Base de test : reprise du lien de test (seule différence avec la production) ──
const dbTest = lire('preview/js/supabase-db.js');
const dbProd = lire('js/supabase-db.js');
const val = (src, nom) => (new RegExp('const ' + nom + " = '([^']+)'").exec(src) || [])[1];
const hote = url => new URL(url).host.split('.')[0];
const PROD = { hote: hote(val(dbProd, 'SUPABASE_URL')), cle: val(dbProd, 'SUPABASE_KEY') };
const TEST = { hote: hote(val(dbTest, 'SUPABASE_URL')), cle: val(dbTest, 'SUPABASE_KEY') };
if (!PROD.hote || !TEST.hote || !PROD.cle || !TEST.cle || PROD.hote === TEST.hote) {
  throw new Error('Base de test introuvable dans preview/js/supabase-db.js');
}

// ── Version : celle de la production, marquée « -demo » ──
const VERSION = /APP_VERSION = '([^']+)'/.exec(lire('sw.js'))[1];
const VERSION_DEMO = VERSION + '-demo';

// ── Nom neutre. Ordre important : des expressions longues aux courtes. ──
const MARQUE = [
  [/Centre de Protection(?:<br>|\s)+Mère et Infantile(?=<)/g, 'Laboratoire<br>de démonstration'],   // page de connexion
  [/Centre de Protection Mère et Infantile\s*·\s*/g, ''],
  [/Centre de Protection Mère et Infantile/g, 'Laboratoire de démonstration'],
  [/(Laboratoire )?du CPMI de Grand-Bassam/g, 'Laboratoire Démo'],
  [/[Ll]aboratoire CPMI,? Grand-Bassam/g, 'Laboratoire Démo'],
  [/CPMI DE GRAND[- ]BASSAM/g, 'LABORATOIRE DÉMO'],
  [/CPMI GRAND-BASSAM/g, 'LABORATOIRE DÉMO'],
  [/CPMI,? (de )?Grand-Bassam/g, 'Laboratoire Démo'],
  [/Laboratoire CPMI/g, 'Laboratoire Démo'],
  [/CPMI Labo/g, 'Labo Démo'],
  [/\bCPMI\b/g, 'Démo'],
  [/\s*[·—-]\s*Grand-Bassam(?=, Côte)/g, ''],
  [/Grand-Bassam, (Côte)/g, '$1'],
  [/\s*[·—]\s*Grand-Bassam/g, ''],
  [/Grand-Bassam/g, 'Côte d’Ivoire'],
  [/'CPM-'/g, "'DEMO-'"],                      // préfixe des références de documents
];

// Exécuté avant tout autre script : stockage séparé de la production.
const STOCKAGE = '<script>/* Site de démonstration : stockage du navigateur séparé de la vraie application (même domaine). */'
  + '(function(){var P="demo:",S=Storage.prototype,g=S.getItem,s=S.setItem,r=S.removeItem,k=S.key;'
  + 'S.getItem=function(x){return g.call(this,P+x)};'
  + 'S.setItem=function(x,v){return s.call(this,P+x,v)};'
  + 'S.removeItem=function(x){return r.call(this,P+x)};'
  + 'S.clear=function(){var a=[],i,y;for(i=0;i<this.length;i++){y=k.call(this,i);if(y&&y.indexOf(P)===0)a.push(y)}'
  + 'for(i=0;i<a.length;i++)r.call(this,a[i])};})();</script>';

const BANDEAU = '<div id="demo-bandeau" aria-hidden="true" style="position:fixed;top:0;left:50%;transform:translateX(-50%);'
  + 'z-index:100000;pointer-events:none;background:#7c3aed;color:#fff;font:700 11px/1.5 system-ui,sans-serif;'
  + 'padding:2px 12px;border-radius:0 0 8px 8px;letter-spacing:.4px;white-space:nowrap">'
  + 'DÉMONSTRATION — données fictives</div>'
  + '<style>@media print{#demo-bandeau{display:none!important}}</style>';

function transformer(nom, texte) {
  let t = texte.split(PROD.hote).join(TEST.hote).split(PROD.cle).join(TEST.cle);
  for (const [re, par] of MARQUE) t = t.replace(re, par);
  if (nom.endsWith('.html')) {
    t = t.replace(/\?v=[0-9][0-9.]*(?=["'])/g, '?v=' + VERSION_DEMO)
         .replace(/(<head[^>]*>)/i, '$1\n' + STOCKAGE)
         .replace(/(<body[^>]*>)/i, '$1\n' + BANDEAU)
         // Le bandeau rouge « VERSION DE TEST » du lien de test n'a rien à faire ici.
         .replace(/<div id="preview-test-banner"[\s\S]*?<\/div>\n?/, '');
  }
  if (nom === 'sw.js') {
    t = t.replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '" + VERSION_DEMO + "'")
         .replace(/const CACHE = '[^']+'/, "const CACHE = 'labo-DEMO-" + VERSION + "'");
  }
  return t;
}

function copier(rel) {
  const src = path.join(RACINE, rel), dst = path.join(SORTIE, rel);
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copier(path.join(rel, f));
  } else if (/\.(html|js|css)$/.test(rel) && !rel.startsWith('vendor')) {   // bibliothèques : copiées telles quelles
    fs.writeFileSync(dst, transformer(path.basename(rel), fs.readFileSync(src, 'utf8')));
  } else {
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(SORTIE, { recursive: true, force: true });
fs.mkdirSync(SORTIE, { recursive: true });
for (const f of FICHIERS) copier(f);
for (const d of DOSSIERS) copier(d);
fs.writeFileSync(path.join(SORTIE, 'VERSION.txt'),
  'Site de démonstration construit depuis la version ' + VERSION + ' (base de test ' + TEST.hote + ').\n'
  + 'Ne pas modifier à la main : relancer node scripts/construire-demo.js\n');

// Garde-fous : rien ne doit pointer vers la production ni nommer le CPMI.
const fautes = [];
(function verifier(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { verifier(p); continue; }
    if (!/\.(html|js|css)$/.test(f)) continue;
    const t = fs.readFileSync(p, 'utf8');
    if (t.includes(PROD.hote) || t.includes(PROD.cle)) fautes.push(path.relative(RACINE, p) + ' : base de production');
    if (/\bCPMI\b|Grand-Bassam|Protection(?:<br>|\s)+Mère|Mère et Infantile/.test(t)) fautes.push(path.relative(RACINE, p) + ' : nom du CPMI');
  }
})(SORTIE);
if (fautes.length) { console.error(fautes.join('\n')); process.exit(1); }
console.log('Site démo construit dans demo/ — version ' + VERSION_DEMO + ', base ' + TEST.hote);
