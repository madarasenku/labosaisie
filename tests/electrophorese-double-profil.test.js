// ✅ v13.173 — DOUBLE PROFIL ÉLECTROPHORÈSE.
//
// Cas réel (dossier ADJETOUAN) : le « Profil Hb » posé est « Profil AS
// (Drépanocytose trait) » mais le « Commentaire Hb » a gardé un texte pré-rempli
// d'une saisie antérieure — « Électrophorèse normale (profil AA). ». Le compte
// rendu affichait alors DEUX profils opposés (AS puis AA). Le commentaire qui
// n'est qu'une REDITE de profil ne doit plus apparaître quand un profil est posé ;
// un vrai commentaire clinique, lui, reste affiché.
const { serve, openApp, createReporter } = require('./helpers');

function dossier(commentaireHb) {
  return {
    id: 3101, type: 'Dossier', montant: 6000, created_at: '2026-09-07T12:00:00Z', created_by: 'YERIGUE',
    patient: { nom: 'EPHB ESSAI', dossier: '0099-0926', date: '2026-09-07', sexe: 'F', age: '28' },
    resultats: {
      _types: ['Hématologie'],
      _facture_seule: false, _reception_seule: false,
      _examens_coches: { 'Hématologie': ["Électrophorèse de l'hémoglobine"] },
      'Hématologie': {
        'Hb A':  { valeur: '61.7', unite: '%', interp: 'Anormal' },
        'Hb S':  { valeur: '36.7', unite: '%', interp: 'Anormal' },
        'Hb A2': { valeur: '1.6',  unite: '%', interp: 'Normal' },
        'Profil Hb': 'Profil AS (Drépanocytose trait)',
        'Commentaire Hb': commentaireHb,
      },
    },
    prescripteur_id: null, est_bpn: false, restricted_by: null, deleted_at: null,
  };
}

(async () => {
  const r = createReporter('ÉLECTROPHORÈSE — DOUBLE PROFIL');
  const srv = await serve(8193);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8193 });
    ctx = app.ctx; const { page, errors } = app;

    // 1) Commentaire = redite d'un AUTRE profil (le bug ADJETOUAN).
    const contradictoire = await page.evaluate(async (d) => {
      const html = await crBuildHTML(d);
      return html;
    }, dossier('Électrophorèse normale (profil AA).'));
    r.check('le profil réel (AS) est affiché', /Profil AS \(Drépanocytose trait\)/.test(contradictoire), true);
    r.check('le profil contradictoire (AA) n’apparaît plus', /profil AA/i.test(contradictoire), false);
    r.check('un seul « Profil : » dans le bloc', (contradictoire.match(/Profil\s*:/g) || []).length, 1);

    // 2) Vrai commentaire clinique : conservé.
    const clinique = await page.evaluate(async (d) => await crBuildHTML(d),
      dossier('Contrôle conseillé du conjoint (conseil génétique).'));
    r.check('commentaire clinique conservé', /conseil génétique/i.test(clinique), true);

    // 3) Sans profil posé, un commentaire « profil … » reste (rien à contredire).
    const sansProfil = await page.evaluate(async (d) => {
      d.resultats['Hématologie']['Profil Hb'] = '';
      return await crBuildHTML(d);
    }, dossier('Aspect en faveur d’un profil AS à confirmer.'));
    r.check('commentaire gardé si aucun profil posé', /profil AS à confirmer/i.test(sansProfil), true);

    r.check('aucune erreur page', errors.join(' | ') || 'aucune', 'aucune');
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
