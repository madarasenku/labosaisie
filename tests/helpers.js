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

// ── Jeu de données : 6 fiches en juillet, 4 en août ──────────────────
const FICHES = [
  [101,'2026-07-05', 4000,'Hématologie',     'agent1','Maternité',   1,'rendu',  'KOUAME AYA'],
  [102,'2026-07-12', 6000,'Biochimie',       'agent1','Pédiatrie',   1,'attente','BAMBA SALIF'],
  [103,'2026-07-20', 5000,'Hématologie',     'agent2','Maternité',   1,'urgent', 'KOUAME AYA'],
  [104,'2026-07-22', 3000,'Parasitologie',   'agent2','Consultation',1,'rendu',  'TRAORE MOUSSA'],
  [105,'2026-07-28', 8000,'Immuno-Sérologie','agent1','Maternité',   1,'attente','DIALLO FATOU'],
  [106,'2026-07-30', 2000,'Biochimie',       'agent2','Pédiatrie',   1,'rendu',  'BAMBA SALIF'],
  [201,'2026-08-02', 5000,'Hématologie',     'agent1','Maternité',   2,'urgent', 'KOUAME AYA'],
  [202,'2026-08-04', 7000,'Biochimie',       'agent2','Pédiatrie',   2,'rendu',  'YAO KOFFI'],
  [203,'2026-08-05', 3000,'Hématologie',     'agent1','Consultation',2,'attente','TRAORE MOUSSA'],
  [204,'2026-08-05', 9000,'Parasitologie',   'agent2','Maternité',   2,'rendu',  'DIALLO FATOU'],
];

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
  const { role = 'admin', username = 'admin1', userId = 1, rpc = {}, port = 8099 } = opts;
  const ctx = await chromium.launchPersistentContext(
    fs.mkdtempSync('/tmp/pw-labo-'), { headless: true, args: ['--no-sandbox'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const responses = rpcResponses(rpc);
  await page.route('**/rest/v1/rpc/**', route => {
    const fn = route.request().url().split('/rpc/')[1].split('?')[0];
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify(fn in responses ? responses[fn] : []) });
  });

  const base = `http://127.0.0.1:${port}`;
  await page.goto(base + '/login.html');
  await page.evaluate(s => localStorage.setItem('labo_session_user', s),
    JSON.stringify({ id:userId, username, role, token:'jeton-de-test',
                     expiresAt: Date.now() + 86400000 }));
  await page.goto(base + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
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

module.exports = { serve, openApp, createReporter, histRows, setField, numeric, rows, FICHES };
