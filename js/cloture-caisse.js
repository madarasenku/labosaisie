/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — cloture-caisse.js

   ✅ v13.84 — État de fin de journée, imprimable et signable.

   Ce que ce document engage : il est signé par le caissier et par le
   responsable, et il sert de pièce en cas de contrôle. Deux principes
   en découlent, et ils priment sur l'esthétique.

   1. La recette annoncée ne doit JAMAIS être plus grosse que ce qui est
      réellement dans le tiroir. Les dossiers verrouillés sont donc sortis
      du total et présentés à part : ils sont exclus de tous les calculs de
      l'application, les inclure ici ferait signer un chiffre introuvable
      ailleurs.
   2. Ce qui cloche se voit. Monnaie promise et non rendue, dossiers non
      encaissés du jour : ces deux lignes sont affichées même à zéro, parce
      qu'une rubrique qui n'apparaît que lorsqu'elle est mauvaise finit par
      être lue comme une accusation, et on cesse de l'imprimer.

   Chargé en script classique — voir le commentaire d'index.html.
   ═══════════════════════════════════════════════════════════════ */

/** Date du jour au format AAAA-MM-JJ, en heure LOCALE.
 *  Pas toISOString() : à Abidjan comme ailleurs, il décale d'un jour selon
 *  l'heure à laquelle on clôture. Une clôture datée de la veille est pire
 *  qu'une clôture absente. */
function _jourLocal(d) {
  const x = d || new Date();
  const p = n => String(n).padStart(2, '0');
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
}

function _fcfa(n) { return (Number(n) || 0).toLocaleString('fr-FR') + ' FCFA'; }

// ✅ v13.127 — Journées verrouillées (gel des sommes du jour).
let _cloturesVerr = new Set();
function jourVerrouille(jour) { return _cloturesVerr.has(jour); }
async function chargerClotures() {
  try {
    if (typeof _sb === 'undefined' || !_sb || typeof TK !== 'function' || !TK()) return;
    const { data, error } = await _sb.rpc('list_clotures', { p_token: TK() });
    if (!error && Array.isArray(data)) _cloturesVerr = new Set(data.map(x => x.jour));
  } catch (e) { /* réseau : garder l'état connu */ }
}
async function verrouillerJournee() {
  const champ = document.getElementById('cloture-date');
  const jour = (champ && champ.value) || _jourLocal();
  if (typeof peutEncaisser === 'function' && !peutEncaisser()) { toast('Verrouillage réservé à la caisse', 'err'); return; }
  const c = calculerCloture(jour);
  if (typeof showConfirmModal === 'function' && !await showConfirmModal({
    icon: '🔒', title: 'Verrouiller la journée ?',
    message: 'La journée du <strong>' + esc(jour) + '</strong> (' + _fcfa(c.total) + ') sera <strong>gelée</strong> : plus aucune modification (encaissements, résultats, suppressions) possible sur ces dossiers. Seul l\'administrateur pourra la rouvrir.',
    confirmText: '🔒 Verrouiller', cancelText: 'Annuler'
  })) return;
  showLoading('Verrouillage…');
  const { data, error } = await _sb.rpc('verrouiller_journee', { p_token: TK(), p_jour: jour });
  hideLoading();
  if (error || data !== 'ok') { toast('Échec : ' + (error?.message || data || '?'), 'err'); return; }
  await chargerClotures();
  toast('🔒 Journée du ' + jour + ' verrouillée', 'ok');
  renderCloture();
}
// ✅ v13.128 — Verrouiller toutes les journées jusqu'à la date choisie (incluse).
async function verrouillerJusqua() {
  const champ = document.getElementById('cloture-date');
  const jour = (champ && champ.value) || _jourLocal();
  if (typeof peutEncaisser === 'function' && !peutEncaisser()) { toast('Verrouillage réservé à la caisse', 'err'); return; }
  if (typeof showConfirmModal === 'function' && !await showConfirmModal({
    icon: '🔒', title: 'Tout verrouiller jusqu\'à cette date ?',
    message: 'Toutes les journées <strong>jusqu\'au ' + esc(jour) + ' inclus</strong> seront gelées : plus aucune modification possible sur ces dossiers.<br>'
      + '<em>Si tu inclus aujourd\'hui, l\'enregistrement de nouveaux patients du jour sera aussi bloqué.</em>',
    confirmText: '🔒 Tout verrouiller', cancelText: 'Annuler'
  })) return;
  showLoading('Verrouillage en cours…');
  const { data, error } = await _sb.rpc('verrouiller_jusqua', { p_token: TK(), p_jour: jour });
  hideLoading();
  if (error || !data || data.erreur) { toast('Échec : ' + (error?.message || data?.erreur || '?'), 'err'); return; }
  await chargerClotures();
  toast('🔒 ' + (data.verrouillees || 0) + ' journée(s) verrouillée(s) jusqu\'au ' + jour, 'ok');
  renderCloture();
}

