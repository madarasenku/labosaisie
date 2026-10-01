// ✅ v13.210 — Certains BPN ne font pas d'électrophorèse : on doit pouvoir
// DÉCOCHER la case électrophorèse à l'enregistrement sans qu'elle soit re-cochée
// de force. Le forfait coche sa composition par défaut UNE FOIS (initBpnComposition) ;
// ensuite applyBpnSections (recalcul) ne force plus rien.
const { serve, openApp, createReporter } = require('./helpers');

(async () => {
  const srv = await serve(8268);
  const r = createReporter('BPN SANS ÉLECTROPHORÈSE');
  const { ctx, page, errors } = await openApp({ role: 'admin', username: 'admin', port: 8268 });

  await page.evaluate(() => { showView('saisie'); });
  await page.waitForTimeout(300);

  const res = await page.evaluate(() => {
    const out = {};
    // Activation du forfait → composition par défaut cochée.
    document.getElementById('ex_bpn').checked = true;
    initBpnComposition();
    out.ephbDefaut = document.getElementById('ex_ephb').checked;   // inclus par défaut
    out.nfsDefaut  = document.getElementById('ex_nfs').checked;

    // L'utilisateur décoche l'électrophorèse (BPN sans électrophorèse).
    const e = document.getElementById('ex_ephb');
    e.checked = false; e.dispatchEvent(new Event('change', { bubbles: true }));
    out.ephbApresDecoche = document.getElementById('ex_ephb').checked;

    // Un autre changement de case (recalcul) ne doit PAS la re-cocher.
    document.getElementById('ex_nfs').dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof calcFicheTotal === 'function') calcFicheTotal();
    out.ephbApresRecalc = document.getElementById('ex_ephb').checked;
    out.nfsTjrs = document.getElementById('ex_nfs').checked;       // les autres restent

    // Décocher puis recocher le forfait repart d'une composition complète.
    const bpn = document.getElementById('ex_bpn');
    bpn.checked = false; initBpnComposition();
    bpn.checked = true;  initBpnComposition();
    out.ephbReactive = document.getElementById('ex_ephb').checked; // de nouveau coché
    return out;
  });

  r.section('Décocher l\'électrophorèse tient');
  r.check('électrophorèse cochée par défaut', res.ephbDefaut, true);
  r.check('NFS cochée par défaut', res.nfsDefaut, true);
  r.check('décochée reste décochée', res.ephbApresDecoche, false);
  r.check('toujours décochée après recalcul', res.ephbApresRecalc, false);
  r.check('les autres examens du BPN restent (NFS)', res.nfsTjrs, true);
  r.check('réactiver le forfait recoche la composition', res.ephbReactive, true);

  r.check('aucune erreur JS', errors.length, 0);
  if (errors.length) console.log('   ', errors.slice(0, 5));
  await ctx.close();
  srv.close();
  const s = r.summary();
  process.exit(s.allPassed ? 0 : 1);
})();
