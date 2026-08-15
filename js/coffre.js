/* ═══════════════════════════════════════════════════════════════════════
   LE COFFRE-FORT — v13.104

   Un second secret, distinct du mot de passe, exigé pour ouvrir le cahier
   jaune ou révéler les dossiers verrouillés. L'accès expire au bout de
   15 minutes.

   ⚠️ TOUT ce qui compte se décide sur le SERVEUR. Ce fichier ne fait
   qu'afficher une boîte de dialogue et redemander les données. Si on le
   supprimait entièrement, le cahier resterait fermé : le serveur répond
   « coffre_ferme » et les dossiers verrouillés n'entrent tout simplement
   pas dans la réponse. Un garde-fou côté navigateur ne garde rien — il
   suffit d'ouvrir la console pour le contourner.

   Tant qu'AUCUN code n'a été défini, tout fonctionne comme avant : c'est
   ce qui permet à l'administrateur de choisir le sien sans se retrouver
   enfermé dehors.
   ═══════════════════════════════════════════════════════════════════════ */

let _coffreEtat = null;   // dernier état connu, purement indicatif

async function etatCoffre() {
  if (typeof _sb === 'undefined' || !_sb) return null;
  try {
    const { data, error } = await _sb.rpc('etat_coffre', { p_token: TK() });
    if (error || !data || data.erreur) return null;
    _coffreEtat = data;
    // Le bouton des fiches masquées dépend de cet état : sans ce rappel, il
    // resterait caché et le code ne pourrait jamais être demandé.
    if (typeof updateMasqueesBtn === 'function') updateMasqueesBtn();
    return data;
  } catch (e) { return null; }
}

/* Le coffre est-il configuré ? Sert à ne pas proposer « changer le code »
   quand il n'y en a pas encore, et inversement. */
async function coffreConfigure() {
  const e = await etatCoffre();
  return !!(e && e.configure);
}

/* ── La boîte de dialogue ────────────────────────────────────────────────
   Volontairement sobre : un champ, un message, rien qui ressemble à la
   page de connexion pour qu'on ne confonde pas les deux secrets. */
function demanderCodeCoffre(motif) {
  return new Promise(resolve => {
    const fond = document.createElement('div');
    fond.id = 'coffre-modale';
    fond.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);'
      + 'z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px';
    fond.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:22px;width:340px;max-width:100%;
                  box-shadow:0 20px 50px rgba(15,23,42,.3)">
        <div style="font-size:17px;font-weight:600;margin-bottom:4px">🔐 Coffre-fort</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:14px">
          ${motif || 'Cet élément est protégé par un code.'}
        </div>
        <input type="password" id="coffre-code" autocomplete="off" placeholder="Code du coffre"
               style="width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:9px;font:inherit">
        <div id="coffre-err" style="color:#b91c1c;font-size:12.5px;margin-top:8px;min-height:16px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
          <button type="button" id="coffre-annuler"
            style="padding:9px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:9px;font:inherit;cursor:pointer">Annuler</button>
          <button type="button" id="coffre-ok"
            style="padding:9px 16px;border:0;background:#0b2545;color:#fff;border-radius:9px;font:inherit;font-weight:600;cursor:pointer">Ouvrir</button>
        </div>
        <div style="font-size:11.5px;color:#94a3b8;margin-top:12px;line-height:1.5">
          L'accès se referme tout seul au bout de 15 minutes.
        </div>
      </div>`;
    document.body.appendChild(fond);
    const champ = fond.querySelector('#coffre-code');
    const err   = fond.querySelector('#coffre-err');
    champ.focus();

    const fermer = v => { fond.remove(); resolve(v); };

    async function valider() {
      const code = champ.value;
      if (!code) { err.textContent = 'Entrez le code.'; return; }
      err.textContent = 'Vérification…';
      const { data, error } = await _sb.rpc('ouvrir_coffre',
        { p_token: TK(), p_code: code });
      if (error) { err.textContent = 'Le serveur n\'a pas répondu.'; return; }
      if (data && data.ok) { fermer(true); return; }
      if (data && data.erreur === 'bloque') {
        const min = Math.max(1, Math.ceil((data.secondes || 0) / 60));
        err.textContent = `Trop d'essais — réessayez dans ${min} min.`;
        champ.value = ''; return;
      }
      if (data && data.erreur === 'non_configure') { fermer(true); return; }
      err.textContent = 'Code incorrect.';
      champ.value = '';
    }

    fond.querySelector('#coffre-ok').addEventListener('click', valider);
    fond.querySelector('#coffre-annuler').addEventListener('click', () => fermer(false));
    champ.addEventListener('keydown', e => { if (e.key === 'Enter') valider(); });
    fond.addEventListener('click', e => { if (e.target === fond) fermer(false); });
  });
}

