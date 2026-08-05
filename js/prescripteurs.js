/* ═══════════════════════════════════════════════════════════════
   LaboSaisie CPMI — prescripteurs.js
   Extrait de index.html (v13.70). Chargé en script classique, PAS en
   module ES : les gestionnaires inline du HTML (onclick="…") résolvent
   les fonctions dans la portée globale. L'ordre des balises <script>
   dans index.html doit être conservé.
   ═══════════════════════════════════════════════════════════════ */

let _prescripteurs = [];

async function loadPrescripteurs() {
  // ✅ v13 — via RPC sécurisée par jeton
  const { data, error } = await _sb.rpc('get_prescripteurs', { p_token: TK() });
  if (!error) {
    _prescripteurs = data || [];
    refreshPrescripteurSelects();
    renderPrescripteursList();
  }
}

function refreshPrescripteurSelects() {
  const opts = '<option value="">— Choisir un prescripteur —</option>'
    + _prescripteurs.map(p =>
        `<option value="${p.id}">${esc(p.nom)}${p.specialite ? ' · ' + esc(p.specialite) : ''}</option>`
      ).join('');
  document.querySelectorAll('select[id="p_prescripteur_id"]').forEach(el => {
    const cur = el.value;
    el.innerHTML = opts;
    el.value = cur;
  });
}

function onPrescripteurChange() {
  const sel = document.getElementById('p_prescripteur_id');
  const id = sel?.value;
  const presc = _prescripteurs.find(p => p.id == id);
  if (presc) {
    const medEl = document.getElementById('p_medecin');
    if (medEl) medEl.value = presc.nom; // ✅ v13.29 — toujours synchroniser, même si déjà rempli
  }
}

function showAddPrescripteur() {
  showView('stats');
  // ✅ v13.33 — Naviguer vers l'onglet Comptes > Prescripteurs
  showView('comptes');
  setTimeout(() => {
    adminShowMain('ac-comptes', document.querySelector('.admin-tab-main'));
    adminShowSub('ac-presc', document.querySelector('#ac-comptes .admin-tab-sub:last-child'));
  }, 80);
}

async function savePrescripteur() {
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; } // ✅ v12
  const nom = document.getElementById('presc_nom')?.value?.trim().toUpperCase();
  if (!nom) { toast('Nom du prescripteur obligatoire', 'err'); return; }
  // ✅ v13.28 — L'anti-doublon est géré côté serveur (qui réactive un
  // prescripteur désactivé portant le même nom au lieu de le rejeter).
  const { data: res, error } = await _sb.rpc('insert_prescripteur', {
    p_token: TK(),
    p_nom: nom,
    p_specialite: document.getElementById('presc_spec')?.value || '',
    p_structure:  document.getElementById('presc_struct')?.value || '',
    p_taux: parseFloat(document.getElementById('presc_taux')?.value || '0'),
  });
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  if (res === 'forbidden') { toast('Action réservée aux administrateurs', 'err'); return; }
  if (res === 'duplicate') { toast('Un prescripteur porte déjà ce nom', 'err'); return; }
  if (res !== 'ok') { toast('Erreur : ' + res, 'err'); return; }
  toast('Prescripteur ajouté ✓', 'ok');
  ['presc_nom','presc_spec','presc_struct'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('presc_taux').value = '0';
  await loadPrescripteurs();
}

async function deletePrescripteur(id) {
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; } // ✅ v12
  if (!confirm('Désactiver ce prescripteur ?')) return;
  const { data: res, error } = await _sb.rpc('deactivate_prescripteur', { p_token: TK(), p_id: id });
  if (error || res !== 'ok') { toast('Échec de la désactivation', 'err'); return; }
  await loadPrescripteurs();
  toast('Prescripteur désactivé', 'ok');
}

