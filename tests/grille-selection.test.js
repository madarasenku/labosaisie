// ✅ v13.134 — Grille série : coche « terminé » automatique quand la ligne est
// complète, décochable à la main ; l'enregistrement ne prend que les cochés.
const { serve, openApp, createReporter } = require('./helpers');

const dossCrp = (id) => ({
  id, type: 'Dossier', montant: 5000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'CRP ' + id, dossier: '0' + id + '-0826', sexe: 'M', age: 40 },
  resultats: {
    _types: ['Immuno-Sérologie'], _facture_seule: true,
    _examens_coches: { 'Immuno-Sérologie': ['CRP (Protéine C Réactive)'] },
    _examens_prix: { 'Immuno-Sérologie': { 'CRP (Protéine C Réactive)': 5000 } },
    _montants: { 'Immuno-Sérologie': 5000 },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});

(async () => {
  const r = createReporter('GRILLE — COCHE « TERMINÉ » (auto + manuel)');
  const srv = await serve(8134);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8134 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d) => {
      window.__u = []; window.__confirm = true; window.showConfirmModal = async () => window.__confirm;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: d, error: null };
        if (nom === 'get_resultat_full') { const x = d.find(z => z.id === params.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
        if (nom === 'update_resultat') { window.__u.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, [dossCrp(960), dossCrp(961)]);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('crp'); });
    await page.waitForTimeout(300);

    r.section('Auto-coche quand complet');
    r.check('2 patients listés', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 2);
    r.check('aucun coché au départ', await page.evaluate(() => grilleSelectedIds().length), 0);
    // Remplir 960 complètement (une seule colonne CRP) → auto-coché.
    await page.evaluate(() => { const el = document.getElementById('g_960_crp_crp'); el.value = 'neg'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    r.check('960 auto-coché', await page.evaluate(() => document.getElementById('gsel_960').checked), true);
    r.check('compteur = 1', await page.evaluate(() => document.getElementById('grille-selcount').textContent), '1');
    r.check('961 non coché', await page.evaluate(() => document.getElementById('gsel_961').checked), false);

    r.section('Décochage manuel respecté');
    await page.evaluate(() => { const cb = document.getElementById('gsel_960'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    // Re-déclencher un changement de cellule : ne doit PAS re-cocher (override manuel).
    await page.evaluate(() => { const el = document.getElementById('g_960_crp_crp'); el.dispatchEvent(new Event('change', { bubbles: true })); });
    r.check('960 reste décoché', await page.evaluate(() => document.getElementById('gsel_960').checked), false);
    // Enregistrer sans sélection → rien envoyé.
    await page.evaluate(() => { window.__u = []; });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(400);
    r.check('aucun enregistrement sans coche', await page.evaluate(() => window.__u.length), 0);

    r.section('Enregistre uniquement les cochés');
    // Re-cocher 960 manuellement, laisser 961 décoché → seul 960 enregistré.
    await page.evaluate(() => { const cb = document.getElementById('gsel_960'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => { window.__u = []; window.grilleSaveAll(); });
    await page.waitForTimeout(600);
    r.check('seul 960 enregistré', await page.evaluate(() => window.__u.map(u => u.p_id).sort().join(',')), '960');

    r.section('Tout cocher');
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('crp'); });
    await page.waitForTimeout(300);
    // 960 sort de la liste (déjà saisi) ; il reste 961.
    await page.evaluate(() => { const el = document.getElementById('g_961_crp_crp'); el.value = '12'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => { const all = document.getElementById('grille-selall'); all.checked = true; all.dispatchEvent(new Event('change', { bubbles: true })); });
    r.check('961 coché via « tout »', await page.evaluate(() => document.getElementById('gsel_961').checked), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
