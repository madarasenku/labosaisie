// ✅ v13.140 — Grille unifiée : une ligne par patient, tous ses examens alignés,
// UNE seule écriture atomique par patient.
const { serve, openApp, createReporter } = require('./helpers');

const mk = (id, n) => ({
  id, type: 'Dossier', montant: 11000, created_at: '2026-08-26T09:00:00Z',
  patient: { nom: 'PATIENT ' + n, dossier: '09' + n + '0-0826', sexe: 'M', age: '30', date: '2026-08-26' },
  resultats: {
    _types: ['Hématologie', 'Immuno-Sérologie'], _facture_seule: true,
    _examens_coches: {
      'Hématologie': ['NFS — Numération Formule Sanguine', 'Goutte épaisse / TDR Paludisme'],
      'Immuno-Sérologie': ['CRP — Protéine C-réactive', 'Widal & Félix (SWF)'],
    },
    _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 3000 }, 'Immuno-Sérologie': { 'CRP — Protéine C-réactive': 3500 } },
    _montants: { 'Hématologie': 3000, 'Immuno-Sérologie': 8000 },
  },
  created_by: 'admin1', prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
});

(async () => {
  const r = createReporter('GRILLE UNIFIÉE — 1 LIGNE = TOUS LES EXAMENS');
  const srv = await serve(8146);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8146 });
    ctx = app.ctx; const { page, errors } = app;
    await page.evaluate((ds) => {
      window.__store = JSON.parse(JSON.stringify(ds)); window.showConfirmModal = async () => true;
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (n, p) => {
        if (n === 'get_resultats_light') return { data: window.__store.map(light), error: null };
        if (n === 'get_resultat_full') { const x = window.__store.find(z => z.id === p.p_id); return { data: [{ resultats: x ? x.resultats : {} }], error: null }; }
        if (n === 'update_resultat') { const x = window.__store.find(z => z.id === p.p_id); if (x && p.p_resultats != null) x.resultats = p.p_resultats; window.__nUpd = (window.__nUpd || 0) + 1; return { data: Object.assign({ created_at: 'x', created_by: 'a' }, x), error: null }; }
        return { data: [], error: null };
      };
    }, [mk(9101, 1), (function () {
      const d = mk(9102, 2);
      d.resultats._examens_coches = { 'Hématologie': ['NFS — Numération Formule Sanguine'] };
      d.resultats._types = ['Hématologie'];
      return d;
    })()]);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { showView('saisie'); _grilleDate = ''; _grilleInclureSaisis = false; ouvrirGrille(); });
    await page.waitForTimeout(500);

    r.section('Structure de la grille');
    r.check('2 patients listés', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 2);
    r.check('colonne NFS présente', await page.evaluate(() => /NFS — Hémogramme/.test(document.getElementById('grille-serie').innerHTML)), true);
    r.check('colonne CRP présente', await page.evaluate(() => />CRP</.test(document.getElementById('grille-serie').innerHTML)), true);
    r.check('cellule NFS du patient 1', await page.evaluate(() => !!document.getElementById('g_9101_nfs_gbc')), true);
    r.check('cellule CRP du patient 1', await page.evaluate(() => !!document.getElementById('g_9101_crp_crp')), true);
    // Le patient 2 n'a pas la CRP → sa case CRP doit être grisée (pas de champ).
    r.check('patient 2 sans champ CRP', await page.evaluate(() => !document.getElementById('g_9102_crp_crp')), true);
    r.check('case grisée affichée', await page.evaluate(() => /#f1f3f5/.test(document.getElementById('grille-serie').innerHTML)), true);

    r.section('Saisie NFS + CRP sur la même ligne');
    await page.evaluate(() => {
      const set = (id, v, ev) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
      ['gbc','gr','hb','ht','plt','pnn','pne','pnb','lymp','mono'].forEach((k, i) => set('g_9101_nfs_' + k, String(5 + i), 'input'));
      set('g_9101_crp_crp', '48', 'change');
    });
    await page.waitForTimeout(200);
    r.check('ligne auto-cochée quand complète', await page.evaluate(() => document.getElementById('gsel_9101').checked), true);
    r.check('patient 2 non coché', await page.evaluate(() => document.getElementById('gsel_9102').checked), false);

    await page.evaluate(() => { window.__nUpd = 0; return grilleSaveAll(); });
    await page.waitForTimeout(1500);

    r.section('Une seule écriture, tout enregistré');
    r.check('1 seul update pour le patient', await page.evaluate(() => window.__nUpd), 1);
    const x = await page.evaluate(() => {
      const d = window.__store.find(z => z.id === 9101); const R = d.resultats;
      return { gb: R['Hématologie'] && R['Hématologie']['Globules blancs (GB)'] && R['Hématologie']['Globules blancs (GB)'].valeur,
               crp: R['Immuno-Sérologie'] && R['Immuno-Sérologie']['CRP - Valeur'],
               serie: R._saisi_serie, coches: Object.keys(R._examens_coches || {}).length,
               types: (R._types || []).slice().sort().join(','), montants: !!R._montants };
    });
    r.check('NFS enregistrée', x.gb, '5');
    r.check('CRP enregistrée', x.crp, '48');
    r.check('marqueurs série nfs+crp', Object.keys(x.serie || {}).sort().join(','), 'crp,nfs');
    r.check('examens demandés intacts', x.coches, 2);
    r.check('types intacts', x.types, 'Hématologie,Immuno-Sérologie');
    r.check('montants intacts', x.montants, true);
    r.check('patient 2 non touché', await page.evaluate(() => { const d = window.__store.find(z => z.id === 9102); return !!(d.resultats['Hématologie']); }), false);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 6));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
