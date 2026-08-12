// Deux exigences du 12 août, vérifiées ensemble parce qu'elles touchent les
// mêmes documents : la feuille de résultat et ses exports.
//
// 1. UN DOSSIER NON ENCAISSÉ NE SORT PAS DU LABORATOIRE.
//    La v13.35 empêchait déjà de saisir un résultat non payé — mais rien
//    n'empêchait de l'imprimer ni de l'exporter. Le trou n'était pas dans la
//    règle, il était dans le nombre de portes.
//
// 2. UNE UNITÉ CORRIGÉE DEPUIS ADMINISTRATION DOIT ALLER JUSQU'AU PAPIER.
//    Elle changeait à l'écran et restait à l'ancienne valeur sur la feuille
//    imprimée : le patient repartait avec la mauvaise unité, ce qui est pire
//    qu'une unité absente — elle a l'air juste.
const { serve, openApp, createReporter } = require('./helpers');

const AUJ = new Date().toISOString().slice(0, 10);

// Deux fiches identiques à une chose près : l'une est encaissée, l'autre non.
// Toute différence de comportement entre elles vient donc du paiement.
const FICHES = [
  { id: 501, type: 'Hématologie', montant: 3000, created_at: AUJ + 'T09:00:00Z',
    created_by: 'admin1', prescripteur_id: 1, est_bpn: false,
    restricted_by: null, deleted_at: null,
    patient: { nom: 'PAYEE MARIE', age: 30, sexe: 'F', dossier: 'D501',
               date: AUJ, statut: 'rendu', paiement_status: 'paye',
               paiement_infos: { montant_recu: 3000 } },
    resultats: { _types: ['Hématologie'],
                 'Hémoglobine (Hb)': { valeur: '12.5', unite: 'g/dL' } } },
  { id: 502, type: 'Hématologie', montant: 3000, created_at: AUJ + 'T10:00:00Z',
    created_by: 'admin1', prescripteur_id: 1, est_bpn: false,
    restricted_by: null, deleted_at: null,
    patient: { nom: 'IMPAYEE FANTA', age: 30, sexe: 'F', dossier: 'D502',
               date: AUJ, statut: 'rendu' },
    resultats: { _types: ['Hématologie'],
                 'Hémoglobine (Hb)': { valeur: '12.5', unite: 'g/dL' } } },
];

// Neutralise l'impression réelle et compte les tentatives : c'est la seule
// preuve fiable qu'un document est bien sorti, ou non.
async function espionner(page) {
  await page.evaluate(() => {
    window.__sorties = { print: 0, toasts: [] };
    window.print = () => { window.__sorties.print++; };
    const t = window.toast;
    window.toast = (msg, type) => { window.__sorties.toasts.push(String(msg));
                                    if (typeof t === 'function') return t(msg, type); };
  });
}

const sorties = page => page.evaluate(() => window.__sorties);

(async () => {
  const srv = await serve();
  const r = createReporter('VERROU PAIEMENT ET UNITÉS');

  // ── 1. Impression ────────────────────────────────────────────────
  {
    r.section('Le caissier ne peut pas imprimer un dossier non encaissé');
    const { ctx, page, errors } = await openApp({
      role: 'caissier', username: 'caisse1', userId: 3,
      rpc: { get_resultats_light: FICHES, get_resultat_full: FICHES[1] } });
    await espionner(page);

    await page.evaluate(() => printRecord(502));
    await page.waitForTimeout(900);
    let s = await sorties(page);
    r.check('aucune impression déclenchée', s.print, 0);
    r.check('le refus est expliqué',
            s.toasts.some(t => /non encaiss/i.test(t)), true);

    await page.evaluate(() => printRecord(501));
    await page.waitForTimeout(1200);
    s = await sorties(page);
    r.check('le dossier payé s\'imprime, lui', s.print >= 1, true);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 2. PDF et Excel ──────────────────────────────────────────────
  {
    r.section('Ni PDF ni Excel pour un dossier non encaissé');
    const { ctx, page, errors } = await openApp({
      role: 'caissier', username: 'caisse1', userId: 3,
      rpc: { get_resultats_light: FICHES, get_resultat_full: FICHES[1] } });
    await espionner(page);

    const refusPDF = await page.evaluate(async () => {
      window.__sorties.toasts = [];
      await exportPDF(502);
      return window.__sorties.toasts.slice();
    });
    r.check('PDF refusé', refusPDF.some(t => /non encaiss/i.test(t)), true);

    const refusXls = await page.evaluate(async () => {
      window.__sorties.toasts = [];
      await exportRecord(502);
      return window.__sorties.toasts.slice();
    });
    r.check('Excel refusé', refusXls.some(t => /non encaiss/i.test(t)), true);

    // Le refus doit venir du paiement, pas d'une erreur de génération : on
    // vérifie qu'un dossier payé, lui, ne déclenche aucun refus.
    const surPaye = await page.evaluate(async () => {
      window.__sorties.toasts = [];
      await exportPDF(501);
      return window.__sorties.toasts.slice();
    });
    r.check('le dossier payé n\'est pas refusé',
            surPaye.some(t => /non encaiss/i.test(t)), false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 3. L'administrateur garde la main ────────────────────────────
  {
    r.section('L\'administrateur peut sortir un duplicata');
    const { ctx, page, errors } = await openApp({
      role: 'admin', username: 'admin1', userId: 1,
      rpc: { get_resultats_light: FICHES, get_resultat_full: FICHES[1] } });
    await espionner(page);

    await page.evaluate(() => printRecord(502));
    await page.waitForTimeout(1200);
    const s = await sorties(page);
    r.check('impression autorisée pour l\'admin', s.print >= 1, true);
    r.check('aucun refus affiché',
            s.toasts.some(t => /non encaiss/i.test(t)), false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── 4. Les unités personnalisées suivent jusqu'au document ───────
  {
    r.section('Une unité corrigée en Administration va jusqu\'au papier');
    const { ctx, page, errors } = await openApp({
      role: 'admin', username: 'admin1', userId: 1,
      rpc: { get_resultats_light: FICHES, get_resultat_full: FICHES[0] } });

    // L'admin remplace g/dL par une unité reconnaissable entre mille.
    await page.evaluate(() => {
      const refs = (typeof getCustomRefs === 'function' ? getCustomRefs() : {}) || {};
      refs.hb = Object.assign({}, refs.hb, { unit: 'UNITE-TEST' });
      saveCustomRefs(refs);
    });

    const vu = await page.evaluate(() => ({
      // ce que voit l'écran de saisie
      ecran: getUnit('hb', 'g/dL'),
      // ce que reçoivent la feuille imprimée, le PDF et l'Excel : tous les
      // trois consomment examExpectedRows
      documents: (examExpectedRows('ex_nfs') || [])
        .filter(x => /Hémoglobine/.test(x.name)).map(x => x.unit),
    }));

    r.check('l\'écran affiche la nouvelle unité', vu.ecran, 'UNITE-TEST');
    r.check('les documents aussi', vu.documents.join(','), 'UNITE-TEST');
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
