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

/* ─────────────────────────────────────────────────────────────
   RESTAURATION  (v13.78)

   Une sauvegarde qu'on ne sait pas relire n'est pas une sauvegarde.

   Règle de sécurité fondamentale : la restauration N'ÉCRASE JAMAIS une
   fiche existante. Elle ne réinsère que les identifiants absents de la
   base. Le cas réel visé est la perte (purge accidentelle, incident),
   pas la synchronisation entre deux versions divergentes. Conséquence
   utile : relancer la restauration deux fois ne fait rien la seconde fois.

   Les tarifs et les examens personnalisés ne sont VOLONTAIREMENT pas
   restaurés : ils vivent déjà en base, se modifient en deux clics, et
   les réécrire depuis un fichier ancien ferait revenir des prix périmés
   sans que personne ne s'en aperçoive.
   ───────────────────────────────────────────────────────────── */

/** Taille des lots envoyés au serveur : un envoi unique de 600 fiches
 *  complètes dépasse largement ce qu'une connexion de labo encaisse. */
const RESTAURATION_LOT = 50;

/** Vérifie qu'un fichier ressemble vraiment à une sauvegarde LaboSaisie. */
function _valideSauvegarde(o) {
  if (!o || typeof o !== 'object')      return 'Fichier illisible';
  if (!o._meta || !o._meta.application) return "Ce fichier n'est pas une sauvegarde LaboSaisie";
  if (!Array.isArray(o.fiches))         return 'Sauvegarde incomplète : aucune fiche';
  return null;
}

/** Ouvre le sélecteur de fichier puis enchaîne sur la restauration. */
function choisirFichierRestauration() {
  if (!isAdmin()) { toast('Restauration réservée aux administrateurs', 'err'); return; }
  const input = document.getElementById('fichier-restauration');
  if (!input) return;
  input.value = '';           // sinon re-choisir le même fichier ne déclenche rien
  input.click();
}

async function restaurerDepuisFichier(input) {
  const fichier = input && input.files && input.files[0];
  if (!fichier) return;
  await restaurerBase(await fichier.text());
}

/**
 * Restaure une sauvegarde à partir de son contenu texte.
 * Séparée de la lecture du fichier pour être testable sans boîte de dialogue.
 */
