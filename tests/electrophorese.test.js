// Électrophorèse de la semaine (v13.171) — sélection et bornes de semaine.
//
// La liste = électrophorèse cochée dans le dossier ET profil Hb non rendu.
// On vérifie les fonctions pures dans le contexte de la page + la présence
// de la carte dans l'Historique.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const r = createReporter('ÉLECTROPHORÈSE DE LA SEMAINE');
  const srv = await serve();
  const { ctx, page, errors } = await openApp({ role: 'admin' });

  const dispo = await page.evaluate(() => ({
    render: typeof renderElectro === 'function',
    imprime: typeof imprimerElectro === 'function',
    decaler: typeof decalerElectro === 'function',
    retour: typeof retourElectroSemaine === 'function',
    carte: !!document.getElementById('electro-card'),
    apercu: !!document.getElementById('electro-apercu'),
    label: !!document.getElementById('electro-week-label'),
  }));
  r.check('renderElectro défini', dispo.render, true);
  r.check('imprimerElectro défini', dispo.imprime, true);
  r.check('decalerElectro défini', dispo.decaler, true);
  r.check('retourElectroSemaine défini', dispo.retour, true);
  r.check('carte « Électrophorèse » présente', dispo.carte, true);
  r.check('aperçu + libellé semaine présents', dispo.apercu && dispo.label, true);

  // Bornes de semaine : samedi 12/09/2026 → lundi 07 au dimanche 13.
  const bornes = await page.evaluate(() => { const b = _elecBornes(new Date(2026, 8, 12)); return { du: b.du, au: b.au }; });
  r.check('lundi de la semaine', bornes.du, '2026-09-07');
  r.check('dimanche de la semaine', bornes.au, '2026-09-13');

  // Détection de l'électrophorèse cochée.
  const coch = await page.evaluate(() => ({
    oui: _elecCochee({ _examens_coches: { 'Hématologie': ["Électrophorèse de l'hémoglobine", 'NFS — Numération Formule Sanguine'] } }),
    non: _elecCochee({ _examens_coches: { 'Hématologie': ['NFS — Numération Formule Sanguine'] } }),
  }));
  r.check('électro cochée détectée', coch.oui, true);
  r.check('électro non cochée', coch.non, false);

  // Profil Hb rendu ou non.
  const prof = await page.evaluate(() => ({
    rendu: _elecProfilRendu({ 'Hématologie': { 'Profil Hb': 'Profil AA (Normal)' } }),
    vide: _elecProfilRendu({ 'Hématologie': { 'Profil Hb': '' } }),
  }));
  r.check('profil Hb rendu détecté', prof.rendu, true);
  r.check('profil Hb vide = à faire', prof.vide, false);

  // Groupe sanguin lisible.
  const grp = await page.evaluate(() => ({
    o: _elecGroupe({ 'Groupe sanguin': { 'Groupe ABO': 'O', 'Rhésus': 'Positif' } }),
    vide: _elecGroupe({ 'Groupe sanguin': { 'Groupe ABO': '' } }),
  }));
  r.check('groupe O Rh+', grp.o, 'O Rh+');
  r.check('groupe vide', grp.vide, '');

  // ✅ v13.255 — Profil refusé par le serveur : rien n'est écrit dans le dossier.
  r.check('profil refusé : dossier inchangé', await page.evaluate(async () => {
    _dbCache.push({ id: 7001, type: 'Dossier', patient: { nom: 'ELEC', date: new Date().toISOString().slice(0, 10) },
      resultats: { 'Hématologie': {} }, montant: 0, _light: false });
    const sel = document.createElement('select'); sel.id = 'elec-prof-7001';
    sel.innerHTML = '<option>Profil AA (Normal)</option>'; document.body.appendChild(sel);
    const vrai = _sb.rpc; _sb.rpc = (n, p) => n === 'update_resultat'
      ? Promise.resolve({ data: null, error: { message: 'refusé' }, status: 400 }) : vrai(n, p);
    try { await enregistrerElectroResultat(7001); } finally { _sb.rpc = vrai; sel.remove(); }
    const r = _dbCache.find(x => x.id === 7001); _dbCache = _dbCache.filter(x => x.id !== 7001);
    return (r.resultats['Hématologie'] || {})['Profil Hb'] || '';
  }), '');

  // Gating ADMIN : la carte est visible dans l'Historique pour l'admin.
  // ✅ v13.253 — Affichée quand on la choisit dans le menu « 📋 Listes ».
  const vuAdmin = await page.evaluate(() => { showView('historique'); choisirListeHistorique('electro'); const c = document.getElementById('electro-card'); return !!(c && c.offsetParent !== null); });
  r.check('carte visible pour l\'admin', vuAdmin, true);
  r.check('aucune erreur page (admin)', errors.join(' | ') || 'aucune', 'aucune');
  await ctx.close();

  // Gating AGENT : la carte est masquée pour un technicien (non-admin).
  const a = await openApp({ role: 'agent', username: 'agent1', userId: 2 });
  const vuAgent = await a.page.evaluate(() => { showView('historique'); choisirListeHistorique('electro'); const c = document.getElementById('electro-card'); return !!(c && c.offsetParent !== null); });
  r.check('carte masquée pour l\'agent', vuAgent, false);
  r.check('aucune erreur page (agent)', a.errors.join(' | ') || 'aucune', 'aucune');
  await a.ctx.close();

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
