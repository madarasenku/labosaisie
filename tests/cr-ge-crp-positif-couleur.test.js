// Sur le compte rendu, la case Résultat de la GE et de la CRP est SURLIGNÉE
// (classe cr-ano : gras + fond gris) lorsque le résultat est POSITIF.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('CR — GE / CRP POSITIVES SURLIGNÉES');
  const srv = await serve(8178);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8178 });
    ctx = app.ctx; const { page, errors } = app;

    const out = await page.evaluate(async () => {
      const mk = (geRes, crp) => ({
        id: 1, type: 'Dossier', montant: 6500,
        patient: { nom: 'TEST', dossier: '0001-0926', sexe: 'M', age: 30, date: '2026-09-18' },
        resultats: {
          _types: ['Hématologie', 'Immuno-Sérologie'],
          _examens_coches: { 'Hématologie': ['Goutte épaisse (GE)'], 'Immuno-Sérologie': ['CRP — Protéine C-réactive'] },
          'Hématologie': { 'GE - Résultat': geRes, 'GE - Densité parasitaire (/µL)': geRes === 'Positif' ? '2400' : '' },
          'Immuno-Sérologie': { 'CRP - Valeur': crp },
        },
      });
      // Extrait la LIGNE DE VALEUR (cr-val) contenant un libellé — pas l'en-tête,
      // dont le titre peut répéter le libellé (ex. « CRP … »).
      const rowOf = (html, label) => {
        const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
        return rows.find(tr => tr.includes(label) && tr.includes('cr-val')) || '';
      };
      const pos = await crBuildHTML(mk('Positif', '96'));
      const neg = await crBuildHTML(mk('Négatif', 'neg'));
      return {
        gePosAno: /cr-ano/.test(rowOf(pos, 'Résultat GE')),
        crpPosAno: /cr-ano/.test(rowOf(pos, 'CRP')),
        geNegPlain: !/cr-ano/.test(rowOf(neg, 'Résultat GE')),
        crpNegPlain: !/cr-ano/.test(rowOf(neg, 'CRP')),
      };
    });

    r.section('Positif → surligné, Négatif → normal');
    r.check('GE positive surlignée', out.gePosAno, true);
    r.check('CRP positive surlignée', out.crpPosAno, true);
    r.check('GE négative non surlignée', out.geNegPlain, true);
    r.check('CRP négative non surlignée', out.crpNegPlain, true);
    r.check('aucune erreur JS', errors.length, 0);
    if (errors.length) console.log('   ', errors.slice(0, 5));

    const s = r.summary();
    process.exitCode = s.allPassed ? 0 : 1;
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { if (ctx) await ctx.close(); srv.close(); }
})();
