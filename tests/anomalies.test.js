// Journal des anomalies (v13.251) — ce qui sort de l'ordinaire chez un utilisateur
// (message d'erreur, refus, erreur technique) part au serveur avec l'heure, le
// compte, l'écran, le dossier et les examens cochés ; l'admin le lit et est prévenu.
const { serve, openApp, createReporter } = require('./helpers');
const PORT = 8339;
const CIBLE = process.env.CIBLE || '/index.html';

const banc = () => {
  window.__envois = []; window.__rep = null; window.__msgs = [];
  const vrai = _sb.rpc.bind(_sb);
  _sb.rpc = (nom, p) => {
    if (nom === 'log_anomalie') { window.__envois.push(p); return Promise.resolve(window.__rep || { data: 'ok', error: null, status: 200 }); }
    return vrai(nom, p);
  };
};

(async () => {
  const srv = await serve(PORT);
  const r = createReporter('JOURNAL DES ANOMALIES');
  let erreurs = [];
  {
    r.section('Agent : les anomalies partent au serveur');
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'agent1', userId: 7, port: PORT, cible: CIBLE });
    await page.evaluate(banc);
    await page.evaluate(() => { showView('saisie'); localStorage.removeItem('labo_anomalies_attente'); });
    await page.waitForTimeout(400);
    const env = await page.evaluate(async () => {
      const cb = document.getElementById('ex_ge'); cb.checked = true; cb.dispatchEvent(new Event('change'));
      toast('Paiement requis avant d\'enregistrer ce dossier', 'err');
      await new Promise(r => setTimeout(r, 200));
      return __envois[0] || null;
    });
    r.check('message envoyé', env && env.p_message, 'Paiement requis avant d\'enregistrer ce dossier');
    r.check('écran', env && env.p_contexte.vue, 'Nouvelle saisie');
    r.check('examens cochés', env && /Goutte épaisse/.test(env.p_contexte.examens || ''), true);
    r.check('heure du poste, rôle, version', env && [!!Date.parse(env.p_contexte.heure_poste), env.p_contexte.role, !!env.p_contexte.version].join('|'), 'true|agent|true');
    r.check('même message répété : un seul envoi', await page.evaluate(async () => {
      toast('Paiement requis avant d\'enregistrer ce dossier', 'err');
      await new Promise(r => setTimeout(r, 200)); return __envois.length; }), 1);
    r.check('message vert ou neutre : rien n\'est envoyé', await page.evaluate(async () => {
      toast('Enregistré', 'ok'); toast('Info', ''); await new Promise(r => setTimeout(r, 200)); return __envois.length; }), 1);
    r.check('réseau coupé : gardé, puis renvoyé au retour', await page.evaluate(async () => {
      __rep = { data: null, error: { message: 'FetchError' }, status: 0 };
      toast('Échec de la mise à jour', 'err'); await new Promise(r => setTimeout(r, 200));
      const garde = JSON.parse(localStorage.getItem('labo_anomalies_attente') || '[]').length;
      __rep = null;
      toast('Journée verrouillée — modification impossible', 'err'); await new Promise(r => setTimeout(r, 300));
      const reste = JSON.parse(localStorage.getItem('labo_anomalies_attente') || '[]').length;
      return [garde, reste, __envois.slice(-2).map(e => e.p_message).join(' / ')].join('|');
    }), '1|0|Échec de la mise à jour / Journée verrouillée — modification impossible');
    r.check('erreur technique de la page consignée', await page.evaluate(async () => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'x is not defined', filename: 'http://h/js/saisie.js?v=1', lineno: 42 }));
      await new Promise(r => setTimeout(r, 200));
      const e = __envois[__envois.length - 1]; return e.p_message + ' | ' + e.p_contexte.detail;
    }), 'Erreur technique : x is not defined | saisie.js:42');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Admin : écran « Anomalies » et alerte en direct');
    const H = (h) => new Date(Date.now() - h * 3600000).toISOString();
    const ano = [
      { id: 3, ts: H(0.1), username: 'agent1', target_id: 501, details: { message: 'Paiement requis : enregistrement des résultats refusé (dossier non encaissé)',
        vue: 'Nouvelle saisie', dossier: '0501-1026', examens: 'Goutte épaisse (GE)', role: 'agent', appareil: 'mobile', version: '13.251', heure_poste: H(0.1) } },
      { id: 2, ts: H(2), username: 'caisse1', target_id: null, details: { message: 'Échec de la mise à jour', vue: 'Caisse', heure_poste: H(2) } },
    ];
    const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin1', port: PORT, cible: CIBLE, rpc: { get_anomalies: ano } });
    await page.evaluate(() => { localStorage.removeItem('labo_last_seen_ano'); });
    await page.evaluate(() => checkNewAnomalies(false));
    r.check('badge : 2 nouvelles anomalies', await page.evaluate(() => document.getElementById('ano-badge')?.textContent || ''), '2');
    await page.evaluate(() => { showView('comptes'); adminShowSub('ac-anomalies', document.getElementById('btn-sub-anomalies')); });
    await page.waitForTimeout(500);
    const lignes = await page.evaluate(() => [...document.querySelectorAll('#anomalies-body tr')].map(t => t.innerText.replace(/\s+/g, ' ').trim()));
    r.check('deux lignes, la plus récente d\'abord', lignes.length + '|' + /agent1/.test(lignes[0]) + '|' + /caisse1/.test(lignes[1]), '2|true|true');
    r.check('contexte : dossier, examens, appareil', /Dossier N° 0501-1026/.test(lignes[0]) && /Goutte épaisse/.test(lignes[0]) && /mobile/.test(lignes[0]), true);
    r.check('badge effacé après consultation', await page.evaluate(() => {
      const b = document.getElementById('ano-badge'); return !b || b.style.display === 'none'; }), true);
    r.check('recherche', await page.evaluate(() => {
      const f = document.getElementById('anomalies-filtre'); f.value = 'caisse1'; f.dispatchEvent(new Event('input'));
      return new Promise(res => setTimeout(() => res(document.querySelectorAll('#anomalies-body tr').length), 300)); }), 1);
    r.check('nouvelle anomalie : alerte en direct', await page.evaluate(async (a) => {
      window.__msgs = []; const t = window.toast; window.toast = (m, k) => { window.__msgs.push(m); };
      _lastNotifiedAnoTs = a[1].ts;          // la plus ancienne était déjà connue
      await checkNewAnomalies(true); window.toast = t;
      return window.__msgs.find(m => /Anomalie/.test(m)) || '';
    }, ano).then(m => /agent1 à \d\d:\d\d — Paiement requis/.test(m)), true);
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  {
    r.section('Responsable : pas d\'onglet « Anomalies »');
    const { ctx, page, errors } = await openApp({ role: 'responsable', username: 'Responsable', userId: 49, port: PORT, cible: CIBLE,
      rpc: { list_users_admin: [] } });
    await page.evaluate(() => showView('comptes'));
    await page.waitForTimeout(400);
    r.check('onglet masqué', await page.evaluate(() => getComputedStyle(document.getElementById('btn-sub-anomalies')).display), 'none');
    erreurs = erreurs.concat(errors); await ctx.close();
  }
  r.check('aucune erreur JS', erreurs.length, 0);
  if (erreurs.length) console.log('   ', erreurs.slice(0, 3));
  const s = r.summary();
  srv.close();
  process.exit(s.allPassed ? 0 : 1);
})();