async function deverrouillerJournee() {
  if (typeof isAdmin === 'function' && !isAdmin()) { toast('Déverrouillage réservé à l\'administrateur', 'err'); return; }
  const champ = document.getElementById('cloture-date');
  const jour = (champ && champ.value) || _jourLocal();
  if (typeof showConfirmModal === 'function' && !await showConfirmModal({
    icon: '🔓', title: 'Déverrouiller la journée ?',
    message: 'La journée du <strong>' + esc(jour) + '</strong> redeviendra modifiable.',
    confirmText: 'Déverrouiller', cancelText: 'Annuler'
  })) return;
  showLoading('Déverrouillage…');
  const { data, error } = await _sb.rpc('deverrouiller_journee', { p_token: TK(), p_jour: jour });
  hideLoading();
  if (error || data !== 'ok') { toast('Échec : ' + (error?.message || data || '?'), 'err'); return; }
  await chargerClotures();
  toast('🔓 Journée du ' + jour + ' déverrouillée', 'ok');
  renderCloture();
}

/**
 * Calcule l'état de caisse d'une journée. Fonction pure : elle ne touche
 * ni au DOM ni au réseau, uniquement au cache déjà chargé. C'est ce qui
 * la rend vérifiable.
 */
function calculerCloture(jour) {
  const toutes = (typeof _dbCache !== 'undefined' ? _dbCache : []) || [];
  const duJour = toutes.filter(r =>
    !r.deletedAt && !r._hardDeleted && _recDate(r) === jour);

  // Un dossier verrouillé est exclu de tous les calculs de l'application.
  // On le sort donc de la recette, mais on le compte à part : de l'argent
  // qui disparaît sans ligne d'explication, c'est exactement le problème
  // qu'on cherche à ne plus reproduire.
  // ✅ v13.91 — Un bilan prénatal interne compte dans la recette comme
  // n'importe quel dossier : la patiente paie bien 10 000 FCFA au guichet.
  // Le cahier jaune suit ce qui est DÛ AU PERSONNEL, il ne retire rien de
  // la caisse. Les avoir sortis de la recette (v13.86) les faisait aussi
  // disparaître de « À encaisser », donc plus personne ne pouvait encaisser.
  const cahierJaune = duJour.filter(r => typeof estCahierJaune === 'function'
                                      && estCahierJaune(r));
  const verrouilles = duJour.filter(r => !!r.restrictedBy);
  const visibles    = duJour.filter(r => !r.restrictedBy);

  const payes    = visibles.filter(r => r.patient?.paiement_status === 'paye');
  const impayes  = visibles.filter(r => r.patient?.paiement_status !== 'paye');

  const somme = liste => liste.reduce((t, r) => t + (Number(r.montant) || 0), 0);

  // Par agent : c'est la ligne qui engage la responsabilité de chacun.
  const parAgent = {};
  payes.forEach(r => {
    const a = r.patient?.paiement_infos?.agent || r.createdBy || '—';
    if (!parAgent[a]) parAgent[a] = { nb: 0, total: 0, regularisations: 0 };
    parAgent[a].nb++;
    parAgent[a].total += Number(r.montant) || 0;
    if (r.patient?.paiement_infos?.regularisation) parAgent[a].regularisations++;
  });

  const parType = {};
  payes.forEach(r => {
    // ✅ v13.85 — Un forfait prénatal compte pour UNE prestation « BPN », pas
    // pour les cinq catégories qu'il coche : sinon la répartition annonce
    // cinq analyses vendues là où le laboratoire en a facturé une.
    const types = (typeof estBPN === 'function' && estBPN(r))
      ? ['BPN']
      : ((typeof getRecordTypes === 'function' ? getRecordTypes(r) : null)
         || [r.type].filter(Boolean));
    const liste = types.length ? types : ['—'];
    // Le montant d'un dossier couvre plusieurs analyses : on l'attribue au
    // dossier entier sur sa première ligne plutôt que de le répartir au
    // hasard entre les types, ce qui produirait des sous-totaux inventés.
    liste.forEach((t, i) => {
      if (!parType[t]) parType[t] = { nb: 0, total: 0 };
      parType[t].nb++;
      if (i === 0) parType[t].total += Number(r.montant) || 0;
    });
  });

  // ✅ v13.85 — Le détail nominatif : c'est lui qui permet de pointer la
  // clôture ligne à ligne contre le cahier de caisse. Trié par heure de
  // saisie, dans l'ordre où les patients se sont présentés.
  const detail = payes
    .slice()
    .sort((a, b) => String(a.savedAt || '').localeCompare(String(b.savedAt || '')))
    .map(r => ({
      dossier: r.patient?.dossier || r.patient?.ancien_dossier || '—',
      nom: r.patient?.nom || '—',
      age: r.patient?.age !== undefined && r.patient?.age !== '' ? String(r.patient.age) : '—',
      prescripteur: r.patient?.medecin || '—',
      // getDisplayType renvoie « BPN » pour un forfait prénatal plutôt que
      // les cinq catégories qu'il coche : c'est la prestation vendue.
      examens: (typeof getDisplayType === 'function' ? getDisplayType(r) : (r.type || '—')),
      montant: Number(r.montant) || 0,
      regularisation: !!r.patient?.paiement_infos?.regularisation,
    }));

  const monnaieDues = visibles
    .map(r => ({ r, du: (typeof monnaieDue === 'function' ? monnaieDue(r.id) : 0) }))
    .filter(x => x.du > 0);

  return {
    jour,
    dossiers: payes.length,
    total: somme(payes),
    parAgent, parType, detail,
    impayes: impayes.map(r => ({ id: r.id, dossier: r.patient?.dossier || '—',
                                 nom: r.patient?.nom || '—', montant: Number(r.montant) || 0 })),
    totalImpaye: somme(impayes),
    verrouilles: verrouilles.length,
    totalVerrouille: somme(verrouilles),
    // Informatif : ces dossiers SONT dans la recette, mais leur produit est
    // dû au personnel. L'admin doit pouvoir rapprocher les deux registres.
    cahierJaune: cahierJaune.length,
    totalCahierJaune: somme(cahierJaune.filter(r => r.patient?.paiement_status === 'paye')),
    monnaieDue: monnaieDues.map(x => ({ dossier: x.r.patient?.dossier || '—',
                                        nom: x.r.patient?.nom || '—', montant: x.du })),
    totalMonnaieDue: monnaieDues.reduce((t, x) => t + x.du, 0),
    // Une régularisation n'est pas de l'argent entré dans le tiroir
    // aujourd'hui : le caissier ne doit pas avoir à le justifier.
    totalRegularise: somme(payes.filter(r => r.patient?.paiement_infos?.regularisation)),
  };
}

