// ✅ v13.164 — Pagination du compte rendu PAR LE NAVIGATEUR (média impression).
//   Chaque compte rendu est une table `.cr-doc` :
//     · <thead> = entête → répétée en haut de chaque feuille (table-header-group) ;
//     · <tfoot> = pied → réserve sa hauteur en bas du contenu (jamais chevauché) ;
//     · <tbody> = les tableaux de résultats, qui s'écoulent sur autant de feuilles
//       que nécessaire (un bilan long déborde sur la feuille suivante).
//   En plus, un pied `position:fixed` (`.cr-foot-fixed`) est collé au bas de CHAQUE
//   feuille imprimée. On vérifie la STRUCTURE qui garantit tout cela dans un vrai
//   DOM (le nombre de feuilles, lui, est décidé par le moteur d'impression).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('COMPTE RENDU — PAGINATION (navigateur, entête+pied répétés)');
  const srv = await serve(8163);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8163 });
    ctx = app.ctx; const { page, errors } = app;

    const res = await page.evaluate(async () => {
      const G = n => { try { return eval(n) || []; } catch (e) { return []; } };
      // Biochimie longue (toutes les familles) → plusieurs tableaux.
      const bio = {};
      ['BIO_GLUCIDES','BIO_REIN','BIO_FOIE','BIO_LIPIDES','BIO_IONO','BIO_FER','BIO_CARD','BIO_HORM','BIO_COAG','BIO_AUTRE']
        .map(G).forEach(g => g.forEach((p, i) => { bio[p.name] = { valeur: String(10 + i), unite: p.unit || '', interp: '' }; }));
      const rec = { id: 1, type: 'Biochimie', montant: 25000,
        patient: { nom: 'PAGINATION TEST', dossier: '0001', sexe: 'M', age: 40, date: '2026-09-10' },
        resultats: { _types: ['Biochimie'], _examens_coches: { 'Biochimie': ['Glycémie à jeun'] }, 'Biochimie': bio } };
      const html = await crBuildHTML(rec);
      const div = document.createElement('div'); div.id = 'print-render';
      document.body.appendChild(div); div.innerHTML = html;

      const doc = div.querySelector('table.cr-doc');
      const thead = doc && doc.querySelector('thead');
      const tfoot = doc && doc.querySelector('tfoot');
      const body = doc && doc.querySelector('tbody .cr-body');
      const footFixed = div.querySelector('.cr-foot-fixed');
      const out = {
        aUneTable: !!doc,
        theadRepete: !!thead && getComputedStyle(thead).display === 'table-header-group',
        tfootRepete: !!tfoot && getComputedStyle(tfoot).display === 'table-footer-group',
        enteteCPMI: !!thead && /CPMI DE GRAND-BASSAM/.test(thead.textContent),
        piedSignatureTfoot: !!tfoot && /Signature du technicien/.test(tfoot.textContent),
        piedFixeEnBas: !!footFixed && getComputedStyle(footFixed).position === 'fixed'
                        && /Signature du technicien/.test(footFixed.textContent),
        // Aucun tableau de résultat perdu : tous sont dans le corps.
        nbTables: body ? body.querySelectorAll('table.cr-t').length : 0,
      };
      div.remove();
      return out;
    });

    r.section('Structure table-cadre (entête + pied répétés)');
    r.check('une table .cr-doc', res.aUneTable, true);
    r.check('entête <thead> répétée (table-header-group)', res.theadRepete, true);
    r.check('pied <tfoot> réservé (table-footer-group)', res.tfootRepete, true);
    r.check('entête CPMI présente', res.enteteCPMI, true);
    r.check('pied (signature) dans le tfoot', res.piedSignatureTfoot, true);

    r.section('Pied toujours en bas');
    r.check('pied fixe (position:fixed) collé en bas', res.piedFixeEnBas, true);

    r.section('Aucun résultat perdu');
    r.check('plusieurs tableaux de résultats présents', res.nbTables >= 5, true);

    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));
    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