async function restaurerBase(texte) {
  if (!isAdmin())        { toast('Restauration réservée aux administrateurs', 'err'); return; }
  if (!navigator.onLine) { toast('Restauration impossible hors-ligne', 'err');        return; }

  let paquet = null;
  try { paquet = JSON.parse(texte); }
  catch (e) { toast('Fichier illisible : ce n\'est pas du JSON valide', 'err'); return; }

  const souci = _valideSauvegarde(paquet);
  if (souci) { toast(souci, 'err'); return; }

  const btn = document.getElementById('btn-restauration');
  try {
    // ── Aperçu : on annonce ce qui va se passer AVANT de toucher à quoi que ce soit.
    showLoading('Comparaison avec la base…');
    const { data: actuelles, error } = await _sb.rpc('get_resultats', { p_token: TK() });
    hideLoading();
    if (error || !Array.isArray(actuelles)) {
      toast('Comparaison impossible : ' + (error?.message || 'réponse inattendue'), 'err');
      return;
    }

    const presents = new Set(actuelles.map(f => String(f.id)));
    const aRestaurer = paquet.fiches.filter(f => f && f.id != null && !presents.has(String(f.id)));

    if (!aRestaurer.length) {
      toast('Rien à restaurer : les ' + paquet.fiches.length
            + ' fiches du fichier sont déjà en base ✓', 'ok');
      return;
    }

    const dateExport = paquet._meta.exporte_le
      ? new Date(paquet._meta.exporte_le).toLocaleDateString('fr-FR') : 'date inconnue';
    const ok = await showConfirmModal({
      icon: '♻️',
      title: 'Restaurer ' + aRestaurer.length + ' fiche' + (aRestaurer.length > 1 ? 's' : '') + ' ?',
      message: 'Sauvegarde du ' + dateExport + ' (' + paquet.fiches.length + ' fiches). '
             + aRestaurer.length + ' sont absentes de la base et vont être réinsérées ; '
             + (paquet.fiches.length - aRestaurer.length) + ' sont déjà présentes et seront ignorées. '
             + 'Aucune fiche existante ne sera modifiée ni supprimée. '
             + 'Les tarifs et le catalogue ne sont pas touchés.',
      confirmText: 'Restaurer',
    });
    if (!ok) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Restauration…'; }

    // ── Les prescripteurs d'abord : une fiche dont le prescripteur manque
    //    serait restaurée sans lui (clé étrangère), et la ristourne serait perdue.
    let prescrRestaures = 0;
    if (Array.isArray(paquet.prescripteurs) && paquet.prescripteurs.length) {
      showLoading('Restauration des prescripteurs…');
      const { data: rp } = await _sb.rpc('restaurer_prescripteurs', {
        p_token: TK(), p_liste: paquet.prescripteurs,
      });
      if (rp && rp.erreur) {
        hideLoading();
        toast('Restauration refusée : ' + rp.erreur, 'err');
        return;
      }
      prescrRestaures = (rp && rp.restaures) || 0;
    }

    // ── Puis les fiches, par lots, avec une progression visible.
    let restaurees = 0, sansPrescripteur = 0;
    for (let i = 0; i < aRestaurer.length; i += RESTAURATION_LOT) {
      const lot = aRestaurer.slice(i, i + RESTAURATION_LOT);
      showLoading('Restauration… ' + Math.min(i + lot.length, aRestaurer.length)
                  + ' / ' + aRestaurer.length);
      const { data: rf, error: ef } = await _sb.rpc('restaurer_fiches', {
        p_token: TK(), p_fiches: lot,
      });
      if (ef || (rf && rf.erreur)) {
        hideLoading();
        // On ne cache pas ce qui a déjà été fait : c'est acquis, pas perdu.
        toast('Interrompue après ' + restaurees + ' fiche' + (restaurees > 1 ? 's' : '')
              + ' : ' + (ef?.message || rf.erreur), 'err');
        await refreshDB(true);
        return;
      }
      restaurees      += (rf && rf.restaurees) || 0;
      sansPrescripteur += (rf && rf.sans_prescripteur) || 0;
    }
    hideLoading();

    let msg = restaurees + ' fiche' + (restaurees > 1 ? 's' : '') + ' restaurée'
            + (restaurees > 1 ? 's' : '') + ' ✓';
    if (prescrRestaures)  msg += ' — ' + prescrRestaures + ' prescripteur(s)';
    if (sansPrescripteur) msg += ' — ' + sansPrescripteur + ' sans prescripteur retrouvé';
    toast(msg, 'ok');

    await refreshDB(true);
    if (typeof renderHistory === 'function') renderHistory();
  } catch (e) {
    hideLoading();
    toast('Restauration échouée : ' + (e.message || e), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '♻️ Restaurer une sauvegarde'; }
  }
}

/* ─────────────────────────────────────────────────────────────
   RETOUR ARRIÈRE  (v13.79)

   Un instantané complet de la base est pris chaque nuit à 23h côté
   serveur et conservé 15 jours. Ce filet existait déjà, mais n'était
   exposé nulle part : personne ne pouvait tomber dedans.

   Deux gestes distincts, volontairement séparés parce qu'ils n'ont pas
   du tout le même risque :

   • Remettre les fiches DISPARUES d'une journée — purement additif,
     rien n'est écrasé, rejouable sans conséquence.
   • Réparer UNE fiche abîmée par une mauvaise saisie — là on écrase
     vraiment, donc une seule fiche à la fois, désignée à la main.
   ───────────────────────────────────────────────────────────── */