/** Affiche l'aperçu à l'écran, avant impression. */
function renderCloture() {
  const zone = document.getElementById('cloture-apercu');
  const champ = document.getElementById('cloture-date');
  if (!zone) return;
  if (champ && !champ.value) champ.value = _jourLocal();
  const jour = (champ && champ.value) || _jourLocal();

  const c = calculerCloture(jour);
  const lignesAgent = Object.entries(c.parAgent)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([nom, v]) => '<tr><td>' + esc(nom) + '</td><td style="text-align:right">' + v.nb
      + '</td><td style="text-align:right"><strong>' + _fcfa(v.total) + '</strong></td></tr>')
    .join('') || '<tr><td colspan="3" style="color:var(--text-muted)">Aucun encaissement</td></tr>';

  const alerte = (titre, n, montant, couleur) =>
    '<div style="margin-top:6px;color:' + (n ? couleur : '#15803d') + ';font-weight:' + (n ? 700 : 600) + '">'
    + (n ? '⚠ ' : '✓ ') + titre + ' : ' + n + (montant != null ? ' — ' + _fcfa(montant) : '') + '</div>';

  zone.innerHTML =
    '<div style="font-size:13px;line-height:1.6">'
    + '<div style="font-size:20px;font-weight:800;color:var(--cpmi-dark,#0b2545)">'
    + _fcfa(c.total) + '</div>'
    + '<div style="color:var(--text-muted);margin-bottom:10px">'
    + c.dossiers + ' dossier(s) encaissé(s) le '
    + new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</div>'
    // ✅ v13.127 — Verrouillage de la journée (gel des sommes).
    + (function () {
        const verr = jourVerrouille(jour);
        const peut = (typeof peutEncaisser === 'function' && peutEncaisser());
        let action = '';
        if (verr) {
          action = (typeof isAdmin === 'function' && isAdmin())
            ? '<button class="btn btn-outline" style="font-size:12px;padding:4px 12px" onclick="deverrouillerJournee()">🔓 Déverrouiller</button>'
            : '<span style="font-size:11.5px;color:#92400e">déverrouillage réservé à l\'administrateur</span>';
        } else if (peut) {
          action = '<button class="btn" style="font-size:12px;padding:4px 12px;background:#92400e;color:#fff" onclick="verrouillerJournee()">🔒 Verrouiller cette journée</button>';
        }
        // Verrouillage en masse jusqu'à la date choisie (visible pour ceux qui encaissent).
        if (peut) {
          action += '<button class="btn btn-outline" style="font-size:12px;padding:4px 12px" onclick="verrouillerJusqua()">🔒 Tout verrouiller jusqu\'à cette date</button>';
        }
        return '<div style="margin:6px 0 12px;padding:8px 11px;border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;'
          + (verr ? 'background:#fef3c7;border:1px solid #fbbf24' : 'background:#f0fdf4;border:1px solid #bbf7d0') + '">'
          + '<span style="font-weight:700;font-size:12.5px;color:' + (verr ? '#92400e' : '#166534') + '">'
          + (verr ? '🔒 Journée verrouillée — sommes gelées' : '🔓 Journée ouverte') + '</span>' + action + '</div>';
      })()
    + '<table style="width:100%;font-size:12.5px;border-collapse:collapse">'
    + '<thead><tr><th style="text-align:left">Agent</th><th style="text-align:right">Dossiers</th>'
    + '<th style="text-align:right">Encaissé</th></tr></thead><tbody>' + lignesAgent + '</tbody></table>'
    + alerte('Monnaie promise non rendue', c.monnaieDue.length, c.totalMonnaieDue, '#b45309')
    + alerte('Dossiers non encaissés', c.impayes.length, c.totalImpaye, '#b91c1c')
    // ✅ v13.89 — Ces deux lignes ne s'affichent QUE pour l'administrateur :
    // pour le reste du personnel, ces dossiers n'existent pas. L'admin doit
    // pouvoir expliquer un écart, les autres n'ont pas à en connaître.
    + (isAdmin() && c.cahierJaune
        ? '<div style="margin-top:6px;color:#92400e">📒 ' + c.cahierJaune
          + ' BPN interne(s), ' + _fcfa(c.totalCahierJaune)
          + ' — comptés dans la recette, et reportés au cahier jaune</div>'
        : '')
    + (isAdmin() && c.verrouilles
        ? '<div style="margin-top:6px;color:#92400e">🔒 ' + c.verrouilles
          + ' dossier(s) verrouillé(s), ' + _fcfa(c.totalVerrouille)
          + ' — hors recette, exclus des calculs de l\'application</div>'
        : '')
    + (c.totalRegularise
        ? '<div style="margin-top:6px;color:var(--text-muted)">Dont ' + _fcfa(c.totalRegularise)
          + ' de régularisation (encaissement rétroactif, pas une entrée du jour)</div>'
        : '')
    + '</div>';
}

