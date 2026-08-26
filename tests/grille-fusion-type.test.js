// ✅ v13.131 — Régression : saisir un paramètre en série ne doit PAS effacer
// les autres paramètres du MÊME type d'analyse déjà enregistrés.
// Bug signalé : « quand je remplis un paramètre d'un patient les autres
// disparaissent ». Cause : CRP et VIH (et HBs, VHC, TPHA…) partagent le type
// 'Immuno-Sérologie' ; l'ancien code remplaçait tout le sous-objet.
const { serve, openApp, createReporter } = require('./helpers');

// Un même dossier demande CRP ET VIH (deux paramètres du type Immuno-Sérologie).
const doss = {
  id: 930, type: 'Dossier', montant: 12000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'FUSION SERO', dossier: '0930-0826', sexe: 'F', age: 33 },
  resultats: {
    _types: ['Immuno-Sérologie'], _facture_seule: true,
    _examens_coches: { 'Immuno-Sérologie': ['CRP (Protéine C Réactive)', 'Sérologie VIH 1 & 2'] },
    _examens_prix: { 'Immuno-Sérologie': { 'CRP (Protéine C Réactive)': 5000, 'Sérologie VIH 1 & 2': 7000 } },
    _montants: { 'Immuno-Sérologie': 12000 },
  },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('GRILLE — FUSION MÊME TYPE (CRP + VIH)');
  const srv = await serve(8131);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8131 });
    ctx = app.ctx;
    const { page, errors } = app;

    // Mock qui PERSISTE les mises à jour dans la base fictive (indispensable
    // pour tester deux enregistrements successifs sur le même dossier).
    await page.evaluate((d0) => {
      window.__store = [JSON.parse(JSON.stringify(d0))];
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') {
          // Chargement allégé : ne renvoie QUE les clés « _… » (comme en prod).
          const light = window.__store.map(x => {
            const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; });
            return Object.assign({}, x, { resultats: res });
          });
          return { data: light, error: null };
        }
        if (nom === 'get_resultat_full') {
          const x = window.__store.find(z => z.id === params.p_id);
          return { data: { resultats: x ? x.resultats : {} }, error: null };
        }
        if (nom === 'update_resultat') {
          const x = window.__store.find(z => z.id === params.p_id);
          if (x) { if (params.p_resultats != null) x.resultats = params.p_resultats; if (params.p_patient != null) x.patient = params.p_patient; }
          return { data: Object.assign({ id: params.p_id, type: 'Dossier' }, x), error: null };
        }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, doss);

    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(200);

    // 1) Enregistrer le VIH en série.
    r.section('Étape 1 — VIH');
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('vih'); });
    await page.waitForTimeout(300);
    r.check('dossier VIH listé', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 1);
    await page.evaluate(() => { const el = document.getElementById('g_930_vih_vih1'); el.value = 'Négatif'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(700);
    r.check('VIH enregistré', await page.evaluate(() => { const x = window.__store.find(z => z.id === 930); return x.resultats['Immuno-Sérologie'] && x.resultats['Immuno-Sérologie']['VIH 1 & 2'] && x.resultats['Immuno-Sérologie']['VIH 1 & 2'].resultat; }), 'Négatif');

    // 2) Enregistrer la CRP en série (même type Immuno-Sérologie).
    r.section('Étape 2 — CRP (ne doit pas effacer le VIH)');
    await page.evaluate(() => window.grilleChangeExam('crp'));
    await page.waitForTimeout(300);
    r.check('dossier CRP listé', await page.evaluate(() => document.querySelectorAll('#grille-serie tr[data-doss]').length), 1);
    await page.evaluate(() => { const el = document.getElementById('g_930_crp_crp'); el.value = 'neg'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(700);

    const fin = await page.evaluate(() => {
      const x = window.__store.find(z => z.id === 930);
      const s = x.resultats['Immuno-Sérologie'] || {};
      return {
        vih: s['VIH 1 & 2'] && s['VIH 1 & 2'].resultat,
        crp: s['CRP - Valeur'],
      };
    });
    r.check('CRP enregistrée', fin.crp, 'neg');
    r.check('VIH TOUJOURS présent après CRP', fin.vih, 'Négatif');
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
