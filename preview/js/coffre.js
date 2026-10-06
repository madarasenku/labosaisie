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

/* ── Il n'y a plus de boîte de dialogue ──────────────────────────────────
   La porte se choisit à la CONNEXION, par le mot de passe employé. Une
   boîte qui réclame un code en cours de route annoncerait à quiconque
   regarde l'écran qu'il existe quelque chose derrière — c'est exactement
   ce qu'on cherche à ne pas dire.

   Depuis la session ordinaire, il n'y a donc rien à demander, rien à
   deviner : le cahier jaune et les dossiers verrouillés n'existent pas.
   `assurerCoffre` est conservée pour les appelants, mais elle ne demande
   plus rien — c'est le serveur qui a déjà tranché, à l'entrée. */
async function assurerCoffre() { return true; }

async function fermerCoffre() {
  if (typeof _sb === 'undefined' || !_sb) return;
  try { await _sb.rpc('fermer_coffre', { p_token: TK() }); } catch (e) {}
  _coffreEtat = null;
  // Se refermer sans quitter la session laisserait une session élevée
  // devenue ordinaire : plus simple et plus sûr de sortir franchement.
  if (typeof logout === 'function') { logout(); return; }
  location.reload();
}

/* ── Définir ou changer le code (Administration) ─────────────────────── */
async function enregistrerCodeCoffre() {
  const err = document.getElementById('coffre-admin-err');
  const actuel  = document.getElementById('coffre-actuel')?.value || '';
  const nouveau = document.getElementById('coffre-nouveau')?.value || '';
  const confirm = document.getElementById('coffre-confirme')?.value || '';
  if (err) err.textContent = '';

  if (nouveau.trim().length < 8) {
    if (err) err.textContent = 'Le second mot de passe doit faire au moins 8 caractères.'; return;
  }
  if (nouveau !== confirm) {
    if (err) err.textContent = 'Les deux saisies ne correspondent pas.'; return;
  }

  const { data, error } = await _sb.rpc('definir_code_coffre',
    { p_token: TK(), p_code_actuel: actuel || null, p_nouveau_code: nouveau });

  if (error) {
    // ✅ v13.106 — On AFFICHE l'erreur du serveur au lieu de la remplacer par
    // une phrase vague. « Le serveur n'a pas répondu » est faux quand il a
    // répondu, et il a justement répondu pourquoi : masquer ce message coûte
    // un aller-retour entier à chaque incident.
    console.error('definir_code_coffre :', error);
    if (err) err.textContent = 'Refusé par le serveur : '
      + (error.message || error.hint || error.details || JSON.stringify(error));
    return;
  }
  if (data === 'code_actuel_incorrect') { if (err) err.textContent = 'Second mot de passe actuel incorrect.'; return; }
  if (data === 'code_trop_court')       { if (err) err.textContent = 'Trop court (8 caractères minimum).'; return; }
  if (data === 'identique_au_mot_de_passe') {
    // Sans cette vérification, l'administrateur croirait avoir deux portes
    // alors qu'il n'en aurait qu'une.
    if (err) err.textContent = 'Il doit être différent de votre mot de passe habituel.'; return; }
  if (data !== 'ok') { if (err) err.textContent = 'Refusé (' + data + ').'; return; }

  ['coffre-actuel','coffre-nouveau','coffre-confirme']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  toast('🔑 Second mot de passe enregistré', 'ok');
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
        ? '🔑 <strong>Vous êtes entré par la seconde porte</strong> — cahier jaune et dossiers verrouillés visibles.'
        : '🔒 <strong>Session ordinaire</strong> — cahier jaune et dossiers verrouillés hors de vue. '
          + 'Déconnectez-vous et entrez le second mot de passe pour y accéder.')
    : '⚠️ <strong>Aucun second mot de passe défini</strong> — tout reste accessible comme avant. '
      + 'Choisissez-en un pour créer la seconde porte.';
}

/* L'état est demandé une fois au chargement : c'est lui qui décide de
   l'affichage du bouton des fiches masquées. */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { if (typeof TK === 'function' && TK()) etatCoffre(); }, 1200);
});