/* Point d'entrée unique : « assure-toi que le coffre est ouvert ».
   Renvoie true si l'appelant peut continuer. */
async function assurerCoffre(motif) {
  const e = await etatCoffre();
  if (!e) return true;              // état inconnu : on laisse le serveur trancher
  if (!e.configure) return true;    // aucun code défini : rien ne change
  if (e.ouvert) return true;
  if (!e.admin) return true;        // le coffre ne concerne que l'administrateur
  return await demanderCodeCoffre(motif);
}

async function fermerCoffre() {
  if (typeof _sb === 'undefined' || !_sb) return;
  try { await _sb.rpc('fermer_coffre', { p_token: TK() }); } catch (e) {}
  _coffreEtat = null;
  toast('🔐 Coffre refermé', 'ok');
  if (typeof refreshDB === 'function') await refreshDB();
  if (typeof renderHistory === 'function') renderHistory();
}

/* ── Définir ou changer le code (Administration) ─────────────────────── */
async function enregistrerCodeCoffre() {
  const err = document.getElementById('coffre-admin-err');
  const actuel  = document.getElementById('coffre-actuel')?.value || '';
  const nouveau = document.getElementById('coffre-nouveau')?.value || '';
  const confirm = document.getElementById('coffre-confirme')?.value || '';
  if (err) err.textContent = '';

  if (nouveau.trim().length < 6) {
    if (err) err.textContent = 'Le code doit faire au moins 6 caractères.'; return;
  }
  if (nouveau !== confirm) {
    if (err) err.textContent = 'Les deux saisies ne correspondent pas.'; return;
  }

  const { data, error } = await _sb.rpc('definir_code_coffre',
    { p_token: TK(), p_code_actuel: actuel || null, p_nouveau_code: nouveau });

  if (error) { if (err) err.textContent = 'Le serveur n\'a pas répondu.'; return; }
  if (data === 'code_actuel_incorrect') { if (err) err.textContent = 'Code actuel incorrect.'; return; }
  if (data === 'code_trop_court')       { if (err) err.textContent = 'Code trop court.'; return; }
  if (data !== 'ok') { if (err) err.textContent = 'Refusé (' + data + ').'; return; }

  ['coffre-actuel','coffre-nouveau','coffre-confirme']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  toast('🔐 Code du coffre enregistré', 'ok');
  // Changer le code referme toutes les élévations, y compris la sienne :
  // l'écran doit le refléter tout de suite.
  await majPanneauCoffre();
  if (typeof refreshDB === 'function') await refreshDB();
  if (typeof renderHistory === 'function') renderHistory();
}

async function majPanneauCoffre() {
  const zone = document.getElementById('coffre-etat');
  const e = await etatCoffre();
  if (!zone) return;
  if (!e) { zone.textContent = ''; return; }
  const bloc = document.getElementById('coffre-actuel-bloc');
  if (bloc) bloc.style.display = e.configure ? '' : 'none';
  zone.innerHTML = e.configure
    ? (e.ouvert
        ? '🔓 <strong>Coffre ouvert</strong> — se referme automatiquement.'
        : '🔒 <strong>Coffre fermé</strong> — le cahier jaune et les dossiers verrouillés sont hors de vue.')
    : '⚠️ <strong>Aucun code défini</strong> — le cahier jaune et les dossiers '
      + 'verrouillés restent accessibles comme avant. Définissez un code pour les protéger.';
}

/* L'état est demandé une fois au chargement : c'est lui qui décide de
   l'affichage du bouton des fiches masquées. */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { if (typeof TK === 'function' && TK()) etatCoffre(); }, 1200);
});
