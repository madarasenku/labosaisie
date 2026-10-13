// ✅ v13.237 — VERROU D'ENCAISSEMENT « argent + identité » : sur une fiche payée,
// un non-admin garde la main sur les RÉSULTATS (saisis ou à compléter) mais
// l'identité du patient, les examens facturés (cases, prix) et l'ajustement sont
// verrouillés. L'administrateur n'a aucun verrou. (Le serveur applique la même
// règle dans update_resultat.)
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8255);
  const r = createReporter('VERROU D\'ENCAISSEMENT (argent + identité)');

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
        '<input id="t_rempli" value="6.4"><input id="t_vide" value="">'
        + '<button id="btn-save-all" onclick="saveRecordAll()">Enregistrer</button>');
      // Une case d'examen facturé + son prix (fiche d'identification).
      const ex = getCatalogueComplet()[0];
      const fiche = document.getElementById('fiche-identification');
      if (!document.getElementById(ex.id))
        fiche.insertAdjacentHTML('beforeend', '<input type="checkbox" id="' + ex.id + '" checked>');
      if (!document.getElementById('px_' + ex.id))
        fiche.insertAdjacentHTML('beforeend', '<input id="px_' + ex.id + '" value="1000">');
      window.__exId = ex.id;
      // Bandeau d'édition (créé par editRecord/fillAllResults dans le vrai flux).
      if (!document.getElementById('edit-mode-banner'))
        zone.insertAdjacentHTML('beforebegin', '<div id="edit-mode-banner"></div>');
      appliquerVerrouEncaissement(rec);
      return {
        verrou: dossierEncaisseVerrou(rec),
        pnom: document.getElementById('p_nom').disabled,
        rempli: document.getElementById('t_rempli').disabled,
        vide: document.getElementById('t_vide').disabled,
        save: document.getElementById('btn-save-all').disabled,
        examen: document.getElementById(window.__exId).disabled,
        prix: document.getElementById('px_' + window.__exId).disabled,
        remise: document.getElementById('remise-type').disabled,
        note: !!document.getElementById('enc-lock-note'),
      };
    });
    r.section('Agent — fiche encaissée');
    r.check('verrou actif (payée, non-admin)', res.verrou, true);
    r.check('identité patient verrouillée', res.pnom, true);
    r.check('examen facturé (case) verrouillé', res.examen, true);
    r.check('prix de l\'examen verrouillé', res.prix, true);
    r.check('ajustement (réduction) verrouillé', res.remise, true);
    r.check('résultat déjà saisi : modifiable', res.rempli, false);
    r.check('résultat à compléter : saisissable', res.vide, false);
    r.check('bouton Enregistrer actif', res.save, false);
    r.check('mention de verrou affichée', res.note, true);

    // Fiche NON payée : rien n'est verrouillé.
    const libre = await page.evaluate(() => {
      const rec = { id: 52, type: 'Dossier', createdBy: 'yerigue',
        patient: { nom: 'LIBRE', dossier: 'D52', paiement_status: 'non_paye' }, resultats: {} };
      _dbCache = [rec];
      document.getElementById('t_rempli').value = '7.1';
      appliquerVerrouEncaissement(rec);
      return { pnom: document.getElementById('p_nom').disabled,
               rempli: document.getElementById('t_rempli').disabled,
               examen: document.getElementById(window.__exId).disabled };
    });
    r.section('Agent — fiche non encaissée');
    r.check('identité éditable', libre.pnom, false);
    r.check('résultat éditable', libre.rempli, false);
    r.check('examen facturé éditable', libre.examen, false);
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
