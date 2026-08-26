// ✅ v13.120 — GRILLE : saisie CRP en série (autre paramètre que la NFS).
//
// Vérifie que le moteur générique fonctionne pour un paramètre à choix
// (select) : on liste les dossiers dont la CRP est demandée mais pas remplie,
// on renseigne la colonne CRP, et l'enregistrement produit le bon JSON sous
// « Immuno-Sérologie ».
const { serve, openApp, createReporter } = require('./helpers');

const mkDoss = (id, nom) => ({
  id, type: 'Dossier', montant: 3500, created_at: '2026-08-20T09:00:00Z',
  patient: { nom, dossier: '0' + id + '-0826', sexe: 'F', age: 33 },
  resultats: { _types: ['Immuno-Sérologie'], _facture_seule: true,
    _examens_coches: { 'Immuno-Sérologie': ['CRP — Protéine C-réactive'] },
    _examens_prix: { 'Immuno-Sérologie': { 'CRP — Protéine C-réactive': 3500 } },
    _montants: { 'Immuno-Sérologie': 3500 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null });

const DOSSIERS = [mkDoss(801, 'CRP UN'), mkDoss(802, 'CRP DEUX')];

(async () => {
  const r = createReporter('GRILLE — SAISIE CRP EN SÉRIE');
  const srv = await serve(8112);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8112 });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((dossiers) => {
      window.__updates = [];
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: dossiers, error: null };
        if (nom === 'get_resultat_full') { const d = dossiers.find(x => x.id === params.p_id); return { data: { resultats: d ? d.resultats : {} }, error: null }; }
        if (nom === 'update_resultat') { window.__updates.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: '2026-08-20T10:00:00Z', created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, DOSSIERS);

    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(400);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);

    r.section('Ouvrir la grille sur CRP');
    await page.evaluate(() => { _grilleDate = ''; window.ouvrirGrille('crp'); });
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => ({
      lignes: document.querySelectorAll('#grille-serie tr[data-doss]').length,
      selValue: /CRP/.test(document.getElementById('grille-serie').innerHTML) ? 'crp' : undefined,
      aSelectCrp: !!document.getElementById('g_801_crp_crp') && document.getElementById('g_801_crp_crp').tagName === 'SELECT',
    }));
    r.check('2 dossiers CRP en attente', g.lignes, 2);
    r.check('sélecteur positionné sur CRP', g.selValue, 'crp');
    r.check('cellule CRP est un menu déroulant', g.aSelectCrp, true);

    r.section('Renseigner et enregistrer');
    await page.evaluate(() => { const a = document.getElementById('g_801_crp_crp'); a.value = 'neg'; a.dispatchEvent(new Event('change', { bubbles: true })); const b = document.getElementById('g_802_crp_crp'); b.value = '12'; b.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.grilleSaveAll());
    await page.waitForTimeout(900);

    const res = await page.evaluate(() => {
      const byId = {}; window.__updates.forEach(p => { byId[p.p_id] = p; });
      const crpOf = p => p && p.p_resultats && p.p_resultats['Immuno-Sérologie'] && p.p_resultats['Immuno-Sérologie']['CRP - Valeur'];
      return { n: window.__updates.length, crp801: crpOf(byId[801]), crp802: crpOf(byId[802]),
        typeInclus: byId[801] && byId[801].p_resultats._types.includes('Immuno-Sérologie') };
    });
    r.check('2 enregistrements émis', res.n, 2);
    r.check('CRP 801 = neg', res.crp801, 'neg');
    r.check('CRP 802 = 12', res.crp802, '12');
    r.check('type Immuno-Sérologie ajouté', res.typeInclus, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 4));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
})();
