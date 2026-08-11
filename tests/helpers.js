// ════════════════════════════════════════════════════════════════════
//  Socle commun des tests LaboSaisie
//
//  Principe : on sert le dépôt en local, on lance Chromium, et on
//  intercepte les appels REST vers Supabase pour renvoyer un jeu de
//  données maîtrisé. AUCUN test ne touche la base de production.
// ════════════════════════════════════════════════════════════════════
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.woff2':'font/woff2', '.json':'application/json' };

function serve(port = 8099) {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                         'Content-Length': body.length,
                         'Last-Modified': fs.statSync(file).mtime.toUTCString() });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

// ── Dates RELATIVES à aujourd'hui ────────────────────────────────────
// ⚠️ Ne jamais remettre de dates en dur ici. La première version de ces
// tests figeait « aujourd'hui » au 5 août 2026 : trois jours plus tard, les
// contrôles « aujourd'hui » et « cette semaine » échouaient alors que
// l'application était parfaitement saine. Une suite qui devient rouge toute
// seule finit par être ignorée — c'est pire que pas de tests du tout.
const AUJ = new Date();
const iso = d => d.toISOString().slice(0, 10);
const decale = n => { const d = new Date(AUJ); d.setDate(d.getDate() - n); return iso(d); };
const premierDuMois = iso(new Date(AUJ.getFullYear(), AUJ.getMonth(), 1));
// Bornée au 1er du mois : le jeu reste valide même le 1er ou le 2 du mois.
const dansLeMois = n => { const d = decale(n); return d < premierDuMois ? premierDuMois : d; };
// 6 fiches dans le mois PRÉCÉDENT, à des jours valides quel que soit le mois
const moisPrec = j => {
  const d = new Date(AUJ.getFullYear(), AUJ.getMonth() - 1, j);
  return iso(d);
};

const AUJOURDHUI = iso(AUJ);
const MOIS_COURANT = AUJOURDHUI.slice(0, 7);
const MOIS_PRECEDENT = moisPrec(5).slice(0, 7);

const FICHES = [
  [101, moisPrec(5),  4000,'Hématologie',     'agent1','Maternité',   1,'rendu',  'KOUAME AYA'],
  [102, moisPrec(12), 6000,'Biochimie',       'agent1','Pédiatrie',   1,'attente','BAMBA SALIF'],
  [103, moisPrec(18), 5000,'Hématologie',     'agent2','Maternité',   1,'urgent', 'KOUAME AYA'],
  [104, moisPrec(22), 3000,'Parasitologie',   'agent2','Consultation',1,'rendu',  'TRAORE MOUSSA'],
  [105, moisPrec(25), 8000,'Immuno-Sérologie','agent1','Maternité',   1,'attente','DIALLO FATOU'],
  [106, moisPrec(27), 2000,'Biochimie',       'agent2','Pédiatrie',   1,'rendu',  'BAMBA SALIF'],
  [201, dansLeMois(5),5000,'Hématologie',     'agent1','Maternité',   2,'urgent', 'KOUAME AYA'],
  [202, dansLeMois(3),7000,'Biochimie',       'agent2','Pédiatrie',   2,'rendu',  'YAO KOFFI'],
  [203, AUJOURDHUI,   3000,'Hématologie',     'agent1','Consultation',2,'attente','TRAORE MOUSSA'],
  [204, AUJOURDHUI,   9000,'Parasitologie',   'agent2','Maternité',   2,'rendu',  'DIALLO FATOU'],
];

// ── Attendus CALCULÉS, avec la même logique que computeHistDateRange ──
const lundiDeCetteSemaine = (() => {
  const d = new Date(AUJ);
  const j = d.getDay();                 // dimanche = 0
  d.setDate(d.getDate() - (j === 0 ? 6 : j - 1));
  return iso(d);
})();

const dansPlage = (d, de, a) => (!de || d >= de) && (!a || d <= a);
const compte = (de, a) => FICHES.filter(f => dansPlage(f[1], de, a)).length;
const agrege = prefixe => {
  const s = FICHES.filter(f => f[1].startsWith(prefixe));
  return { nb: s.length, total: s.reduce((t, f) => t + f[2], 0) };
};

const ATTENDU = {
  aujourdhui: AUJOURDHUI,
  moisCourantPrefixe: MOIS_COURANT,
  moisPrecedentPrefixe: MOIS_PRECEDENT,
  moisPrecedentNum: Number(MOIS_PRECEDENT.slice(5, 7)),
  moisPrecedentAnnee: Number(MOIS_PRECEDENT.slice(0, 4)),
  moisCourantNum: Number(MOIS_COURANT.slice(5, 7)),
  moisCourantAnnee: Number(MOIS_COURANT.slice(0, 4)),
  jour:    compte(AUJOURDHUI, AUJOURDHUI),
  semaine: compte(lundiDeCetteSemaine, AUJOURDHUI),
  mois:    compte(premierDuMois, AUJOURDHUI),
  tout:    FICHES.length,
  caisseMois:       agrege(MOIS_COURANT),
  caisseJour:       (() => { const s = FICHES.filter(f => f[1] === AUJOURDHUI);
                             return { nb: s.length, total: s.reduce((t, f) => t + f[2], 0) }; })(),
  ristournesCourant:   agrege(MOIS_COURANT),
  ristournesPrecedent: agrege(MOIS_PRECEDENT),
  // Plage personnalisée : du 18 au 27 du mois précédent → 3 fiches
  plageDe: moisPrec(18), plageA: moisPrec(27),
  plage:   compte(moisPrec(18), moisPrec(27)),
};

