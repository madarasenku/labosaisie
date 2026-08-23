// ✅ v13.124 — Grille en série : paramètres du BPN (sérologies + groupe sanguin).
const { serve, openApp, createReporter } = require('./helpers');

const dossSero = {
  id: 920, type: 'Dossier', montant: 19000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'BPN SERO', dossier: '0920-0826', sexe: 'F', age: 29 },
  resultats: { _types: ['Immuno-Sérologie'], _facture_seule: true,
    _examens_coches: { 'Immuno-Sérologie': ['Ag HBs (Hépatite B)'] },
    _examens_prix: { 'Immuno-Sérologie': { 'Ag HBs (Hépatite B)': 7000 } },
    _montants: { 'Immuno-Sérologie': 7000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null };

const dossGs = {
  id: 921, type: 'Dossier', montant: 2000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'BPN GROUPE', dossier: '0921-0826', sexe: 'F', age: 31 },
  resultats: { _types: ['Groupe sanguin'], _facture_seule: true,
    _examens_coches: { 'Groupe sanguin': ['Groupe sanguin ABO / Rhésus'] },
    _examens_prix: { 'Groupe sanguin': { 'Groupe sanguin ABO / Rhésus': 2000 } },
    _montants: { 'Groupe sanguin': 2000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null };

(async () => {
  const r = createReporter('GRILLE — BPN SÉROLOGIES & GROUPE');
  const srv = await serve(8116);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8116 });
    ctx = app.ctx;
    const { page, errors } = app;
    await page.evaluate((d) => {
      window.__u = []; window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: d, error: null };
        if (nom === 'get_resultat_full') { const x = d.find(z => z.id === params.p_id); return { data: { resultats: x ? x.resultats : {} }, error: null }; }
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: 'x', created_by: 'a', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, [dossSero, dossGs]);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);

    r.section('Hépatite B (Ag HBs + Ac HBc + Ac anti-HBs)');
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('hbs'); });
    await page.waitForTimeout(300);
    r.check('dossier HBs listé', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 1);
    await page.evaluate(() => {
      const set = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
      set('g_920_hbsag', 'Positif', 'change');
      set('g_920_hbcac', 'Négatif', 'change');
      set('g_920_hbsac', '12.5', 'input');
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const hb = await page.evaluate(() => {
      const p = window.__u.find(u => u.p_id === 920); const s = p && p.p_resultats['Immuno-Sérologie'];
      return { ag: s && s['Ag HBs'] && s['Ag HBs'].resultat, hbc: s && s['Ac anti-HBc total'] && s['Ac anti-HBc total'].resultat, hbsac: s && s['Ac anti-HBs'] && s['Ac anti-HBs'].valeur };
    });
    r.check('Ag HBs = Positif', hb.ag, 'Positif');
    r.check('Ac anti-HBc = Négatif', hb.hbc, 'Négatif');
    r.check('Ac anti-HBs (quant) = 12.5', hb.hbsac, '12.5');

    r.section('Groupe sanguin ABO / Rhésus');
    await page.evaluate(() => window.grilleChangeExam('gs'));
    await page.waitForTimeout(300);
    r.check('dossier groupe listé', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 1);
    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('g_921_abo', 'O'); set('g_921_rh', 'Positif');
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const gs = await page.evaluate(() => {
      const p = window.__u.find(u => u.p_id === 921); const g = p && p.p_resultats['Groupe sanguin'];
      return { abo: g && g['Groupe ABO'], rh: g && g['Rhésus'], type: p && p.p_resultats._types.includes('Groupe sanguin') };
    });
    r.check('Groupe ABO = O', gs.abo, 'O');
    r.check('Rhésus = Positif', gs.rh, 'Positif');
    r.check('type Groupe sanguin ajouté', gs.type, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
