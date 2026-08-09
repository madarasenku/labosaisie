/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — periode-nav.js
   Navigation dans le temps, partagée par tous les onglets filtrables.

   ✅ v13.73 — Extrait de js/historique.js et généralisé. L'Historique,
   les Statistiques, la Caisse et la Caisse personnelle avaient chacun
   leur sélecteur de période, mais aucun ne permettait de remonter à un
   mois passé : il fallait saisir deux dates à la main. Plutôt que de
   recopier la logique quatre fois, elle vit ici.

   Chaque onglet conserve son propre décalage (0 = période en cours,
   -1 = la précédente…) et appelle ces fonctions avec son préfixe d'id.

   Chargé en script classique — voir le commentaire d'index.html.
   ═══════════════════════════════════════════════════════════════ */

const MOIS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet',
                   'Août','Septembre','Octobre','Novembre','Décembre'];

/** Format AAAA-MM-JJ en heure LOCALE.
 *  toISOString() bascule en UTC et décale d'un jour selon le fuseau. */
function _isoLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
       + '-' + String(d.getDate()).padStart(2, '0');
}

/** Lundi de la semaine contenant `d` (la semaine démarre le lundi). */
function _lundiDe(d) {
  const x = new Date(d);
  const j = x.getDay();                    // dimanche = 0
  x.setDate(x.getDate() - (j === 0 ? 6 : j - 1));
  return x;
}

/**
 * Plage [from, to] d'une période, décalage compris.
 * @param {string} periode  'jour' | 'semaine' | 'mois' | 'tout'
 * @param {number} decalage 0 = en cours, -1 = précédente, …
 */
function calcPlagePeriode(periode, decalage) {
  const now = new Date();
  decalage = decalage || 0;

  if (periode === 'jour') {
    const d = new Date(now); d.setDate(d.getDate() + decalage);
    const s = _isoLocal(d);
    return { from: s, to: s };
  }

  if (periode === 'semaine') {
    const lundi = _lundiDe(now);
    lundi.setDate(lundi.getDate() + decalage * 7);
    const dim = new Date(lundi); dim.setDate(dim.getDate() + 6);
    // Semaine en cours : on ne va pas au-delà d'aujourd'hui.
    const fin = (decalage === 0 && dim > now) ? now : dim;
    return { from: _isoLocal(lundi), to: _isoLocal(fin) };
  }

  if (periode === 'mois') {
    const debut = new Date(now.getFullYear(), now.getMonth() + decalage, 1);
    const fin   = new Date(now.getFullYear(), now.getMonth() + decalage + 1, 0);
    return { from: _isoLocal(debut), to: _isoLocal(decalage === 0 ? now : fin) };
  }

  return { from: null, to: null }; // 'tout'
}

/** Libellé lisible : « Juillet 2026 », « Semaine du 27 juillet au 2 août », « Hier ». */
function libelleDePeriode(periode, decalage) {
  decalage = decalage || 0;
  const { from, to } = calcPlagePeriode(periode, decalage);
  if (periode === 'tout')   return 'Toutes les fiches';
  if (periode === 'custom') return (from || '…') + ' → ' + (to || '…');

  const d = new Date(from + 'T12:00:00');
  if (periode === 'jour') {
    if (decalage === 0)  return "Aujourd'hui";
    if (decalage === -1) return 'Hier';
    return d.toLocaleDateString('fr-FR',
      { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
  if (periode === 'semaine') {
    const f = new Date(to + 'T12:00:00');
    const memeMois = d.getMonth() === f.getMonth();
    const txt = 'Semaine du ' + d.getDate()
              + (memeMois ? '' : ' ' + MOIS_LONG[d.getMonth()].toLowerCase())
              + ' au ' + f.getDate() + ' ' + MOIS_LONG[f.getMonth()].toLowerCase()
              + (d.getFullYear() !== new Date().getFullYear() ? ' ' + f.getFullYear() : '');
    return decalage === 0 ? txt + ' (en cours)' : txt;
  }
  return MOIS_LONG[d.getMonth()] + ' ' + d.getFullYear();
}

/**
 * Rafraîchit le bandeau de navigation d'un onglet.
 * @param {string} prefixe  'hist' | 'stats' | 'caisse' | 'ucaisse'
 */
function majBandeauPeriode(prefixe, periode, decalage) {
  const zone = document.getElementById(prefixe + '-nav-periode');
  if (!zone) return;
  const navigable = ['jour','semaine','mois'].includes(periode);
  zone.style.display = navigable ? 'flex' : 'none';

  const lbl = document.getElementById(prefixe + '-nav-label');
  if (lbl) lbl.textContent = libelleDePeriode(periode, decalage);

  // Interdit d'aller dans le futur : aucune fiche n'y existe, on n'y
  // afficherait qu'un tableau vide sans explication.
  const suivant = document.getElementById(prefixe + '-nav-suivant');
  if (suivant) {
    suivant.disabled = decalage >= 0;
    suivant.style.opacity = decalage >= 0 ? '.35' : '1';
    suivant.style.cursor  = decalage >= 0 ? 'default' : 'pointer';
  }
  const retour = document.getElementById(prefixe + '-nav-retour');
  if (retour) retour.style.display = decalage === 0 ? 'none' : '';

  // Sélecteurs mois / année : utiles seulement en granularité « mois ».
  const selZone = document.getElementById(prefixe + '-mois-annee');
  if (selZone) selZone.style.display = (periode === 'mois') ? 'flex' : 'none';
  if (periode === 'mois') {
    const { from } = calcPlagePeriode('mois', decalage);
    const d = new Date(from + 'T12:00:00');
    const mEl = document.getElementById(prefixe + '-sel-mois');
    const aEl = document.getElementById(prefixe + '-sel-annee');
    if (mEl && !mEl.dataset.rempli) {
      mEl.innerHTML = MOIS_LONG.map((m, i) => `<option value="${i}">${m}</option>`).join('');
      mEl.dataset.rempli = '1';
    }
    if (aEl && !aEl.dataset.rempli) {
      const a = new Date().getFullYear();
      aEl.innerHTML = [a, a - 1, a - 2].map(y => `<option value="${y}">${y}</option>`).join('');
      aEl.dataset.rempli = '1';
    }
    if (mEl) mEl.value = d.getMonth();
    if (aEl) aEl.value = d.getFullYear();
  }
}

/** Décalage correspondant au mois choisi dans les listes déroulantes. */
function decalageDepuisSelecteurs(prefixe) {
  const m = Number(document.getElementById(prefixe + '-sel-mois')?.value);
  const a = Number(document.getElementById(prefixe + '-sel-annee')?.value);
  if (Number.isNaN(m) || Number.isNaN(a)) return null;
  const now = new Date();
  const diff = (a - now.getFullYear()) * 12 + (m - now.getMonth());
  if (diff > 0) {
    if (typeof toast === 'function') toast("Ce mois n'est pas encore arrivé", 'err');
    return null;
  }
  return diff;
}

/** Remplit les champs de dates d'un onglet à partir de la période active. */
function synchroniserChampsDate(prefixe, periode, decalage) {
  const { from, to } = calcPlagePeriode(periode, decalage);
  const f = document.getElementById(prefixe + '-date-from');
  const t = document.getElementById(prefixe + '-date-to');
  if (f) f.value = from || '';
  if (t) t.value = (periode === 'tout') ? '' : (to || '');
}