// ✅ v2: ajout bouton ✏ modification + fonction editPrescripteur
function renderPrescripteursList() {
  const el = document.getElementById('prescripteurs-list');
  if (!el) return;
  if (!_prescripteurs.length) { el.innerHTML = '<p style="font-size:12.5px;color:var(--text-muted)">Aucun prescripteur enregistré.</p>'; return; }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr style="background:var(--bg)">
      <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border)">Nom</th>
      <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border)">Spécialité</th>
      <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border)">Structure</th>
      <th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">Ristourne %</th>
      <th style="padding:8px;border-bottom:1px solid var(--border)"></th>
    </tr></thead>
    <tbody>
      ${_prescripteurs.map(p => `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);font-weight:600">${esc(p.nom)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text-muted)">${esc(p.specialite||'—')}</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text-muted)">${esc(p.structure||'—')}</td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border);font-weight:700;color:var(--accent)">${p.taux_ristourne||0} %</td>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);display:flex;gap:4px">
          ${isAdmin() ? `<button class="btn" style="padding:3px 8px;font-size:11px" onclick="editPrescripteur(${p.id})">✏</button>
          <button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deletePrescripteur(${p.id})">✕</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

async function editPrescripteur(id) {
  if (!isAdmin()) { toast('Action réservée aux administrateurs', 'err'); return; }
  const presc = _prescripteurs.find(p => p.id === id);
  if (!presc) { toast('Prescripteur introuvable', 'err'); return; }
  // ✅ v13.1 — ouverture d'une modale (remplace les prompt() en série, peu ergonomiques sur mobile)
  document.getElementById('pm_id').value = presc.id;
  document.getElementById('pm_nom').value = presc.nom || '';
  document.getElementById('pm_spec').value = presc.specialite || '';
  document.getElementById('pm_struct').value = presc.structure || '';
  document.getElementById('pm_taux').value = presc.taux_ristourne || 0;
  document.getElementById('pm-error').textContent = '';
  document.getElementById('presc-modal').style.display = 'flex';
  document.getElementById('pm_nom').focus();
}

function closePrescModal() {
  document.getElementById('presc-modal').style.display = 'none';
}

async function submitPrescModal() {
  const errEl = document.getElementById('pm-error');
  errEl.textContent = '';
  const id = parseInt(document.getElementById('pm_id').value, 10);
  const nom = document.getElementById('pm_nom').value.trim().toUpperCase();
  const spec = document.getElementById('pm_spec').value.trim();
  const struct = document.getElementById('pm_struct').value.trim();
  const taux = parseFloat(document.getElementById('pm_taux').value);
  if (!nom) { errEl.textContent = 'Le nom est obligatoire.'; return; }
  if (isNaN(taux) || taux < 0 || taux > 100) { errEl.textContent = 'Taux invalide (0 à 100).'; return; }
  // anti-doublon (hors soi-même)
  if (_prescripteurs.some(p => p.id !== id && (p.nom||'').trim().toLowerCase() === nom.toLowerCase())) {
    errEl.textContent = 'Un autre prescripteur porte déjà ce nom.'; return;
  }
  const { data, error } = await _sb.rpc('update_prescripteur_admin', {
    p_token:          TK(),
    p_prescr_id:      id,
    p_nom:            nom,
    p_specialite:     spec,
    p_structure:      struct,
    p_taux_ristourne: taux,
  });
  if (error)                   { errEl.textContent = 'Erreur serveur : ' + error.message; return; }
  if (data === 'forbidden')    { errEl.textContent = 'Action réservée aux administrateurs.'; return; }
  if (data === 'not_found')    { errEl.textContent = 'Prescripteur introuvable.'; return; }
  if (data === 'nom_required') { errEl.textContent = 'Le nom est obligatoire.'; return; }
  if (data === 'taux_invalid') { errEl.textContent = 'Taux invalide (0 à 100).'; return; }
  if (data !== 'ok')           { errEl.textContent = 'Erreur : ' + data; return; }
  closePrescModal();
  toast('Prescripteur mis à jour ✓', 'ok');
  await loadPrescripteurs();
}

// ============================================================
// FILTRES TEMPORELS DES STATS
// ============================================================

let _statsPeriode = 'mois'; // 'jour'|'semaine'|'mois'|'tout'|'custom'

function setStatsPeriode(periode) {
  _statsPeriode = periode;
  // Mettre en évidence le bouton actif
  ['jour','semaine','mois','tout'].forEach(p => {
    const btn = document.getElementById('stats-btn-' + p);
    if (btn) btn.classList.toggle('active', p === periode);
  });
  renderStats();
}

function getStatsDateRange() {
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  let from = null, to = today, label = '';

  if (_statsPeriode === 'jour') {
    from = today; label = "Aujourd'hui (" + today.split('-').reverse().join('/') + ')';
  } else if (_statsPeriode === 'semaine') {
    const d = new Date(now);
    const jour = d.getDay(); // 0 = dimanche, 1 = lundi, ... 6 = samedi
    const decalage = jour === 0 ? 6 : jour - 1; // nombre de jours depuis le lundi de cette semaine
    d.setDate(d.getDate() - decalage);
    from = d.toISOString().slice(0,10);
    label = 'Semaine du ' + from.split('-').reverse().join('/');
  } else if (_statsPeriode === 'mois') {
    from = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-01';
    label = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
  } else if (_statsPeriode === 'tout') {
    from = null; label = 'Toute la période';
  } else if (_statsPeriode === 'custom') {
    from = document.getElementById('stats-date-from')?.value || null;
    to   = document.getElementById('stats-date-to')?.value || today;
    label = (from ? from.split('-').reverse().join('/') : '...') + ' → ' + to.split('-').reverse().join('/');
  }

  const labelEl = document.getElementById('stats-periode-label');
  if (labelEl) labelEl.textContent = label;
  return { from, to };
}

// Filtre une liste de fiches selon une plage de dates [from, to], en se basant
// sur l'horodatage RÉEL d'enregistrement (savedAt), pas la date de prélèvement
// saisie manuellement. "from" est toujours interprété à partir de 00h00:00
// du jour indiqué, et "to" jusqu'à 23h59:59 du jour indiqué inclus — ainsi
// "Aujourd'hui" couvre bien toute la journée depuis minuit jusqu'à maintenant.
function filterByDateRange(db, from, to) {
  const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null;
  const toTs   = to   ? new Date(to   + 'T23:59:59.999').getTime() : null;
  if (fromTs === null && toTs === null) return db;
  return db.filter(r => {
    // ✅ v13.28 — filtrer sur la date du PATIENT (date de consultation saisie),
    // avec savedAt (date d'enregistrement) comme fallback si patient.date absent.
    const dateStr = r.patient?.date || '';
    const ts = dateStr
      ? new Date(dateStr + 'T00:00:00').getTime()
      : (r.savedAt ? new Date(r.savedAt).getTime() : NaN);
    if (isNaN(ts)) return false;
    if (fromTs !== null && ts < fromTs) return false;
    if (toTs   !== null && ts > toTs)   return false;
    return true;
  });
}

function filterDbByPeriode(db) {
  const { from, to } = getStatsDateRange();
  return filterByDateRange(db, from, to);
}

// ============================================================
// RISTOURNES PRESCRIPTEURS
// ============================================================

async function renderRistournes(db) {
  const el = document.getElementById('ristournes-table');
  if (!el || !_prescripteurs.length) {
    if (el) el.innerHTML = '<p style="font-size:12.5px;color:var(--text-muted)">Aucun prescripteur enregistré. Ajoutez des prescripteurs ci-dessous.</p>';
    return;
  }

  // Pour chaque prescripteur, calculer BPN + extra-BPN
  const rows = _prescripteurs.map(presc => {
    const fiches = db.filter(r => Number(r.prescripteur_id) === Number(presc.id));
    // ✅ v13.28 — BPN détecté via est_bpn OU type 'Bilan prénatal' (rétrocompat)
    // OU présence de ex_bpn dans les examens cochés
    const isBpn = r => r.est_bpn
      || getRecordTypes(r).includes('Bilan prénatal')
      || Object.values(r.resultats?._examens_coches || {}).flat().includes('Bilan prénatal complet (forfait)');
    const bpn      = fiches.filter(r => isBpn(r));
    const extraBPN = fiches.filter(r => !isBpn(r));
    const montantExtraBPN = extraBPN.reduce((s, r) => s + (r.montant || 0), 0);
    const ristourne = Math.round(montantExtraBPN * (presc.taux_ristourne || 0) / 100);
    return { presc, bpn: bpn.length, extraBPN: extraBPN.length, montantExtraBPN, ristourne };
  }).filter(r => r.bpn + r.extraBPN > 0);

  if (!rows.length) {
    el.innerHTML = '<p style="font-size:12.5px;color:var(--text-muted)">Aucune activité prescripteur sur cette période.</p>';
    return;
  }

  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr style="background:var(--bg)">
      <th style="padding:8px;text-align:left;border-bottom:1px solid var(--border)">Prescripteur</th>
      <th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">BPN (nb)</th>
      <th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">Ristourne BPN</th>
      <th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">Examens extra-BPN</th>
      <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border)">Montant extra-BPN</th>
      <th style="padding:8px;text-align:center;border-bottom:1px solid var(--border)">Taux</th>
      <th style="padding:8px;text-align:right;border-bottom:1px solid var(--border);color:#15803d;font-weight:700">Ristourne due</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid var(--border);font-weight:600">${esc(r.presc.nom)}<br><span style="font-size:11px;color:var(--text-muted);font-weight:400">${esc(r.presc.specialite||'')}</span></td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border)">${r.bpn}</td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border);color:var(--text-muted);font-style:italic;font-size:11px">0 FCFA<br>(règle : pas de ristourne BPN)</td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border)">${r.extraBPN}</td>
        <td style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border)">${r.montantExtraBPN.toLocaleString('fr-FR')} F</td>
        <td style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border);font-weight:700;color:var(--accent)">${r.presc.taux_ristourne||0} %</td>
        <td style="padding:7px 8px;text-align:right;border-bottom:1px solid var(--border);font-weight:700;color:#15803d;font-size:13px">${r.ristourne.toLocaleString('fr-FR')} F</td>
      </tr>`).join('')}
      <tr style="background:var(--bg)">
        <td colspan="6" style="padding:8px;font-weight:700;text-align:right">Total ristournes dues :</td>
        <td style="padding:8px;font-weight:800;color:#15803d;font-size:14px;text-align:right">${rows.reduce((s,r)=>s+r.ristourne,0).toLocaleString('fr-FR')} FCFA</td>
      </tr>
    </tbody>
  </table>`;
}

// (Ancien système bio_config supprimé — remplacé par labosaisie_refs_v1 dans le panneau admin)




// ============================================================
// FICHE D'IDENTIFICATION — EXAMENS & FACTURATION
// ============================================================

// Catalogue complet des examens avec prix et type associé

