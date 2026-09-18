// ✅ v13.174 — Changement de mot de passe VOLONTAIRE, accessible à tous les rôles.
//
// Chaque agent peut changer son propre mot de passe à tout moment via un bouton
// dédié (et plus seulement à la première connexion). On vérifie que le bouton,
// la modale, les champs et les fonctions sont présents, et que la validation
// côté client fonctionne (règles + appel de change_password sur cas valide).
const { serve, openApp, createReporter } = require('./helpers');

async function run(role, port) {
  const r = createReporter('CHANGER MOT DE PASSE — rôle ' + role);
  const srv = await serve(port);
  let ctx;
  try {
    const app = await openApp({ role, port });
    ctx = app.ctx; const { page, errors } = app;

    const dispo = await page.evaluate(() => ({
      bouton: !!document.querySelector('button[onclick="ouvrirChangerMdp()"]'),
      modale: !!document.getElementById('change-pwd-modal'),
      champs: !!document.getElementById('cp_old') && !!document.getElementById('cp_new') && !!document.getElementById('cp_confirm'),
      annuler: !!document.querySelector('#change-pwd-modal button[onclick="fermerChangerMdp()"]'),
      fnOuvrir: typeof ouvrirChangerMdp === 'function',
      fnSubmit: typeof submitChangerMdp === 'function',
      fnFermer: typeof fermerChangerMdp === 'function',
    }));
    r.check('bouton « Mot de passe » présent (tous rôles)', dispo.bouton, true);
    r.check('modale présente', dispo.modale, true);
    r.check('champs actuel/nouveau/confirmation présents', dispo.champs, true);
    r.check('bouton Annuler présent', dispo.annuler, true);
    r.check('ouvrirChangerMdp défini', dispo.fnOuvrir, true);
    r.check('submitChangerMdp défini', dispo.fnSubmit, true);
    r.check('fermerChangerMdp défini', dispo.fnFermer, true);

    // Ouverture + validations côté client (aucun appel réseau tant que c'est invalide).
    const valid = await page.evaluate(async () => {
      let appelee = false;
      const orig = _sb.rpc;
      _sb.rpc = async (n, p) => { if (n === 'change_password') { appelee = true; return { data: true, error: null }; } return orig(n, p); };
      const err = () => document.getElementById('cp-error').textContent;
      const set = (id, v) => { document.getElementById(id).value = v; };
      ouvrirChangerMdp();
      const ouverte = document.getElementById('change-pwd-modal').style.display === 'flex';

      set('cp_old', 'ancien123'); set('cp_new', 'court'); set('cp_confirm', 'court');
      await submitChangerMdp(); const eCourt = err();

      set('cp_new', 'sanschiffre'); set('cp_confirm', 'sanschiffre');
      await submitChangerMdp(); const eChiffre = err();

      set('cp_new', 'nouveau123'); set('cp_confirm', 'different123');
      await submitChangerMdp(); const eConfirm = err();

      set('cp_new', 'ancien123'); set('cp_confirm', 'ancien123');
      await submitChangerMdp(); const eMeme = err();

      const appeleeAvant = appelee;
      set('cp_new', 'nouveau123'); set('cp_confirm', 'nouveau123');
      await submitChangerMdp();
      const fermee = document.getElementById('change-pwd-modal').style.display === 'none';

      _sb.rpc = orig;
      return { ouverte, eCourt, eChiffre, eConfirm, eMeme, appeleeAvant, appelee, fermee };
    });
    r.check('modale s’ouvre', valid.ouverte, true);
    r.check('refus < 8 caractères', /8 caract/i.test(valid.eCourt), true);
    r.check('refus sans chiffre', /chiffre/i.test(valid.eChiffre), true);
    r.check('refus confirmation différente', /correspond/i.test(valid.eConfirm), true);
    r.check('refus identique à l’ancien', /différent/i.test(valid.eMeme), true);
    r.check('aucun appel réseau tant qu’invalide', valid.appeleeAvant, false);
    r.check('change_password appelé sur cas valide', valid.appelee, true);
    r.check('modale fermée après succès', valid.fermee, true);

    r.check('aucune erreur page', errors.join(' | ') || 'aucune', 'aucune');
  } finally {
    if (ctx) await ctx.close();
    srv.close();
  }
  return r.summary();
}

(async () => {
  const s1 = await run('admin', 8197);
  const s2 = await run('agent', 8198);
  process.exit(s1.allPassed && s2.allPassed ? 0 : 1);
})();