let _instantaneChoisi = null;

/** Remplit le sélecteur de dates avec les instantanés disponibles. */
async function chargerInstantanes() {
  const sel = document.getElementById('instantane-date');
  if (!sel || !isAdmin()) return;
  if (!navigator.onLine || typeof _sb === 'undefined' || !_sb) return;

  try {
    const { data, error } = await _sb.rpc('liste_instantanes', { p_token: TK() });
    if (error || !data || data.erreur || !Array.isArray(data.instantanes)) return;

    const liste = data.instantanes;
    if (!liste.length) {
      sel.innerHTML = '<option value="">Aucun instantané disponible</option>';
      return;
    }
    sel.innerHTML = '<option value="">— choisir une date —</option>' + liste.map(i => {
      const d = new Date(i.date + 'T12:00:00');
      const libelle = d.toLocaleDateString('fr-FR',
        { weekday: 'long', day: 'numeric', month: 'long' });
      // On annonce dès la liste combien de fiches manquent à l'appel :
      // c'est ce qui permet de repérer la bonne date sans tâtonner.
      const alerte = i.disparues > 0 ? ' — ' + i.disparues + ' fiche(s) disparue(s)' : '';
      return '<option value="' + i.date + '">' + libelle
           + ' (' + i.nb_fiches + ' fiches)' + alerte + '</option>';
    }).join('');
  } catch (e) { /* sans réseau, on laisse le sélecteur en l'état */ }
}

/** Compare une date d'instantané à l'état actuel et affiche le verdict. */
async function analyserInstantane() {
  const sel  = document.getElementById('instantane-date');
  const zone = document.getElementById('instantane-resultat');
  const btn  = document.getElementById('btn-retour-arriere');
  if (!sel || !zone) return;
  if (btn) btn.style.display = 'none';
  _instantaneChoisi = null;

  const date = sel.value;
  if (!date) { zone.innerHTML = ''; return; }
  if (!isAdmin()) { toast('Retour arrière réservé aux administrateurs', 'err'); return; }

  try {
    showLoading('Comparaison…');
    const { data, error } = await _sb.rpc('comparer_instantane', { p_token: TK(), p_date: date });
    hideLoading();
    if (error || !data || data.erreur) {
      zone.innerHTML = '<span style="color:#b91c1c">Comparaison impossible'
        + (data?.erreur ? ' (' + data.erreur + ')' : '') + '</span>';
      return;
    }

    const gris = 'color:var(--text-muted)';
    let html = '<div style="font-size:12.5px;line-height:1.7">'
      + '<strong>' + data.nb_fiches + '</strong> fiches dans cet instantané. ';

    if (data.disparues > 0) {
      html += '<span style="color:#b45309;font-weight:700">'
            + data.disparues + ' ne sont plus en base.</span>';
      const noms = (data.apercu || []).map(f =>
        '<li>' + (f.dossier || '?') + ' — ' + (f.nom || 'sans nom')
        + ' <span style="' + gris + '">(' + (f.montant || 0) + ' FCFA, saisi par '
        + (f.cree_par || '?') + ')</span></li>').join('');
      if (noms) html += '<ul style="margin:8px 0 0 18px;padding:0">' + noms
        + (data.disparues > 20 ? '<li style="' + gris + '">… et ' + (data.disparues - 20)
           + ' autres</li>' : '') + '</ul>';
    } else {
      html += '<span style="color:#15803d;font-weight:600">Aucune fiche manquante ✓</span>';
    }

    // Les deux autres compteurs sont informatifs : le retour arrière n'y touche pas.
    html += '<div style="' + gris + ';margin-top:8px">'
          + data.creees_depuis + ' fiche(s) créée(s) depuis — elles seront conservées. '
          + data.modifiees + ' fiche(s) modifiée(s) depuis — elles ne seront pas touchées '
          + '(pour en réparer une, utilisez le champ « réparer une fiche » ci-dessous).'
          + '</div></div>';
    zone.innerHTML = html;

    if (data.disparues > 0 && btn) {
      _instantaneChoisi = { date, disparues: data.disparues };
      btn.style.display = '';
      btn.textContent = '♻️ Remettre les ' + data.disparues + ' fiche(s) disparue(s)';
    }
  } catch (e) {
    hideLoading();
    zone.innerHTML = '<span style="color:#b91c1c">Comparaison impossible</span>';
  }
}

