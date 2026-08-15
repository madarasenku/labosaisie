/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — historique.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

let _sortCol = 'date';

function setSortCol(col) {
  const sel = document.getElementById('filter-sort');
  if (_sortCol === col) { sel.value = sel.value === 'desc' ? 'asc' : 'desc'; }
  else { _sortCol = col; }
  renderHistory();
}

function clearSearchFilters() {
  ['search-input','filter-date-from','filter-date-to'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['filter-type','filter-agent','filter-statut','filter-service'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const fs = document.getElementById('filter-sort'); if (fs) fs.value = 'desc';
  _sortCol = 'date';
  _histPeriode = 'mois';
  _filterMasquees    = false; // kept for compatibility
  _filterVerrouillees = false; // ✅ v13.32
  ['jour','semaine','mois','tout'].forEach(p => {
    const btn = document.getElementById('hist-btn-' + p);
    if (btn) btn.classList.toggle('active', p === 'tout');
  });
  renderHistory(true);
}

// ── Raccourcis de période pour l'Historique (même logique que Statistiques) ──
let _histPeriode = 'mois'; // 'jour'|'semaine'|'mois'|'tout'|'custom'

// ✅ v13.72 — NAVIGATION DANS LE TEMPS
//   Décalage par rapport à la période courante : 0 = aujourd'hui / cette
//   semaine / ce mois, -1 = la précédente, +1 = la suivante. Auparavant,
//   consulter juillet depuis août imposait de saisir deux dates à la main.
let _histDecalage = 0;

/** Plage active de l'Historique (déléguée au module partagé). */
function getHistRange() { return calcPlagePeriode(_histPeriode, _histDecalage); }

function majNavPeriode() { majBandeauPeriode('hist', _histPeriode, _histDecalage); }

/** Flèches ◀ ▶ : recule ou avance d'une période entière. */
function decalerPeriode(pas) {
  if (!['jour','semaine','mois'].includes(_histPeriode)) return;
  if (_histDecalage + pas > 0) return;     // pas de futur
  _histDecalage += pas;
  setHistPeriode(_histPeriode, true);
}

/** Retour direct à la période en cours. */
function retourPeriodeCourante() {
  _histDecalage = 0;
  setHistPeriode(_histPeriode, true);
}

/** Saut direct à un mois précis via les listes déroulantes. */
function allerAuMois() {
  const d = decalageDepuisSelecteurs('hist');
  if (d === null) { majNavPeriode(); return; }
  _histPeriode = 'mois';
  _histDecalage = d;
  setHistPeriode('mois', true);
}

function setHistPeriode(periode, garderDecalage) {
  // Changer de granularité repart de la période en cours, sauf si l'appel
  // vient de la navigation elle-même (flèches, sélecteurs).
  if (!garderDecalage) _histDecalage = 0;
  _histPeriode = periode;
  ['jour','semaine','mois','tout'].forEach(p => {
    const btn = document.getElementById('hist-btn-' + p);
    if (btn) btn.classList.toggle('active', p === periode);
  });

  if (periode !== 'custom') {
    const { from, to } = getHistRange();
    const fromEl = document.getElementById('filter-date-from');
    const toEl   = document.getElementById('filter-date-to');
    if (fromEl) fromEl.value = from || '';
    if (toEl)   toEl.value   = (periode === 'tout') ? '' : (to || '');
  }

  majNavPeriode();

  // ✅ v13.68 — le cache contient toutes les fiches : filtrage client instantané,
  // plus aucun aller-retour serveur au changement de période.
  renderHistory();
}

// Calcule la plage [from, to] pour un raccourci donné (réutilise la même
// logique que les Statistiques pour que "Aujourd'hui" ait toujours le même
// sens partout dans l'application : depuis 00h00 du jour en cours)
function appliquerFiltreCustom() {
  const from = document.getElementById('filter-date-from')?.value || '';
  const to   = document.getElementById('filter-date-to')?.value   || '';
  if (!from && !to) { toast('Saisissez au moins une date', 'err'); return; }
  _histPeriode = 'custom';
  _histDecalage = 0;
  // ✅ v13.68 — filtrage client sur le cache complet : instantané, et le
  // fallback « filtre date serveur inactif » n'a plus lieu d'être.
  ['jour','semaine','mois','tout'].forEach(p => {
    const btn = document.getElementById('hist-btn-' + p);
    if (btn) btn.classList.remove('active');
  });
  majNavPeriode();
  renderHistory();
}

function computeHistDateRange(periode) {
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  if (periode === 'jour') return { from: today, to: today };
  if (periode === 'semaine') {
    const d = new Date(now);
    const jour = d.getDay();
    const decalage = jour === 0 ? 6 : jour - 1;
    d.setDate(d.getDate() - decalage);
    return { from: d.toISOString().slice(0,10), to: today };
  }
  if (periode === 'mois') {
    const from = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01';
    return { from, to: today };
  }
  return { from: null, to: null }; // 'tout'
}

// ── Surbrillance des termes recherchés ───────────────────────────────
function highlight(str, q) {
  if (!q || !str) return esc(str || '');
  const safe = esc(str);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp('(' + esc(safeQ) + ')', 'gi'),
    '<mark style="background:#fde68a;color:#78350f;border-radius:2px;padding:0 1px">$1</mark>');
}

// Debounce pour la recherche texte (évite appels Supabase à chaque frappe)
let _histDebounce = null;
function renderHistoryDebounced() {
  clearTimeout(_histDebounce);
  const q = (document.getElementById('search-input')?.value || '').trim();
  // Si une recherche texte est active, on charge TOUT l'historique
  // pour ne pas manquer des fiches hors de la période affichée
  if (q && _histPeriode !== 'tout') {
    _histDebounce = setTimeout(() => {
      _histPeriode = 'tout';
      ['jour','semaine','mois','tout'].forEach(p => {
        const btn = document.getElementById('hist-btn-' + p);
        if (btn) btn.classList.toggle('active', p === 'tout');
      });
      document.getElementById('filter-date-from').value = '';
      document.getElementById('filter-date-to').value   = '';
      _dbCache = [];
      showLoading();
      refreshDB(true).then(() => { hideLoading(); renderHistory(); });
    }, 400);
  } else {
    _histDebounce = setTimeout(renderHistory, 220);
  }
}

async function renderHistory(forceRefresh) {
  const b = document.getElementById('history-body');
  if (!b) return;
  b.innerHTML = '<tr><td colspan="10"><div class="empty-state"><span style="font-size:20px">⏳</span><br>Chargement…</div></td></tr>';
  // Rafraîchir depuis Supabase uniquement si demandé ou cache vide
  if (forceRefresh || !getDB().length) await refreshDB();
  const db = getDB();

  // ✅ v13.32 — Mettre à jour les boutons admin
  updateVerrouilleeBtn();
  updateCorbeilleBtn();

  const agentSel = document.getElementById('filter-agent');
  const currentAgent = agentSel ? agentSel.value : '';
  const agents = [...new Set(db.map(r => r.createdBy).filter(Boolean))].sort();
  if (agentSel) agentSel.innerHTML = '<option value="">Tous les agents</option>' +
    agents.map(a => '<option value="' + esc(a) + '"' + (a === currentAgent ? ' selected' : '') + '>' + esc(a) + '</option>').join('');

  const q         = (document.getElementById('search-input')?.value   || '').toLowerCase();
  const ft        =  document.getElementById('filter-type')?.value    || '';
  const fa        =  document.getElementById('filter-agent')?.value   || '';
  const fst       =  document.getElementById('filter-statut')?.value  || '';
  const fsv       =  document.getElementById('filter-service')?.value || '';
  const dateFrom  =  document.getElementById('filter-date-from')?.value || '';
  const dateTo    =  document.getElementById('filter-date-to')?.value   || '';
  const sortDir   =  document.getElementById('filter-sort')?.value    || 'desc';

  // ✅ v13.34 — Peupler la liste des services à partir des fiches présentes
  const svcSel = document.getElementById('filter-service');
  if (svcSel) {
    const services = [...new Set(db.map(r => (r.patient?.service || '').trim()).filter(Boolean))].sort();
    const currentSvc = svcSel.value;
    svcSel.innerHTML = '<option value="">Tous les services</option>' +
      services.map(s => '<option value="' + esc(s) + '"' + (s === currentSvc ? ' selected' : '') + '>' + esc(s) + '</option>').join('');
  }

  // Filtrage normal par période (getDB() gère déjà l'exclusion des fiches verrouillées/supprimées)
  let filtered = filterByDateRange(db, dateFrom, dateTo);
  filtered = filtered.filter(r => {
    if (ft) {
      const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type];
      if (!types.includes(ft)) return false;
    }
    if (fa && r.createdBy !== fa) return false;
    if (fst && getStatut(r.id) !== fst) return false;       // ✅ v13.34 filtre statut
    if (fsv && (r.patient?.service || '').trim() !== fsv) return false; // ✅ v13.34 filtre service
    if (q) {
      // ✅ v13.83 — `ancien_dossier` est inclus : le numéro d'un dossier
      // verrouillé est libéré au bout de deux semaines, mais un patient peut
      // revenir avec son vieux reçu. La recherche doit encore le retrouver.
      // ✅ v13.85 — Les types détaillés sont indexés EN PLUS de l'affichage :
      // un dossier prénatal s'affiche « BPN », mais chercher
      // « Immuno-Sérologie » doit continuer de le trouver. Raccourcir
      // l'affichage ne doit pas rétrécir la recherche.
      const txt = [r.patient?.nom, r.patient?.dossier, r.patient?.ancien_dossier,
                   r.patient?.medecin, r.patient?.service, r.createdBy,
                   getDisplayType(r),
                   (typeof getRecordTypes === 'function' ? getRecordTypes(r).join(' ') : '')
                  ].filter(Boolean).join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let va, vb;
    if (_sortCol === 'nom')     { va=(a.patient.nom||'').toLowerCase(); vb=(b.patient.nom||'').toLowerCase(); }
    else if (_sortCol==='montant') { va=a.montant||0; vb=b.montant||0; }
    else { va=a.patient.date||a.savedAt||''; vb=b.patient.date||b.savedAt||''; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  const sortDateEl    = document.getElementById('sort-date');
  const sortNomEl     = document.getElementById('sort-nom');
  const sortMontantEl = document.getElementById('sort-montant');
  if (sortDateEl)    sortDateEl.textContent    = _sortCol==='date'    ? (sortDir==='asc'?'↑':'↓') : '';
  if (sortNomEl)     sortNomEl.textContent     = _sortCol==='nom'     ? (sortDir==='asc'?'↑':'↓') : '';
  if (sortMontantEl) sortMontantEl.textContent = _sortCol==='montant' ? (sortDir==='asc'?'↑':'↓') : '';

  // ✅ v13.33 — Total propre à la vue active :
  // • Mode normal/corbeille : somme des fiches visibles (filtered)
  // • Mode masquées : somme des fiches masquées uniquement (exclues du calcul global)
  const totalMontant = filtered.reduce((s, r) => s + (r.montant || 0), 0);
  const countEl = document.getElementById('search-count');
  const totalBar = document.getElementById('search-total-bar');
  const countBar = document.getElementById('search-count-bar');
  if (countEl) {
    if (_filterCorbeille) {
      const corbWho = isAdmin() ? 'dans la corbeille (tous utilisateurs)' : 'supprimée' + (filtered.length>1?'s':'') + ' par vous';
      countEl.textContent = '🗑️ ' + filtered.length + ' fiche' + (filtered.length>1?'s':'') + ' ' + corbWho;
    } else if (_filterVerrouillees) {
      const who = isAdmin() ? 'au total' : 'masquée' + (filtered.length>1?'s par vous':'e par vous');
      countEl.textContent = '🔒 ' + filtered.length + ' fiche' + (filtered.length>1?'s':'') + ' ' + who;
    } else {
      const isFull = filtered.length === db.length;
      countEl.textContent = isFull
        ? db.length + ' fiche' + (db.length>1?'s':'') + ' au total'
        : filtered.length + ' résultat' + (filtered.length>1?'s':'') + ' sur ' + db.length + ' fiche' + (db.length>1?'s':'');
    }
  }
  if (countBar) {
    countBar.style.background = _filterCorbeille
      ? 'linear-gradient(to right,#fff5f5,#fef2f2)'
      : _filterVerrouillees
        ? 'linear-gradient(to right,#fefce8,#fef9c3)'
        : 'linear-gradient(to right,var(--accent-light),#f0f9ff)';
    countBar.style.borderColor = _filterCorbeille ? '#f87171' : _filterVerrouillees ? '#fbbf24' : 'var(--border)';
  }
  if (totalBar) {
    if (totalMontant > 0) {
      // ✅ v13.33 — Couleur du total selon le mode actif
      totalBar.style.color = _filterCorbeille
        ? '#b91c1c'   // rouge : montant "perdu" dans la corbeille
        : _filterVerrouillees
          ? '#92400e'   // ambré : montant masqué, hors calcul global
          : '#15803d';  // vert : total normal
      totalBar.textContent = (_filterVerrouillees ? '🔒 ' : '💰 ')
        + totalMontant.toLocaleString('fr-FR') + ' FCFA'
        + (_filterVerrouillees ? ' (masqué)' : '');
    } else {
      totalBar.textContent = '';
    }
  }

  if (!filtered.length) {
    const hasFilters = (document.getElementById('search-input')?.value||'').trim()
      || document.getElementById('filter-type')?.value
      || document.getElementById('filter-agent')?.value
      || document.getElementById('filter-date-from')?.value
      || _histPeriode !== 'tout';
    b.innerHTML = '<tr><td colspan="10"><div class="empty-state">'
      + '<div style="font-size:32px;margin-bottom:8px">' + (hasFilters ? '🔍' : '📂') + '</div>'
      + '<div>' + (hasFilters
          ? 'Aucune fiche ne correspond à ces filtres — <a href="#" onclick="clearSearchFilters();return false" style="color:var(--cpmi-mid)">Réinitialiser</a>'
          : 'Aucune saisie enregistrée pour le moment')
      + '</div></div></td></tr>';
    return;
  }

  // ✅ v13.82 — Suppression ouverte à tous : chacun peut envoyer n'importe quel
  // dossier à la corbeille, plus seulement les siens. Réversible (corbeille +
  // instantanés nocturnes) et tracée nominativement au journal d'audit.
  // Le spectateur reste en lecture seule, et la suppression DÉFINITIVE reste
  // réservée à l'administrateur depuis la corbeille.
  const softDeleteBtn = (r) => {
    if (_filterCorbeille) return ''; // handled separately in corbeille row
    if (typeof isSpectateur === 'function' && isSpectateur()) return '';
    return '<button class="btn btn-danger" style="padding:4px 8px;font-size:11px;margin-left:3px;opacity:.85" '
      + 'title="Supprimer (envoyé dans la corbeille)" aria-label="Supprimer, envoyer dans la corbeille" onclick="softDeleteDossier(' + r.id + ')">🗑️</button>';
  };
  const deleteBtn = (id, rid) => {
    const dupl = '<button class="btn" style="padding:4px 8px;font-size:11px;margin-left:3px;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd" title="Dupliquer — pré-remplir le formulaire" aria-label="Dupliquer cette fiche" onclick="dupliquerFiche(' + (rid||id) + ')">⧉</button>';
    const del = isAdmin() ? '<button class="btn btn-danger" style="padding:4px 8px;font-size:11px;margin-left:3px" title="Supprimer définitivement" aria-label="Supprimer définitivement" onclick="deleteRecord(' + id + ')">🗑</button>' : '';
    return dupl + del;
  };

  // ✅ v13.82 — Le verrouillage est désormais RÉSERVÉ À L'ADMINISTRATEUR.
  // Motif tiré des données : un dossier masqué disparaît aussi de l'écran
  // « À encaisser », donc le caissier ne peut pas l'encaisser. 106 dossiers,
  // 607 500 FCFA, étaient devenus invisibles exactement de cette façon.
  const lockBtn = (r) => {
    if (_filterVerrouillees || _filterCorbeille) return ''; // géré par les rows spéciaux
    if (!isAdmin()) return '';
    const locked = !!r.restrictedBy;
    const style = locked
      ? 'background:#fef3c7;color:#92400e;border:1px solid #fbbf24'
      : 'background:#f8fafc;color:#94a3b8;border:1px solid #e2e8f0';
    const title = locked ? 'Lever la restriction (démasquer)' : 'Masquer aux autres profils';
    return '<button class="btn" id="lock-btn-' + r.id + '" '
      + 'style="padding:4px 8px;font-size:11px;margin-left:3px;' + style + '" '
      + 'title="' + title + '" '
      + 'aria-label="' + title + '" '
      + 'onclick="toggleRestriction(' + r.id + ')">' + (locked ? '🔒' : '🔓') + '</button>';
  };

  // ✅ v13.83 — Un dossier verrouillé rend son numéro au bout de deux
  // semaines, pour qu'il puisse être réattribué. La fiche n'a donc plus de
  // numéro : on affiche l'ancien plutôt qu'une case vide, sinon la ligne a
  // l'air corrompue. Le numéro reste cherchable dans la barre de recherche.
  const celluleNumDossier = (r, fmt) => r.patient.dossier
    ? '<strong>' + fmt(r.patient.dossier) + '</strong>'
    : '<span style="color:#92400e" title="Num\u00e9ro lib\u00e9r\u00e9, r\u00e9attribuable \u00e0 un nouveau patient">'
      + '<strong>\u2014</strong> <span style="font-size:10.5px">(ex. '
      + fmt(r.patient.ancien_dossier || '?') + ')</span></span>';

  const hl = q ? (s => highlight(s, q)) : esc;

  b.innerHTML = filtered.map(r => {
    // ✅ v13.32 — En mode Fiches verrouillées (admin), afficher qui a verrouillé + bouton déverrouiller
    if (_filterVerrouillees && isAdmin()) {
      const lockedBy  = r.restrictedBy || '?';
      const montantStr2 = r.montant ? r.montant.toLocaleString('fr-FR') + ' F' : '—';
      return '<tr style="background:#fffbeb;border-left:3px solid #fbbf24">'
        // ✅ v13.90 — La case était désactivée : l'admin ne pouvait donc rien
        // faire en masse sur les fiches verrouillées, alors que c'est
        // justement là qu'il en a besoin (déverrouiller un lot, encaisser,
        // supprimer). Le verrouillage sert à masquer aux autres profils, pas
        // à priver l'administrateur de ses outils.
        + '<td style="text-align:center;padding:4px"><input type="checkbox" class="bulk-chk" data-id="' + r.id + '" '
          + (_selectedIds.has(r.id) ? 'checked' : '') + ' onchange="toggleRowSelect(' + r.id + ',this.checked)"'
          + ' style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)"></td>'
        + '<td data-label="Date">' + esc(r.patient.date || '—') + '</td>'
        + '<td data-label="N° Dossier">' + celluleNumDossier(r, esc) + '</td>'
        + '<td data-label="Patient">' + esc(r.patient.nom)
            + '<div style="font-size:10px;color:#d97706;margin-top:2px">Verrouillé par <strong>' + esc(lockedBy) + '</strong></div>'
          + '</td>'
        + '<td data-label="Âge">' + esc(r.patient.age || '—') + '</td>'
        + '<td data-label="Sexe">' + esc(r.patient.sexe || '—') + '</td>'
        + '<td data-label="Service">' + esc(r.patient.service || '—') + '</td>'
        + '<td data-label="Type">' + getRecordTypes(r).map(t => '<span class="badge-type" style="margin:1px 2px;display:inline-block">'+t+'</span>').join('') + '</td>'
        + '<td data-label="Saisi par">' + esc(r.createdBy || '—') + '</td>'
        + '<td data-label="Montant" style="font-weight:700;color:#92400e;white-space:nowrap">' + montantStr2 + '</td>'
        + '<td data-label="Statut">—</td>'
        + '<td data-label="Actions">'
          + '<button class="btn" style="padding:4px 9px;font-size:11px;background:#fef3c7;color:#92400e;border:1px solid #fbbf24;margin-right:4px" '
            + 'title="Déverrouiller ce dossier" onclick="toggleRestriction(' + r.id + ')">🔓 Déverrouiller</button>'
          + '<button class="btn" style="padding:4px 8px;font-size:11px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc" '
            + 'onclick="showEditPatientModal(' + r.id + ')" title="Modifier patient">👤</button>'
        + '</td></tr>';
    }

    // ✅ v13.31 — En mode Corbeille, remplacer toutes les actions par restaurer + supprimer définitivement
    if (_filterCorbeille) {
      // ✅ v13.33 — Fiche hard-deleted : trace permanente en lecture seule
      if (r._hardDeleted) {
        const hdDate = r.deletedAt ? new Date(r.deletedAt).toLocaleDateString('fr-FR') : '?';
        const hdBy   = r.deletedBy || r.createdBy || '?';
        return '<tr style="opacity:.45;background:#f1f5f9;text-decoration:line-through">'
          + '<td style="text-align:center;padding:4px"><input type="checkbox" disabled style="width:16px;height:16px;opacity:.2"></td>'
          + '<td data-label="Date">' + esc(r.patient.date || '—') + '</td>'
          + '<td data-label="N° Dossier">' + celluleNumDossier(r, esc) + '</td>'
          + '<td data-label="Patient">' + esc(r.patient.nom)
              + '<div style="font-size:10px;color:#64748b;margin-top:2px;text-decoration:none">Supprimé déf. le ' + hdDate + ' · par <strong>' + esc(hdBy) + '</strong></div>'
            + '</td>'
          + '<td data-label="Âge">' + esc(r.patient.age || '—') + '</td>'
          + '<td data-label="Sexe">' + esc(r.patient.sexe || '—') + '</td>'
          + '<td data-label="Service">' + esc(r.patient.service || '—') + '</td>'
          + '<td data-label="Type">' + getRecordTypes(r).map(t => '<span class="badge-type" style="margin:1px 2px;display:inline-block;opacity:.5">'+t+'</span>').join('') + '</td>'
          + '<td data-label="Saisi par">' + esc(r.createdBy || '—') + '</td>'
          + '<td data-label="Montant" style="color:#94a3b8">' + (r.montant ? r.montant.toLocaleString('fr-FR') + ' F' : '—') + '</td>'
          + '<td data-label="Statut"><span style="font-size:10px;background:#e2e8f0;color:#475569;border-radius:4px;padding:2px 6px;font-weight:600;text-decoration:none">Supprimée déf.</span></td>'
          + '<td data-label="Actions"><span style="font-size:11px;color:#94a3b8;font-style:italic">—</span></td></tr>';
      }
      const deletedDate = r.deletedAt ? new Date(r.deletedAt).toLocaleDateString('fr-FR') : '?';
      const deletedBy   = r.deletedBy || '?';
      return '<tr style="opacity:.85;background:#fff5f5">'
        + '<td style="text-align:center;padding:4px"><input type="checkbox" disabled style="width:16px;height:16px;opacity:.3"></td>'
        + '<td data-label="Date">' + esc(r.patient.date || '—') + '</td>'
        + '<td data-label="N° Dossier">' + celluleNumDossier(r, esc) + '</td>'
        + '<td data-label="Patient">' + esc(r.patient.nom)
            + '<div style="font-size:10px;color:#dc2626;margin-top:2px">Supprimé le ' + deletedDate + ' par <strong>' + esc(deletedBy) + '</strong></div>'
          + '</td>'
        + '<td data-label="Âge">' + esc(r.patient.age || '—') + '</td>'
        + '<td data-label="Sexe">' + esc(r.patient.sexe || '—') + '</td>'
        + '<td data-label="Service">' + esc(r.patient.service || '—') + '</td>'
        + '<td data-label="Type">' + getRecordTypes(r).map(t => '<span class="badge-type" style="margin:1px 2px;display:inline-block">'+t+'</span>').join('') + '</td>'
        + '<td data-label="Saisi par">' + esc(r.createdBy || '—') + '</td>'
        + '<td data-label="Montant" style="font-weight:700;color:#94a3b8">' + (r.montant ? r.montant.toLocaleString('fr-FR') + ' F' : '—') + '</td>'
        + '<td data-label="Statut">—</td>'
        // ✅ v13.92 — Le bouton Restaurer apparaît aussi pour celui qui a
        // supprimé, pendant 24 h. Passé ce délai, ou sur la suppression d'un
        // collègue, il faut toujours l'administrateur.
        + '<td data-label="Actions">'
          + (peutRestaurer(r)
            ? '<button class="btn" style="padding:4px 9px;font-size:11px;background:#dcfce7;color:#166534;border:1px solid #86efac;margin-right:4px" '
                + 'title="Restaurer ce dossier" onclick="restoreDossier(' + r.id + ')">↩️ Restaurer</button>'
            : '')
          + (isAdmin()
            ? '<button class="btn btn-danger" style="padding:4px 9px;font-size:11px" '
                + 'title="Supprimer définitivement (irréversible)" onclick="deleteRecord(' + r.id + ')">🗑 Supprimer</button>'
            : (peutRestaurer(r) ? ''
               : '<span style="font-size:11px;color:#dc2626;font-style:italic">Contactez l\'admin pour restaurer</span>'))
        + '</td></tr>';
    }
    const dossierMulti = '';
    const montantStr = r.montant ? r.montant.toLocaleString('fr-FR') + ' F' : '—';
    // ✅ v13.36 — SÉCURITÉ (XSS) : ne plus injecter le JSON du dossier (nom/note
    // patients) dans l'attribut HTML. On passe seulement l'id (numérique) et
    // showPreview() retrouve le dossier dans le cache. Empêche un nom de patient
    // du type '"><img src=x onerror=...> d'exécuter du code dans l'historique.
    return '<tr id="row-' + r.id + '" class="hist-row-' + getStatut(r.id) + '"'
      + ' onmousemove="showPreview(event,' + r.id + ')" onmouseleave="hidePreview()">'
      + '<td style="text-align:center;padding:4px;vertical-align:middle"><input type="checkbox" class="bulk-chk" data-id="' + r.id + '" '
        + (_selectedIds.has(r.id) ? 'checked' : '') + ' onchange="toggleRowSelect(' + r.id + ',this.checked)"'
        + ' style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)"></td>'
      + '<td data-label="Date">' + esc(r.patient.date || '—') + '</td>'
      + '<td data-label="N° Dossier">' + celluleNumDossier(r, hl)
        + (r._pending ? ' <span title="En attente de synchronisation" style="font-size:10px;background:#fde68a;color:#92400e;border-radius:4px;padding:1px 5px;font-weight:700">⏳ à synchroniser</span>' : '')
      + '</td>'
      + '<td data-label="Patient">' + hl(r.patient.nom)
          + (hasCriticalValues(r) ? '<span class="badge-critique" title="Valeur critique détectée">🔴 CRITIQUE</span>' : '')
          + (r.patient.medecin ? '<div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">' + hl(r.patient.medecin) + '</div>' : '')
          + (r.patient.note ? '<div style="font-size:10.5px;color:#7c3aed;margin-top:2px;font-style:italic" title="Note interne">📝 ' + esc(r.patient.note) + '</div>' : '')
        + '</td>'
      + '<td data-label="Âge">' + esc(r.patient.age || '—') + '</td>'
      + '<td data-label="Sexe">' + esc(r.patient.sexe || '—') + '</td>'
      + '<td data-label="Service">' + hl(r.patient.service || '—') + '</td>'
      + '<td data-label="Type">' + getRecordTypes(r).map(t => {
          const cls = t==='Hématologie'?'badge-hema':t==='Biochimie'?'badge-bio':
            t==='Bactériologie'?'badge-bacterio':t==='Immuno-Sérologie'?'badge-sero':
            t==='Parasitologie'?'badge-parasito':t==='Groupe sanguin'?'badge-gs':
            t==='Bilan prénatal'?'badge-bpn':'';
          return '<span class="badge-type '+cls+'" style="margin:1px 2px;display:inline-block">'+t+'</span>';
        }).join('') + '</td>'
      + '<td data-label="Saisi par">' + hl(r.createdBy || '—') + '</td>'
      + '<td data-label="Montant" style="font-weight:700;color:var(--accent);white-space:nowrap">' + montantStr + '</td>'
      + '<td data-label="Statut">' + statutBadge(r.id) + ' ' + paiementBadge(r.id) + '</td>'
      + '<td data-label="Actions">'
        // ✅ v13.33 — Caissier : lecture seule (export/impression uniquement, pas de modification)
        // ✅ v13.37 — Spectateur : idem, lecture seule stricte
        + ((isCaissier() || isSpectateur()) ? ''
            : lockBtn(r)
              + (() => {
                  const uid = _currentUser?.username;
                  const canEdit = isAdmin() || r.createdBy === uid;
                  // ✅ v13.34 — Bouton unifié
                  return canEdit
                    ? '<button class="btn btn-action-secondary" style="padding:4px 8px;font-size:11px;margin-left:3px;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd" onclick="showEditUnifie(' + r.id + ')" title="Modifier" aria-label="Modifier">✏️ Modifier</button>'
                    : '';
                })()
          )
        + '<button class="btn btn-success" style="padding:4px 8px;font-size:11px;margin-left:3px" onclick="exportRecord(' + r.id + ')">⬇</button>'
        + '<button class="btn" style="padding:4px 8px;font-size:11px;margin-left:3px;background:#dc2626;color:#fff" onclick="exportPDF(' + r.id + ')" title="Exporter en PDF" aria-label="Exporter en PDF">📄</button>'
        + ((isCaissier() || isSpectateur()) ? ''
            : '<button class="btn" style="padding:4px 8px;font-size:11px;margin-left:3px;background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc" onclick="dupliquerDossier(' + r.id + ')" title="Dupliquer ce patient">⎘</button>'
              + dossierMulti
              + (isAdmin() && isDossierRecord(r) && getRecordTypes(r).length > 0
                  ? getRecordTypes(r).map(t =>
                      '<button class="btn btn-danger" style="padding:3px 7px;font-size:10px;margin-left:2px;opacity:.75" title="Supprimer ' + t + '" onclick="deleteAnalyseFromDossier(' + r.id + ',\'' + t.replace(/'/g,"\\'") + '\')">✕ ' + t.substring(0,4) + '</button>'
                    ).join('')
                  : '')
          )
        // ✅ v13.82 — La corbeille sort du bloc réservé aux agents et à l'admin :
        // « chacun peut supprimer » inclut le caissier, qui en était privé au
        // même titre que la duplication. Seul le spectateur en reste exclu, et
        // c'est softDeleteBtn qui le décide — un seul endroit qui tranche.
        + softDeleteBtn(r)
        + '<button class="btn" style="padding:4px 8px;font-size:11px;margin-left:3px" onclick="printRecord(' + r.id + ')" title="Imprimer résultats" aria-label="Imprimer les résultats">🖨</button>'
        + '<button class="btn" style="padding:4px 8px;font-size:11px;margin-left:3px;background:#f0fdf4;color:#166534;border:1px solid #86efac" onclick="choisirSignataireRecu(' + r.id + ')" title="Imprimer le reçu">🧾</button>'
        + '<button class=\'btn btn-action-menu\' style=\'display:none;padding:4px 10px;font-size:15px;margin-left:3px;line-height:1\' onclick=\'toggleActionMenu(this)\' title=\'Actions\' aria-label=\'Actions\'>⋯</button>'
      + '</td></tr>';
  }).join('');
  if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge(); // ✅ v13.28 F10

  // ✅ v13.33 — Animation d'entrée décalée sur les rangées
  b.querySelectorAll('tr').forEach((tr, i) => {
    tr.classList.add('hist-row-anim');
    tr.style.animationDelay = Math.min(i * 28, 280) + 'ms';
    tr.addEventListener('animationend', () => {
      tr.classList.remove('hist-row-anim');
      tr.style.animationDelay = '';
    }, { once: true });
  });
}


async function deleteAnalyseFromDossier(recordId, type) {
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; }
  const record = getDB().find(r => r.id === recordId);
  if (!record || !isDossierRecord(record)) { toast('Dossier introuvable', 'err'); return; }
  await ensureFull(record); // ✅ v13.5 — détail complet avant de recomposer le dossier
  // ✅ v13.90 — Le garde-fou exigeait aussi qu'une entrée de résultats existe
  // pour CHAQUE type déclaré. Il confondait deux choses : « le détail n'a pas
  // été chargé » et « les résultats ne sont pas encore saisis ». Or une
  // analyse cochée mais non remplie est le cas NORMAL — et précisément celui
  // où l'on veut la retirer, quand elle a été cochée par erreur. Résultat :
  // 633 des 658 dossiers multi-analyses refusaient la suppression, en
  // accusant le réseau. Seul `_light` dit si le chargement a échoué.
  if (record._light) {
    toast('⚠ Détail du dossier non chargé (réseau ?). Réessayez.', 'err'); return;
  }
  const types = getRecordTypes(record);
  if (types.length <= 1) {
    if (!await showConfirmModal({
      icon: '🗑️', title: 'Supprimer le dossier ?',
      message: 'C\'est la dernière analyse de ce dossier. Le dossier entier sera supprimé.',
      confirmText: 'Supprimer', cancelText: 'Annuler', confirmClass: 'btn-danger'
    })) return;
    const ok = await deleteRecordRemote(recordId);
    if (ok) { renderHistory(); toast('Dossier supprimé'); }
    return;
  }
  if (!await showConfirmModal({
    icon: '🗑️', title: 'Supprimer cette analyse ?',
    message: 'Supprimer « ' + type + ' » du dossier ? Les autres analyses seront conservées.',
    confirmText: 'Supprimer', cancelText: 'Annuler', confirmClass: 'btn-danger'
  })) return;
  // ✅ v12 — retrancher le montant de l'analyse supprimée :
  // 1) montant mémorisé à la saisie (_montants) si disponible ;
  // 2) sinon (anciens dossiers) : répartition proportionnelle du total facturé
  //    selon les tarifs actuels, de sorte que la somme reste cohérente avec le
  //    montant réellement facturé (plutôt qu'une ré-estimation brute).
  let montantAnalyse;
  if (record.resultats?._montants && record.resultats._montants[type] != null) {
    montantAnalyse = record.resultats._montants[type];
  } else {
    const allTypes = getRecordTypes(record);
    const estimations = {};
    let sommeEst = 0;
    allTypes.forEach(t => { const e = calculateMontant(t, getRecordResultats(record, t)) || 0; estimations[t] = e; sommeEst += e; });
    const total = record.montant || 0;
    montantAnalyse = (sommeEst > 0)
      ? Math.round(total * (estimations[type] || 0) / sommeEst)  // part proportionnelle
      : Math.round(total / Math.max(1, allTypes.length));        // sinon part égale
  }
  const newMontant = Math.max(0, (record.montant || 0) - (montantAnalyse || 0));
  const newRes = { ...record.resultats };
  delete newRes[type];
  newRes._types = (newRes._types || []).filter(t => t !== type);
  if (newRes._examens_coches) delete newRes._examens_coches[type];
  if (newRes._montants) delete newRes._montants[type];
  const saved = await updateRecordRemote(recordId, {
    patient: record.patient, type: 'Dossier', resultats: newRes,
    montant: newMontant, prescripteur_id: record.prescripteur_id,
  });
  if (saved) { renderHistory(); toast('"' + type + '" supprimé du dossier ✓', 'ok'); }
}

async function deleteRecord(id) {
  if (blockIfSpectateur()) return;
  if (!await showConfirmModal({
    icon: '🗑️', title: 'Supprimer cette fiche ?',
    message: 'Cette action est irréversible.',
    confirmText: 'Supprimer', cancelText: 'Annuler', confirmClass: 'btn-danger'
  })) return;
  const ok = await deleteRecordRemote(id);
  if (ok) {
    renderHistory();
    toast('Fiche supprimée');
  }
}

// ============================================================
// ✅ v13.30 — ACTIONS EN MASSE (sélection par cases à cocher)
// ============================================================

function toggleRowSelect(id, checked) {
  if (checked) _selectedIds.add(id); else _selectedIds.delete(id);
  updateBulkToolbar();
}

function toggleSelectAll(checked) {
  // Sélectionner/décocher uniquement les lignes actuellement visibles
  document.querySelectorAll('.bulk-chk').forEach(chk => {
    const id = Number(chk.dataset.id);
    chk.checked = checked;
    if (checked) _selectedIds.add(id); else _selectedIds.delete(id);
  });
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulk-toolbar');
  const countEl = document.getElementById('bulk-count');
  const delBtn  = document.getElementById('bulk-delete-btn');
  const selectAll = document.getElementById('select-all-chk');
  const n = _selectedIds.size;
  if (toolbar) toolbar.style.display = n > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = n + ' fiche' + (n > 1 ? 's' : '') + ' sélectionnée' + (n > 1 ? 's' : '');
  if (delBtn) delBtn.style.display = isAdmin() ? '' : 'none';
  // ✅ v13.82 — Verrouillage réservé à l'administrateur : on masque les boutons
  // plutôt que de laisser cliquer pour refuser ensuite. Un bouton qui dit
  // toujours non est plus agaçant qu'un bouton absent.
  ['bulk-lock-btn', 'bulk-unlock-btn'].forEach(idBtn => {
    const b = document.getElementById(idBtn);
    if (b) b.style.display = isAdmin() ? '' : 'none';
  });
  // État de la case "tout sélectionner"
  if (selectAll) {
    const total = document.querySelectorAll('.bulk-chk').length;
    selectAll.indeterminate = n > 0 && n < total;
    selectAll.checked = total > 0 && n === total;
  }
}

function clearBulkSelection() {
  _selectedIds.clear();
  document.querySelectorAll('.bulk-chk').forEach(chk => chk.checked = false);
  const sel = document.getElementById('select-all-chk');
  if (sel) { sel.checked = false; sel.indeterminate = false; }
  updateBulkToolbar();
}

// ✅ v13.33 — Fiches masquées : visible pour tout utilisateur
//   Admin → toutes les fiches masquées de tous les agents
//   Agent → uniquement ses propres fiches masquées
function updateMasqueesBtn() {
  const btn   = document.getElementById('btn-masquees');
  const badge = document.getElementById('masquees-badge');
  if (!btn) return;
  // ✅ v13.52 — L'admin voit toutes les fiches masquées ; un autre profil ne
  //   voit que celles qu'il a masquées lui-même. Caissier/spectateur/agent
  //   qui n'ont rien masqué ne voient rien.
  const uid = _currentUser?.username;
  const count = isAdmin()
    ? _dbCache.filter(r => !r.deletedAt && !!r.restrictedBy).length
    : _dbCache.filter(r => !r.deletedAt && r.restrictedBy === uid).length;
  // ✅ v13.105 — Aucun indice en session ordinaire. Le cadenas de la v13.104
  // disait à qui regardait l'écran qu'il existait quelque chose derrière ;
  // c'est précisément ce que la seconde porte évite.
  if (badge) badge.textContent = count;
  btn.style.display   = count > 0 ? 'flex' : 'none';
  btn.style.opacity   = _filterVerrouillees ? '1' : '0.75';
  btn.style.boxShadow = _filterVerrouillees ? '0 0 0 2px #d97706' : 'none';
}
// Alias conservé pour les appels existants dans la base de code
function updateVerrouilleeBtn() { updateMasqueesBtn(); }

function toggleMasquees() {
  _filterVerrouillees = !_filterVerrouillees;
  if (_filterVerrouillees) { _filterCorbeille = false; updateCorbeilleBtn(); }
  // ✅ v13.90 — Vider la sélection en changeant de vue : depuis que les
  // fiches verrouillées sont cochables, une sélection oubliée agirait sur
  // des lignes devenues invisibles. Une action de masse ne doit porter que
  // sur ce que l'on a sous les yeux.
  if (typeof clearBulkSelection === 'function') clearBulkSelection();
  updateMasqueesBtn();
  renderHistory();
}
// Alias conservé
function toggleVerrouillee() { toggleMasquees(); }
function toggleVerrouillees() { toggleMasquees(); }

// ✅ v13.31 — Corbeille admin
function updateCorbeilleBtn() {
  const btn   = document.getElementById('btn-corbeille');
  const badge = document.getElementById('corbeille-badge');
  if (!btn) return;
  // ✅ v13.33 — Visible pour tous : admin voit soft+hard, agent voit ses suppressions
  const uid = _currentUser?.username;
  const count = isAdmin()
    ? _dbCache.filter(r => !!r.deletedAt || !!r._hardDeleted).length
    : _dbCache.filter(r => !!r.deletedAt && !r._hardDeleted && r.deletedBy === uid).length;
  if (badge) badge.textContent = count;
  btn.style.display   = count > 0 ? 'flex' : 'none';
  btn.style.opacity   = _filterCorbeille ? '1' : '0.75';
  btn.style.boxShadow = _filterCorbeille ? '0 0 0 2px #f87171' : 'none';
}

function toggleCorbeille() {
  _filterCorbeille = !_filterCorbeille;
  if (_filterCorbeille) { _filterVerrouillees = false; updateVerrouilleeBtn(); }
  if (typeof clearBulkSelection === 'function') clearBulkSelection();
  updateCorbeilleBtn();
  renderHistory();
}

async function softDeleteDossier(id) {
  if (blockIfSpectateur()) return;
  const record = _dbCache.find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }
  const uid = _currentUser?.username;
  // ✅ v13.82 — Chacun peut désormais supprimer n'importe quel dossier, plus
  // seulement les siens. Le geste reste réversible (corbeille + instantanés
  // nocturnes) et il est tracé nominativement au journal d'audit : ouvrir la
  // suppression sans la tracer l'aurait rendue irresponsable.
  if (!await showConfirmModal({
    icon: '🗑️',
    title: 'Supprimer ce dossier ?',
    message: (record.createdBy && record.createdBy !== uid
        ? 'Ce dossier a été saisi par <strong>' + esc(record.createdBy) + '</strong>. '
        : '')
      + 'Il sera placé dans la corbeille et l\'administrateur pourra le restaurer '
      + 'à tout moment. Votre nom sera enregistré dans le journal d\'audit.',
    confirmText: 'Supprimer',
    cancelText: 'Annuler',
    confirmClass: 'btn-danger'
  })) return;

  // ✅ v13.33 — Hors ligne : enfiler l'action, masquer localement
  if (!navigator.onLine || String(id).startsWith('tmp_')) {
    record.deletedAt = new Date().toISOString();
    record.deletedBy = uid;
    enqueueAction('soft_delete_dossier', id);
    updateCorbeilleBtn();
    if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();
    renderHistory();
    toast('📴 Hors ligne — dossier placé en corbeille localement', 'ok');
    return;
  }

  const { data, error } = await _sb.rpc('soft_delete_dossier', { p_token: TK(), p_id: id });
  if (error || data !== 'ok') {
    toast('Erreur : ' + (error?.message || data || 'inconnue'), 'err');
    return;
  }
  // Mise à jour optimiste du cache
  record.deletedAt = new Date().toISOString();
  record.deletedBy = uid;

  updateCorbeilleBtn();
  if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();
  renderHistory();
  toast('Dossier déplacé dans la corbeille 🗑️', 'ok');
}

/** ✅ v13.92 — Chacun peut ressortir CE QU'IL A LUI-MÊME mis à la corbeille,
 *  pendant 24 h. Depuis que la suppression est ouverte à tous, une erreur
 *  obligeait à déranger l'administrateur ; une fenêtre courte suffit à
 *  réparer sa propre bêtise sans permettre de défaire le ménage d'autrui. */
function peutRestaurer(r) {
  if (isAdmin()) return true;
  if (!r || !r.deletedAt) return false;
  if (r.deletedBy !== _currentUser?.username) return false;
  return (Date.now() - new Date(r.deletedAt).getTime()) < 24 * 3600 * 1000;
}

async function restoreDossier(id) {
  if (blockIfSpectateur()) return;
  const record = _dbCache.find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }
  if (!peutRestaurer(record)) {
    toast(record.deletedBy === _currentUser?.username
      ? 'Passé 24 h, seul l\'administrateur peut restaurer'
      : 'Vous ne pouvez restaurer que vos propres suppressions', 'err');
    return;
  }

  if (!await showConfirmModal({
    icon: '↩️',
    title: 'Restaurer ce dossier ?',
    message: 'Le dossier de ' + (record.patient?.nom || '?') + ' sera restauré et redeviendra visible.',
    confirmText: 'Restaurer',
    cancelText: 'Annuler'
  })) return;

  const { data, error } = await _sb.rpc('restore_dossier', { p_token: TK(), p_id: id });
  if (error || data !== 'ok') {
    // Le serveur reste juge : l'écran peut se tromper de quelques secondes
    // sur le délai, lui non.
    toast(data === 'delai_depasse'
      ? 'Passé 24 h, seul l\'administrateur peut restaurer'
      : 'Erreur : ' + (error?.message || data || 'inconnue'), 'err');
    return;
  }
  record.deletedAt = null;
  record.deletedBy = null;

  updateCorbeilleBtn();
  if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();
  renderHistory();
  toast('Dossier restauré ✓', 'ok');
}

// ✅ v13.31 — Modal d'édition rapide des informations patient
// Accessible au propriétaire de la fiche et à l'admin.
function showEditPatientModal(id) {
  const record = _dbCache.find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }
  const uid = _currentUser?.username;
  if (!isAdmin() && record.createdBy !== uid) { toast('Action non autorisée', 'err'); return; }

  const old = document.getElementById('edit-patient-modal-bd');
  if (old) old.remove();

  const p = record.patient || {};

  const sexeOptions = ['', 'M', 'F'].map(v =>
    '<option value="' + v + '"' + (p.sexe === v ? ' selected' : '') + '>'
    + (v === '' ? '— Choisir —' : v === 'M' ? 'Masculin' : 'Féminin') + '</option>'
  ).join('');

  const bd = document.createElement('div');
  bd.id = 'edit-patient-modal-bd';
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  bd.innerHTML = `
    <div style="background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.22);width:100%;max-width:500px;max-height:90vh;overflow-y:auto;padding:28px 28px 20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <span style="font-size:24px">👤</span>
        <div>
          <div style="font-size:15px;font-weight:700;color:#1e293b">Modifier les informations patient</div>
          <div style="font-size:12px;color:#64748b">N° ${esc(p.dossier || '?')} · ${esc((p.nom || '').toUpperCase())}</div>
        </div>
        <button onclick="document.getElementById('edit-patient-modal-bd').remove()"
          style="margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;line-height:1">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1">
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Nom complet <span style="color:#e11d48">*</span></label>
          <input id="ep_nom" type="text" value="${esc((p.nom || '').toUpperCase())}"
            oninput="forcerMajuscule(this)"
            style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box;text-transform:uppercase">
        </div>
        <div>
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Date de la visite</label>
          <input id="ep_date" type="date" value="${esc(p.date || '')}"
            style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Âge</label>
          <input id="ep_age" type="number" min="0" max="120" value="${esc(p.age || '')}"
            style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Sexe</label>
          <select id="ep_sexe" style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box">
            ${sexeOptions}
          </select>
        </div>
        <div style="grid-column:1/-1">
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Médecin prescripteur</label>
          <input id="ep_medecin" type="text" value="${esc((p.medecin || '').toUpperCase())}"
            oninput="forcerMajuscule(this)"
            style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box;text-transform:uppercase">
        </div>
        <div>
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Service</label>
          <input id="ep_service" type="text" value="${esc(p.service || '')}"
            style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Clinique / Hôpital</label>
          <input id="ep_clinique" type="text" value="${esc(p.clinique || '')}"
            style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:11.5px;font-weight:700;color:#475569;display:block;margin-bottom:4px">Téléphone</label>
          <input id="ep_telephone" type="tel" value="${esc(p.telephone || '')}"
            style="width:100%;border:1.5px solid #cbd5e1;border-radius:8px;padding:8px 11px;font-size:13px;box-sizing:border-box">
        </div>
      </div>

      <div id="ep_err" style="display:none;margin-top:12px;padding:8px 12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;font-size:12.5px;color:#b91c1c"></div>

      <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">
        <button onclick="document.getElementById('edit-patient-modal-bd').remove()"
          style="padding:9px 20px;border:1.5px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#475569;font-size:13px;font-weight:600;cursor:pointer">
          Annuler
        </button>
        <button onclick="savePatientEdit(${id})"
          style="padding:9px 22px;border:none;border-radius:8px;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px">
          💾 Enregistrer
        </button>
      </div>
    </div>`;

  document.body.appendChild(bd);
  bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
  document.getElementById('ep_nom').focus();
}

async function savePatientEdit(id) {
  const record = _dbCache.find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }

  const nom = (document.getElementById('ep_nom')?.value || '').trim().toUpperCase();
  if (!nom) {
    const errEl = document.getElementById('ep_err');
    if (errEl) { errEl.textContent = 'Le nom du patient est obligatoire.'; errEl.style.display = 'block'; }
    document.getElementById('ep_nom')?.focus();
    return;
  }

  const updatedPatient = {
    ...record.patient,
    nom,
    date:      document.getElementById('ep_date')?.value      || record.patient?.date      || '',
    age:       document.getElementById('ep_age')?.value       || record.patient?.age       || '',
    sexe:      document.getElementById('ep_sexe')?.value      || record.patient?.sexe      || '',
    medecin:   (document.getElementById('ep_medecin')?.value  || '').trim().toUpperCase(),
    service:   (document.getElementById('ep_service')?.value  || '').trim(),
    clinique:  (document.getElementById('ep_clinique')?.value || '').trim(),
    telephone: (document.getElementById('ep_telephone')?.value|| '').trim(),
  };

  // Griser le bouton d'enregistrement pendant la sauvegarde
  const saveBtn = document.querySelector('#edit-patient-modal-bd button[onclick*="savePatientEdit"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Enregistrement…'; }

  try {
    // ✅ v13.34 — Modifier infos patient : ne touche QUE le patient, prix inchangé
    const updated = await updateRecordRemote(id, {
      type:           record.type,
      patient:        updatedPatient,
      resultats:      record.resultats,
      montant:        record.montant,
      prescripteur_id: record.prescripteur_id,
    }, { onlyPatient: true });

    if (!updated) throw new Error('La mise à jour a échoué.');

    // Rafraîchir le cache local (updateRecordRemote le fait déjà, on re-patch pour être sûr)
    const idx = _dbCache.findIndex(r => r.id === id);
    if (idx >= 0) _dbCache[idx].patient = updatedPatient;

    document.getElementById('edit-patient-modal-bd')?.remove();
    buildPatientCache();
    renderHistory();
    toast('Informations patient mises à jour ✓', 'ok');
  } catch (e) {
    const errEl = document.getElementById('ep_err');
    if (errEl) { errEl.textContent = 'Erreur : ' + (e.message || e); errEl.style.display = 'block'; }
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '💾 Enregistrer'; }
  }
}