/** Construit le document de clôture et lance l'impression. */
function imprimerCloture() {
  const champ = document.getElementById('cloture-date');
  const jour = (champ && champ.value) || _jourLocal();
  const c = calculerCloture(jour);
  const now = new Date();
  const jourLong = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const rangs = (obj, cols) => Object.entries(obj)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => '<tr><td>' + escHTML(k) + '</td><td style="text-align:right">' + v.nb
      + '</td>' + (cols ? '<td style="text-align:right">' + _fcfa(v.total) + '</td>' : '') + '</tr>')
    .join('') || '<tr><td colspan="3" style="font-style:italic">Aucun</td></tr>';

  const bloc = (titre, corps) =>
    '<div style="margin-top:14px"><div style="font-weight:800;font-size:11pt;'
    + 'border-bottom:1.5px solid #1e3a8a;padding-bottom:3px;margin-bottom:6px">'
    + titre + '</div>' + corps + '</div>';

  const listeSimple = (arr, vide) => arr.length
    ? '<table style="width:100%;font-size:10pt;border-collapse:collapse">'
      + arr.map(x => '<tr><td>' + escHTML(x.dossier) + '</td><td>' + escHTML(x.nom)
        + '</td><td style="text-align:right">' + _fcfa(x.montant) + '</td></tr>').join('')
      + '</table>'
    : '<div style="font-style:italic;color:#444">' + vide + '</div>';

  const html =
    '<div class="print-header-bar"></div>'
    + '<div style="text-align:center;padding:10px 0 4px">'
    + '<div style="font-size:17pt;font-weight:900">CPMI DE GRAND-BASSAM</div>'
    + '<div style="font-size:10pt;color:#444">Laboratoire d\'analyses médicales</div>'
    + '<div style="font-size:14pt;font-weight:800;margin-top:8px;letter-spacing:.5px">'
    + 'CLÔTURE DE CAISSE</div>'
    + '<div style="font-size:11pt;margin-top:2px">' + jourLong + '</div></div>'
    + '<div class="print-header-bar bottom"></div>'

    + '<div style="margin-top:16px;text-align:center;border:2px solid #1e3a8a;padding:10px">'
    + '<div style="font-size:9.5pt;letter-spacing:1px;color:#444">RECETTE DU JOUR</div>'
    + '<div style="font-size:22pt;font-weight:900">' + _fcfa(c.total) + '</div>'
    + '<div style="font-size:10pt;color:#444">' + c.dossiers + ' dossier(s) encaissé(s)</div>'
    + (c.totalRegularise
        ? '<div style="font-size:9pt;color:#444;margin-top:4px;font-style:italic">dont '
          + _fcfa(c.totalRegularise) + ' de régularisation rétroactive — non encaissé ce jour</div>'
        : '')
    + '</div>'

    + bloc('Répartition par agent',
        '<table style="width:100%;font-size:10.5pt;border-collapse:collapse">'
        + '<thead><tr><th style="text-align:left">Agent</th><th style="text-align:right">Dossiers</th>'
        + '<th style="text-align:right">Montant</th></tr></thead><tbody>'
        + rangs(c.parAgent, true) + '</tbody></table>')

    // ✅ v13.85 — Détail nominatif : c'est ce qui permet de pointer la
    // clôture ligne à ligne contre le cahier de caisse. Sans lui, le
    // document n'est qu'un total qu'on ne peut ni vérifier ni contester.
    + bloc('Détail des encaissements',
        '<table style="width:100%;font-size:9.5pt;border-collapse:collapse">'
        + '<thead><tr style="border-bottom:1px solid #000">'
        + '<th style="text-align:left">N°</th><th style="text-align:left">Patient</th>'
        + '<th style="text-align:center">Âge</th><th style="text-align:left">Prescripteur</th>'
        + '<th style="text-align:left">Examens</th><th style="text-align:right">Payé</th>'
        + '</tr></thead><tbody>'
        + (c.detail.length
            ? c.detail.map(d =>
                '<tr style="border-bottom:1px solid #e5e5e5">'
                + '<td>' + escHTML(d.dossier) + '</td>'
                + '<td>' + escHTML(d.nom) + '</td>'
                + '<td style="text-align:center">' + escHTML(d.age) + '</td>'
                + '<td>' + escHTML(d.prescripteur) + '</td>'
                + '<td>' + escHTML(d.examens)
                + (d.regularisation ? ' <em style="font-size:8pt">(régul.)</em>' : '') + '</td>'
                + '<td style="text-align:right">' + _fcfa(d.montant) + '</td></tr>').join('')
            : '<tr><td colspan="6" style="font-style:italic">Aucun encaissement ce jour.</td></tr>')
        + '</tbody><tfoot><tr style="border-top:2px solid #000;font-weight:800">'
        + '<td colspan="5">TOTAL</td><td style="text-align:right">' + _fcfa(c.total) + '</td>'
        + '</tr></tfoot></table>')

    + bloc('Répartition par analyse',
        '<table style="width:100%;font-size:10.5pt;border-collapse:collapse">'
        + '<thead><tr><th style="text-align:left">Analyse</th><th style="text-align:right">Nombre</th>'
        + '<th style="text-align:right">Montant dossier</th></tr></thead><tbody>'
        + rangs(c.parType, true) + '</tbody></table>')

    // Ces deux rubriques s'impriment même vides : une rubrique qui
    // n'apparaît que lorsqu'elle est mauvaise finit par être lue comme une
    // accusation, et on cesse de l'imprimer.
    + bloc('Monnaie promise et non rendue',
        listeSimple(c.monnaieDue, 'Aucune monnaie en attente — tout a été rendu.')
        + (c.totalMonnaieDue ? '<div style="text-align:right;font-weight:800;margin-top:4px">Total dû : '
            + _fcfa(c.totalMonnaieDue) + '</div>' : ''))

    + bloc('Dossiers non encaissés',
        listeSimple(c.impayes, 'Aucun — tous les dossiers du jour ont été encaissés.')
        + (c.totalImpaye ? '<div style="text-align:right;font-weight:800;margin-top:4px">Total : '
            + _fcfa(c.totalImpaye) + '</div>' : ''))

    // ✅ v13.89 — Les rubriques « hors recette » ne s'impriment plus : le
    // laboratoire veut un document qui ne parle QUE de la recette. Les
    // montants restent calculés et consultables à l'écran par l'admin,
    // mais ils ne figurent plus sur la pièce signée.

    + '<div style="margin-top:26px;display:flex;gap:30px">'
    + ['Le caissier', 'Le responsable'].map(r =>
        '<div style="flex:1"><div style="font-size:10pt;font-weight:700">' + r + '</div>'
        + '<div style="font-size:8.5pt;color:#666">Nom et signature</div>'
        + '<div style="border-bottom:1px solid #000;height:46px"></div></div>').join('')
    + '</div>'

    + '<div style="margin-top:18px;font-size:8pt;color:#555;text-align:center;'
    + 'border-top:1px solid #ccc;padding-top:6px">'
    + 'Édité le ' + now.toLocaleDateString('fr-FR') + ' à '
    + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    + ' par ' + escHTML(_currentUser?.username || '?')
    + ' · Document interne du laboratoire CPMI Grand-Bassam</div>';

  let printDiv = document.getElementById('print-render');
  if (!printDiv) {
    printDiv = document.createElement('div');
    printDiv.id = 'print-render';
    document.body.appendChild(printDiv);
  }
  printDiv.innerHTML = html;
  window.print();
}
