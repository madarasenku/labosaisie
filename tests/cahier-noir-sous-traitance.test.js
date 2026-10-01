// ✅ v13.210 — Cahier noir : colonne SOUS TRAITANCE (montant négatif forcé)
// + question « somme retirée ? ». Ouvert à tous les agents (hors spectateur).
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8258);
  const r = createReporter('CAHIER NOIR — SOUS TRAITANCE');
  const { ctx, page, errors } = await openApp({ role: 'agent', username: 'yerigue', port: 8258 });

  // Prépare le cahier noir avec une colonne normale + SOUS TRAITANCE.
  await page.evaluate(() => {
    _cahierActif = 'noir';
    _cahierData = {
      mois: '2026-10',
      colonnes: [
        { id: 1, libelle: 'DIVERS', archivee: false },
        { id: 2, libelle: 'SOUS TRAITANCE', archivee: false },
      ],
      ecritures: [],
      lecture_seule: false,
    };
    _cahierAcces = { autorise: true, admin: true };
  });

  // ── Fenêtre : la sous-traitance affiche la question « retirée ? » ──
  r.section('La colonne SOUS TRAITANCE pilote la fenêtre');
  const modale = await page.evaluate(() => {
    ouvrirSaisieCahier('2026-10-02');
    const sel = document.getElementById('cj-colonne');
    // Par défaut : DIVERS → pas de question retirée.
    const retireAvant = document.getElementById('cj-retire-row').style.display;
    // Sélection de SOUS TRAITANCE.
    sel.value = '2';
    _cjMajModaleColonne();
    const retireApres = document.getElementById('cj-retire-row').style.display;
    return { retireAvant, retireApres };
  });
  r.check('DIVERS : pas de question « retirée »', modale.retireAvant, 'none');
  r.check('SOUS TRAITANCE : question « retirée » visible', modale.retireApres !== 'none', true);

  // ── Enregistrement : montant forcé négatif + p_retire transmis ──
  r.section('Montant forcé négatif + p_retire transmis');
  const save = await page.evaluate(async () => {
    window.__calls = [];
    _sb.rpc = async (n, p) => { window.__calls.push({ n, p }); return { data: { ok: true, id: 9 }, error: null }; };
    window.toast = () => {};
    window.chargerCahierJaune = async () => {};
    // On saisit un montant POSITIF : il doit être converti en sortie.
    document.getElementById('cj-colonne').value = '2';
    _cjMajModaleColonne();
    document.getElementById('cj-montant').value = '7000';
    document.getElementById('cj-retire').value = 'oui';
    document.getElementById('cj-explication').value = 'LABO EXTERNE';
    await enregistrerEcritureCahier('2026-10-02');
    const call = window.__calls.find(c => c.n === 'ajouter_ecriture_noir');
    return { rpc: call && call.n, montant: call && call.p.p_montant, retire: call && call.p.p_retire };
  });
  r.check('RPC = ajouter_ecriture_noir', save.rpc, 'ajouter_ecriture_noir');
  r.check('montant converti en sortie (-7000)', save.montant, -7000);
  r.check('p_retire = true (déjà retirée)', save.retire, true);

  // ── Colonne normale : p_retire null (mais champ présent côté noir) ──
  r.section('Colonne normale → pas de retire');
  const normal = await page.evaluate(async () => {
    window.__calls = [];
    _sb.rpc = async (n, p) => { window.__calls.push({ n, p }); return { data: { ok: true, id: 10 }, error: null }; };
    ouvrirSaisieCahier('2026-10-02');
    document.getElementById('cj-colonne').value = '1';   // DIVERS
    _cjMajModaleColonne();
    document.getElementById('cj-montant').value = '5000';
    await enregistrerEcritureCahier('2026-10-02');
    const call = window.__calls.find(c => c.n === 'ajouter_ecriture_noir');
    return { montant: call && call.p.p_montant, retire: call && call.p.p_retire };
  });
  r.check('montant positif conservé (5000)', normal.montant, 5000);
  r.check('p_retire = null hors sous-traitance', normal.retire, null);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