/** Remet en place les fiches manquantes de l'instantané sélectionné. */
async function lancerRetourArriere() {
  if (!isAdmin())        { toast('Retour arrière réservé aux administrateurs', 'err'); return; }
  if (!_instantaneChoisi) { toast('Choisissez d\'abord une date', 'err'); return; }

  const { date, disparues } = _instantaneChoisi;
  const jour = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR');
  const ok = await showConfirmModal({
    icon: '♻️',
    title: 'Remettre ' + disparues + ' fiche(s) ?',
    message: 'Les fiches présentes le ' + jour + ' et absentes aujourd\'hui seront '
           + 'réinsérées avec leur contenu, leur date et leur auteur d\'origine. '
           + 'Aucune fiche actuelle ne sera modifiée ni supprimée.',
    confirmText: 'Remettre',
  });
  if (!ok) return;

  const btn = document.getElementById('btn-retour-arriere');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Restauration…'; }
  try {
    showLoading('Retour arrière…');
    const { data, error } = await _sb.rpc('restaurer_depuis_instantane',
      { p_token: TK(), p_date: date });
    hideLoading();
    if (error || !data || data.erreur) {
      toast('Retour arrière échoué : ' + (error?.message || data?.erreur || '?'), 'err');
      return;
    }
    let msg = data.restaurees + ' fiche(s) remise(s) en place ✓';
    if (data.sans_prescripteur) msg += ' — ' + data.sans_prescripteur + ' sans prescripteur retrouvé';
    toast(msg, 'ok');
    await refreshDB(true);
    if (typeof renderHistory === 'function') renderHistory();
    await chargerInstantanes();
    await analyserInstantane();
  } catch (e) {
    hideLoading();
    toast('Retour arrière échoué : ' + (e.message || e), 'err');
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

/**
 * Répare une fiche désignée par son numéro de dossier, à la date choisie
 * dans le sélecteur. Passer par le numéro de dossier plutôt que par un
 * identifiant technique : c'est ce que l'admin a sous les yeux sur le reçu.
 */
async function reparerFicheParDossier() {
  const champ = document.getElementById('reparer-dossier');
  const sel   = document.getElementById('instantane-date');
  if (!champ || !sel) return;

  const numero = (champ.value || '').trim();
  if (!numero)     { toast('Indiquez un numéro de dossier', 'err'); return; }
  if (!sel.value)  { toast('Choisissez d\'abord une date ci-dessus', 'err'); return; }

  const db = (typeof getCalcDB === 'function' ? getCalcDB() : []) || [];
  const fiche = db.find(r => String(r.patient?.dossier || '').trim() === numero);
  if (!fiche) { toast('Dossier ' + numero + ' introuvable', 'err'); return; }

  await reparerFicheDepuisInstantane(fiche.id, sel.value);
  champ.value = '';
}

/**
 * Répare UNE fiche en la ramenant à son état d'une date donnée.
 * Contrairement au retour arrière de masse, celui-ci écrase le contenu
 * actuel : d'où la confirmation qui nomme explicitement le patient.
 */
async function reparerFicheDepuisInstantane(id, date) {
  if (!isAdmin()) { toast('Réservé aux administrateurs', 'err'); return; }
  const jour = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR');
  const ok = await showConfirmModal({
    icon: '↺',
    title: 'Revenir à la version du ' + jour + ' ?',
    message: 'Le contenu actuel de cette fiche (patient, résultats, montant) sera '
           + 'remplacé par celui du ' + jour + '. Cette action est tracée dans le '
           + 'journal d\'audit, mais elle écrase la version d\'aujourd\'hui.',
    confirmText: 'Revenir en arrière',
    confirmClass: 'btn-danger',
  });
  if (!ok) return;

  try {
    showLoading('Restauration de la fiche…');
    const { data, error } = await _sb.rpc('restaurer_fiche_depuis_instantane',
      { p_token: TK(), p_id: id, p_date: date });
    hideLoading();
    if (error || !data || data.erreur) {
      toast('Échec : ' + (error?.message || data?.erreur || '?'), 'err');
      return;
    }
    toast('Fiche ' + (data.dossier || id) + ' revenue au ' + jour + ' ✓', 'ok');
    await refreshDB(true);
    if (typeof renderHistory === 'function') renderHistory();
  } catch (e) {
    hideLoading();
    toast('Échec : ' + (e.message || e), 'err');
  }
}

/* ─────────────────────────────────────────────────────────────
   AUDIT DE SÉCURITÉ  (v13.80)

   Un contrôle de sécurité qui ne tourne qu'une fois, le jour où on y
   pense, ne protège de rien. Celui-ci interroge le serveur réel et
   vérifie trois invariants :

   • toute fonction joignable sans être connecté doit exiger un jeton
     de session (deux exceptions assumées : la connexion elle-même, et
     la vérification publique d'un résultat par QR) ;
   • toutes les tables ont la sécurité au niveau ligne activée ;
   • aucun mot de passe ne reste sur un hachage bcrypt faible.

   Il ne remplace pas la relecture du code : il attrape les régressions
   silencieuses, celles qu'on introduit sans s'en rendre compte.
   ───────────────────────────────────────────────────────────── */

async function lancerAuditSecurite() {
  const zone = document.getElementById('audit-securite-resultat');
  if (!zone) return;
  if (!isAdmin()) { toast('Audit réservé aux administrateurs', 'err'); return; }

  try {
    showLoading('Audit du serveur…');
    const { data, error } = await _sb.rpc('auditer_securite', { p_token: TK() });
    hideLoading();
    if (error || !data || data.erreur) {
      zone.innerHTML = '<span style="color:#b91c1c">Audit impossible'
        + (data?.erreur ? ' (' + data.erreur + ')' : '') + '</span>';
      return;
    }

    const fn      = data.fonctions_sans_controle_de_jeton || [];
    const tables  = data.tables_sans_rls || [];
    const comptes = data.comptes_a_hachage_faible || [];
    const ligne = (ok, txtOk, txtKo) => '<div style="margin:4px 0">'
      + (ok ? '<span style="color:#15803d;font-weight:600">✓ ' + txtOk + '</span>'
            : '<span style="color:#b91c1c;font-weight:700">✗ ' + txtKo + '</span>') + '</div>';

    zone.innerHTML = '<div style="font-size:12.5px;line-height:1.6">'
      + ligne(fn.length === 0,
              'Toutes les fonctions exposées exigent une session',
              fn.length + ' fonction(s) accessibles sans jeton : '
                + fn.map(f => f.fonction + (f.ecrit ? ' (écrit !)' : '')).join(', '))
      + ligne(tables.length === 0,
              'Sécurité au niveau ligne active sur toutes les tables',
              'Tables sans RLS : ' + tables.join(', '))
      + ligne(comptes.length === 0,
              'Tous les mots de passe utilisent un hachage fort',
              'Hachage faible (se corrigera à leur prochaine connexion) : ' + comptes.join(', '))
      + '<div style="color:var(--text-muted);margin-top:8px">Vérifié le '
      + new Date(data.verifie_le).toLocaleString('fr-FR') + '</div></div>';
  } catch (e) {
    hideLoading();
    zone.innerHTML = '<span style="color:#b91c1c">Audit impossible</span>';
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
