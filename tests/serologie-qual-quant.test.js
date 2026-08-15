// Sérologie — bascule Qualitatif / Quantitatif à la saisie + examens HBs/HBc.
//
// Chaque test sérologique peut être saisi en QUALITATIF (Positif/Négatif) ou en
// QUANTITATIF (valeur chiffrée), au choix de l'agent selon la méthode employée.
// Le mode par défaut vient de SERO_TESTS ; l'agent bascule via smode_<id>.
// On vérifie aussi que « Ac anti-HBs » et « Ac anti-HBc totaux » existent comme
// examens facturables autonomes.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve();
  const r = createReporter('SÉROLOGIE — QUAL / QUANT');

  const { ctx, page, errors } = await openApp({ role: 'admin',
    rpc: { get_tarifs: {}, get_examens_custom: [] } });

  const res = await page.evaluate(() => {
    ['sero'].forEach(n => { try { ensurePanelBuilt(n); } catch (e) {} });
    const out = { erreurs: [] };

    // 1) Les deux nouveaux examens sont au catalogue, avec case + champs.
    const cat = getCatalogueComplet();
    const hbsac = cat.find(e => e.id === 'ex_hbsac');
    const hbcac = cat.find(e => e.id === 'ex_hbcac');
    out.hbsac_present = !!hbsac && hbsac.label === 'Ac anti-HBs';
    out.hbcac_present = !!hbcac && hbcac.label === 'Ac anti-HBc totaux';
    out.hbsac_case = !!document.getElementById('ex_hbsac');
    out.hbcac_case = !!document.getElementById('ex_hbcac');
    // champs de saisie correspondants
    out.hbsac_champ = !!document.getElementById('sr_hbsac') && !!document.getElementById('sv_hbsac');
    out.hbcac_champ = !!document.getElementById('sr_hbcac');

    // 2) CHAQUE test sérologique a un sélecteur de mode.
    const sansMode = (typeof SERO_TESTS !== 'undefined' ? SERO_TESTS : [])
      .filter(t => !document.getElementById('smode_' + t.id)).map(t => t.id);
    out.tousOntMode = sansMode.length === 0;
    out.sansMode = sansMode.join(', ') || 'aucun';

    // 3) Bascule sur un test : quantitatif → valeur visible ; qualitatif →
    //    valeur masquée et vidée.
    const id = 'vih1';
    const sv = document.getElementById('sv_' + id);
    const wrap = document.getElementById('sqwrap_' + id);
    const dash = document.getElementById('sqdash_' + id);

    document.getElementById('smode_' + id).value = 'quant';
    toggleSeroMode(id);
    out.quant_valeur_visible = wrap.style.display !== 'none' && dash.style.display === 'none';

    sv.value = '42';
    document.getElementById('smode_' + id).value = 'qual';
    toggleSeroMode(id);
    out.qual_valeur_masquee = wrap.style.display === 'none' && dash.style.display !== 'none';
    out.qual_valeur_videe = sv.value === '';

    return out;
  });

  r.section('Examens Ac anti-HBs / Ac anti-HBc totaux');
  r.check('« Ac anti-HBs » au catalogue',            res.hbsac_present, true);
  r.check('« Ac anti-HBc totaux » au catalogue',     res.hbcac_present, true);
  r.check('case à cocher Ac anti-HBs',               res.hbsac_case, true);
  r.check('case à cocher Ac anti-HBc totaux',        res.hbcac_case, true);
  r.check('champs de saisie Ac anti-HBs',            res.hbsac_champ, true);
  r.check('champ de saisie Ac anti-HBc totaux',      res.hbcac_champ, true);

  r.section('Bascule Qualitatif / Quantitatif');
  r.check('chaque test sérologique a un sélecteur de mode', res.tousOntMode, true);
  r.check('  (tests sans mode)',                     res.sansMode, 'aucun');
  r.check('mode quantitatif : la valeur est visible', res.quant_valeur_visible, true);
  r.check('mode qualitatif : la valeur est masquée',  res.qual_valeur_masquee, true);
  r.check('mode qualitatif : la valeur est vidée',    res.qual_valeur_videe, true);
  r.check('aucune erreur JS', errors.length, 0);
  await ctx.close();

  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
