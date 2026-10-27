// v13.265 — Site de démonstration (/demo/), construit par scripts/construire-demo.js :
// copie figée de l'application, branchée sur la base de TEST, nom neutre
// « Laboratoire Démo », stockage du navigateur séparé, bandeau « Démonstration ».
// Ce test vise toujours /demo/, quelle que soit la cible de la suite.
const { serve, openApp, createReporter, rows } = require('./helpers');
const fs = require('fs');
const path = require('path');
const PORT = 8367;
const RACINE = path.join(__dirname, '..');
const DEMO = path.join(RACINE, 'demo');

const val = (src, nom) => (new RegExp('const ' + nom + " = '([^']+)'").exec(src) || [])[1];
const hote = url => new URL(url).host.split('.')[0];
const PROD = hote(val(fs.readFileSync(path.join(RACINE, 'js/supabase-db.js'), 'utf8'), 'SUPABASE_URL'));
const TEST = hote(val(fs.readFileSync(path.join(RACINE, 'preview/js/supabase-db.js'), 'utf8'), 'SUPABASE_URL'));

function fichiers(dir) {
  return fs.readdirSync(dir).flatMap(f => {
    const p = path.join(dir, f);
    return fs.statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}

(async () => {
  const r = createReporter('SITE DE DÉMONSTRATION (/demo/)');

  r.section('Fichiers du site démo');
  r.check('dossier demo/ présent', fs.existsSync(path.join(DEMO, 'index.html')), true);
  const textes = fichiers(DEMO).filter(f => /\.(html|js|css)$/.test(f))
    .map(f => ({ f: path.relative(RACINE, f), t: fs.readFileSync(f, 'utf8') }));
  r.check('aucune référence à la base de production', textes.filter(x => x.t.includes(PROD)).map(x => x.f).join(', ') || 'aucune', 'aucune');
  r.check('branché sur la base de test', /supabase-db\.js/.test(textes.map(x => x.f).join(' '))
    && textes.find(x => x.f.endsWith('js/supabase-db.js')).t.includes(TEST), true);
  r.check('aucun « CPMI » / « Grand-Bassam » / « Mère et Infantile »',
    textes.filter(x => /\bCPMI\b|Grand-Bassam|Protection(?:<br>|\s)+Mère|Mère et Infantile/.test(x.t)).map(x => x.f).join(', ') || 'aucun', 'aucun');
  const pages = textes.filter(x => x.f.endsWith('.html'));
  r.check('stockage séparé chargé AVANT tout autre script (chaque page)', pages.every(x => {
    const i = x.t.indexOf('S.getItem=function'); const j = x.t.search(/<script src=/);
    return i > 0 && (j < 0 || i < j);
  }), true);
  const sw = fs.readFileSync(path.join(DEMO, 'sw.js'), 'utf8');
  r.check('cache propre au site démo', (/const CACHE = '([^']+)'/.exec(sw) || [])[1].startsWith('labo-DEMO-'), true);
  r.check('le nettoyage ne vise que les caches de sa famille', /famille\(k\) === famille\(CACHE\)/.test(sw), true);

  const srv = await serve(PORT);
  const hotes = new Set();
  const data = rows();
  const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: '/demo/index.html',
    connexion: '/demo/login.html', rpc: { get_resultats_light: data } });
  page.on('request', q => { if (/supabase\.co/.test(q.url())) hotes.add(new URL(q.url()).host.split('.')[0]); });

  r.section('Application démo');
  await page.evaluate(() => showView('historique'));
  await page.waitForTimeout(800);
  const ecran = await page.evaluate(() => ({
    connecte: typeof _currentUser !== 'undefined' && !!_currentUser,
    dossiers: getDB().length,
    bandeau: (document.getElementById('demo-bandeau') || {}).textContent || '',
    cpmi: /\bCPMI\b|Grand-Bassam|Mère et Infantile/.test(document.body.innerText + document.title),
  }));
  r.check('session ouverte, dossiers chargés', ecran.connecte && ecran.dossiers === data.length, true);
  r.check('bandeau « Démonstration »', ecran.bandeau, 'DÉMONSTRATION — données fictives');
  r.check('aucun « CPMI » à l\'écran', ecran.cpmi, false);
  r.check('compte rendu à l\'en-tête « LABORATOIRE DÉMO »', await page.evaluate(async () => {
    const h = await crBuildHTML(getDB()[0]); return /LABORATOIRE DÉMO/.test(h) && !/CPMI|Grand-Bassam/.test(h);
  }), true);
  await page.evaluate(() => fetch('https://exemple.supabase.co/rest/v1/rpc/get_refs_config_v2', { method: 'POST' }).catch(() => {}));
  await page.evaluate(() => typeof _sb !== 'undefined' && _sb.rpc('get_refs_config_v2', {}));
  await page.waitForTimeout(300);
  r.check('appels Supabase vers la base de test uniquement',
    [...hotes].filter(h => h !== 'exemple').every(h => h === TEST) && hotes.has(TEST), true);

  const pl = await ctx.newPage();
  await pl.goto('http://127.0.0.1:' + PORT + '/demo/login.html'); await pl.waitForTimeout(800);
  r.check('page de connexion : ni « CPMI » ni « Mère et Infantile »', await pl.evaluate(() =>
    /\bCPMI\b|Grand-Bassam|Mère et Infantile/.test(document.body.innerText + document.title)), false);
  await pl.close();

  r.section('Stockage séparé de la vraie application (même domaine)');
  const cles = await page.evaluate(() => Object.keys(localStorage));
  r.check('toutes les clés écrites par la démo sont préfixées « demo: »',
    cles.filter(k => !k.startsWith('demo:') && !['labo_session_user', 'v2_labo_session_user'].includes(k)).join(',') || 'aucune autre', 'aucune autre');
  r.check('la démo lit sa propre session', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('labo_session_user') || '{}').token), 'jeton-de-test');
  // Session de production effacée, session démo conservée : la démo reste connectée…
  await page.evaluate(() => Storage.prototype.removeItem.call(localStorage, 'nimporte'));
  const p2 = await ctx.newPage();
  await p2.goto('http://127.0.0.1:' + PORT + '/login.html');
  await p2.evaluate(() => { localStorage.removeItem('labo_session_user'); localStorage.removeItem('v2_labo_session_user'); });
  await p2.goto('http://127.0.0.1:' + PORT + '/demo/index.html', { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  r.check('sans session de production, la démo reste connectée', /\/demo\/index\.html/.test(p2.url()), true);
  // … et la vraie application ne voit pas la session démo.
  await p2.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  r.check('la vraie application ne reprend pas la session démo', /login\.html/.test(p2.url()), true);
  await p2.close();

  r.section('Caches hors-ligne : la démo n\'efface plus ceux de la production');
  const caches = await page.evaluate(async () => {
    const attendre = async (t) => { for (let i = 0; i < 60; i++) { if (await t()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
    await attendre(async () => { const g = await navigator.serviceWorker.getRegistration(); return g && g.active; });
    // Un cache « de production » et un ancien cache démo, puis réactivation du service worker démo.
    await (await caches.open('cpmi-labo-v1')).put('/temoin', new Response('x'));
    await (await caches.open('labo-DEMO-0.1')).put('/temoin', new Response('x'));
    // Nouvelle adresse de script = nouvelle installation, donc une vraie activation.
    await navigator.serviceWorker.register('./sw.js?essai=' + Date.now());
    await attendre(async () => !(await caches.keys()).includes('labo-DEMO-0.1'));
    return (await caches.keys()).sort();
  });
  r.check('cache de production conservé', caches.includes('cpmi-labo-v1'), true);
  r.check('ancien cache démo supprimé', caches.includes('labo-DEMO-0.1'), false);

  r.check('aucune erreur JS', errors.join(' | ') || 'aucune', 'aucune');
  await ctx.close(); srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
