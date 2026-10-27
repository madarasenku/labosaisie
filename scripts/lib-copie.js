/* ═══════════════════════════════════════════════════════════════
   LaboSaisie — fabrique d'une copie « à un autre nom » de l'application
   (site démo, sites des laboratoires clients).

   À partir de la production (racine du dépôt), la copie :
   • remplace le nom du CPMI de Grand-Bassam par celui donné (écrans,
     documents imprimés, références) ;
   • se branche sur une AUTRE base Supabase (jamais la production) ;
   • a son propre stockage du navigateur (préfixe) et son propre cache
     hors-ligne : plusieurs copies sur le même domaine ne se mélangent pas ;
   • peut être INACTIVE : les pages affichent « Service en cours
     d'activation », aucun code de l'application ne s'exécute.
   Garde-fous : échec s'il reste la base de production ou le nom du CPMI.
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const FICHIERS = ['index.html', 'login.html', 'soignant.html', 'confidentialite.html', '404.html', 'sw.js'];
const DOSSIERS = ['css', 'js', 'vendor'];
const PAGES_APPLI = ['index.html', 'login.html', 'soignant.html'];

const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const val = (src, nom) => (new RegExp('const ' + nom + " = '([^']+)'").exec(src) || [])[1];
const hote = url => new URL(url).host.split('.')[0];

/** Base de production (à remplacer) et base de test (lien /preview/). */
function bases() {
  const prod = lire('js/supabase-db.js'), test = lire('preview/js/supabase-db.js');
  const PROD = { hote: hote(val(prod, 'SUPABASE_URL')), cle: val(prod, 'SUPABASE_KEY') };
  const TEST = { hote: hote(val(test, 'SUPABASE_URL')), cle: val(test, 'SUPABASE_KEY') };
  if (!PROD.hote || !TEST.hote || !PROD.cle || !TEST.cle || PROD.hote === TEST.hote) {
    throw new Error('Bases introuvables dans js/ et preview/js/supabase-db.js');
  }
  return { PROD, TEST };
}

/** Version de la production (sw.js). */
const versionProduction = () => /APP_VERSION = '([^']+)'/.exec(lire('sw.js'))[1];

/** Remplacements du nom. Ordre important : des expressions longues aux courtes. */
function remplacementsMarque(m) {
  return [
    [/Centre de Protection(?:<br>|\s)+Mère et Infantile(?=<)/g, m.sousTitreBr],   // page de connexion
    [/Centre de Protection Mère et Infantile\s*·\s*/g, ''],
    [/Centre de Protection Mère et Infantile/g, m.sousTitre],
    [/(Laboratoire )?du CPMI de Grand-Bassam/g, m.long],
    [/[Ll]aboratoire CPMI,? Grand-Bassam/g, m.long],
    [/CPMI DE GRAND[- ]BASSAM/g, m.LONG],
    [/CPMI GRAND-BASSAM/g, m.LONG],
    [/CPMI,? (de )?Grand-Bassam/g, m.long],
    [/Laboratoire CPMI/g, m.long],
    [/CPMI Labo/g, m.court],
    [/\bCPMI\b/g, m.sigle],
    [/\s*[·—-]\s*Grand-Bassam(?=, Côte)/g, ''],
    [/Grand-Bassam, (Côte)/g, '$1'],
    [/\s*[·—]\s*Grand-Bassam/g, ''],
    [/Grand-Bassam/g, m.lieu],
    [/'CPM-'/g, "'" + m.prefixeRef + "-'"],              // préfixe des références de documents
  ];
}

/** Script exécuté avant tout autre : stockage du navigateur séparé (préfixe). */
function scriptStockage(prefixe, commentaire) {
  return '<script>/* ' + commentaire + ' */'
    + '(function(){var P=' + JSON.stringify(prefixe) + ',S=Storage.prototype,g=S.getItem,s=S.setItem,r=S.removeItem,k=S.key;'
    + 'S.getItem=function(x){return g.call(this,P+x)};'
    + 'S.setItem=function(x,v){return s.call(this,P+x,v)};'
    + 'S.removeItem=function(x){return r.call(this,P+x)};'
    + 'S.clear=function(){var a=[],i,y;for(i=0;i<this.length;i++){y=k.call(this,i);if(y&&y.indexOf(P)===0)a.push(y)}'
    + 'for(i=0;i<a.length;i++)r.call(this,a[i])};})();</script>';
}