const rows = () => FICHES.map(([id,d,m,t,by,svc,p,st,nom]) => ({
  id, type:t, montant:m, created_at:d+'T09:00:00Z',
  patient:{ nom, age:30, sexe:'F', medecin:'Dr T', service:svc, dossier:'D'+id, statut:st },
  resultats:{}, created_by:by, prescripteur_id:p, est_bpn:false,
  restricted_by:null, deleted_at:null,
}));

const PRESCRIPTEURS = [{id:1,nom:'Dr ALPHA',actif:true},{id:2,nom:'Dr BETA',actif:true}];

// Réponses par défaut des RPC ; `extra` permet de surcharger au cas par cas.
function rpcResponses(extra = {}) {
  return Object.assign({
    get_resultats_light: rows(),
    get_prescripteurs:   PRESCRIPTEURS,
    get_deleted_status:  [],
    get_restriction_status: [],
    get_audit_log:       [],
    get_my_signature:    null,
    check_first_login:   false,
    get_refs_config:     null,
    get_next_dossier_num:'0001-0826',
  }, extra);
}

/**
 * Ouvre l'application avec une session simulée et les RPC interceptés.
 * @param {object} opts { role, username, userId, rpc, port }
 */
async function openApp(opts = {}) {
  const { role = 'admin', username = 'admin1', userId = 1, rpc = {}, port = 8099,
          // Le portail du soignant est une page distincte : on doit pouvoir
          // l'ouvrir sans passer par l'application du laboratoire.
          cible = '/index.html', sansSession = false, appels = null } = opts;
  const ctx = await chromium.launchPersistentContext(
    fs.mkdtempSync('/tmp/pw-labo-'), { headless: true, args: ['--no-sandbox'],
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const responses = rpcResponses(rpc);
  await page.route('**/rest/v1/rpc/**', route => {
    const fn = route.request().url().split('/rpc/')[1].split('?')[0];
    if (appels) appels.push(fn);
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify(fn in responses ? responses[fn] : []) });
  });

  const base = `http://127.0.0.1:${port}`;
  await page.goto(base + '/login.html');
  // Le site secondaire préfixe ses clés (« v2_… ») pour ne pas partager le
  // localStorage du site principal, qui vit sur le même domaine. On pose les
  // deux : le même helper sert alors aux deux dépôts sans divergence.
  await page.evaluate(s => { localStorage.setItem('labo_session_user', s);
                             localStorage.setItem('v2_labo_session_user', s); },
    JSON.stringify({ id:userId, username, role, token:'jeton-de-test',
                     expiresAt: Date.now() + 86400000 }));
  if (sansSession) {
    await page.evaluate(() => { localStorage.removeItem('labo_session_user');
                                localStorage.removeItem('v2_labo_session_user'); });
  }
  await page.goto(base + cible, { waitUntil: 'load' });
  await page.waitForTimeout(cible === '/index.html' ? 2500 : 900);
  return { ctx, page, errors };
}

// ── Micro-harnais d'assertions ──────────────────────────────────────
function createReporter(titre) {
  const res = [];
  console.log('\n══ ' + titre + ' ══');
  return {
    check(label, got, expected) {
      const ok = String(got) === String(expected);
      res.push(ok);
      console.log(`  ${ok ? '✔' : '✗'} ${label.padEnd(46)} ${got}` +
                  (ok ? '' : `   (attendu ${expected})`));
      return ok;
    },
    section(t) { console.log('\n  — ' + t); },
    summary() {
      const ok = res.filter(Boolean).length;
      console.log(`\n  ${ok}/${res.length} contrôles OK`);
      return { ok, total: res.length, allPassed: ok === res.length };
    },
  };
}

const histRows = page => page.evaluate(() => {
  const t = document.getElementById('history-body');
  return t ? [...t.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length > 1).length : -1;
});

const setField = (page, id, v) => page.evaluate(([i, x]) => {
  const e = document.getElementById(i);
  if (e) { e.value = x; e.dispatchEvent(new Event('change', { bubbles: true })); }
}, [id, v]);

const numeric = s => Number(String(s || '').replace(/[^0-9]/g, ''));

module.exports = { serve, openApp, createReporter, histRows, setField, numeric, rows, FICHES, ATTENDU };
