// v13.267 — Sites des laboratoires clients (scripts/construire-client.js) :
// copies de l'application à un autre nom, INACTIVES tant qu'aucune base n'est
// branchée, jamais sur la base du CPMI, stockage séparé. On vérifie les copies
// publiées (clients/<client>/) et une activation d'essai (copie temporaire).
const { serve, openApp, createReporter, rows } = require('./helpers');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const PORT = 8369;
const RACINE = path.join(__dirname, '..');

const val = (src, nom) => (new RegExp('const ' + nom + " = '([^']+)'").exec(src) || [])[1];
const hote = url => new URL(url).host.split('.')[0];
const PROD = hote(val(fs.readFileSync(path.join(RACINE, 'js/supabase-db.js'), 'utf8'), 'SUPABASE_URL'));
const TEST = hote(val(fs.readFileSync(path.join(RACINE, 'preview/js/supabase-db.js'), 'utf8'), 'SUPABASE_URL'));
const CLE_TEST = val(fs.readFileSync(path.join(RACINE, 'preview/js/supabase-db.js'), 'utf8'), 'SUPABASE_KEY');
const fichiers = dir => fs.readdirSync(dir).flatMap(f => {
  const p = path.join(dir, f); return fs.statSync(p).isDirectory() ? fichiers(p) : [p];
});
const construire = (client, config, sortie) => {
  const cfg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'client-')), client + '.json');
  fs.writeFileSync(cfg, JSON.stringify(config));
  return spawnSync(process.execPath, [path.join(RACINE, 'scripts/construire-client.js'), client, sortie],
    { env: Object.assign({}, process.env, { CLIENT_CONFIG: cfg }), encoding: 'utf8' });
};

(async () => {
  const r = createReporter('SITES DES LABORATOIRES CLIENTS');
  const configs = fs.readdirSync(path.join(RACINE, 'clients/config')).filter(f => f.endsWith('.json'));

  r.section('Copies publiées (clients/<client>/)');
  r.check('au moins deux copies prêtes', configs.length >= 2, true);
  for (const f of configs) {
    const client = f.replace(/\.json$/, '');
    const cfg = JSON.parse(fs.readFileSync(path.join(RACINE, 'clients/config', f), 'utf8'));
    const dir = path.join(RACINE, 'clients', client);
    const textes = fichiers(dir).filter(p => /\.(html|js|css)$/.test(p)).map(p => fs.readFileSync(p, 'utf8'));
    r.check(client + ' : ni base de production ni base de test du CPMI',
      textes.some(t => t.includes(PROD) || t.includes(TEST)), false);
    r.check(client + ' : aucun « CPMI »', textes.some(t => /\bCPMI\b|Grand-Bassam|Mère et Infantile/.test(t)), false);
    if (!cfg.actif) {
      const pages = ['index.html', 'login.html', 'soignant.html'].map(p => fs.readFileSync(path.join(dir, p), 'utf8'));
      r.check(client + ' : inactif — « Service en cours d\'activation » au nom du labo',
        pages.every(p => /Service en cours d'activation/.test(p) && p.includes(cfg.nom.replace(/'/g, '’'))), true);
      r.check(client + ' : inactif — aucune page n\'exécute l\'application', pages.every(p => !/<script/i.test(p)), true);
    }
  }

  const srv = await serve(PORT);
  r.section('Copie inactive ouverte dans un navigateur');
  {
    const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: '/clients/labo-1/index.html',
      connexion: '/clients/labo-1/login.html', appels: [] });
    const hotes = new Set();
    page.on('request', q => { if (/supabase\.co/.test(q.url())) hotes.add(q.url()); });
    await page.goto('http://127.0.0.1:' + PORT + '/clients/labo-1/index.html'); await page.waitForTimeout(800);
    r.check('message d\'activation affiché', /Service en cours d'activation/.test(await page.evaluate(() => document.body.innerText)), true);
    r.check('aucun appel à une base', hotes.size, 0);
    r.check('aucune erreur JS', errors.join(' | ') || 'aucune', 'aucune');
    await ctx.close();
  }

  r.section('Garde-fous à l\'activation');
  const tmp = path.join(RACINE, 'tests', '.tmp-client-actif');
  const base = { nom: 'Laboratoire d\'Analyses Essai', nom_court: 'Labo Essai', sigle: 'Essai', prefixe_references: 'ESS', actif: true };
  try {
    let res = construire('essai-actif', Object.assign({}, base, { supabase_url: 'https://' + TEST + '.supabase.co', supabase_cle: CLE_TEST }), tmp);
    r.check('refus de la base de test du CPMI', res.status !== 0 && /REFUS/.test(res.stderr), true);
    res = construire('essai-actif', Object.assign({}, base, { supabase_url: 'https://' + PROD + '.supabase.co', supabase_cle: 'x' }), tmp);
    r.check('refus de la base de production', res.status !== 0 && /REFUS/.test(res.stderr), true);
    res = construire('essai-actif', Object.assign({}, base, { nom: 'Labo <script>' }), tmp);
    r.check('refus d\'un nom invalide', res.status !== 0, true);

    r.section('Activation d\'essai (base fictive « clientessai »)');
    res = construire('essai-actif', Object.assign({}, base, { supabase_url: 'https://clientessai.supabase.co', supabase_cle: 'sb_publishable_essai' }), tmp);
    r.check('construction réussie (apostrophe du nom acceptée, JavaScript valide)', res.status, 0);
    const { ctx, page, errors } = await openApp({ role: 'admin', port: PORT, cible: '/tests/.tmp-client-actif/index.html',
      connexion: '/tests/.tmp-client-actif/login.html', rpc: { get_resultats_light: rows() } });
    const hotes = new Set();
    page.on('request', q => { if (/supabase\.co/.test(q.url())) hotes.add(new URL(q.url()).host.split('.')[0]); });
    await page.evaluate(() => showView('historique'));
    await page.waitForTimeout(600);
    const etat = await page.evaluate(async () => ({
      connecte: typeof _currentUser !== 'undefined' && !!_currentUser, dossiers: getDB().length,
      cr: /LABORATOIRE D’ANALYSES ESSAI/.test(await crBuildHTML(getDB()[0])),
      cles: Object.keys(localStorage).filter(k => /session/.test(k)),
    }));
    await page.evaluate(() => _sb.rpc('get_refs_config_v2', {}));
    await page.waitForTimeout(300);
    r.check('l\'application tourne, dossiers chargés', etat.connecte && etat.dossiers === rows().length, true);
    r.check('compte rendu au nom du laboratoire client', etat.cr, true);
    r.check('appels vers la base du client uniquement', [...hotes].join(','), 'clientessai');
    r.check('session rangée sous le préfixe du client', etat.cles.every(k => k.startsWith('client-essai-actif:') || !k.startsWith('labo_')), true);
    r.check('aucune erreur JS', errors.join(' | ') || 'aucune', 'aucune');
    await ctx.close();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
