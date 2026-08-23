// ✅ v13.121 — PAILLASSE + HISTORIQUE : ouvrir un dossier existant dans la
// paillasse pour le compléter/modifier, en gardant les patients déjà ouverts.
//
// Scénario : un patient NEUF est ouvert (A). Depuis l'historique, on ouvre un
// dossier existant (benchOpenRecord) : il s'ajoute comme onglet, en mode
// édition (_editingRecordId). On bascule A ⇄ existant (le mode édition suit),
// puis on enregistre l'existant : mise à jour du dossier (pas de création),
// l'onglet se ferme et on reste sur A (pas de saut vers l'historique).
const { serve, openApp, createReporter, setField } = require('./helpers');

const EXISTANT = {
  id: 900, type: 'Dossier', montant: 3000, created_at: '2026-08-20T09:00:00Z',
  patient: { nom: 'DOSSIER EXISTANT', dossier: '0900-0826', date: '2026-08-20', sexe: 'F', age: 40, paiement_status: 'paye' },
  resultats: { _types: ['Hématologie'], _facture_seule: true,
    _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] },
    _examens_prix: { 'Hématologie': { 'NFS — Numération Formule Sanguine': 3000 } },
    _montants: { 'Hématologie': 3000 } },
  created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const r = createReporter('PAILLASSE — ÉDITION DEPUIS L\'HISTORIQUE');
  const srv = await serve(8113);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8113,
      rpc: { get_next_dossier_num: '0901-0826' } });
    ctx = app.ctx;
    const { page, errors } = app;

    await page.evaluate((ex) => {
      window.__updates = [];
      window.showConfirmModal = async () => true;
      _sb.rpc = async (nom, params) => {
        if (nom === 'get_resultats_light') return { data: [ex], error: null };
        if (nom === 'get_resultat_full') return { data: { resultats: ex.resultats }, error: null };
        if (nom === 'get_next_dossier_num') return { data: '0901-0826', error: null };
        if (nom === 'update_resultat') { window.__updates.push(params); return { data: { id: params.p_id, type: 'Dossier', patient: params.p_patient, resultats: params.p_resultats, montant: params.p_montant, created_at: '2026-08-20T10:00:00Z', created_by: 'admin1', prescripteur_id: 1, est_bpn: false, restricted_by: null }, error: null }; }
        if (nom === 'insert_resultat') { window.__updates.push({ insert: true, ...params }); return { data: { id: 950, dossier: '0901-0826' }, error: null }; }
        if (nom === 'get_restriction_status') return { data: [], error: null };
        return { data: [], error: null };
      };
    }, EXISTANT);
    await page.evaluate(() => refreshDB(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { showView('saisie'); } catch (e) {} });
    await page.waitForTimeout(300);

    // ── Patient A neuf, ouvert dans la paillasse ──
    r.section('Patient neuf A ouvert');
    await setField(page, 'p_nom', 'PATIENT A');
    await page.evaluate(() => { const c = document.getElementById('ex_nfs'); if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } if (typeof calcFicheTotal === 'function') calcFicheTotal(); });
    await page.evaluate(() => window.demarrerSaisie());
    await page.waitForTimeout(400);
    r.check('1 onglet (A)', await page.evaluate(() => _bench.length), 1);

    // ── Ouvrir le dossier existant depuis l'historique ──
    r.section('Ouvrir le dossier existant dans la paillasse');
    await page.evaluate(() => window.benchOpenRecord(900));
    await page.waitForTimeout(600);
    const apres = await page.evaluate(() => ({
      n: _bench.length,
      editing: _editingRecordId,
      chipEdit: document.getElementById('paillasse-chips').textContent.includes('✎'),
      nomForm: document.getElementById('p_nom')?.value,
    }));
    r.check('2 onglets (A + existant)', apres.n, 2);
    r.check('mode édition actif sur l\'existant', apres.editing, 900);
    r.check('onglet marqué ✎ (existant)', apres.chipEdit, true);
    r.check('formulaire chargé sur l\'existant', apres.nomForm, 'DOSSIER EXISTANT');

    // ── Basculer A ⇄ existant : le mode édition suit ──
    r.section('Bascule : le mode édition suit l\'onglet');
    const keys = await page.evaluate(() => _bench.map(e => ({ key: e.key, rec: e.recordId, label: e.label })));
    const keyA = keys.find(k => k.label === 'PATIENT A').key;
    const keyE = keys.find(k => k.rec === 900).key;
    await page.evaluate((k) => window.benchGo(k), keyA);
    await page.waitForTimeout(400);
    r.check('sur A : pas en édition', await page.evaluate(() => _editingRecordId), null);
    await page.evaluate((k) => window.benchGo(k), keyE);
    await page.waitForTimeout(400);
    r.check('retour existant : édition rétablie', await page.evaluate(() => _editingRecordId), 900);

    // ── Enregistrer l'existant : update (pas insert), onglet fermé, reste sur A ──
    r.section('Enregistrer l\'existant');
    await page.evaluate(() => { const el = document.getElementById('v_gbc'); if (el) { el.value = '6.5'; el.dispatchEvent(new Event('input', { bubbles: true })); } });
    await page.evaluate(() => window.saveAllTabs());
    await page.waitForTimeout(900);
    const fin = await page.evaluate(() => ({
      updates: window.__updates.filter(u => !u.insert && u.p_id === 900).length,
      inserts: window.__updates.filter(u => u.insert).length,
      reste: _bench.map(e => e.label),
      vue: (typeof _currentView !== 'undefined') ? _currentView : (document.querySelector('#view-saisie') && document.querySelector('#view-saisie').offsetParent !== null ? 'saisie' : '?'),
    }));
    r.check('dossier existant mis à jour (update)', fin.updates, 1);
    r.check('aucune création parasite (insert)', fin.inserts, 0);
    r.check('onglet existant fermé, A reste', fin.reste.join(','), 'PATIENT A');
    r.check('reste sur la saisie (pas de saut historique)', fin.vue, 'saisie');
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
