// ✅ VERROU TOTAL d'encaissement : une fiche payée est entièrement verrouillée
// pour les non-admins — identité patient, résultats déjà saisis ET examens
// encore vides. Seul l'administrateur peut corriger. (Le serveur applique la
// même règle : update_resultat / update_dossier_patient refusent une fiche
// payée pour les non-admins.)
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8255);
  const r = createReporter('VERROU TOTAL D\'ENCAISSEMENT');

  // ── Agent : fiche payée → identité + résultats remplis verrouillés ──
  {
    const { ctx, page, errors } = await openApp({ role: 'agent', username: 'yerigue', port: 8255 });
    const res = await page.evaluate(() => {
      const rec = { id: 51, type: 'Dossier', createdBy: 'yerigue', montant: 4000,
        patient: { nom: 'PAYE', dossier: 'D51', paiement_status: 'paye' }, resultats: {} };
      _dbCache = [rec];
      // Identité + une case déjà saisie + une case vide, dans la zone de saisie.
      const pnom = document.getElementById('p_nom'); if (pnom) pnom.value = 'PAYE';
      const zone = document.getElementById('zone-saisie');
      zone.insertAdjacentHTML('beforeend',
        '<input id="t_rempli" value="6.4"><input id="t_vide" value="">');
      // Bandeau d'édition (créé par editRecord/fillAllResults dans le vrai flux).
      if (!document.getElementById('edit-mode-banner'))
        zone.insertAdjacentHTML('beforebegin', '<div id="edit-mode-banner"></div>');
      appliquerVerrouEncaissement(rec);
      return {
        verrou: dossierEncaisseVerrou(rec),
        pnom: document.getElementById('p_nom').disabled,
        rempli: document.getElementById('t_rempli').disabled,
        vide: document.getElementById('t_vide').disabled,
        note: !!document.getElementById('enc-lock-note'),
      };
    });
    r.section('Agent — fiche encaissée');
    r.check('verrou actif (payée, non-admin)', res.verrou, true);
    r.check('identité patient verrouillée', res.pnom, true);
    r.check('résultat déjà saisi verrouillé', res.rempli, true);
    r.check('examen vide AUSSI verrouillé', res.vide, true);
    r.check('mention de verrou affichée', res.note, true);

    // Fiche NON payée : rien n'est verrouillé.
    const libre = await page.evaluate(() => {
      const rec = { id: 52, type: 'Dossier', createdBy: 'yerigue',
        patient: { nom: 'LIBRE', dossier: 'D52', paiement_status: 'non_paye' }, resultats: {} };
      _dbCache = [rec];
      document.getElementById('t_rempli').value = '7.1';
      appliquerVerrouEncaissement(rec);
      return { pnom: document.getElementById('p_nom').disabled,
               rempli: document.getElementById('t_rempli').disabled };
    });
    r.section('Agent — fiche non encaissée');
    r.check('identité éditable', libre.pnom, false);
    r.check('résultat éditable', libre.rempli, false);
    r.check('aucune erreur JS', errors.length, 0);
    await ctx.close();
  }

  // ── Admin : fiche payée → rien verrouillé (il corrige) ──────────────
  {
    const { ctx, page } = await openApp({ role: 'admin', username: 'admin', port: 8255 });
    const admin = await page.evaluate(() => {
      const rec = { id: 51, type: 'Dossier',
        patient: { nom: 'PAYE', dossier: 'D51', paiement_status: 'paye' }, resultats: {} };
      _dbCache = [rec];
      const zone = document.getElementById('zone-saisie');
      zone.insertAdjacentHTML('beforeend', '<input id="t_rempli" value="6.4">');
      appliquerVerrouEncaissement(rec);
      return { verrou: dossierEncaisseVerrou(rec),
               rempli: document.getElementById('t_rempli').disabled,
               pnom: document.getElementById('p_nom').disabled };
    });
    r.section('Admin');
    r.check('admin non verrouillé (verrou=false)', admin.verrou, false);
    r.check('résultat éditable (admin)', admin.rempli, false);
    r.check('identité éditable (admin)', admin.pnom, false);
    await ctx.close();
  }

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
