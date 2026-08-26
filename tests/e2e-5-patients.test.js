// ✅ E2E — Scénario réel demandé :
//  1) Enregistrer 5 patients avec NFS + GE + CRP + SWF via la VRAIE interface
//     (fiche patient → Démarrer la saisie → Enregistrer) sans remplir les résultats.
//  2) Saisir la NFS en série pour les 5.
//  3) Vérifier que la CRP (et le SWF) ne sont PAS touchés et restent à saisir.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('E2E — 5 PATIENTS (NFS+GE+CRP+SWF) → NFS EN SÉRIE');
  const srv = await serve(8140);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8140 });
    ctx = app.ctx; const { page, errors } = app;

    // ── Backend simulé, fidèle au serveur réel ────────────────────────
    await page.evaluate(() => {
      window.__store = []; window.__seq = 5000;
      window.showConfirmModal = async () => true;
      const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
      _sb.rpc = async (n, p) => {
        if (n === 'get_resultats_light') return { data: window.__store.map(light), error: null };
        if (n === 'get_resultats')       return { data: window.__store, error: null };
        if (n === 'get_resultat_full') { const x = window.__store.find(z => z.id === p.p_id); return { data: { resultats: x ? x.resultats : {} }, error: null }; }
        if (n === 'insert_resultat') {
          const row = { id: ++window.__seq, type: p.p_type, patient: p.p_patient, resultats: p.p_resultats,
            montant: p.p_montant, created_at: '2026-08-26T09:00:00Z', created_by: 'admin1',
            prescripteur_id: p.p_prescripteur_id, est_bpn: false, restricted_by: null, deleted_at: null };
          window.__store.push(row); return { data: row, error: null };
        }
        if (n === 'update_resultat') {
          const x = window.__store.find(z => z.id === p.p_id);
          if (x) { if (p.p_resultats != null) x.resultats = p.p_resultats; if (p.p_patient != null) x.patient = p.p_patient; }
          return { data: Object.assign({ created_at: '2026-08-26T09:00:00Z', created_by: 'admin1' }, x), error: null };
        }
        if (n === 'get_next_dossier_num') return { data: window.__seq + 1, error: null };
        return { data: [], error: null };
      };
    });

    // ── 1) Créer 5 patients NFS + GE + CRP + SWF ──────────────────────
    r.section('1) Enregistrement de 5 patients (NFS+GE+CRP+SWF)');
    for (let i = 1; i <= 5; i++) {
      await page.evaluate((i) => {
        showView('saisie');
        try { if (typeof resetFicheIdentif === 'function') resetFicheIdentif(); } catch (e) {}
      }, i);
      await page.waitForTimeout(150);
      await page.evaluate((i) => {
        const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
        set('p_nom', 'PATIENT ' + i); set('p_dossier', '060' + i + '-0826');
        set('p_age', '30'); set('p_sexe', 'M'); set('p_date', '2026-08-26');
        ['ex_nfs','ex_ge','ex_crp','ex_widal'].forEach(id => {
          const c = document.getElementById(id);
          if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
        });
        if (typeof calcFicheTotal === 'function') calcFicheTotal();
      }, i);
      await page.waitForTimeout(120);
      await page.evaluate(() => demarrerSaisie());
      await page.waitForTimeout(250);
      await page.evaluate(() => saveAllTabs());
      await page.waitForTimeout(500);
    }
    const crees = await page.evaluate(() => window.__store.length);
    r.check('5 dossiers créés', crees, 5);
    const meta = await page.evaluate(() => {
      const x = window.__store[0];
      return { coches: x.resultats._examens_coches, types: (x.resultats._types || []).slice().sort().join(','), montant: x.montant };
    });
    r.check('Hématologie = NFS + GE', (meta.coches?.['Hématologie'] || []).length, 2);
    r.check('Immuno-Sérologie = CRP + SWF', (meta.coches?.['Immuno-Sérologie'] || []).length, 2);
    r.check('_types complet', meta.types, 'Hématologie,Immuno-Sérologie');

    // ── 2) NFS en série pour les 5 ────────────────────────────────────
    r.section('2) Saisie de la NFS en série');
    await page.evaluate(() => { _grilleDate = ''; _grilleInclureSaisis = false; ouvrirGrille('nfs'); });
    await page.waitForTimeout(400);
    r.check('5 patients en attente de NFS', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 5);
    await page.evaluate(() => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      [...document.querySelectorAll('#grille-serie tr[data-doss]')].forEach((tr, n) => {
        const d = tr.dataset.doss;
        set('g_'+d+'_nfs_gbc', String(6+n)); set('g_'+d+'_nfs_gr','4.5'); set('g_'+d+'_nfs_hb','13'); set('g_'+d+'_nfs_ht','40');
        set('g_'+d+'_nfs_plt','250'); set('g_'+d+'_nfs_pnn','55'); set('g_'+d+'_nfs_pne','2'); set('g_'+d+'_nfs_pnb','1');
        set('g_'+d+'_nfs_lymp','35'); set('g_'+d+'_nfs_mono','7');
      });
    });
    await page.waitForTimeout(200);
    r.check('5 lignes auto-cochées', await page.evaluate(() => grilleSelectedIds().length), 5);
    await page.evaluate(() => grilleSaveAll());
    await page.waitForTimeout(2500);

    // ── 3) La CRP ne doit PAS avoir été touchée ───────────────────────
    r.section('3) Contrôle : la CRP est intacte');
    const bilan = await page.evaluate(() => {
      const out = { nfsOk: 0, crpEcrasee: 0, cochesPerdues: 0, immunoCree: 0 };
      window.__store.forEach(x => {
        const R = x.resultats || {};
        if (R['Hématologie'] && R['Hématologie']['Globules blancs (GB)'] && R['Hématologie']['Globules blancs (GB)'].valeur) out.nfsOk++;
        const im = R['Immuno-Sérologie'];
        if (im) { out.immunoCree++; if (im['CRP - Valeur']) out.crpEcrasee++; }
        const c = R._examens_coches || {};
        if (!c['Immuno-Sérologie'] || c['Immuno-Sérologie'].length !== 2) out.cochesPerdues++;
      });
      return out;
    });
    r.check('NFS enregistrée pour les 5', bilan.nfsOk, 5);
    r.check('aucune CRP écrasée', bilan.crpEcrasee, 0);
    r.check('examens demandés intacts (CRP+SWF)', bilan.cochesPerdues, 0);
    const pendingCrp = await page.evaluate(() => grillePending('crp').length);
    r.check('les 5 restent à saisir en CRP', pendingCrp, 5);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   JS:', errors.slice(0, 8));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
