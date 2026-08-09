/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — sauvegarde.js
   Export complet de la base, récupérable par l'administrateur.

   ✅ v13.77 — Jusqu'ici, tout reposait sur les sauvegardes internes de
   Supabase, sur lesquelles le laboratoire n'a aucune main : impossible de
   les télécharger, de vérifier qu'elles existent, ou de restaurer soi-même.

   ⚠️ LA SAUVEGARDE NE QUITTE PAS LE POSTE DE L'ADMINISTRATEUR.
   Le dépôt GitHub du projet est PUBLIC : y déposer un export publierait
   les données médicales de centaines de patients. Le fichier est donc
   téléchargé sur le disque de l'admin, et rien n'est envoyé ailleurs.
   Seule la DATE de la sauvegarde est enregistrée en base, pour pouvoir
   alerter quand elle devient trop ancienne.

   Chargé en script classique — voir le commentaire d'index.html.
   ═══════════════════════════════════════════════════════════════ */

/** Nombre de jours au-delà duquel on considère la sauvegarde trop ancienne. */
const SAUVEGARDE_ALERTE_JOURS = 7;

/** Télécharge un contenu sous forme de fichier, sans passer par un serveur. */
function _telechargerFichier(contenu, nomFichier, type) {
  const blob = new Blob([contenu], { type: type || 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = nomFichier;
  document.body.appendChild(a); a.click(); a.remove();
  // Libérer l'URL après le déclenchement du téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function _horodatage() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
       + '-' + p(d.getHours()) + p(d.getMinutes());
}

/**
 * Sauvegarde complète : toutes les fiches, avec leurs résultats détaillés.
 * refreshDB() ne rapporte que des métadonnées légères ; on va donc chercher
 * le contenu complet, sinon la sauvegarde serait inutilisable pour restaurer.
 */
async function sauvegarderBase() {
  if (!isAdmin()) { toast('Sauvegarde réservée aux administrateurs', 'err'); return; }
  if (!navigator.onLine) { toast('Sauvegarde impossible hors-ligne', 'err'); return; }

  const btn = document.getElementById('btn-sauvegarde');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sauvegarde en cours…'; }

  try {
    showLoading('Récupération des fiches…');
    const { data, error } = await _sb.rpc('get_resultats', { p_token: TK() });
    hideLoading();

    if (error || !Array.isArray(data)) {
      toast('Sauvegarde échouée : ' + (error?.message || 'réponse inattendue'), 'err');
      return;
    }

    const paquet = {
      _meta: {
        application: 'LaboSaisie CPMI Grand-Bassam',
        version_application: (typeof APP_VERSION_CLIENT !== 'undefined') ? APP_VERSION_CLIENT : null,
        exporte_le: new Date().toISOString(),
        exporte_par: _currentUser?.username || '?',
        nb_fiches: data.length,
        avertissement: 'Ce fichier contient des données médicales nominatives. '
                     + 'Le conserver sur un support sécurisé et ne jamais le déposer '
                     + 'sur un dépôt public ou un partage en ligne non protégé.',
      },
      fiches: data,
      prescripteurs: (typeof _prescripteurs !== 'undefined') ? _prescripteurs : [],
      tarifs: (typeof getTarifsRef === 'function') ? getTarifsRef() : {},
      examens_personnalises: (typeof getExamensCustom === 'function') ? getExamensCustom() : [],
    };

    const nom = 'labosaisie-sauvegarde-' + _horodatage() + '.json';
    _telechargerFichier(JSON.stringify(paquet, null, 2), nom);

    // On note la date en base pour que TOUS les postes sachent où on en est.
    try {
      await _sb.rpc('enregistrer_sauvegarde', {
        p_token: TK(), p_nb_fiches: data.length, p_format: 'json',
      });
    } catch (e) { /* le fichier est déjà téléchargé, c'est l'essentiel */ }

    toast(data.length + ' fiches sauvegardées ✓', 'ok');
    majBandeauSauvegarde();
  } catch (e) {
    hideLoading();
    toast('Sauvegarde échouée : ' + (e.message || e), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Sauvegarder maintenant'; }
  }
}

/**
 * Affiche l'ancienneté de la dernière sauvegarde, et alerte si elle date.
 * Volontairement discret quand tout va bien : une alerte permanente finit
 * par ne plus être lue.
 */
async function majBandeauSauvegarde() {
  const zone = document.getElementById('sauvegarde-etat');
  if (!zone || !isAdmin()) return;
  if (!navigator.onLine || typeof _sb === 'undefined' || !_sb) return;

  try {
    const { data, error } = await _sb.rpc('derniere_sauvegarde', { p_token: TK() });
    if (error || !data) return;

    if (data.jamais) {
      zone.innerHTML = '<span style="color:#b45309;font-weight:700">⚠ Aucune sauvegarde effectuée</span>'
        + ' <span style="color:var(--text-muted)">— ' + data.fiches_actuelles + ' fiches en base</span>';
      return;
    }

    const jours = Number(data.jours) || 0;
    const quand = jours === 0 ? "aujourd'hui" : (jours === 1 ? 'hier' : 'il y a ' + jours + ' jours');
    const nouvelles = (Number(data.fiches_actuelles) || 0) - (Number(data.nb_fiches) || 0);
    const detail = nouvelles > 0 ? ' — ' + nouvelles + ' fiche' + (nouvelles > 1 ? 's' : '') + ' depuis' : '';

    if (jours >= SAUVEGARDE_ALERTE_JOURS) {
      zone.innerHTML = '<span style="color:#b45309;font-weight:700">⚠ Dernière sauvegarde ' + quand + '</span>'
        + '<span style="color:var(--text-muted)">' + detail + '</span>';
    } else {
      zone.innerHTML = '<span style="color:#15803d;font-weight:600">✓ Sauvegardé ' + quand + '</span>'
        + '<span style="color:var(--text-muted)">' + detail + '</span>';
    }
  } catch (e) { /* sans réseau, on n'affiche rien plutôt qu'une fausse alerte */ }
}