async function bulkSetStatut(statut) {
  if (blockIfSpectateur()) return;
  const ids = [..._selectedIds];
  if (!ids.length) return;
  const labels = { attente: 'En attente', 'en cours': 'En cours', rendu: 'Rendu' };
  if (!await showConfirmModal({
    icon: '📋',
    title: 'Changer le statut ?',
    message: 'Marquer ' + ids.length + ' fiche(s) comme « ' + (labels[statut] || statut) + ' » ?',
    confirmText: 'Confirmer', cancelText: 'Annuler'
  })) return;
  // ✅ v13.81 — Un seul aller-retour pour tout le lot. L'ancienne boucle
  // envoyait DEUX appels par fiche (celui-ci, puis un second déclenché par
  // setStatut), attendus l'un après l'autre : 483 fiches faisaient 966
  // requêtes séquentielles et 483 réaffichages complets de l'historique.
  showLoading('Mise à jour du statut…');
  try {
    const { data, error } = await _sb.rpc('set_statut_lot',
      { p_token: TK(), p_ids: ids, p_statut: statut });
    hideLoading();
    if (error || !data || data.erreur) {
      toast('Échec : ' + (error?.message || data?.erreur || 'réponse inattendue'), 'err');
      return;
    }
    // Le cache local ne suit que ce que le serveur a réellement accepté :
    // un agent ne peut changer que ses propres fiches, et afficher un
    // changement que la base a refusé serait pire que ne rien afficher.
    if (data.refusees > 0) await refreshDB(true);
    else ids.forEach(id => setStatutLocal(id, statut));

    clearBulkSelection();
    if (typeof updateHistoriqueBadge === 'function') updateHistoriqueBadge();
    renderHistory();
    toast(data.modifiees + ' fiche(s) mises à jour'
      + (data.refusees ? ' · ' + data.refusees + ' refusée(s)' : ''),
      data.refusees ? 'err' : 'ok');
  } catch (e) {
    hideLoading();
    toast('Échec : ' + (e.message || e), 'err');
  }
}

