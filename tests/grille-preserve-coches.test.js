// ✅ v13.135 — Régression du bug « les examens demandés disparaissent » :
// un patient NFS + GE + CRP, saisi en série (NFS puis CRP), doit conserver
// TOUTES ses métadonnées (_examens_coches, _examens_prix, _montants,
// _reception_seule) et son _types complet ; et rester listé pour la CRP après
// l'enregistrement de la NFS.
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 990, type: 'Dossier', montant: 11000, created_at: '2026-08-26T09:00:00Z',
  patient: { nom: 'NFS GE CRP', dossier: '0990-0826', sexe: 'M', age: 30 },
  resultats: {
    _types: ['Hématologie', 'Immuno-Sérologie'], _facture_seule: true, _reception_seule: false,
    _examens_coches: {
      'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'],
      'Immuno-Sérologie': ['CRP — Protéine C-réactive'],
    },
    _examens_prix: {
      'Hématologie': { 'NFS — Numération Formule Sanguine': 5000, 'Goutte épaisse / TDR Paludisme': 0 },
      'Immuno-Sérologie': { 'CRP — Protéine C-réactive': 6000 },
    },
    _montants: { 'Hématologie': 5000, 'Immuno-Sérologie': 6000 },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('GRILLE — MÉTADONNÉES PRÉSERVÉES (NFS+GE+CRP)');
  const srv = await serve(8135);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8135 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((d0) => {
      window.__store = [JSON.parse(JSON.stringify(d0))];
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') {
          return { data: window.__store.map(x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); }), error: null };
        }
        if (nom === 'get_resultat_full') { const x = window.__store.find(z => z.id === params.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
        if (nom === 'update_resultat') { const x = window.__store.find(z => z.id === params.p_id); if (x && params.p_resultats != null) x.resultats = params.p_resultats; return { data: Object.assign({ id: params.p_id, type: 'Dossier' }, x), error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, doss);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);

    // Étape 1 — NFS en série.
    r.section('NFS en série');
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('nfs'); });
    await page.waitForTimeout(300);
    r.check('patient listé pour NFS', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 1);
    await page.evaluate(() => { const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }; ['gbc','gr','hb','ht','plt','pnn','pne','pnb','lymp','mono'].forEach((k,i) => set('g_990_nfs_'+k, String(7+i))); });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);

    const apres = await page.evaluate(() => { const x = window.__store.find(z => z.id === 990); return x.resultats; });
    r.check('_examens_coches conservé (2 types)', Object.keys(apres._examens_coches || {}).sort().join(','), 'Hématologie,Immuno-Sérologie');
    r.check('CRP toujours dans _examens_coches', (apres._examens_coches['Immuno-Sérologie'] || []).join(','), 'CRP — Protéine C-réactive');
    r.check('_examens_prix conservé', !!apres._examens_prix, true);
    r.check('_montants conservé', !!apres._montants, true);
    r.check('_reception_seule conservé', apres._reception_seule, false);
    r.check('_types complet (2)', (apres._types || []).slice().sort().join(','), 'Hématologie,Immuno-Sérologie');
    r.check('NFS enregistrée', !!(apres['Hématologie'] && apres['Hématologie']['Globules blancs (GB)']), true);

    // Étape 2 — le patient doit RESTER listé pour la CRP.
    r.section('CRP encore disponible après NFS');
    await page.evaluate(() => window.grilleChangeExam('crp'));
    await page.waitForTimeout(300);
    r.check('patient listé pour CRP', await page.evaluate(() => grillePending('crp').length), 1);
    await page.evaluate(() => { const el = document.getElementById('g_990_crp_crp'); el.value = 'neg'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(800);
    const fin = await page.evaluate(() => { const x = window.__store.find(z => z.id === 990); return { crp: x.resultats['Immuno-Sérologie'] && x.resultats['Immuno-Sérologie']['CRP - Valeur'], hb: !!(x.resultats['Hématologie'] && x.resultats['Hématologie']['Globules blancs (GB)']), coches: Object.keys(x.resultats._examens_coches || {}).length }; });
    r.check('CRP enregistrée', fin.crp, 'neg');
    r.check('NFS toujours présente', fin.hb, true);
    r.check('_examens_coches toujours complet', fin.coches, 2);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
