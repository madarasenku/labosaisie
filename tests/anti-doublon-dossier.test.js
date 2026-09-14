// ✅ v13.173 — GARDE-FOU ANTI-DOUBLON DE NUMÉRO.
//
// Après un enregistrement, le formulaire régénère le N° de dossier. Corriger le
// patient qu'on vient de saisir (sans repasser par « Modifier ») créait un 2ᵉ
// dossier au N° suivant — un doublon qu'il fallait supprimer à la main (constaté
// en base : FACHIRA 0076/0077, OUATTARA 0131/0132, etc.).
//
// trouverDoublonDossier() repère, à l'enregistrement en mode création, un dossier
// NON supprimé du même patient (nom normalisé) et de la même date : l'appli
// propose alors de METTRE À JOUR ce dossier au lieu de créer un nouveau numéro.
const { serve, openApp, createReporter } = require('./helpers');

const D = (over) => Object.assign({
  id: 1, type: 'Dossier', deletedAt: null, _hardDeleted: false,
  patient: { nom: 'FACHIRA ISMAËL', date: '2026-09-03', dossier: '0076-0926' },
  resultats: { _types: ['Hématologie'] },
}, over);

(async () => {
  const r = createReporter('ANTI-DOUBLON DE NUMÉRO');
  const srv = await serve(8195);
  let ctx;
  try {
    const app = await openApp({ role: 'admin', port: 8195 });
    ctx = app.ctx; const { page, errors } = app;

    r.check('trouverDoublonDossier défini',
      await page.evaluate(() => typeof trouverDoublonDossier === 'function'), true);

    // Même nom + même date → doublon détecté (on renvoie son numéro).
    const trouve = await page.evaluate(() => {
      const db = [{ id: 1, type: 'Dossier', patient: { nom: 'FACHIRA ISMAËL', date: '2026-09-03', dossier: '0076-0926' }, resultats: { _types: ['Hématologie'] } }];
      const d = trouverDoublonDossier(db, { nom: 'fachira ismaël', date: '2026-09-03', dossier: '0077-0926' });
      return d && d.patient.dossier;
    });
    r.check('doublon même nom+date détecté (N° d’origine)', trouve, '0076-0926');

    // Date différente → pas de doublon (vraie 2ᵉ visite).
    const autreDate = await page.evaluate(() => {
      const db = [{ id: 1, type: 'Dossier', patient: { nom: 'NGUESSAN OKROU', date: '2026-09-09', dossier: '0138-0926' }, resultats: { _types: ['Hématologie'] } }];
      return trouverDoublonDossier(db, { nom: 'NGUESSAN OKROU', date: '2026-09-11', dossier: '0180-0926' });
    });
    r.check('date différente → pas de doublon', autreDate, null);

    // Dossier supprimé → ignoré (on peut recréer après suppression).
    const supprime = await page.evaluate(() => {
      const db = [{ id: 1, type: 'Dossier', deletedAt: '2026-09-03T13:10:00Z', patient: { nom: 'FACHIRA ISMAËL', date: '2026-09-03', dossier: '0076-0926' }, resultats: { _types: ['Hématologie'] } }];
      return trouverDoublonDossier(db, { nom: 'FACHIRA ISMAËL', date: '2026-09-03', dossier: '0077-0926' });
    });
    r.check('dossier supprimé ignoré', supprime, null);

    // Nom différent → pas de doublon.
    const autreNom = await page.evaluate(() => {
      const db = [{ id: 1, type: 'Dossier', patient: { nom: 'KOUAME GRACE', date: '2026-09-03', dossier: '0076-0926' }, resultats: { _types: ['Hématologie'] } }];
      return trouverDoublonDossier(db, { nom: 'FACHIRA ISMAËL', date: '2026-09-03', dossier: '0077-0926' });
    });
    r.check('nom différent → pas de doublon', autreNom, null);

    // Patient sans date → garde-fou neutre (pas de faux positif).
    const sansDate = await page.evaluate(() => {
      const db = [{ id: 1, type: 'Dossier', patient: { nom: 'FACHIRA ISMAËL', date: '', dossier: '0076-0926' }, resultats: { _types: ['Hématologie'] } }];
      return trouverDoublonDossier(db, { nom: 'FACHIRA ISMAËL', date: '', dossier: '0077-0926' });
    });
    r.check('sans date → pas de doublon', sansDate, null);

    r.check('aucune erreur page', errors.join(' | ') || 'aucune', 'aucune');
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