async function bulkLock() {
  if (blockIfSpectateur()) return;
  // ✅ v13.82 — Verrouillage réservé à l'administrateur.
  if (!isAdmin()) { toast('Le verrouillage est réservé à l\'administrateur', 'err'); return; }
  const ids = [..._selectedIds];
  if (!ids.length) return;
  const eligible = ids.filter(id => {
    const r = _dbCache.find(x => x.id === id);
    return r && !r.restrictedBy;
  });
  if (!eligible.length) { toast('Aucune fiche éligible au verrouillage', 'err'); return; }
  if (!await showConfirmModal({
    icon: '🔒',
    title: 'Masquer ' + eligible.length + ' fiche(s) ?',
    message: 'Ces fiches n\'apparaîtront plus dans l\'historique ni les calculs des autres profils.',
    confirmText: 'Masquer', cancelText: 'Annuler'
  })) return;
  showLoading('Verrouillage…');
  let ok = 0, err = 0;
  for (const id of eligible) {
    const { data, error } = await _sb.rpc('toggle_restriction', { p_token: TK(), p_id: id });
    if (!error && data === 'restricted') {
      const r = _dbCache.find(x => x.id === id);
      if (r) r.restrictedBy = _currentUser?.username;
      ok++;
    } else err++;
  }
  hideLoading();
  clearBulkSelection();
  renderHistory();
  toast(ok + ' fiche(s) verrouillée(s)' + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
}

async function bulkUnlock() {
  if (blockIfSpectateur()) return;
  // ✅ v13.82 — Déverrouillage réservé à l'administrateur, comme le verrouillage.
  if (!isAdmin()) { toast('Le déverrouillage est réservé à l\'administrateur', 'err'); return; }
  const ids = [..._selectedIds];
  if (!ids.length) return;
  const eligible = ids.filter(id => {
    const r = _dbCache.find(x => x.id === id);
    return r && r.restrictedBy;
  });
  if (!eligible.length) { toast('Aucune fiche verrouillée dans la sélection', 'err'); return; }
  if (!await showConfirmModal({
    icon: '🔓',
    title: 'Lever la restriction ?',
    message: eligible.length + ' fiche(s) redeviendront visibles pour tous les profils.',
    confirmText: 'Lever', cancelText: 'Annuler'
  })) return;
  showLoading('Déverrouillage…');
  let ok = 0, err = 0;
  for (const id of eligible) {
    const { data, error } = await _sb.rpc('toggle_restriction', { p_token: TK(), p_id: id });
    if (!error && data === 'unrestricted') {
      const r = _dbCache.find(x => x.id === id);
      if (r) r.restrictedBy = null;
      ok++;
    } else err++;
  }
  hideLoading();
  clearBulkSelection();
  renderHistory();
  toast(ok + ' fiche(s) déverrouillée(s)' + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
}

async function bulkDelete() {
  if (blockIfSpectateur()) return;
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; }
  const ids = [..._selectedIds];
  if (!ids.length) return;
  if (!await showConfirmModal({
    icon: '⚠️',
    title: 'Supprimer définitivement ?',
    message: ids.length + ' fiche(s) seront supprimée(s) de façon irréversible.',
    confirmText: 'Supprimer', cancelText: 'Annuler', confirmClass: 'btn-danger'
  })) return;
  showLoading('Suppression en cours…');
  let ok = 0, err = 0;
  for (const id of ids) {
    const success = await deleteRecordRemote(id);
    if (success) ok++; else err++;
  }
  hideLoading();
  clearBulkSelection();
  await refreshDB(true);
  renderHistory();
  toast(ok + ' fiche(s) supprimée(s)' + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
}

// ✅ v13.42 — Encaissement groupé : marque tous les dossiers sélectionnés
//   comme payés au montant exact demandé (montant reçu = montant, pas de
//   monnaie). Chaque dossier est persisté dans Supabase individuellement.
async function bulkEncaisser() {
  if (blockIfSpectateur()) return;
  const ids = [..._selectedIds];
  if (!ids.length) return;

  const eligible = ids.filter(id => !isDossierPaye(id));
  if (!eligible.length) {
    toast('Tous les dossiers sélectionnés sont déjà payés', 'err');
    return;
  }
  const total = eligible.reduce((s, id) => {
    const r = (_dbCache || []).find(x => x.id === id);
    return s + (Number(r?.montant) || 0);
  }, 0);
  const dejaPayes = ids.length - eligible.length;

  if (!await showConfirmModal({
    icon: '💰',
    title: 'Encaissement groupé',
    message: 'Encaisser <strong>' + eligible.length + ' dossier(s)</strong> pour un total de <strong>'
      + total.toLocaleString('fr-FR') + ' FCFA</strong> ?<br>'
      + 'Chaque dossier sera marqué payé à son montant exact (pas de monnaie à rendre).'
      + (dejaPayes ? '<br><em>' + dejaPayes + ' dossier(s) déjà payé(s) seront ignorés.</em>' : ''),
    confirmText: '💰 Encaisser ' + total.toLocaleString('fr-FR') + ' F',
    cancelText: 'Annuler'
  })) return;

  // ✅ v13.81 — Encaissement en un seul appel, dans une transaction. La
  // boucle précédente envoyait un aller-retour par dossier : si le réseau
  // lâchait au milieu, la caisse se retrouvait à moitié encaissée sans que
  // personne ne sache où. Maintenant c'est tout ou rien.
  showLoading('Encaissement groupé…');
  let ok = 0, err = 0;
  try {
    const { data, error } = await _sb.rpc('encaisser_lot', { p_token: TK(), p_ids: eligible });
    hideLoading();
    if (error || !data || data.erreur) {
      toast('Encaissement échoué : ' + (error?.message || data?.erreur || '?'), 'err');
      return;
    }
    ok  = data.encaissees || 0;
    // « ignorées » = déjà payées côté serveur. Ce n'est pas une erreur, mais
    // il faut le dire : sinon l'écart entre le nombre annoncé et le nombre
    // encaissé passe pour une perte.
    err = data.ignorees || 0;
    // Le serveur fait foi sur les montants encaissés : on recharge plutôt
    // que de recopier localement un état qu'on croit correct.
    await refreshDB(true);
  } catch (e) {
    hideLoading();
    toast('Encaissement échoué : ' + (e.message || e), 'err');
    return;
  }
  clearBulkSelection();
  updateBandeauPaiement();
  if (typeof renderCaisse === 'function') renderCaisse();
  renderHistory();
  toast('💰 ' + ok + ' dossier(s) encaissé(s) — ' + total.toLocaleString('fr-FR') + ' FCFA'
    + (err ? ' · ' + err + ' déjà payé(s), ignoré(s)' : ''), 'ok');
}

// ✅ v13.42 — Annulation groupée de paiement
async function bulkAnnulerPaiement() {
  if (blockIfSpectateur()) return;
  const ids = [..._selectedIds];
  if (!ids.length) return;

  const eligible = ids.filter(id => isDossierPaye(id));
  if (!eligible.length) {
    toast('Aucun dossier payé dans la sélection', 'err');
    return;
  }
  if (!await showConfirmModal({
    icon: '↩️',
    title: 'Annuler les paiements ?',
    message: eligible.length + ' dossier(s) repasseront en « non payé ». Cette action est visible en caisse.',
    confirmText: 'Annuler les paiements', cancelText: 'Retour', confirmClass: 'btn-danger'
  })) return;

  showLoading('Annulation des paiements…');
  const p = getPaiements();
  let ok = 0, err = 0;
  for (const id of eligible) {
    try {
      const r = (_dbCache || []).find(x => x.id === id);
      if (r) r.patient = { ...(r.patient || {}), paiement_status: 'non_paye', paiement_infos: {} };
      p[id] = 'non_paye';
      if (_sb && TK() && r) {
        const { error } = await _sb.rpc('update_dossier_patient', {
          p_token: TK(), p_id: id, p_patient: r.patient
        });
        if (error) throw error;
      }
      ok++;
    } catch (e) { err++; }
  }
  localStorage.setItem(PAIEMENT_KEY, JSON.stringify(p));
  hideLoading();
  clearBulkSelection();
  updateBandeauPaiement();
  if (typeof renderCaisse === 'function') renderCaisse();
  renderHistory();
  toast('↩ ' + ok + ' paiement(s) annulé(s)' + (err ? ' · ' + err + ' erreur(s)' : ''), err ? 'err' : 'ok');
}

// ✅ v13.33 — clearHistory retiré de l'interface ; stub conservé
//   pour éviter les ReferenceError si un onglet ouvert avant la mise à
//   jour tentait d'appeler la fonction.
// ✅ v13.34 — Bouton modifier unifié : une modale, 3 actions
function showEditUnifie(id) {
  if (blockIfSpectateur()) return;
  const record = getDB().find(r => r.id === id);
  if (!record) { toast('Fiche introuvable', 'err'); return; }
  const p = record.patient || {};
  const types = getRecordTypes(record);
  const nom = esc(p.nom || '—');
  const dossier = esc(p.dossier || '—');

  const old = document.getElementById('edit-unifie-modal');
  if (old) old.remove();

  const bd = document.createElement('div');
  bd.id = 'edit-unifie-modal';
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';

  const typesChoix = types.length > 1
    ? types.map(t => `<button class="btn" onclick="document.getElementById('edit-unifie-modal').remove();editRecord(${id},'${t}')"
        style="width:100%;padding:11px 14px;text-align:left;margin-bottom:6px;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">
        ✏️ Modifier les résultats — <strong>${esc(t)}</strong></button>`).join('')
    : `<button class="btn" onclick="document.getElementById('edit-unifie-modal').remove();editRecord(${id})"
        style="width:100%;padding:11px 14px;text-align:left;margin-bottom:6px;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">
        ✏️ Modifier les résultats — <strong>${esc(types[0] || 'Analyse')}</strong></button>`;

  bd.innerHTML = `
    <div style="background:var(--surface-2);border-radius:16px;padding:24px 26px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:3px">✏️ Modifier le dossier</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:18px">${dossier} · ${nom}</div>
      ${typesChoix}
      <button class="btn" onclick="document.getElementById('edit-unifie-modal').remove();editFicheIdentif(${id})"
        style="width:100%;padding:11px 14px;text-align:left;margin-bottom:6px;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">
        🗂 Modifier les examens &amp; informations patient</button>
      <button class="btn" onclick="document.getElementById('edit-unifie-modal').remove();showNoteModal(${id})"
        style="width:100%;padding:11px 14px;text-align:left;margin-bottom:14px;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">
        📝 Note interne</button>
      <button class="btn btn-outline" onclick="document.getElementById('edit-unifie-modal').remove()"
        style="width:100%;padding:7px">Annuler</button>
    </div>`;

  document.body.appendChild(bd);
  bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
}

// ✅ v13.34 — Enregistrer et passer à l'onglet SUIVANT dans les examens cochés
// Ex : Biochimie → Immuno-Sérologie → Parasitologie selon ce qui est coché
const TAB_ORDER = ['hema','bio','bacterio','sero','parasito','gs','bpn'];
const TAB_TO_TYPE = {
  hema:'Hématologie', bio:'Biochimie', bacterio:'Bactériologie',
  sero:'Immuno-Sérologie', parasito:'Parasitologie', gs:'Groupe sanguin', bpn:'Bilan prénatal'
};

async function saveThenNext(type) {
  await saveRecord(type);
  // Trouver l'onglet courant
  const typeToTab = {
    'Hématologie':'hema','Biochimie':'bio','Bactériologie':'bacterio',
    'Immuno-Sérologie':'sero','Parasitologie':'parasito','Groupe sanguin':'gs','Bilan prénatal':'bpn'
  };
  const currentTab = typeToTab[type] || 'hema';
  const currentIdx = TAB_ORDER.indexOf(currentTab);

  // Chercher le prochain onglet qui a au moins un examen coché
  let nextTab = null;
  for (let i = currentIdx + 1; i < TAB_ORDER.length; i++) {
    const tabId = TAB_ORDER[i];
    const tabEl = document.getElementById('tab-' + tabId);
    if (!tabEl) continue;
    // Vérifier si au moins un examen de cet onglet est coché
    const cat = getCatalogueComplet().filter(ex => ex.tab === tabId);
    const hasChecked = cat.some(ex => document.getElementById(ex.id)?.checked);
    if (hasChecked) { nextTab = tabId; break; }
  }

  if (nextTab) {
    setTimeout(() => {
      switchTab(nextTab);
      toast('➡ Passez à ' + (TAB_TO_TYPE[nextTab] || nextTab), 'ok');
    }, 150);
  } else {
    // Plus d'onglet suivant — réinitialiser pour le prochain patient
    setTimeout(() => {
      const nomEl = document.getElementById('p_nom');
      if (nomEl) { nomEl.value = ''; nomEl.focus(); }
      ['p_age','p_ddn'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      const lblEl = document.getElementById('p_age_label');
      if (lblEl) lblEl.textContent = '';
      regenDossier();
      switchTab(TAB_ORDER[0]);
      toast('✅ Tous les examens enregistrés — patient suivant', 'ok');
    }, 150);
  }
}


// ✅ v13.35 — Enregistrer tous les onglets cochés en séquence automatique
async function saveAllTabs() {
  const tabsACochecher = TAB_ORDER.filter(tabId => {
    const cat = getCatalogueComplet().filter(ex => ex.tab === tabId);
    return cat.some(ex => document.getElementById(ex.id)?.checked);
  });

  if (!tabsACochecher.length) {
    toast('⚠ Aucun examen coché', 'err'); return;
  }

  const btns = document.querySelectorAll('button[onclick^="saveThenNext"], button[onclick^="saveRecord"], #btn-save-all');
  btns.forEach(b => b.disabled = true);

  try {
    for (const tabId of tabsACochecher) {
      const type = TAB_TO_TYPE[tabId];
      if (!type) continue;
      switchTab(tabId);
      await new Promise(r => setTimeout(r, 80));
      await _saveRecordImpl(type);
      await new Promise(r => setTimeout(r, 120));
    }
    toast('✅ ' + tabsACochecher.length + ' analyse(s) enregistrée(s)', 'ok');
    setTimeout(() => {
      regenDossier();
      switchTab(TAB_ORDER[0]);
    }, 200);
  } catch(e) {
    toast('Erreur : ' + (e.message || e), 'err');
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}
// ✅ v13.33 — Navigation sous-onglets admin
function adminShowMain(id, btn) {
  document.querySelectorAll('#view-comptes .admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-tab-main').forEach(t => t.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
}
function adminShowSub(id, btn) {
  if (!btn) return;
  const parentSection = btn.closest('.admin-section');
  if (!parentSection) return;
  parentSection.querySelectorAll('.admin-sub-section').forEach(s => s.classList.remove('active'));
  parentSection.querySelectorAll('.admin-tab-sub').forEach(t => t.classList.remove('active'));
  const sub = document.getElementById(id);
  if (sub) sub.classList.add('active');
  btn.classList.add('active');
  // ✅ v13.37 — Charger le journal des connexions à l'ouverture de l'onglet
  if (id === 'ac-connexions' && typeof renderConnexions === 'function') renderConnexions();
  // ✅ v13.79 — Les instantanés ne sont chargés qu'à l'ouverture de l'onglet :
  // inutile d'interroger le serveur à chaque connexion pour un écran rarement
  // visité, mais indispensable de rafraîchir la liste quand on l'ouvre.
  if (id === 'ac-sauvegarde') {
    if (typeof majBandeauSauvegarde === 'function') majBandeauSauvegarde();
    if (typeof chargerInstantanes   === 'function') chargerInstantanes();
    if (typeof majPanneauCoffre     === 'function') majPanneauCoffre();
  }
}

// ✅ v13.33 — Afficher/masquer un champ mot de passe
function togglePwdVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
  btn.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
}

// ✅ v13.34 — Sauvegarde complète (JSON) de toutes les fiches
// ✅ v13.34 — Dupliquer une fiche : pré-remplit le formulaire avec le patient
// et les examens cochés de la fiche source. Les valeurs restent vides.
// ✅ v13.34 — Note interne sur une fiche (agents + admin, invisible sur les impressions)
function showNoteModal(id) {
  const record = _dbCache.find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }
  const uid = _currentUser?.username;
  const canEdit = isAdmin() || record.createdBy === uid;
  const note = record.patient?.note || '';

  const old = document.getElementById('note-modal-bd');
  if (old) old.remove();

  const bd = document.createElement('div');
  bd.id = 'note-modal-bd';
  bd.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
  bd.innerHTML = `
    <div style="background:var(--surface-2,#fff);border-radius:16px;padding:26px 28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:15px;font-weight:700;color:var(--text-primary,#0f172a);margin-bottom:4px">📝 Note interne</div>
      <div style="font-size:12px;color:var(--text-muted,#94a3b8);margin-bottom:14px">
        Dossier <strong>${esc(record.patient?.dossier || '—')}</strong> · ${esc(record.patient?.nom || '—')}<br>
        Visible uniquement par les agents et l'admin — n'apparaît pas sur les impressions.
      </div>
      <textarea id="note-modal-textarea" rows="4"
        style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border,#e2e8f0);border-radius:8px;font-size:13px;resize:vertical;font-family:inherit"
        placeholder="Anomalie de prélèvement, contexte clinique, instruction médicale…"
        ${!canEdit ? 'readonly' : ''}>${esc(note)}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-outline" onclick="document.getElementById('note-modal-bd').remove()" style="padding:7px 16px">Fermer</button>
        ${canEdit ? '<button class="btn btn-primary" onclick="saveNote(' + id + ')" style="padding:7px 16px">💾 Enregistrer</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(bd);
  bd.addEventListener('click', e => { if (e.target === bd) bd.remove(); });
  setTimeout(() => document.getElementById('note-modal-textarea')?.focus(), 50);
}

async function saveNote(id) {
  const record = _dbCache.find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }
  const note = (document.getElementById('note-modal-textarea')?.value || '').trim();

  // Mise à jour optimiste
  if (!record.patient) record.patient = {};
  record.patient.note = note;

  // Hors ligne : persister dans le cache uniquement (la note sera synchro au prochain update_resultat)
  if (!navigator.onLine || String(id).startsWith('tmp_')) {
    document.getElementById('note-modal-bd')?.remove();
    renderHistory();
    toast('📴 Note enregistrée localement', 'ok');
    return;
  }

  // En ligne : RPC dédiée
  try {
    const { data, error } = await _sb.rpc('update_note_dossier', {
      p_token: TK(), p_id: id, p_note: note
    });
    if (error) throw error;
    if (data === 'unauthorized') { toast('Session expirée — reconnectez-vous', 'err'); return; }
    if (data === 'forbidden')    { toast('Action non autorisée', 'err'); return; }
    if (data === 'not_found')    { toast('Fiche introuvable', 'err'); return; }
    document.getElementById('note-modal-bd')?.remove();
    renderHistory();
    toast(note ? '📝 Note enregistrée' : '📝 Note effacée', 'ok');
  } catch (e) {
    console.error('saveNote:', e);
    toast("Erreur lors de l'enregistrement : " + (e.message || e), 'err');
  }
}


