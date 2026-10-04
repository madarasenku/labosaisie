// ✅ v13.210 — iPhone : le pied du compte rendu ne se superpose plus au contenu.
// Stratégie retenue : on GARDE le pied « position:fixed » (seul moyen de le
// coller EN BAS de chaque feuille, y compris la dernière, courte) et on rend le
// pied du <tfoot> TRANSPARENT (opacity:0) pour qu'iOS réserve bien sa hauteur —
// donc aucun chevauchement — sans l'afficher en double. (L'ancienne approche
// v13.207 « pas de pied fixe » posait le pied juste après le dernier examen.)
const { serve, openApp, createReporter } = require('./helpers');

const doss = {
  id: 3101, type: 'Dossier', montant: 7000, created_at: '2026-09-24T18:00:00Z', created_by: 'YERIGUE',
  patient: { nom: 'PIED ESSAI', dossier: '0499-0926', date: '2026-09-24', sexe: 'F', age: '40', medecin: 'DR X' },
  resultats: {
    _types: ['Immuno-Sérologie'],
    _examens_coches: { 'Immuno-Sérologie': ['Ag HBs (Hépatite B)'] },
    'Immuno-Sérologie': { 'Ag HBs': { mode: 'qual', resultat: 'Négatif' } },
  }, prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
};

(async () => {
  const srv = await serve();
  const r = createReporter('IMPRESSION — PIED iOS (pas de chevauchement)');
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  await page.evaluate((d) => {
    window.print = () => {};
    const light = x => { const res = {}; Object.keys(x.resultats || {}).forEach(k => { if (k[0] === '_') res[k] = x.resultats[k]; }); return Object.assign({}, x, { resultats: res }); };
    _sb.rpc = async (n) => {
      if (n === 'get_resultats_light') return { data: [light(d)], error: null };
      if (n === 'get_resultat_full') return { data: [{ resultats: d.resultats }], error: null };
      return { data: [], error: null };
    };
  }, doss);
  await page.evaluate(() => refreshDB(true));
  await page.waitForTimeout(300);
  await page.evaluate(async () => { await printRecord(3101); });
  await page.waitForTimeout(400);
  await page.emulateMedia({ media: 'print' });

  const lire = () => page.evaluate(() => {
    const pr = document.getElementById('print-render');
    const fixed = pr.querySelector('.cr-foot-fixed');
    const tfoot = pr.querySelector('.cr-doc > tfoot .cr-foot');
    const cs = e => e ? getComputedStyle(e) : null;
    return { fixed: cs(fixed) && cs(fixed).display, tfoot: cs(tfoot) && cs(tfoot).visibility };
  });

  r.section('Bureau (Chrome) : pied fixe, tfoot réserve mais invisible');
  await page.evaluate(() => document.getElementById('print-render').classList.remove('cr-ios'));
  let s = await lire();
  r.check('pied fixe affiché', s.fixed !== 'none', true);
  r.check('pied tfoot invisible (réserve la place)', s.tfoot, 'hidden');

  r.section('iOS : pied fixe conservé, tfoot transparent réserve la hauteur');
  await page.evaluate(() => document.getElementById('print-render').classList.add('cr-ios'));
  s = await lire();
  r.check('pied fixe conservé (collé en bas de chaque feuille)', s.fixed !== 'none', true);
  r.check('pied tfoot réserve la hauteur (visible mais transparent, aucun chevauchement)', s.tfoot, 'visible');

  await page.emulateMedia({ media: 'screen' });
  r.check('aucune erreur JS', errors.length, 0);
  await ctx.close();
  srv.close();
  const res = r.summary();
  process.exit(res.allPassed ? 0 : 1);
})();
