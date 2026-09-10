// ✅ v13.162 — Pagination sur mesure du compte rendu : le contenu est découpé en
//   pages A4 de hauteur fixe ; chaque page porte l'ENTÊTE (répétée) en haut et le
//   PIED en bas. Un bilan long produit plusieurs pages ; aucun résultat n'est
//   caché (pas de bloc coupé). On vérifie via crPaginate() dans un vrai DOM.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('COMPTE RENDU — PAGINATION SUR MESURE');
  const srv = await serve(8163);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8163 });
    ctx = app.ctx; const { page, errors } = app;

    const res = await page.evaluate(async () => {
      const G = n => { try { return eval(n) || []; } catch (e) { return []; } };
      // Biochimie longue (toutes les familles) → plusieurs pages.
      const bio = {};
      ['BIO_GLUCIDES','BIO_REIN','BIO_FOIE','BIO_LIPIDES','BIO_IONO','BIO_FER','BIO_CARD','BIO_HORM','BIO_COAG','BIO_AUTRE']
        .map(G).forEach(g => g.forEach((p, i) => { bio[p.name] = { valeur: String(10 + i), unite: p.unit || '', interp: '' }; }));
      const rec = { id: 1, type: 'Biochimie', montant: 25000,
        patient: { nom: 'PAGINATION TEST', dossier: '0001', sexe: 'M', age: 40, date: '2026-09-10' },
        resultats: { _types: ['Biochimie'], _examens_coches: { 'Biochimie': ['Glycémie à jeun'] }, 'Biochimie': bio } };
      const html = await crBuildHTML(rec);
      const div = document.createElement('div'); div.id = 'print-render';
      document.body.appendChild(div); div.innerHTML = html;
      crPaginate(div);
      const pages = div.querySelectorAll('.cr-page-a4');
      const allHaveHeadFoot = Array.from(pages).every(pg =>
        pg.querySelector('.cr-page-head') && pg.querySelector('.cr-page-foot') && pg.querySelector('.cr-page-body'));
      // L'entête (nom CPMI) et le pied (Signature) présents sur CHAQUE page.
      const headEveryPage = Array.from(pages).every(pg => /CPMI DE GRAND-BASSAM/.test(pg.querySelector('.cr-page-head').textContent));
      const footEveryPage = Array.from(pages).every(pg => /Signature du technicien/.test(pg.querySelector('.cr-page-foot').textContent));
      // Aucun bloc perdu : le nombre de tableaux rendus == nombre de blocs source.
      const srcTables = div.querySelectorAll('.cr-src .cr-blk table').length;
      const pagedTables = Array.from(pages).reduce((a, pg) => a + pg.querySelectorAll('.cr-page-body table').length, 0);
      const out = { nbPages: pages.length, allHaveHeadFoot, headEveryPage, footEveryPage, srcTables, pagedTables };
      div.remove();
      return out;
    });

    r.section('Découpage en pages A4');
    r.check('plusieurs pages générées', res.nbPages >= 2, true);
    r.check('chaque page a entête + corps + pied', res.allHaveHeadFoot, true);
    r.check('entête CPMI sur chaque page', res.headEveryPage, true);
    r.check('pied (signature) sur chaque page', res.footEveryPage, true);

    r.section('Aucun résultat perdu');
    r.check('tous les tableaux répartis (aucun caché)', res.pagedTables >= res.srcTables && res.srcTables > 0, true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
