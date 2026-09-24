// ✅ v13.204 — Le spectateur voit le travail de l'équipe EN TEMPS RÉEL
// (indépendamment de la clôture), SAUF les dossiers de « nadia » et « admin ».
// (Avant v13.128→203 : il ne voyait que les journées verrouillées.)
// La seconde partie vérifie le verrouillage en masse par l'admin (inchangé).
const { serve, openApp, createReporter } = require('./helpers');

const LOCKED = '2026-08-20';
const OPEN = '2026-08-22';
const mk = (id, nom, date, by = 'agent1') => ({
  id, type: 'Dossier', montant: 3000, created_at: date + 'T09:00:00Z',
  patient: { nom, dossier: '0' + id + '-0826', sexe: 'F', age: 30, date },
  resultats: { _types: ['Hématologie'], _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] } },
  created_by: by, prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });
const DOSS = [
  mk(980, 'JOUR VERROUILLE', LOCKED),          // agent visible, jour verrouillé
  mk(981, 'JOUR OUVERT', OPEN),                // agent visible, jour ouvert
  mk(982, 'DOSSIER NADIA', OPEN, 'nadia'),     // caché du spectateur
  mk(983, 'DOSSIER ADMIN', OPEN, 'admin'),     // caché du spectateur
];

(async () => {
  const r = createReporter('SPECTATEUR — VISIBILITÉ TEMPS RÉEL PAR AUTEUR');
  const srv = await serve(8120);
  let ctx;
  try {
    // ── Spectateur ──
    const app = await openApp({ role: 'spectateur', username: 'obs', userId: 5, port: 8120 });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate(({ d, locked }) => {
      window.__locked = new Set([locked]);
      _sb.rpc = async (nom) => {
        if (nom === 'get_resultats_light') return { data: d, error: null };
        if (nom === 'list_clotures') return { data: [...window.__locked].map(j => ({ jour: j, verrouille_par: 'x', verrouille_le: 'x' })), error: null };
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, { d: DOSS, locked: LOCKED });
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);

    r.section('Spectateur : équipe visible (verrouillé OU ouvert), sauf nadia/admin');
    const vu = await page.evaluate(() => ({
      db: (getDB() || []).map(x => x.patient?.dossier).sort(),
      calc: (getCalcDB() || []).map(x => x.patient?.dossier).sort(),
    }));
    r.check('voit le jour verrouillé (0980)', vu.db.includes('0980-0826'), true);
    r.check('voit AUSSI le jour ouvert (0981)', vu.db.includes('0981-0826'), true);
    r.check('ne voit PAS le dossier de nadia (0982)', vu.db.includes('0982-0826'), false);
    r.check('ne voit PAS le dossier de admin (0983)', vu.db.includes('0983-0826'), false);
    r.check('caisse spectateur = les 2 dossiers de l\'équipe', vu.calc.join(','), '0980-0826,0981-0826');
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));
    await ctx.close();

    // ── Admin : verrouiller en masse (inchangé) ──
    const app2 = await openApp({ role: 'admin', port: 8120 });
    const p2 = app2.page; const ctx2 = app2.ctx;
    await p2.evaluate(() => {
      window.__args = null; window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'verrouiller_jusqua') { window.__args = params; return { data: { verrouillees: 4 }, error: null }; }
        if (nom === 'list_clotures') return { data: [], error: null };
        if (nom === 'get_resultats_light') return { data: [], error: null };
        return { data: [], error: null };
      };
    });
    r.section('Admin : tout verrouiller jusqu\'à une date');
    await p2.evaluate(() => { showView('caisse'); });
    await p2.waitForTimeout(200);
    await p2.evaluate((d) => { const c = document.getElementById('cloture-date'); if (c) c.value = d; }, OPEN);
    await p2.evaluate(() => verrouillerJusqua());
    await p2.waitForTimeout(400);
    const args = await p2.evaluate(() => window.__args);
    r.check('RPC verrouiller_jusqua appelé', !!args, true);
    r.check('avec la bonne date', args && args.p_jour, OPEN);
    r.check('aucune erreur JS (admin)', app2.errors.length, 0);
    await ctx2.close();

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; if (ctx) await ctx.close(); }
  finally { srv.close(); }
})();