const echapper = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Page affichée tant que la copie n'est pas activée (aucun script de l'appli). */
function pageInactive(nom) {
  return '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex, nofollow, noarchive">'
    + '<title>' + echapper(nom) + ' — Service en cours d\'activation</title>'
    + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f0fdfa;'
    + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0b2545}'
    + 'main{max-width:420px;margin:24px;padding:32px 28px;background:#fff;border-radius:18px;'
    + 'box-shadow:0 10px 30px rgba(11,37,69,.12);text-align:center}'
    + 'h1{font-size:22px;margin:12px 0 4px}.sous{color:#64748b;font-size:14px;margin:0 0 22px}'
    + '.etat{display:inline-block;background:#fef3c7;color:#92400e;font-weight:700;font-size:13px;'
    + 'padding:6px 14px;border-radius:999px}p.info{color:#475569;font-size:14px;line-height:1.6;margin:18px 0 0}'
    + '.ic{font-size:40px}</style></head>\n<body><main>'
    + '<div class="ic" aria-hidden="true">🧪</div>'
    + '<h1>' + echapper(nom) + '</h1><p class="sous">Logiciel de gestion de laboratoire</p>'
    + '<span class="etat">Service en cours d\'activation</span>'
    + '<p class="info">Votre espace sera disponible très prochainement.<br>'
    + 'Pour toute question, contactez votre fournisseur.</p>'
    + '</main></body></html>\n';
}

/**
 * Construit une copie dans `o.sortie`.
 * o = { sortie, marque, base: {hote, cle} | null, prefixeStockage, commentaireStockage,
 *       suffixeVersion, prefixeCache, bandeau (html) | '', inactive (bool), notice (texte) }
 */
function construireCopie(o) {
  const { PROD } = bases();
  const VERSION = versionProduction();
  const VERSION_COPIE = VERSION + o.suffixeVersion;
  const base = o.base || { hote: 'base-non-configuree', cle: 'cle-non-configuree' };
  const MARQUE = remplacementsMarque(o.marque);
  const STOCKAGE = scriptStockage(o.prefixeStockage, o.commentaireStockage);

  function transformer(nom, texte) {
    let t = texte.split(PROD.hote).join(base.hote).split(PROD.cle).join(base.cle);
    for (const [re, par] of MARQUE) t = t.replace(re, par);
    if (nom.endsWith('.html')) {
      t = t.replace(/\?v=[0-9][0-9.]*(?=["'])/g, '?v=' + VERSION_COPIE)
           .replace(/(<head[^>]*>)/i, '$1\n' + STOCKAGE)
           .replace(/(<body[^>]*>)/i, '$1' + (o.bandeau ? '\n' + o.bandeau : ''))
           // Le bandeau rouge « VERSION DE TEST » du lien de test n'a rien à faire ici.
           .replace(/<div id="preview-test-banner"[\s\S]*?<\/div>\n?/, '');
    }
    if (nom === 'sw.js') {
      t = t.replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '" + VERSION_COPIE + "'")
           .replace(/const CACHE = '[^']+'/, "const CACHE = '" + o.prefixeCache + VERSION + "'");
    }
    return t;
  }

  function copier(rel) {
    const src = path.join(RACINE, rel), dst = path.join(o.sortie, rel);
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      for (const f of fs.readdirSync(src)) copier(path.join(rel, f));
    } else if (o.inactive && PAGES_APPLI.includes(rel)) {
      fs.writeFileSync(dst, pageInactive(o.marque.long));
    } else if (/\.(html|js|css)$/.test(rel) && !rel.startsWith('vendor')) {   // bibliothèques : copiées telles quelles
      fs.writeFileSync(dst, transformer(path.basename(rel), fs.readFileSync(src, 'utf8')));
    } else {
      fs.copyFileSync(src, dst);
    }
  }

  fs.rmSync(o.sortie, { recursive: true, force: true });
  fs.mkdirSync(o.sortie, { recursive: true });
  for (const f of FICHIERS) copier(f);
  for (const d of DOSSIERS) copier(d);
  fs.writeFileSync(path.join(o.sortie, 'VERSION.txt'), o.notice(VERSION, base.hote));

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
  })(o.sortie);
  if (fautes.length) { console.error(fautes.join('\n')); process.exit(1); }
  return { VERSION, VERSION_COPIE, base };
}

module.exports = { RACINE, bases, versionProduction, construireCopie };
