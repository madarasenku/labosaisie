// ✅ v13.133 — Saisie en série : correction (inclure les déjà saisis) +
// impression du lot (un compte rendu par patient).
const { serve, openApp, createReporter } = require('./helpers');

const dossNfs = (id) => ({
  id, type: 'Dossier', montant: 5000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'SERIE NFS ' + id, dossier: '0' + id + '-0826', sexe: 'M', age: 40 },
  resultats: {
    _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ['NFS (Hémogramme)'] },
    _examens_prix: { 'Hématologie': { 'NFS (Hémogramme)': 5000 } },
    _montants: { 'Hématologie': 5000 },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
});

(async () => {
  const r = createReporter('GRILLE — CORRECTION + IMPRESSION DU LOT');
  const srv = await serve(8133);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8133 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d0) => {
      window.__store = JSON.parse(JSON.stringify(d0));
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') {
          const light = window.__store.map(x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); });
          return { data: light, error: null };
        }
        if (nom === 'get_resultat_full') { const x = window.__store.find(z => z.id === params.p_id); return { data: { resultats: x ? x.resultats : {} }, error: null }; }
        if (nom === 'update_resultat') { const x = window.__store.find(z => z.id === params.p_id); if (x && params.p_resultats != null) x.resultats = params.p_resultats; return { data: { id: params.p_id }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, [dossNfs(950), dossNfs(951)]);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);

    // Enregistrer une NFS en série pour 950 et 951.
    r.section('Enregistrement du lot (950 + 951)');
    await page.evaluate(() => { _grilleDate = ''; _grilleInclureSaisis = false; window.ouvrirGrille('nfs'); });
    await page.waitForTimeout(300);
    r.check('2 dossiers en attente', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 2);
    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      [950, 951].forEach(dd => ['gbc','gr','hb','ht','plt','pnn','pne','pnb','lymp','mono'].forEach((k,i) => set('g_'+dd+'_nfs_'+k, String(7+i))));
    });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(900);
    r.check('lot mémorisé (2 ids)', await page.evaluate(() => _grilleDernierLot.length), 2);
    r.check('bouton « Imprimer le lot » affiché', await page.evaluate(() => /Imprimer le lot/.test(document.getElementById('grille-serie').innerHTML)), true);

    // Après enregistrement, la liste par défaut est vide (déjà saisis exclus).
    r.section('Correction — inclure les déjà saisis');
    r.check('0 en attente par défaut', await page.evaluate(() => grillePending('nfs').length), 0);
    r.check('2 réapparaissent avec « déjà saisis »', await page.evaluate(() => { _grilleInclureSaisis = true; return grillePending('nfs').length; }), 2);
    await page.evaluate(() => { _grilleInclureSaisis = false; });

    // Impression du lot : stub window.print et vérifier le contenu injecté.
    r.section('Impression du lot');
    await page.evaluate(() => { window.__printed = null; window.print = () => { window.__printed = (document.getElementById('print-render') || {}).innerHTML || ''; }; });
    await page.evaluate(() => window.grilleImprimerLot());
    await page.waitForTimeout(1200);
    const printed = await page.evaluate(() => window.__printed || '');
    r.check('impression déclenchée', printed.length > 0, true);
    r.check('compte rendu du 950 présent', /SERIE NFS 950/.test(printed), true);
    r.check('compte rendu du 951 présent', /SERIE NFS 951/.test(printed), true);
    r.check('saut de page entre les deux', /page-break-after\s*:\s*always/.test(printed), true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
