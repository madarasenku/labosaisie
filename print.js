/* ============================================================
   LaboSaisie CPMI — print.js
   Fonctions d'impression, export PDF et export Excel
   v13.35 — extrait de index.html
   Dépendances : ExcelJS, jsPDF, jspdf-autotable (chargés dans index.html)
   Variables globales attendues : _sb, TK(), _currentUser,
     getDB(), getRecordTypes(), getRecordResultats(), _fmtF(),
     _recDate(), toast(), showLoading(), hideLoading(), esc(),
     TARIFS_BASE_DEFAULT, HEMA_FL, HEMA_PARAMS, BIO_*, SERO_*,
     CATALOGUE_EXAMENS, _prescripteurs, etc.
   ============================================================ */

function ensureExcelJSReady() {
  if (typeof ExcelJS === 'undefined') {
    toast('Bibliothèque Excel indisponible — vérifiez votre connexion internet et réessayez', 'err');
    return false;
  }
  return true;
}

// Convertit un classeur ExcelJS en fichier .xlsx et déclenche son
// téléchargement dans le navigateur. C'était la fonction manquante qui
// empêchait TOUS les exports Excel de fonctionner (le classeur était bien
// construit mais jamais réellement écrit sur le disque de l'utilisateur).
// ── Nom de feuille Excel valide (ExcelJS rejette certains caractères) ──
function safeSheetName(name, usedNames) {
  // Supprimer les caractères interdits par Excel : [ ] : * ? / \ '
  let safe = (name || 'Feuille')
    .replace(/[\[\]:*?/\\']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 31);
  if (!safe) safe = 'Feuille';
  // Dédoublonner si usedNames fourni
  if (usedNames) {
    let candidate = safe;
    let n = 2;
    while (usedNames.has(candidate)) {
      candidate = safe.substring(0, 28) + ' ' + n;
      n++;
    }
    usedNames.add(candidate);
    return candidate;
  }
  return safe;
}

async function downloadWorkbook(wb, filename) {
  showLoading('Génération du fichier Excel…'); // ✅ v13
  try {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    hideLoading();
  }
}

async function exportSingle(type) {
  try {
  const p = getPatient();
  if (!validatePatient(p)) return;
  if (!ensureExcelJSReady()) return;

  await refreshDB();
  const db = getDB();

  // Chercher dans les dossiers unifiés ET les anciens formats
  let saved = db.find(r => isDossierRecord(r) && r.patient?.dossier === p.dossier);
  if (saved) {
    await ensureFull(saved); // ✅ v13.5 — détail complet avant export Excel
    // Extraire le type demandé du dossier
    const typeRes = getRecordResultats(saved, type);
    saved = { ...saved, type, resultats: typeRes };
  } else {
    saved = db.find(r => r.type === type && r.patient?.dossier === p.dossier);
    if (saved) await ensureFull(saved); // ✅ v13.5
  }
  if (!saved) {
    toast('Enregistrez la fiche avant de l\'exporter ✗', 'err');
    return;
  }

  // Avertir si des examens payés ne sont pas remplis
  if (!confirmerSiExamensManquants(type, saved.resultats)) return;

  // Export depuis la fiche enregistrée (pas depuis le formulaire en cours)
  const displayType = getDisplayType(saved);
  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Résultat ' + displayType;
  buildProfessionalSheet(wb, saved, getDisplayTypeShort(saved).substring(0, 31));
  await downloadWorkbook(wb, makeFilename(saved.patient.dossier, saved.patient.date, saved.patient.nom || 'PATIENT', getDisplayTypeShort(saved)));
  toast('Export Excel réussi ✓', 'ok');
  } catch(err) {
    console.error('exportSingle:', err);
    toast('Erreur export Excel : ' + (err.message || err), 'err');
  }
}

async function exportAllExcel() {
  try {
  if (!ensureExcelJSReady()) return;
  toast('Récupération des données…');
  showLoading('Récupération de tous les détails…'); // ✅ v13.5
  await refreshDBFull(); // ✅ v13.5 — l'export global a besoin du détail complet
  hideLoading();
  const db = getDB();
  if (!db.length) { toast('Aucune donnée à exporter', 'err'); return; }
  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Export LaboSaisie';
  let sheetCount = 0;
  let failedSheets = 0; // ✅ v12

  const usedNames = new Set();
  db.forEach((record, ri) => {
    try {
      if (isDossierRecord(record)) {
        const types = getRecordTypes(record);
        types.forEach(type => {
          sheetCount++;
          const fakeRecord = { ...record, type, resultats: getRecordResultats(record, type) };
          const nom = (record.patient?.nom || 'PATIENT').toUpperCase().substring(0, 8);
          const rawName = nom + ' ' + type.substring(0, 18);
          buildProfessionalSheet(wb, fakeRecord, safeSheetName(rawName, usedNames));
        });
      } else {
        sheetCount++;
        const rawName = (record.type || 'Analyse') + ' ' + (record.patient?.nom || '').substring(0, 10);
        buildProfessionalSheet(wb, record, safeSheetName(rawName, usedNames));
      }
    } catch(sheetErr) {
      console.error('Erreur feuille dossier', ri, ':', sheetErr);
      failedSheets++; // ✅ v12 — compter les échecs pour ne plus les masquer
      // Continuer avec les autres dossiers
    }
  });

  if (!sheetCount) { toast('Aucune donnée à exporter', 'err'); return; }
  const today = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
  await downloadWorkbook(wb, `LaboSaisie_Export_${today}.xlsx`);
  if (failedSheets > 0) {
    toast('Export terminé, mais ' + failedSheets + ' feuille' + (failedSheets>1?'s':'') + ' en erreur (voir console F12)', 'err');
  } else {
    toast('Export complet réussi ✓', 'ok');
  }
  } catch(err) {
    console.error('exportAllExcel:', err);
    toast('Erreur export Excel : ' + (err.message || err), 'err');
  }
}

// ============================================================
// TABLEAU DE BORD — STATISTIQUES
// ============================================================

const TYPES_ANALYSES = ['Hématologie','Biochimie','Bactériologie','Immuno-Sérologie','Parasitologie','Groupe sanguin','Bilan prénatal'];
const TYPE_COLORS = ['#2563EB','#7C3AED','#DB2777','#D97706','#059669','#DC2626','#EA580C'];

async function renderStats() {
  ['kpi-total','kpi-month','kpi-agents','kpi-recettes-month','kpi-recettes-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.querySelector('.kpi-val').textContent = '…';
  });

  await refreshDB();
  const db = getCalcDB(); // ✅ v13.30 — exclut les fiches verrouillées des statistiques

  // Appliquer le filtre de période
  const dbPeriode = filterDbByPeriode(db);

  if (!db.length) {
    ['chart-by-type','chart-monthly','chart-by-agent','chart-recettes-type','chart-recettes-monthly'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="stats-empty">Aucune donnée disponible</div>';
    });
    ['kpi-total','kpi-month','kpi-agents','kpi-recettes-month','kpi-recettes-total'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.querySelector('.kpi-val').textContent = '0';
    });
    renderRistournes([]);
    return;
  }

  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');

  // ── KPI ─────────────────────────────────────────────────────
  const total = db.length;
  const periodeCount = dbPeriode.length;
  const agents = new Set(dbPeriode.map(r => r.createdBy).filter(Boolean));

  // ✅ v13.33 — Animation compte-à-rebours sur les KPI stats
  animateCount(document.getElementById('kpi-total')?.querySelector('.kpi-val'),   total,       600, false);
  animateCount(document.getElementById('kpi-month')?.querySelector('.kpi-val'),   periodeCount,500, false);
  animateCount(document.getElementById('kpi-agents')?.querySelector('.kpi-val'),  agents.size || 0, 400, false);

  // ── Fiches par type d'analyse (barres horizontales) ─────────
  const byType = {};
  TYPES_ANALYSES.forEach(t => byType[t] = 0);
  db.forEach(r => {
    // Dossiers unifiés : compter chaque type séparément
    const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type];
    types.forEach(t => { if (byType[t] !== undefined) byType[t]++; });
  });
  const maxType = Math.max(...Object.values(byType), 1);

  document.getElementById('chart-by-type').innerHTML = `
    <div class="bar-chart">
      ${TYPES_ANALYSES.map((t, i) => `
        <div class="bar-row">
          <div class="bar-label" title="${t}">${t}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.round(byType[t]/maxType*100)}%;background:${TYPE_COLORS[i]}"></div>
          </div>
          <div class="bar-count">${byType[t]}</div>
        </div>
      `).join('')}
    </div>`;

  // ── Évolution mensuelle (6 derniers mois) ───────────────────
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    months.push({ key, label, count: dbPeriode.filter(r => (r.patient?.date||r.savedAt||'').startsWith(key)).length });
  }
  const maxMonth = Math.max(...months.map(m => m.count), 1);

  document.getElementById('chart-monthly').innerHTML = `
    <div class="monthly-chart">
      ${months.map(m => `
        <div class="monthly-col">
          <div class="monthly-count">${m.count || ''}</div>
          <div class="monthly-bar" style="height:${Math.max(Math.round(m.count/maxMonth*110),2)}px"></div>
          <div class="monthly-month">${m.label}</div>
        </div>
      `).join('')}
    </div>`;

  // ── Répartition par agent (barres + SVG camembert) ──────────
  const byAgent = {};
  dbPeriode.forEach(r => {
    const a = r.createdBy || 'Inconnu';
    byAgent[a] = (byAgent[a] || 0) + 1;
  });
  const agentEntries = Object.entries(byAgent).sort((a,b) => b[1]-a[1]);
  const maxAgent = Math.max(...agentEntries.map(e => e[1]), 1);
  const agentColors = ['#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2','#DC2626'];

  // SVG camembert
  let svgPaths = '';
  let legendItems = '';
  let startAngle = -Math.PI / 2;
  agentEntries.forEach(([agent, count], i) => {
    const pct = count / total;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = Math.cos(startAngle) * 60 + 70;
    const y1 = Math.sin(startAngle) * 60 + 70;
    const x2 = Math.cos(endAngle) * 60 + 70;
    const y2 = Math.sin(endAngle) * 60 + 70;
    const largeArc = angle > Math.PI ? 1 : 0;
    const color = agentColors[i % agentColors.length];
    if (total > 1 || agentEntries.length === 1) {
      svgPaths += `<path d="M70,70 L${x1},${y1} A60,60 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" stroke="white" stroke-width="2"/>`;
    }
    legendItems += `<div class="pie-legend-item"><div class="pie-dot" style="background:${color}"></div><span><strong>${agent}</strong> — ${count} fiche${count>1?'s':''} (${Math.round(pct*100)}%)</span></div>`;
    startAngle = endAngle;
  });

  document.getElementById('chart-by-agent').innerHTML = `
    <div class="pie-chart">
      <svg width="140" height="140" viewBox="0 0 140 140" style="flex-shrink:0">
        ${agentEntries.length === 1
          ? `<circle cx="70" cy="70" r="60" fill="${agentColors[0]}"/>`
          : svgPaths}
        <circle cx="70" cy="70" r="30" fill="white"/>
        <text x="70" y="74" text-anchor="middle" font-size="14" font-weight="700" fill="#1E3A8A">${total}</text>
      </svg>
      <div class="pie-legend">${legendItems}</div>
    </div>`;

  // ── KPI Financiers ────────────────────────────────────────────
  const recettesTotal = db.reduce((s, r) => s + (r.montant || 0), 0);
  const recettesMonth = db.filter(r => (r.patient?.date||r.savedAt||'').startsWith(thisMonth))
    .reduce((s, r) => s + (r.montant || 0), 0);

  // ✅ v13.33 — Animation compte-à-rebours KPI financiers
  const kpiRM = document.getElementById('kpi-recettes-month');
  const kpiRT = document.getElementById('kpi-recettes-total');
  animateCount(kpiRM?.querySelector('.kpi-val'), recettesMonth, 700, true);
  animateCount(kpiRT?.querySelector('.kpi-val'), recettesTotal, 800, true);

  // ── Recettes par type ──────────────────────────────────────────
  const recettesByType = {};
  TYPES_ANALYSES.forEach(t => recettesByType[t] = 0);
  db.forEach(r => { if (recettesByType[r.type] !== undefined) recettesByType[r.type] += (r.montant || 0); });
  const maxRec = Math.max(...Object.values(recettesByType), 1);

  const chartRecType = document.getElementById('chart-recettes-type');
  if (chartRecType) chartRecType.innerHTML = `
    <div class="bar-chart">
      ${TYPES_ANALYSES.map((t, i) => `
        <div class="bar-row">
          <div class="bar-label" title="${t}">${t}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.round(recettesByType[t]/maxRec*100)}%;background:${TYPE_COLORS[i]}"></div>
          </div>
          <div class="bar-count" style="width:70px;font-size:10px">${recettesByType[t].toLocaleString('fr-FR')} F</div>
        </div>
      `).join('')}
    </div>`;

  // ── Recettes mensuelles (6 mois) ────────────────────────────────
  const recMonths = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('fr-FR', { month: 'short' });
    const montantMonth = db.filter(r => (r.savedAt||'').startsWith(key)).reduce((s, r) => s + (r.montant||0), 0);
    recMonths.push({ key, label, montant: montantMonth });
  }
  const maxRecMonth = Math.max(...recMonths.map(m => m.montant), 1);

  const chartRecMonthly = document.getElementById('chart-recettes-monthly');
  if (chartRecMonthly) chartRecMonthly.innerHTML = `
    <div class="monthly-chart">
      ${recMonths.map(m => `
        <div class="monthly-col">
          <div class="monthly-count" style="font-size:9px">${m.montant ? (m.montant/1000).toFixed(0)+'k' : ''}</div>
          <div class="monthly-bar" style="height:${Math.max(Math.round(m.montant/maxRecMonth*110),2)}px;background:#15803d"></div>
          <div class="monthly-month">${m.label}</div>
        </div>
      `).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:4px;text-align:center">
      Total 6 mois : <strong>${recMonths.reduce((s,m)=>s+m.montant,0).toLocaleString('fr-FR')} FCFA</strong>
    </div>`;

  // Ristournes sur la période filtrée

  // ── Graphiques Chart.js ──────────────────────────────────────
  if (window._charts) { Object.values(window._charts).forEach(ch => { try { ch.destroy(); } catch(e){} }); }
  window._charts = {};
  const CHART_COLORS = {'Hématologie':'#b91c1c','Biochimie':'#854d0e','Bactériologie':'#166534','Immuno-Sérologie':'#5b21b6','Parasitologie':'#9d174d','Groupe sanguin':'#9a3412','Bilan prénatal':'#155e75'};
  const donutEl = document.getElementById('chartjs-donut');
  if (donutEl && typeof Chart !== 'undefined') {
    const dL=TYPES_ANALYSES.filter(t=>byType[t]>0), dD=dL.map(t=>byType[t]), dC=dL.map(t=>CHART_COLORS[t]||'#6b7280'), dT=dD.reduce((a,b)=>a+b,0);
    window._charts.donut = new Chart(donutEl,{type:'doughnut',data:{labels:dL,datasets:[{data:dD,backgroundColor:dC,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10},padding:8}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw/dT*100)}%)`}}}}});
  }
  const barRecEl = document.getElementById('chartjs-bar-recettes');
  if (barRecEl && typeof Chart !== 'undefined') {
    const bL=[],bD=[];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');bL.push(d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}));bD.push(db.filter(r=>(r.patient?.date||r.savedAt||'').startsWith(k)).reduce((s,r)=>s+(r.montant||0),0));}
    window._charts.barRec = new Chart(barRecEl,{type:'bar',data:{labels:bL,datasets:[{label:'FCFA',data:bD,backgroundColor:'rgba(30,58,138,.75)',borderColor:'#1e3a8a',borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+ctx.raw.toLocaleString('fr-FR')+' FCFA'}}},scales:{y:{beginAtZero:true,ticks:{font:{size:10},callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v}},x:{ticks:{font:{size:10}}}}}});
  }
  const lineEl = document.getElementById('chartjs-line-evolution');
  if (lineEl && typeof Chart !== 'undefined') {
    const lL=[],lD=[];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');lL.push(d.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}));lD.push(db.filter(r=>(r.patient?.date||r.savedAt||'').startsWith(k)).length);}
    // ✅ v13.34 — Dataset comparaison année précédente
    const lD2 = [];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear()-1,now.getMonth()-i,1);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');lD2.push(db.filter(r=>(r.patient?.date||r.savedAt||'').startsWith(k)).length);}
    window._charts.line = new Chart(lineEl,{type:'line',data:{labels:lL,datasets:[
      {label:'Cette année',data:lD,borderColor:'#059669',backgroundColor:'rgba(5,150,105,.08)',borderWidth:2,tension:.35,pointRadius:4,fill:true},
      {label:'An passé',data:lD2,borderColor:'#94a3b8',backgroundColor:'transparent',borderWidth:1.5,borderDash:[4,3],tension:.35,pointRadius:3,fill:false}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{font:{size:10},boxWidth:14}}},scales:{y:{beginAtZero:true,ticks:{font:{size:10},stepSize:1}},x:{ticks:{font:{size:10}}}}}});
  }
  const el_ts=document.getElementById('kpi-total-sub'); if(el_ts){const n=Object.values(byType).reduce((a,b)=>a+b,0);el_ts.textContent=n+' analyse'+(n>1?'s':'')+' enregistrée'+(n>1?'s':'');}
  const el_ms=document.getElementById('kpi-month-sub'); if(el_ms){const n=dbPeriode.reduce((s,r)=>s+(isDossierRecord(r)?(r.resultats?._types||[]).length:1),0);el_ms.textContent=n+' analyse'+(n>1?'s':'');}
  const el_as=document.getElementById('kpi-agents-sub'); if(el_as){const n=new Set(db.map(r=>r.createdBy).filter(Boolean)).size;el_as.textContent=n+' agent'+(n>1?'s':'')+' au total';}

  await renderRistournes(dbPeriode);
  renderTopExamens();
  // Section admin prescripteurs
  const adminCard = document.getElementById('prescripteurs-admin-card');
  if (adminCard) adminCard.style.display = isAdmin() ? '' : 'none';
}

// ============================================================
// IMPRESSION DIRECTE
// ============================================================

// ============================================================
// VÉRIFICATION EXAMENS PAYÉS NON REMPLIS — avant impression/export
// ============================================================

// Retourne la liste des libellés d'examens cochés (payés) sur la fiche
// d'accueil dont la section correspondante n'a aucune valeur saisie
function getExamensManquants(type, resultats) {
  const TYPE_TO_TAB = {
    'Hématologie': 'hema', 'Biochimie': 'bio', 'Bactériologie': 'bacterio',
    'Immuno-Sérologie': 'sero', 'Parasitologie': 'parasito',
    'Groupe sanguin': 'gs', // BPN supprimé v13.21
  };
  const tabKey = TYPE_TO_TAB[type];
  if (!tabKey) return [];

  const tousExamens = getCatalogueComplet();
  const examensConcernés = tousExamens.filter(ex => {
    const chk = document.getElementById(ex.id);
    return chk && chk.checked && ex.tab === tabKey;
  });
  if (!examensConcernés.length) return [];

  // Un résultat est considéré "rempli" si au moins une valeur existe dans `resultats`
  // pour la section concernée. On vérifie via les sections marquées.
  const manquants = [];
  examensConcernés.forEach(ex => {
    if (!ex.section) return;
    const sectionEl = document.getElementById(ex.section);
    if (!sectionEl) return;
    const card = sectionEl.closest('.card') || sectionEl;
    // Vérifier si au moins un champ rempli existe dans cette carte
    const inputs = card.querySelectorAll('input[type=number], input[type=text], select, textarea');
    let rempli = false;
    inputs.forEach(inp => {
      if (inp.value && inp.value.trim() !== '' && inp.value !== '—') rempli = true;
    });
    if (!rempli) manquants.push(ex.label);
  });
  return [...new Set(manquants)];
}

// Affiche une confirmation si des examens payés ne sont pas remplis.
// Retourne true si on peut continuer (rien à signaler, ou utilisateur confirme).
function confirmerSiExamensManquants(type, resultats) {
  const manquants = getExamensManquants(type, resultats);
  if (!manquants.length) return true;
  const msg = '⚠ Les examens suivants ont été payés mais ne sont pas remplis :\n\n'
    + manquants.map(m => '  • ' + m).join('\n')
    + '\n\nVoulez-vous imprimer/exporter quand même ?';
  return confirm(msg);
}

async function printRecord(id) {
  let r = getDB().find(x => x.id === id);
  if (!r) { toast('Fiche introuvable', 'err'); return; }
  await ensureFull(r); // ✅ v13.5 — détail complet avant impression
  // Pour un dossier unifié : créer une fiche composite avec toutes les analyses
  if (isDossierRecord(r)) {
    const types = getRecordTypes(r);
    if (types.length === 0) { toast('Dossier vide', 'err'); return; }
    if (types.length === 1) {
      // Une seule analyse : utiliser le rendu standard avec les bons resultats
      r = { ...r, type: types[0], resultats: getRecordResultats(r, types[0]) };
    } else {
      // Plusieurs analyses : construire un faux record agrégé pour l'impression
      // buildAndPrint va appeler buildPrintSections pour chaque type
      const compositeResultats = { _types: types, _dossier: true };
      types.forEach(t => { compositeResultats[t] = getRecordResultats(r, t); });
      buildAndPrint({ ...r, type: 'Dossier', resultats: compositeResultats });
      return;
    }
  }
  // Vérification simple : si la fiche a un montant > 0 mais aucun résultat exploitable
  const hasAnyValue = Object.values(r.resultats || {}).some(v => {
    if (!v) return false;
    if (typeof v === 'object') return !!(v.valeur || v.resultat || v.titre);
    return typeof v === 'string' && v.trim() !== '';
  });
  if (r.montant > 0 && !hasAnyValue) {
    const ok = confirm('⚠ Cette fiche a été facturée (' + r.montant.toLocaleString('fr-FR') + ' FCFA) mais ne contient aucun résultat rempli.\n\nVoulez-vous imprimer quand même ?');
    if (!ok) return;
  }
  buildAndPrint(r);
}

function printCurrentForm(type) {
  const p = getPatient();
  if (!validatePatient(p)) return;
  const resultats = collectResults(type);
  if (!confirmerSiExamensManquants(type, resultats)) return;
  buildAndPrint({ type, patient: p, resultats, montant: parseInt(document.getElementById('montant-preview')?.dataset?.montant||'0'), savedAt: new Date().toISOString() });
}

// Échappe les caractères HTML spéciaux pour éviter toute injection XSS
function escHTML(s) {
  return (s || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}



// ============================================================
// ✅ v13.35 — RÉFÉRENCE UNIQUE DOCUMENT
// Format : CPM-XXXX-YYYY (4 chars alphanumériques + année)
// Générée une fois par dossier, stockée dans patient.ref_doc
// ============================================================
function generateRefUnique() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I pour lisibilité
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'CPM-' + code + '-' + new Date().getFullYear();
}

function getOrCreateRef(record) {
  // Réutiliser la ref existante si déjà générée
  if (record?.patient?.ref_doc) return record.patient.ref_doc;
  const ref = generateRefUnique();
  // Stocker dans le record en mémoire (persisté au prochain save)
  if (record?.patient) record.patient.ref_doc = ref;
  return ref;
}

// ✅ v13.35 — Signature cursive SVG à partir du nom
// Génère un paraphe stylisé illisible mais unique par nom
function generateSignatureSVG(name, width=160, height=45) {
  if (!name || name === '—') return '';
  // Seed déterministe depuis le nom
  let seed = 0;
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0xffffffff;
  const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

  const cx = width / 2, cy = height / 2;
  const paths = [];

  // Trait principal — ondulation centrale
  const pts = [];
  const steps = 10 + Math.floor(rng() * 6);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = 12 + t * (width - 24);
    const amp = 8 + rng() * 10;
    const freq = 1.5 + rng() * 1.5;
    const y = cy + Math.sin(t * Math.PI * freq + rng() * 2) * amp * (1 - Math.abs(t - 0.5) * 0.8);
    pts.push([x, y]);
  }
  // Convertir en courbe de Bézier
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i-1], cur = pts[i];
    const cpx = (prev[0] + cur[0]) / 2;
    d += ` Q ${cpx.toFixed(1)} ${prev[1].toFixed(1)} ${cur[0].toFixed(1)} ${cur[1].toFixed(1)}`;
  }
  paths.push(`<path d="${d}" fill="none" stroke="#1e3a8a" stroke-width="${1.2 + rng() * 0.8}" stroke-linecap="round"/>`);

  // Boucle montante (début de prénom)
  const loopX = 12 + rng() * 20;
  const loopH = 15 + rng() * 12;
  paths.push(`<path d="M ${loopX} ${cy+5} C ${loopX-4} ${cy-loopH} ${loopX+10} ${cy-loopH+4} ${loopX+6} ${cy+2}" fill="none" stroke="#1e3a8a" stroke-width="1.1" stroke-linecap="round"/>`);

  // Trait de soulignement partiel
  const ulStart = 8 + rng() * 10;
  const ulEnd = width - 8 - rng() * 15;
  const ulY = cy + 14 + rng() * 6;
  paths.push(`<path d="M ${ulStart} ${ulY} Q ${(ulStart+ulEnd)/2} ${ulY + (rng()-0.5)*4} ${ulEnd} ${ulY - rng()*3}" fill="none" stroke="#1e3a8a" stroke-width="0.8" stroke-linecap="round"/>`);

  // Point final (paraphe)
  const dotX = ulEnd + 3 + rng() * 5;
  paths.push(`<circle cx="${dotX}" cy="${ulY - 1}" r="${0.8 + rng() * 0.6}" fill="#1e3a8a"/>`);

  // Initiales lisibles en petite taille (optionnel — donne l'ancrage)
  const initials = name.split(/[\s._-]+/).map(w => w[0]||'').join('').substring(0,2).toUpperCase();
  paths.push(`<text x="10" y="${cy+3}" font-family="Georgia,serif" font-style="italic" font-size="9" fill="#1e3a8a" opacity="0.35">${initials}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.join('')}</svg>`;
}
// ============================================================
// QR CODE — Génération asynchrone via QRCode.js (CDN)
// ============================================================

function generateQRDataURL(text, size = 120) {
  return new Promise((resolve) => {
    if (typeof QRCode === 'undefined') { resolve(''); return; }
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
    document.body.appendChild(div);
    try {
      new QRCode(div, {
        text: text.substring(0, 900), // QR supporte ~900 chars mode alphanum
        width: size, height: size,
        colorDark: '#1e3a8a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch(e) { document.body.removeChild(div); resolve(''); return; }
    // QRCode.js crée le canvas de façon synchrone mais on attend un tick
    requestAnimationFrame(() => {
      const canvas = div.querySelector('canvas');
      const url = canvas ? canvas.toDataURL('image/png') : '';
      document.body.removeChild(div);
      resolve(url);
    });
  });
}

async function buildAndPrint(r) {
  // Construire le HTML de rendu d'impression
  const p = r.patient;
  const res = r.resultats || {};
  const now = new Date();

  let html = `
    <style>
      .print-empty-row td { background: #fafafa !important; }
      .print-empty-row td:nth-child(2) { border-bottom: 1px dotted #9ca3af !important; min-width: 80px; }
    </style>
    <div class="print-header">
      <div class="print-header-bar"></div>
      <div class="print-header-content">
        <div class="print-logo">
          <svg viewBox="0 0 64 64" width="34" height="34" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="31" fill="#1e3a8a"/>
            <path d="M32 16c-5.5 0-10 4.2-10 10.5 0 4.8 2.9 9 7 11.3v3.4c-4.5 1-8 3.6-9.4 7h25c-1.4-3.5-5-6-9.6-7v-3.4c4.1-2.3 7-6.5 7-11.3C42 20.2 37.5 16 32 16z" fill="#fff"/>
            <circle cx="32" cy="14" r="3.4" fill="#fff"/>
            <path d="M27 12.5c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
            <rect x="46" y="40" width="3.2" height="11" rx="1.2" fill="#fbbf24"/>
            <rect x="41.4" y="44.4" width="11" height="3.2" rx="1.2" fill="#fbbf24"/>
          </svg>
        </div>
        <div>
          <div class="print-center-name">CPMI DE GRAND-BASSAM</div>
          <div class="print-center-sub">Centre de Protection Mère et Infantile · Laboratoire d'analyses médicales</div>
          <div class="print-center-addr">Grand-Bassam, Côte d'Ivoire · Tél : — · Email : —</div>
        </div>
        <div class="print-type-badge">${getDisplayType(r).toUpperCase()}</div>
      </div>
      <div class="print-header-bar bottom"></div>
    </div>

    <div class="print-patient-card">
      <table class="print-patient-table">
        <tr>
          <td><b>N° Dossier</b><br><span class="print-dossier">${escHTML(p.dossier)||'—'}</span></td>
          <td><b>Patient</b><br><strong style="text-transform:uppercase;font-size:14px;letter-spacing:.3px">${escHTML(p.nom)||'—'}</strong></td>
          <td><b>Âge / Sexe</b><br>${escHTML(p.age)||'—'} ans / ${p.sexe==='M'?'Masculin':p.sexe==='F'?'Féminin':'—'}</td>
          <td><b>Date prélèvement</b><br>${p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}</td>
        </tr>
        <tr>
          <td><b>Prescripteur</b><br>${escHTML(p.medecin)||'—'}</td>
          <td><b>Service</b><br>${escHTML(p.service)||'—'}</td>
          <td colspan="2"><b>Renseignements cliniques</b><br>${escHTML(p.clinique)||'—'}</td>
        </tr>
      </table>
    </div>`;

  // ── ✅ v13.35 — Double QR + UUID + technicien ───────────────
  const shareToken = p?.share_token;
  const refDoc     = getOrCreateRef(r);
  const techName   = (typeof _currentUser !== 'undefined' && _currentUser?.username) || '—';

  // QR 1 : vérification en ligne (share_token) ou infos dossier
  const qrContent1 = shareToken
    ? `${APP_PUBLIC_URL}?share=${shareToken}`
    : `CPMI Grand-Bassam | Ref: ${refDoc} | Dossier: ${p?.dossier||'—'} | Patient: ${(p?.nom||'').toUpperCase()} | Date: ${p?.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}`;
  // QR 2 : infos patient compactes (toujours disponible offline)
  const qrContent2 = `CPMI GRAND-BASSAM\nREF: ${refDoc}\nDOSSIER: ${p?.dossier||'—'}\nPATIENT: ${(p?.nom||'').toUpperCase()}\nANALYSE: ${getDisplayType(r)}\nDATE: ${p?.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}\nTECH: ${techName}`;

  const [qrUrl1, qrUrl2] = await Promise.all([
    generateQRDataURL(qrContent1, 90),
    generateQRDataURL(qrContent2, 90),
  ]);

  html += `<div style="float:right;margin:-90px 0 10px 12px;text-align:center;display:flex;flex-direction:column;gap:4px">
    ${qrUrl1 ? `<div style="text-align:center">
      <img src="${qrUrl1}" width="72" height="72" style="display:block;border:2px solid #1e3a8a;border-radius:4px;margin:0 auto">
      <div style="font-size:7px;color:#1e3a8a;font-weight:700;margin-top:1px">${shareToken ? 'Vérifier en ligne' : 'Info dossier'}</div>
    </div>` : ''}
    ${qrUrl2 ? `<div style="text-align:center;margin-top:3px">
      <img src="${qrUrl2}" width="72" height="72" style="display:block;border:1px solid #9ca3af;border-radius:4px;margin:0 auto">
      <div style="font-size:7px;color:#6b7280;margin-top:1px">Infos patient</div>
    </div>` : ''}
    <div style="font-size:7px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:3px;margin-top:1px">Réf. ${refDoc}</div>
  </div>`;

  // ── Sections selon le type ──────────────────────────────────
  html += buildPrintSections(r.type, res, r.patient);

  // ✅ v13.35 — Cases vides pour examens cochés sans résultats
  if (isDossierRecord(r)) {
    (res._types || []).forEach(t => {
      const coches = res._examens_coches?.[t] || [];
      const typeRes = res[t] || {};
      const emptyHtml = buildEmptyRows(t, typeRes, coches);
      if (emptyHtml) {
        html += `<div class="print-composite-section" style="margin-top:12px">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;border-bottom:1.5px solid #d1d5db;padding-bottom:3px;margin-bottom:6px">${t} — à compléter</div>
          ${emptyHtml}
        </div>`;
      }
    });
  } else {
    const coches = res._examens_coches || [];
    html += buildEmptyRows(r.type, res, Array.isArray(coches) ? coches : Object.values(coches).flat());
  }

  // ✅ v12.4 — Composition BPN (forfait fixe)
  if (Array.isArray(res['_bpn_inclus']) && res['_bpn_inclus'].length) {
    html += `<div class="print-section">
      <div class="print-section-title">Composition du bilan prénatal — forfait ${(r.montant||20000).toLocaleString('fr-FR')} FCFA</div>
      <table class="print-table"><tbody>
      ${res['_bpn_inclus'].map(l => `<tr><td style="width:26px;text-align:center;color:#15803d">☑</td><td>${escHTML(l)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ✅ v12.4 — Examens demandés non renseignés → lignes vides à compléter
  const printPending = getPendingCheckedExams(r, r.type);
  if (printPending.length) {
    html += `<div class="print-section">
      <div class="print-section-title">Examens demandés — résultats à compléter</div>`;
    printPending.forEach(ex => {
      html += `<table class="print-table" style="margin-bottom:8px">
        <thead><tr><th>${escHTML(ex.label)}</th><th>Résultat</th><th>Unité</th><th>Valeurs normales</th></tr></thead>
        <tbody>
        ${ex.rows.map(pr => `<tr><td>${escHTML(pr.name)}</td><td style="min-width:70px">&nbsp;</td><td>${escHTML(pr.unit)}</td><td style="color:#64748b">${escHTML(pr.ref)}</td></tr>`).join('')}
        </tbody></table>`;
    });
    html += `</div>`;
  }

  // ── Pied de page ────────────────────────────────────────────
  html += `
    <div class="print-footer">
      <div class="print-footer-bar"></div>
      <div class="print-footer-content">
        <div class="print-sig-box" style="flex:2">
          <div class="print-sig-label">Commentaire du technicien</div>
          <div class="print-sig-zone" style="height:22mm;padding:4px 8px;line-height:1.8">
            <div style="border-bottom:1px solid #c7d9f9;margin-bottom:4px"></div>
            <div style="border-bottom:1px solid #c7d9f9;margin-bottom:4px"></div>
            <div style="border-bottom:1px solid #c7d9f9"></div>
          </div>
        </div>
        <div class="print-sig-box" style="flex:1">
          <div class="print-sig-label">Signature du technicien</div>
          <div class="print-sig-zone" style="height:18mm;padding:2px 4px;display:flex;flex-direction:column;justify-content:center">
            ${generateSignatureSVG(techName, 150, 38)}
            <div style="font-size:7pt;color:#1e3a8a;font-weight:600;margin-top:2px;letter-spacing:.3px">${techName}</div>
            <div style="font-size:6.5pt;color:#9ca3af">Technicien de laboratoire · CPMI Grand-Bassam</div>
          </div>
        </div>
        <div class="print-meta">
          Édité le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}<br>
          CPMI de Grand-Bassam<br>
          <span style="font-size:6.5pt;font-weight:700;color:#1e3a8a">Réf. ${refDoc || record?.patient?.ref_doc || '—'}</span>
        </div>
      </div>
      <div class="print-confidential">
        Document officiel du laboratoire CPMI Grand-Bassam · Réf. ${refDoc || record?.patient?.ref_doc || '—'}
        · Résultats à interpréter en contexte clinique par un professionnel de santé.
        · Document confidentiel — usage médical exclusif. Toute reproduction non autorisée est interdite.
      </div>
    </div>`;

  // Injecter et imprimer
  let printDiv = document.getElementById('print-render');
  if (!printDiv) {
    printDiv = document.createElement('div');
    printDiv.id = 'print-render';
    document.body.appendChild(printDiv);
  }
  printDiv.innerHTML = html;
  window.print();
}


// ✅ v13.35 — Construire les lignes vides pour les examens cochés sans résultats
function buildEmptyRows(type, res, cochesList) {
  if (!cochesList || !cochesList.length) return '';
  // Paramètres connus pour ce type avec leurs unités et valeurs normales
  const PARAMS_META = {};
  if (typeof HEMA_PARAMS !== 'undefined') HEMA_PARAMS.forEach(p => { PARAMS_META[p.name] = {unit: p.unit||'', ref: p.ref||''}; });
  if (typeof HEMA_FL !== 'undefined')     HEMA_FL.forEach(p => { PARAMS_META[p.name] = {unit: p.unit||'', ref: p.ref||''}; });
  if (typeof BIO_GLUCIDES !== 'undefined') [...(BIO_GLUCIDES||[]),...(BIO_REIN||[]),...(BIO_FOIE||[]),...(BIO_LIPIDES||[]),...(BIO_IONO||[]),...(BIO_FER||[]),...(BIO_HORM||[]),...(BIO_AUTRE||[])].forEach(p => { if(p) PARAMS_META[p.name] = {unit:p.unit||'', ref:p.ref||''}; });

  // Filtrer les examens cochés qui n'ont pas de résultat saisi
  const paramsTypes = {
    'Hématologie': [...(typeof HEMA_PARAMS!=='undefined'?HEMA_PARAMS:[]), ...(typeof HEMA_FL!=='undefined'?HEMA_FL:[])],
    'Biochimie':   [...(typeof BIO_GLUCIDES!=='undefined'?BIO_GLUCIDES:[]),...(typeof BIO_REIN!=='undefined'?BIO_REIN:[]),...(typeof BIO_FOIE!=='undefined'?BIO_FOIE:[]),...(typeof BIO_LIPIDES!=='undefined'?BIO_LIPIDES:[]),...(typeof BIO_IONO!=='undefined'?BIO_IONO:[])],
  };
  const knownParams = (paramsTypes[type]||[]).map(p=>p.name);

  // Examens cochés sans valeur
  const empty = cochesList.filter(label => {
    // Vérifier si ce label correspond à un paramètre connu sans résultat
    const hasResult = Object.keys(res).some(k => {
      if (k.startsWith('_')) return false;
      if (k === label) return res[k] && (res[k].valeur || res[k].resultat);
      return false;
    });
    return !hasResult;
  });

  if (!empty.length) return '';

  const rows = empty.map(label => {
    const meta = PARAMS_META[label] || {};
    return `<tr class="print-empty-row">
      <td>${label}</td>
      <td style="min-width:60px;border-bottom:1px dotted #9ca3af">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
      <td style="color:#9ca3af;font-size:9pt">${meta.unit||''}</td>
      <td style="color:#9ca3af;font-size:9pt">${meta.ref||''}</td>
    </tr>`;
  }).join('');

  return `<div class="print-section">
    <div class="print-section-title" style="color:#6b7280;border-color:#d1d5db">📋 Résultats à compléter manuellement</div>
    <table class="print-table" style="opacity:.85">
      <thead><tr><th>Examen</th><th>Résultat</th><th>Unité</th><th>Valeurs normales</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:7.5pt;color:#9ca3af;font-style:italic;margin-top:4px">
      Ces examens ont été demandés — résultats à saisir manuellement après analyse.
    </p>
  </div>`;
}
function buildPrintSections(type, res, pat) {
  const profile = profileFromPatient(pat || {}); // ✅ v13.17 — valeurs normales
  let html = '';

  // Dossier composite (impression multi-analyses) : itérer sur chaque type
  if (type === 'Dossier' && res?._dossier && res._types) {
    res._types.forEach(t => {
      const typeRes = res[t] || {};
      html += `<div class="print-composite-section" style="margin-top:20px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--cpmi-deep);border-bottom:2px solid var(--cpmi-deep);padding-bottom:4px;margin-bottom:8px">${t}</div>`;
      html += buildPrintSections(t, typeRes, r.patient);
      html += '</div>';
    });
    return html;
  }

  const section = (title, content) => {
    if (!content) return '';
    return `<div class="print-section"><div class="print-section-title">${title}</div>${content}</div>`;
  };

  const table = (headers, rows) => {
    if (!rows.length) return '';
    return `<table class="print-table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map((c,i)=>{
        const cls = c&&c.includes&&(c.includes('Élevé')||c.includes('⚠'))?'print-hi':c&&c.includes&&(c.includes('Bas'))?'print-lo':c&&c.includes&&(c.includes('Normal')||c.includes('✓'))?'print-ok':'';
        return `<td class="${cls}">${c||''}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>`;
  };

  const row = (label, val, unit='', comment='') =>
    val ? `<tr><td>${label}</td><td><b>${val}</b></td><td>${unit}</td><td>${comment}</td></tr>` : '';

  if (type === 'Hématologie') {
    // NFS + FL
    const nfsRows = [];
    [...HEMA_PARAMS, ...HEMA_FL].forEach(p => {
      const v = res[p.name];
      if (!v || !v.valeur) return;
      nfsRows.push([p.name, v.valeur, v.unite||'/µL', refDisplayFor(p, profile) || '—', v.interp||'']); // ✅ v13.25
    });
    if (nfsRows.length) html += section('🩸 NFS — Numération Formule Sanguine', table(['Paramètre','Valeur','Unité','Valeurs normales'], nfsRows.map(r => r.slice(0,4))));

    // Électrophorèse Hb
    const ephbRows = [];
    ['Hb A','Hb A2','Hb F','Hb S','Hb C','Hb D','Hb E'].forEach(n => {
      const v = res[n]; if (v&&v.valeur) ephbRows.push([n, v.valeur+'%', '', v.interp||'']);
    });
    const profil = res['Profil Hb'];
    const commentHb = res['Commentaire Hb'];
    if (ephbRows.length || profil) {
      let c = table(['Fraction','%','','Commentaire'], ephbRows);
      if (profil) c += `<p class="print-note"><b>Profil :</b> ${profil}</p>`;
      if (commentHb) c += `<p class="print-note print-italic">${commentHb}</p>`;
      html += section('🔬 Électrophorèse de l\'Hémoglobine', c);
    }

    // GE / Parasitologie
    const ge = { res:res['GE - Résultat'], espece:res['GE - Espèce'], para:res['GE - Parasitémie (%)'], densite:res['GE - Densité parasitaire (/µL)'], stade:res['GE - Stade'], tdr:res['GE - TDR'], obs:res['GE - Observation'] };
    if (ge.res || ge.tdr || ge.espece) {
      const geRows = [];
      if (ge.res)    geRows.push(['Résultat GE', ge.res, '', '']);
      if (ge.tdr)    geRows.push(['TDR Paludisme', ge.tdr, '', '']);
      if (ge.espece) geRows.push(['Espèce plasmodiale', ge.espece, '', '']);
      if (ge.para)   geRows.push(['Parasitémie', ge.para, '%', '']);
      if (ge.densite) geRows.push(['Densité parasitaire', ge.densite, '/µL', '']);
      if (ge.stade)  geRows.push(['Stade', ge.stade, '', '']);
      if (ge.obs)    geRows.push(['Observation', ge.obs, '', '']);
      html += section('🦟 Goutte Épaisse / Parasitologie', table(['Paramètre','Résultat','Unité','Observation'], geRows));
    }

  }

  else if (type === 'Immuno-Sérologie') {
    // ✅ v13.24 — Sérologie : tests séro + GS/Rh + CRP + SWF sur la même page
    // Tests sérologiques
    if (typeof SERO_TESTS !== 'undefined') {
      const seroRows = [];
      SERO_TESTS.forEach(t => {
        const v = res[t.name]; if (!v) return;
        const val = v.resultat || v.valeur || ''; if (!val) return;
        const numVal = v.valeur && v.valeur !== val ? v.valeur : '';
        seroRows.push([t.name, val, numVal, v.obs||'']);
      });
      if (seroRows.length) html += section('💉 Immuno-Sérologie',
        table(['Test','Résultat','Valeur numérique','Commentaire'], seroRows));
      if (res['sero_obs'] || res['Observations']) {
        const obs = res['sero_obs'] || res['Observations'];
        html += `<p class="print-note">${escHTML(obs)}</p>`;
      }
    }
    // Groupe sanguin (si renseigné)
    const gsAboS = res['Groupe ABO'] || res['GS - ABO'] || '';
    const gsRhS  = res['Rhésus']     || res['GS - Rhésus'] || '';
    const gsObsS = res['Commentaire GS'] || '';
    if (gsAboS || gsRhS) {
      const gsRows = [];
      if (gsAboS) gsRows.push(['Groupe ABO', gsAboS, '', '']);
      if (gsRhS)  gsRows.push(['Rhésus',     gsRhS,  '', '']);
      let gsHtml = table(['Paramètre','Résultat','',''], gsRows);
      if (gsObsS) gsHtml += `<p class="print-note">${escHTML(gsObsS)}</p>`;
      html += section('🩸 Groupe Sanguin ABO / Rhésus', gsHtml);
    }
    // CRP
    const crpValS = res['CRP - Valeur'];
    if (crpValS) {
      const crpLabel = crpValS === 'neg' ? 'Négatif (< 6 mg/L)' : crpValS + ' mg/L';
      const crpCls   = crpValS === 'neg' ? 'print-ok' : 'print-hi';
      html += section('🔥 CRP — Protéine C-réactive (Latex)', `
        <table class="print-table"><thead><tr><th>Test</th><th>Résultat</th><th>Valeurs normales</th></tr></thead>
        <tbody><tr><td>CRP Latex</td><td class="${crpCls}"><b>${crpLabel}</b></td><td>&lt; 6 mg/L</td></tr></tbody></table>`);
    }
    // SWF
    const _widS = widalReport(res);
    if (_widS.show) {
      const widalRowsS = _widS.rows.map(w => [w.name, w.titre, w.cinetique||'—', w.interp||'—']);
      let wHtml = widalRowsS.length ? table(['Antigène','Titre','Cinétique','Commentaire'], widalRowsS) : '';
      if (_widS.concl) {
        const cls = _widS.concl.includes('ÉTAT') ? 'print-hi' : _widS.concl.includes('DÉBUT') ? 'print-warn' : 'print-note';
        wHtml += `<p class="print-conclusion ${cls}">${escHTML(_widS.concl.replace(/^[🔴🟠🟡⚪]\s*/,''))}</p>`;
      }
      html += section('🦠 Sérodiagnostic de Widal & Félix', wHtml);
    }
  }

  else {
    // Rendu générique pour tous les autres types
    // Map nom de paramètre → id (pour getUnit)
    const _paramIdMap = {};
    const _paramObjMap = {}; // ✅ v13.17 — étendu à tous les catalogues (v13.19)
    const _allCatalogues = [
      ...(typeof BIO_GLUCIDES!=='undefined'?[...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE]:[]),
      ...(typeof BPN_NFS!=='undefined'?[...BPN_NFS]:[]),
      ...(typeof BPN_FL!=='undefined'?[...BPN_FL]:[]),
      ...(typeof HEMA_PARAMS!=='undefined'?[...HEMA_PARAMS]:[]),
      ...(typeof HEMA_FL!=='undefined'?[...HEMA_FL]:[]),
      ...(typeof SERO_TESTS!=='undefined'?SERO_TESTS:[]),
      ...(typeof getCatalogueComplet==='function'?getCatalogueComplet():[]),
    ];
    _allCatalogues.forEach(p => {
      if (p && p.name) { _paramIdMap[p.name] = p.id; _paramObjMap[p.name] = p; }
    });

    const rows = [];
    Object.entries(res).forEach(([k,v]) => {
      if (!v || k.startsWith('_')) return; // ✅ v12 — ignorer clés techniques
      if (typeof v === 'object') {
        const val = v.valeur || v.resultat || '';
        const pid = _paramIdMap[k];
        if (val) rows.push([k, val, pid ? getUnit(pid, v.unite||'') : (v.unite||''), refDisplayFor(_paramObjMap[k], profile) || '', v.interp||v.obs||'']);
      } else if (typeof v === 'string' && v && v !== '—' && !k.startsWith('ABG_') && !k.startsWith('AFG_')) {
        rows.push([k, v, '', '', '']);
      }
    });
    if (rows.length) html += section('📋 Résultats', table(['Paramètre','Résultat','Unité','Valeurs normales'], rows.map(r => r.slice(0,4))));

    // Antibiogramme si bactériologie
    if (type === 'Bactériologie') {
      const abgRows = [];
      ABG_ANTIBIOS.forEach(ab => {
        const v = res['ABG_'+ab];
        if (v && v !== 'nd') abgRows.push([ab, v]);
      });
      if (abgRows.length) html += section('💊 Antibiogramme', table(['Antibiotique','Résultat'], abgRows));
      const afg = []; AFG_ANTIFONGIQUES.forEach(af => { const v=res['AFG_'+af]; if(v&&v!=='nd') afg.push([af,v]); });
      if (afg.length) html += section('💊 Antifongigramme', table(['Antifongique','Résultat'], afg));
    }
  }

  return html;
}


// ============================================================
// REÇU DE PAIEMENT IMPRIMABLE
// ============================================================

async function printReceipt(id) {
  const record = getDB().find(r => r.id === id);
  if (!record) { toast('Dossier introuvable', 'err'); return; }
  await ensureFull(record); // ✅ v13.5 — détail complet avant le reçu

  const p = record.patient || {};
  const types = getRecordTypes(record);
  const now = new Date();
  const ref = typeof getTarifsRef === 'function' ? getTarifsRef() : {};
  const catalogue = getCatalogueComplet();

  // Construire les lignes du reçu
  const lignes = [];
  let totalCalcule = 0;

  types.forEach(type => {
    const TYPE_TO_TAB = {
      'Hématologie':'hema','Biochimie':'bio','Bactériologie':'bacterio',
      'Immuno-Sérologie':'sero','Parasitologie':'parasito','Groupe sanguin':'gs',// BPN supprimé v13.21
    };
    const tabKey = TYPE_TO_TAB[type] || 'hema';
    // Examens cochés enregistrés dans le dossier
    const examens = isDossierRecord(record)
      ? (record.resultats?._examens_coches?.[type] || [])
      : (record.resultats?.['_examens_coches'] || []);
    // ✅ v13.12 — prix EXACTS saisis sur la fiche (prioritaires sur les tarifs)
    const prixMap = isDossierRecord(record)
      ? (record.resultats?._examens_prix?.[type] || {})
      : (record.resultats?.['_examens_prix'] || {});

    if (examens.length) {
      examens.forEach(label => {
        const ex = catalogue.find(e => e.label === label);
        const prix = (prixMap[label] !== undefined)
          ? prixMap[label]
          : (ex ? (ref[ex.id] !== undefined ? ref[ex.id] : ex.prix || 0) : 0);
        lignes.push({ label, prix, type });
        totalCalcule += prix;
      });
    } else {
      lignes.push({ label: type, prix: null, type });
    }
  });

  const montantAffiche = record.montant || totalCalcule;

  // QR code pour le reçu
  const qrText = `CPMI Grand-Bassam\nREÇU N°${record.id}\nDossier: ${p.dossier||'—'}\nPatient: ${(p.nom||'').toUpperCase()}\nMontant: ${montantAffiche.toLocaleString('fr-FR')} FCFA`;
  const qrUrl = await generateQRDataURL(qrText, 90);

  const receiptNum = String(record.id).padStart(6, '0');
  const dateHeure = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'});

  // ✅ v13.34 — Reçu modernisé : en-tête avec logo SVG inline,
  //   séparations visuelles, total en vedette, QR en bas
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Courier New',monospace; font-size:12px; width:80mm; margin:0 auto; padding:0; background:#fff; }
  .receipt { padding:10px 10px 6px; }
  .hdr-bar { height:5px; background:linear-gradient(to right,#1e3a8a,#2563eb,#cba135); }
  .hdr { padding:8px 0 6px; text-align:center; border-bottom:2px solid #000; margin-bottom:0; }
  .hdr-logo { display:inline-block; width:36px; height:36px; margin-bottom:3px; }
  .hdr-name { font-weight:900; font-size:13px; letter-spacing:.5px; }
  .hdr-sub  { font-size:9px; color:#444; }
  .hdr-addr { font-size:8px; color:#666; font-style:italic; }
  .title-bar { background:#1e3a8a; color:#fff; text-align:center; font-weight:700; font-size:11px; letter-spacing:2px; padding:5px 0; margin:6px 0; }
  .meta { font-size:9.5px; margin-bottom:4px; }
  .meta-row { display:flex; justify-content:space-between; padding:1.5px 0; }
  .meta-row .lbl { color:#444; }
  .meta-row .val { font-weight:600; }
  .sep { border-top:1px dashed #555; margin:5px 0; }
  .sep-solid { border-top:2px solid #000; margin:5px 0; }
  .section-title { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#1e3a8a; margin:4px 0 2px; }
  .item-row { display:flex; justify-content:space-between; font-size:10px; padding:1.5px 0; }
  .item-name { flex:1; padding-right:6px; }
  .item-type { font-size:8.5px; color:#666; padding-right:8px; }
  .item-prix { font-weight:500; white-space:nowrap; }
  .total-box { background:#f0f5ff; border:1.5px solid #1e3a8a; border-radius:3px; padding:6px 10px; margin:6px 0; display:flex; justify-content:space-between; align-items:center; }
  .total-lbl { font-weight:700; font-size:11px; }
  .total-val { font-weight:900; font-size:16px; color:#1e3a8a; }
  .qr-section { text-align:center; margin-top:6px; padding-top:5px; border-top:1px dashed #aaa; }
  .qr-section img { width:70px; height:70px; }
  .qr-ref { font-size:8px; color:#666; margin-top:2px; font-style:italic; }
  .footer-msg { text-align:center; font-size:9px; color:#666; font-style:italic; margin-top:5px; }
  .footer-bar { height:3px; background:linear-gradient(to right,#cba135,#1e3a8a); margin-top:8px; }
  @media print { body { width:100%; } }
</style>
</head><body>
  <div class="hdr-bar"></div>
  <div class="receipt">
  <div class="hdr">
    <div class="hdr-logo">
      <svg viewBox="0 0 64 64" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="31" fill="#1e3a8a"/>
        <path d="M32 16c-5.5 0-10 4.2-10 10.5 0 4.8 2.9 9 7 11.3v3.4c-4.5 1-8 3.6-9.4 7h25c-1.4-3.5-5-6-9.6-7v-3.4c4.1-2.3 7-6.5 7-11.3C42 20.2 37.5 16 32 16z" fill="#fff"/>
        <circle cx="32" cy="14" r="3.4" fill="#fff"/>
        <rect x="46" y="40" width="3.2" height="11" rx="1.2" fill="#fbbf24"/>
        <rect x="41.4" y="44.4" width="11" height="3.2" rx="1.2" fill="#fbbf24"/>
      </svg>
    </div>
    <div class="hdr-name">CPMI DE GRAND-BASSAM</div>
    <div class="hdr-sub">Centre de Protection Mère et Infantile</div>
    <div class="hdr-sub">Laboratoire d'analyses médicales</div>
    <div class="hdr-addr">Grand-Bassam, Côte d'Ivoire</div>
  </div>
  <div class="title-bar">REÇU DE PAIEMENT</div>

  <!-- Infos reçu -->
  <div class="row"><span>N° Reçu :</span><span class="bold">${receiptNum}</span></div>
  <div class="row"><span>Date :</span><span>${dateHeure}</span></div>
  <div class="row"><span>Agent :</span><span>${record.createdBy || '—'}</span></div>
  <div class="line"></div>

  <!-- Patient -->
  <div class="bold" style="margin-bottom:3px">PATIENT</div>
  <div class="row"><span>Nom :</span><span class="bold">${escHTML((p.nom||'').toUpperCase())}</span></div>
  <div class="row"><span>N° Dossier :</span><span>${escHTML(p.dossier||'—')}</span></div>
  <div class="row"><span>Âge / Sexe :</span><span>${escHTML(p.age||'—')} ans / ${p.sexe||'—'}</span></div>
  <div class="row"><span>Prescripteur :</span><span>${escHTML(p.medecin||'—')}</span></div>
  <div class="line"></div>

  <!-- Détail analyses -->
  <div class="bold" style="margin-bottom:3px">DÉTAIL DES ANALYSES</div>
  ${lignes.map(l => `
  <div class="row">
    <span style="flex:1;max-width:55mm">${escHTML(l.label)}</span>
    <span>${l.prix !== null ? l.prix.toLocaleString('fr-FR') + ' F' : '—'}</span>
  </div>`).join('')}
  <div class="double-line"></div>

  <!-- Total -->
  <div class="row total-row">
    <span>TOTAL PAYÉ :</span>
    <span>${montantAffiche.toLocaleString('fr-FR')} FCFA</span>
  </div>
  <div class="line"></div>

  <!-- Mode paiement -->
  <div class="row"><span>Mode de paiement :</span><span>_________________</span></div>
  <div class="row small"><span>Signature caissier :</span><span>_________________</span></div>
  <div class="line"></div>

  <!-- QR code -->
  ${qrUrl ? `<div class="center" style="margin:6px 0">
    <img src="${qrUrl}" width="80" height="80">
    <div class="small">Scannez pour vérifier</div>
  </div>
  <div class="line"></div>` : ''}

  <!-- Pied -->
  <div class="center small" style="margin-top:4px">
    Merci de votre confiance<br>
    Ce reçu fait foi de paiement<br>
    CPMI Grand-Bassam
  </div>
</body></html>`;

  const win = window.open('', 'receipt', 'width=400,height=700,toolbar=no,scrollbars=yes');
  if (!win) { toast('Autorisez les pop-ups pour imprimer le reçu', 'err'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}


// ── Export CSV de l'historique filtré ────────────────────────────────
function exportHistoryCSV() {
  const db = getDB();
  if (!db.length) { toast('Aucune donnée à exporter', 'err'); return; }

  const headers = ['N° Dossier','Nom patient','Âge','Sexe','Date prélèvement',
    'Types analyses','Prescripteur','Montant (FCFA)','Saisi par','Date saisie'];

  const rows = db.map(r => {
    const p = r.patient || {};
    return [
      p.dossier || '',
      (p.nom || '').toUpperCase(),
      p.age || '',
      p.sexe || '',
      p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '',
      getRecordTypes(r).join(' + ') || r.type || '',
      p.medecin || '',
      r.montant || 0,
      r.createdBy || '',
      r.savedAt ? new Date(r.savedAt).toLocaleDateString('fr-FR') : '',
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"');
  });

  const csv = [headers.map(h => '"'+h+'"').join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'LaboSaisie_Historique_' + new Date().toLocaleDateString('fr-FR').replace(/\//g,'-') + '.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('Export CSV réussi ✓', 'ok');
}

function printHistory() {
  _printData = null; // mode historique complet
  window.print();
}

// ============================================================
// EXPORT PDF
// ============================================================

async function exportPDF(id) {
  try {
    const record = getDB().find(x => x.id === id);
    if (!record) { toast('Fiche introuvable', 'err'); return; }
    await ensureFull(record); // ✅ v13.5 — détail complet avant export PDF

    if (isDossierRecord(record)) {
      // ✅ v13.10 — Dossier unifié : PDF multi-pages (une page par analyse)
      const types = getRecordTypes(record);
      if (!types.length) { toast('Dossier vide', 'err'); return; }
      const analyses = types.map(t => ({ type: t, res: getRecordResultats(record, t) }));
      buildPDF(record, analyses);
    } else {
      buildPDF(record);
    }
  } catch(err) {
    console.error('exportPDF:', err);
    toast('Erreur PDF : ' + (err.message||err), 'err');
  }
}

// Export Excel d'une fiche depuis l'historique (par id) — c'était la fonction
// manquante qui empêchait le bouton ⬇ Excel de la table Historique de fonctionner.
async function exportRecord(id) {
  const record = getDB().find(x => x.id === id);
  if (!record) { toast('Fiche introuvable', 'err'); return; }
  if (!ensureExcelJSReady()) return;

  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Dossier ' + (record.patient?.dossier || '');

  const usedNamesR = new Set();
  try {
    if (isDossierRecord(record)) {
      const types = getRecordTypes(record);
      if (!types.length) { toast('Aucune analyse dans ce dossier', 'err'); return; }
      types.forEach(type => {
        const fakeRecord = { ...record, type, resultats: getRecordResultats(record, type) };
        buildProfessionalSheet(wb, fakeRecord, safeSheetName(type, usedNamesR));
      });
    } else {
      buildProfessionalSheet(wb, record, safeSheetName(getDisplayTypeShort(record), usedNamesR));
    }
  } catch(err) {
    console.error('buildProfessionalSheet:', err);
    toast('Erreur lors de la construction du fichier Excel : ' + (err.message || err), 'err');
    return;
  }

  // ✅ v13.34 — Onglet récapitulatif en première position
  try {
    const recap = wb.addWorksheet('Récapitulatif', { properties: { tabColor: { argb: 'FF1E3A8A' } } });
    const p = record.patient || {};
    recap.columns = [{width:28},{width:40}];
    const addR = (label, val, bold) => {
      const r = recap.addRow([label, val || '—']);
      r.getCell(1).font = { bold:true, color:{argb:'FF1E3A8A'}, size:10 };
      r.getCell(2).font = { bold:!!bold, size:10 };
      r.getCell(1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F0FE'}};
      r.getCell(2).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFF'}};
      r.getCell(1).border = r.getCell(2).border = {bottom:{style:'thin',color:{argb:'FFD0DCF7'}}};
    };
    // Titre
    recap.mergeCells('A1:B1');
    const t = recap.getCell('A1');
    t.value = 'CPMI DE GRAND-BASSAM — Résumé du dossier';
    t.font = {bold:true, size:13, color:{argb:'FFFFFFFF'}};
    t.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A8A'}};
    t.alignment = {horizontal:'center',vertical:'middle'};
    recap.getRow(1).height = 28;
    recap.addRow([]);
    addR('N° Dossier', p.dossier, true);
    addR('Patient', p.nom);
    addR('Date', p.date ? p.date.split('-').reverse().join('/') : '');
    addR('Âge / Sexe', [p.age ? p.age + ' ans' : '', p.sexe].filter(Boolean).join(' · '));
    addR('Service', p.service);
    addR('Médecin', p.medecin);
    addR('Analyses', getRecordTypes(record).join(', '));
    addR('Montant total', record.montant ? record.montant.toLocaleString('fr-FR') + ' FCFA' : '—', true);
    addR('Saisi par', record.createdBy);
    addR('Date enregistrement', record.savedAt ? new Date(record.savedAt).toLocaleString('fr-FR') : '');
    // Déplacer la feuille récap en premier
    wb.moveWorksheet('Récapitulatif', 0);
  } catch(e) { console.warn('recap sheet:', e); }

  await downloadWorkbook(wb, makeFilename(
    record.patient?.dossier, record.patient?.date,
    record.patient?.nom || 'PATIENT', 'Dossier'
  ));
  toast('Export Excel réussi ✓', 'ok');
}

// Export Excel multi-feuilles de TOUTES les fiches d'un même patient
// (même N° de dossier) — appelé depuis le bouton 📁 de l'historique,
// qui n'apparaît que lorsque ce dossier a plusieurs fiches enregistrées.
async function exportPatientComplet(dossier) {
  if (!ensureExcelJSReady()) return;
  await refreshDB();
  const db = getDB();
  const recs = db.filter(r => r.patient.dossier === dossier)
                 .sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));
  if (!recs.length) { toast('Aucune fiche trouvée pour ce dossier', 'err'); return; }

  const wb = new ExcelJS.Workbook();
  wb.creator = CENTRE;
  wb.title = 'Dossier complet ' + dossier;

  const usedNames = new Set();
  recs.forEach(r => {
    let base = getDisplayTypeShort(r).substring(0, 28) || 'Fiche';
    let sheetName = base;
    let n = 2;
    while (usedNames.has(sheetName)) { sheetName = (base + ' (' + n + ')').substring(0, 31); n++; }
    usedNames.add(sheetName);
    buildProfessionalSheet(wb, r, sheetName);
  });

  const nom = recs[0].patient.nom || 'PATIENT';
  await downloadWorkbook(wb, makeFilename(dossier, recs[0].patient.date, nom, 'Dossier-complet'));
  toast('Dossier complet exporté ✓ (' + recs.length + ' fiches)', 'ok');
}

async function exportPDFFromForm(type) {
  try {
  const p = getPatient();
  if (!validatePatient(p)) return;
  showLoading('Génération du PDF…'); // ✅ v13
  await refreshDB();
  // Chercher dans les dossiers unifiés ET les anciens formats
  let dossier = getDB().find(r => isDossierRecord(r) && r.patient?.dossier === p.dossier);
  if (dossier) {
    await ensureFull(dossier); // ✅ v13.5 — détail complet avant export PDF
    if (!confirmerSiExamensManquants(type, getRecordResultats(dossier, type))) return;
    // ✅ v13.10 — exporter TOUTES les analyses du dossier (une page chacune)
    const types = getRecordTypes(dossier);
    const analyses = types.map(t => ({ type: t, res: getRecordResultats(dossier, t) }));
    buildPDF(dossier, analyses);
  } else {
    let saved = getDB().find(r => r.type === type && r.patient?.dossier === p.dossier);
    if (saved) await ensureFull(saved);
    if (!saved) { toast('Enregistrez la fiche avant d\'exporter en PDF', 'err'); return; }
    if (!confirmerSiExamensManquants(type, saved.resultats)) return;
    buildPDF(saved);
  }
  } catch(err) { console.error('exportPDFFromForm:', err); toast('Erreur PDF : ' + (err.message||err), 'err'); }
}

async function buildPDF(r, analyses) {
  try {
  // Ordre des paramètres NFS pour le PDF (même ordre que l'écran)
  const HEMA_PARAMS_PRINT = HEMA_PARAMS.map(p => p.name);
  const HEMA_FL_PRINT     = HEMA_FL.map(p => p.name);

  // Protection contre CDN non chargé
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast('Bibliothèque PDF non disponible — vérifiez votre connexion internet', 'err');
    return;
  }
  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ✅ v12.3 — La police intégrée de jsPDF (Helvetica/WinAnsi) ne rend PAS
  // les emojis, superscripts (10⁶), ≥ ≤, flèches, etc. → caractères parasites.
  // On nettoie tout texte AVANT le rendu (titres, cellules, valeurs, unités).
  function pdfSafe(s) {
    if (s == null) return '';
    return String(s)
      .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≈/g, '~')
      .replace(/→/g, '->').replace(/←/g, '<-').replace(/↔/g, '<->')
      .replace(/[↑▲⬆↗]/g, '(+)').replace(/[↓▼⬇↘]/g, '(-)')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, m => '^' + '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(m))
      .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, m => '₀₁₂₃₄₅₆₇₈₉'.indexOf(m))
      .replace(/⁺/g, '+').replace(/⁻/g, '-').replace(/−/g, '-')
      .replace(/β/g, 'beta')
      // emojis, pictogrammes, symboles divers, sélecteurs de variante
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2500}-\u{25FF}\u{FE00}-\u{FE0F}\u{200D}\u{2705}\u{2713}\u{2717}\u{2716}\u{2714}]/gu, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
  // Interception globale : tout passe par pdfSafe sans toucher aux appels existants
  const _rawText = doc.text.bind(doc);
  doc.text = function(txt, x, yy, opts) {
    if (Array.isArray(txt)) txt = txt.map(pdfSafe);
    else txt = pdfSafe(txt);
    return _rawText(txt, x, yy, opts);
  };
  const _rawAutoTable = doc.autoTable.bind(doc);
  doc.autoTable = function(o) {
    if (o) {
      if (Array.isArray(o.head)) o.head = o.head.map(rw => rw.map(pdfSafe));
      if (Array.isArray(o.body)) o.body = o.body.map(rw => rw.map(c => Array.isArray(c) ? c : pdfSafe(c)));
    }
    return _rawAutoTable(o);
  };

  const p = r.patient;
  const W = 210; const MARGIN = 10; // ✅ v13.34 — marges réduites
  const profile = profileFromPatient(p); // ✅ v13.17 — valeurs normales
  const _paramByName = {};
  [...(typeof HEMA_PARAMS!=='undefined'?HEMA_PARAMS:[]), ...(typeof HEMA_FL!=='undefined'?HEMA_FL:[])].forEach(pp => { _paramByName[pp.name] = pp; });

  // ✅ v13.10 — Un dossier multi-analyses génère une PAGE par analyse.
  const _analyses = (Array.isArray(analyses) && analyses.length)
    ? analyses : [{ type: r.type, res: r.resultats || {} }];

  _analyses.forEach((__a, __i) => {
  const rType = __a.type;
  const res = __a.res || {};
  if (__i > 0) doc.addPage();
  let y = MARGIN;

  // ── En-tête bleu ─────────────────────────────────────────
  doc.setFillColor(30, 58, 138); // C_HEADER_BG
  doc.rect(0, 0, W, 26, 'F');

  // Liséré doré
  doc.setFillColor(203, 161, 53);
  doc.rect(0, 0, W, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('CPMI DE GRAND BASSAM', MARGIN + 18, 10);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text("Laboratoire d'analyses medicales - Grand-Bassam", MARGIN + 18, 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RESULTAT : ' + getDisplayType({ type: rType, resultats: res }).toUpperCase(), MARGIN + 18, 22);

  // Liseré bleu clair bas
  doc.setFillColor(96, 165, 250);
  doc.rect(0, 26, W, 1.5, 'F'); // ✅ v13.34

  // ── Logo CPMI — silhouette mère-enfant + croix dorée (dessin vectoriel natif) ──
  const lcx = MARGIN + 9, lcy = 13; // centre du cercle logo (✅ v13.34)
  doc.setFillColor(255, 255, 255);
  doc.circle(lcx, lcy, 8.2, 'F');

  doc.setFillColor(30, 58, 138); // silhouette en bleu profond CPMI
  // Tête (cercle)
  doc.circle(lcx, lcy - 4.3, 1.55, 'F');
  // Corps (triangle arrondi approximé par un polygone lissé)
  doc.setDrawColor(30, 58, 138);
  doc.setFillColor(30, 58, 138);
  doc.triangle(lcx - 3.4, lcy + 4.6, lcx + 3.4, lcy + 4.6, lcx, lcy - 2.0, 'F');
  // Petit arrondi de base pour adoucir le triangle
  doc.circle(lcx, lcy + 4.2, 0.9, 'F');

  // Croix médicale dorée, petite, en bas à droite du cercle (signature CPMI)
  doc.setFillColor(251, 191, 36);
  doc.roundedRect(lcx + 4.6, lcy + 2.0, 1.3, 4.0, 0.4, 0.4, 'F');
  doc.roundedRect(lcx + 3.1, lcy + 3.5, 4.0, 1.3, 0.4, 0.4, 'F');

  y = 30; // ✅ v13.34

  // ── Fiche patient ─────────────────────────────────────────
  doc.setFillColor(220, 232, 251);
  doc.rect(MARGIN, y, W - 2*MARGIN, 7, 'F');
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('IDENTIFICATION DU PATIENT', MARGIN + 2, y + 5);
  y += 9;

  doc.setFillColor(241, 245, 254);
  doc.rect(MARGIN, y, W - 2*MARGIN, 22, 'F');
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);

  const col1 = MARGIN + 2, col2 = MARGIN + 32, col3 = MARGIN + 95, col4 = MARGIN + 118;
  doc.text('N° Dossier', col1, y + 5); doc.setFont('helvetica','normal'); doc.text(p.dossier || '—', col2, y + 5);
  doc.setFont('helvetica','bold');
  doc.text('Date', col3, y + 5); doc.setFont('helvetica','normal'); doc.text((p.date || '—').split('-').reverse().join('/'), col4, y + 5);

  doc.setFont('helvetica','bold');
  doc.text('Patient', col1, y + 11); doc.setFont('helvetica','normal'); doc.text(p.nom || '—', col2, y + 11);
  doc.setFont('helvetica','bold');
  doc.text('Âge / Sexe', col3, y + 11); doc.setFont('helvetica','normal');
  doc.text((p.age ? p.age + ' ans' : '') + (p.sexe ? ' — ' + p.sexe : ''), col4, y + 11);

  doc.setFont('helvetica','bold');
  doc.text('Médecin', col1, y + 17); doc.setFont('helvetica','normal'); doc.text(p.medecin || '—', col2, y + 17);
  doc.setFont('helvetica','bold');
  doc.text('Service', col3, y + 17); doc.setFont('helvetica','normal'); doc.text(p.service || '—', col4, y + 17);

  y += 26;

  // ── Tableau des résultats ─────────────────────────────────
  const rows = [];

  if (rType === 'Hématologie') {

    const addTable = (head, body, opts={}) => {
      if (!body.length) return;
      const o2 = { ...opts }; delete o2.interpCol;
      doc.autoTable({
        startY: y, head: [head], body,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */ },
        headStyles: { fillColor: [30,58,138], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [250,251,253] },
        ...o2,
        // ✅ v13.18 — colorer la cellule Valeur (col 1) selon l'interprétation
        // stockée en dernière colonne (même logique qu'Excel, sans afficher l'interp)
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index !== 1) return;
          const rowData = data.row.raw;
          const interp = String(rowData[rowData.length - 1] || '').toLowerCase();
          if (interp.includes('élevé')||interp.includes('eleve'))       { data.cell.styles.textColor=[153,27,27];  data.cell.styles.fillColor=[253,232,232]; }
          else if (interp.includes('bas'))                               { data.cell.styles.textColor=[30,64,175];  data.cell.styles.fillColor=[232,240,254]; }
          else if (interp.includes('normal'))                            { data.cell.styles.textColor=[21,128,61];  data.cell.styles.fillColor=[232,248,238]; }
        }
      });
      y = doc.lastAutoTable.finalY + 3; // ✅ v13.34
    };

    const sectionTitle = (txt) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,58,138);
      doc.text(txt, MARGIN, y); y += 3.5; // ✅ v13.34
    };

    // ── NFS ─────────────────────────────────────────────────────
    const nfsRows = [];
    [...HEMA_PARAMS_PRINT, ...HEMA_FL_PRINT].forEach(name => {
      const v = res[name];
      if (!v || typeof v !== 'object') return;
      if (!v.valeur) return;
      nfsRows.push([name, v.valeur, v.unite || '/µL', refDisplayFor(_paramByName[name], profile) || '—', v.interp || '']); // ✅ v13.25
    });
    if (nfsRows.length) {
      sectionTitle('🩸 NFS — Numération Formule Sanguine');
      // 4 colonnes affichées, 5e colonne = interp pour la colorisation (masquée via columnStyles)
      addTable(['Paramètre','Valeur','Unité','Valeurs normales'], nfsRows,
        { columnStyles: { 4: { cellWidth: 0.1, minCellWidth: 0, overflow: 'hidden' } } });
    }

    // ── Électrophorèse Hb ────────────────────────────────────────
    const ephbRows = [];
    ['Hb A','Hb A2','Hb F','Hb S','Hb C','Hb D','Hb E'].forEach(name => {
      const v = res[name];
      if (v && typeof v === 'object' && v.valeur) ephbRows.push([name, v.valeur, '%', v.interp||'']);
    });
    if (ephbRows.length || res['Profil Hb']) {
      sectionTitle('🔬 Électrophorèse de l\'Hémoglobine');
      if (ephbRows.length) addTable(['Fraction','%','Unité','Commentaire'], ephbRows);
      if (res['Profil Hb']) {
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(50,50,50);
        doc.text('Profil : ' + res['Profil Hb'], MARGIN, y); y += 4;
      }
      if (res['Commentaire Hb']) {
        doc.setFont('helvetica','italic'); doc.setFontSize(8);
        doc.text(res['Commentaire Hb'], MARGIN, y, {maxWidth: W-2*MARGIN}); y += 6;
      }
    }

    // ── GE / Parasitologie ───────────────────────────────────────
    const geRes    = res['GE - Résultat'] || '';
    const geEspece = res['GE - Espèce'] || '';
    const gePara   = res['GE - Parasitémie (%)'] || '';
    const geDensite= res['GE - Densité parasitaire (/µL)'] || '';
    const geStade  = res['GE - Stade'] || '';
    const geTDR    = res['GE - TDR'] || '';
    const geObs    = res['GE - Observation'] || '';
    if (geRes || geEspece || gePara || geTDR) {
      sectionTitle('🦟 Goutte Épaisse / Parasitologie');
      const geRows = [];
      if (geRes)    geRows.push(['Résultat GE', geRes, '', '']);
      if (geTDR)    geRows.push(['TDR Paludisme', geTDR, '', '']);
      if (geEspece) geRows.push(['Espèce plasmodiale', geEspece, '', '']);
      if (gePara)   geRows.push(['Parasitémie', gePara, '%', '']);
      if (geDensite) geRows.push(['Densité parasitaire', geDensite, '/µL', '']);
      if (geStade)  geRows.push(['Stade parasitaire', geStade, '', '']);
      if (geObs)    geRows.push(['Observation', geObs, '', '']);
      addTable(['Paramètre','Résultat','Unité','Observation'], geRows);
    }

    // ── Groupe sanguin ───────────────────────────────────────────
    const gsAbo = res['Groupe ABO'] || res['GS - ABO'] || '';
    const gsRh  = res['Rhésus']     || res['GS - Rhésus'] || '';
    const gsObs = res['Commentaire GS'] || '';
    if (gsAbo || gsRh) {
      sectionTitle('🩸 Groupe Sanguin ABO / Rhésus');
      const gsRows = [];
      if (gsAbo) gsRows.push(['Groupe ABO', gsAbo, '', '']);
      if (gsRh)  gsRows.push(['Rhésus',     gsRh,  '', '']);
      addTable(['Paramètre','Résultat','',''], gsRows);
      if (gsObs) {
        doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(80,80,80);
        doc.text(pdfSafe(gsObs), MARGIN, y); y += 5; doc.setTextColor(0);
      }
    }

    // ── CRP ──────────────────────────────────────────────────────
    const crpVal    = res['CRP - Valeur'] || '';
    if (crpVal) {
      sectionTitle('🔥 CRP — Protéine C-réactive');
      const crpLabel = crpVal === 'neg' ? 'Négatif (< 6 mg/L)' : crpVal + ' mg/L';
      const crpColor = crpVal === 'neg' ? [21,128,61] : [185,28,28];
      doc.autoTable({
        startY: y,
        head: [['Test','Résultat','Valeurs normales']],
        body: [['CRP Latex', crpLabel, '< 6 mg/L']],
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */ },
        headStyles: { fillColor: [30,58,138], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1:{ textColor: crpColor, fontStyle:'bold' } },
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    // ── Widal & Félix ────────────────────────────────────────────
    const _wid = widalReport(res);
    const widalRows = _wid.rows.map(w => [w.name, w.titre, w.cinetique || '—', w.interp || '—']);
    const widalConclusion = _wid.concl;
    if (_wid.show) {
      sectionTitle('🦠 Sérodiagnostic de Widal & Félix');
      if (widalRows.length) {
        addTable(['Antigène','Titre','Cinétique','Commentaire'], widalRows);
      }
      if (widalConclusion) {
        const isEtat  = widalConclusion.includes('ÉTAT');
        const isDebut = widalConclusion.includes('DÉBUT');
        const isCicat = widalConclusion.includes('CICATRI');
        const bgColor  = isEtat  ? [253,232,232] : isDebut ? [254,243,199] : isCicat ? [254,252,232] : [245,247,250];
        const txtColor = isEtat  ? [185,28,28]   : isDebut ? [180,83,9]   : isCicat  ? [133,77,14]  : [55,65,81];
        doc.setFillColor(...bgColor);
        doc.roundedRect(MARGIN, y, W-2*MARGIN, 10, 2, 2, 'F');
        doc.setTextColor(...txtColor); doc.setFont('helvetica','bold'); doc.setFontSize(8);
        doc.text(widalConclusion.replace(/^[🔴🟠🟡⚪]\s*/,''), MARGIN+3, y+6.5, {maxWidth: W-2*MARGIN-6});
        y += 14;
      }
    }

  } else {
    // Pour les autres types : affichage générique clé/valeur
    // ✅ v13.17 — index nom→paramètre pour les valeurs normales
    const _pbn = {};
    [...(typeof BIO_GLUCIDES!=='undefined'?[...BIO_GLUCIDES,...BIO_REIN,...BIO_FOIE,...BIO_LIPIDES,...BIO_IONO,...BIO_FER,...BIO_CARD,...BIO_HORM,...BIO_COAG,...BIO_AUTRE]:[]),
     ...(typeof HEMA_PARAMS!=='undefined'?[...HEMA_PARAMS,...HEMA_FL]:[]),
     ...(typeof BPN_NFS!=='undefined'?[...BPN_NFS]:[]),
     ...(typeof BPN_FL!=='undefined'?[...BPN_FL]:[]),
     ...(typeof SERO_TESTS!=='undefined'?SERO_TESTS:[]),
    ].forEach(pp => { if (pp && pp.name) _pbn[pp.name] = pp; });
    Object.entries(res).forEach(([k, v]) => {
      if (k.startsWith('_')) return; // ✅ v12 — ignorer clés techniques
      if (typeof v === 'object' && v !== null) {
        const val = v.valeur || v.resultat || '';
        if (val) rows.push([k, val, v.unite || '', refDisplayFor(_pbn[k], profile) || '', v.interp || v.obs || '']);
      } else if (v && typeof v === 'string' && v !== '—') {
        rows.push([k, v, '', '', '']);
      }
    });
    if (rows.length) {
      doc.autoTable({
        startY: y,
        head: [['Paramètre', 'Résultat', 'Unité', 'Valeurs normales']],
        body: rows.map(r => r.slice(0,4)),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */ },
        headStyles: { fillColor: [30,58,138], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [250,251,253] },
      });
      y = doc.lastAutoTable.finalY + 6;
    }
  }

  // ✅ v12.4 — Composition BPN + examens demandés non renseignés
  const pdfSectionTitle = (txt) => {
    if (y > 250) { doc.addPage(); y = MARGIN; }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,58,138);
    doc.text(txt, MARGIN, y); y += 5;
  };
  if (Array.isArray(res['_bpn_inclus']) && res['_bpn_inclus'].length) {
    pdfSectionTitle('Composition du bilan prénatal (forfait ' + (r.montant||20000).toLocaleString('fr-FR') + ' FCFA)');
    doc.autoTable({
      startY: y,
      body: res['_bpn_inclus'].map(l => ['☑', l]),
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0:{ cellWidth: 8, halign:'center', textColor:[21,128,61] } },
      alternateRowStyles: { fillColor: [240,253,250] },
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  const pdfPending = getPendingCheckedExams({ ...r, type: rType, resultats: res }, rType);
  if (pdfPending.length) {
    pdfSectionTitle('Examens demandés — résultats à compléter');
    pdfPending.forEach(ex => {
      doc.autoTable({
        startY: y,
        head: [[ex.label, 'Résultat', 'Unité', 'Valeurs normales']],
        body: ex.rows.map(pr => [pr.name, '', pr.unit, pr.ref]),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 8, cellPadding: 2 /* ✅ v13.34 */, minCellHeight: 7 },
        headStyles: { fillColor: [71,85,105], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: { 1:{ fillColor:[255,255,255] } },
      });
      y = doc.lastAutoTable.finalY + 4;
    });
    y += 2;
  }

  // ── Pied de page ─────────────────────────────────────────
  // Liseré doré
  doc.setFillColor(203, 161, 53);
  doc.rect(MARGIN, y, W - 2*MARGIN, 0.8, 'F');
  y += 4;

  const now = new Date();
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  // ✅ v13.35 — Ligne méta avec UUID
  const _refDoc = getOrCreateRef(r);
  const _techName = (typeof _currentUser !== 'undefined' && _currentUser?.username) ? _currentUser.username.toUpperCase() : '—';
  doc.text('Édité le ' + now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) + '  ·  CPMI DE GRAND-BASSAM  ·  Réf. ' + _refDoc, MARGIN, y);
  y += 6;

  // ✅ v13.34 — Zone commentaire + signature technicien (médecin supprimé)
  const zoneW = (W - 2*MARGIN);
  const commentW = zoneW * 0.6;
  const sigW = zoneW * 0.38;
  const sigX = MARGIN + commentW + zoneW * 0.02;

  // Zone commentaire technicien
  doc.setFillColor(220, 232, 251);
  doc.rect(MARGIN, y, commentW, 5, 'F');
  doc.setTextColor(30,58,138); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('Commentaire du technicien', MARGIN + 2, y + 3.5);
  doc.setDrawColor(30,58,138); doc.setLineWidth(0.4);
  doc.rect(MARGIN, y + 5, commentW, 16);
  // Lignes de saisie
  doc.setDrawColor(200,210,230); doc.setLineWidth(0.2);
  for (let li = 1; li <= 3; li++) doc.line(MARGIN+2, y+5+li*4, MARGIN+commentW-2, y+5+li*4);

  // ✅ v13.35 — Zone signature PDF avec cursive SVG
  doc.setFillColor(220, 232, 251);
  doc.rect(sigX, y, sigW, 5, 'F');
  doc.setTextColor(30,58,138); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.text('Signature du technicien', sigX + 2, y + 3.5);
  doc.setDrawColor(30,58,138); doc.setLineWidth(0.4);
  doc.rect(sigX, y + 5, sigW, 22);
  // Signature SVG → PNG via canvas → addImage
  try {
    const _svgStr = generateSignatureSVG(_techName, 140, 40);
    if (_svgStr) {
      const _blob = new Blob([_svgStr], {type:'image/svg+xml'});
      const _url  = URL.createObjectURL(_blob);
      await new Promise(res => {
        const _img = new Image();
        _img.onload = () => {
          const _cv = document.createElement('canvas');
          _cv.width = 280; _cv.height = 80;
          const _ctx = _cv.getContext('2d');
          _ctx.drawImage(_img, 0, 0, 280, 80);
          URL.revokeObjectURL(_url);
          try { doc.addImage(_cv.toDataURL('image/png'), 'PNG', sigX + 1, y + 6, sigW - 2, 14); } catch(e){}
          res();
        };
        _img.onerror = res;
        _img.src = _url;
      });
    }
  } catch(_se) {}
  // Nom et titre sous la signature
  doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(30,58,138);
  doc.text(_techName, sigX + 2, y + 22);
  doc.setFont('helvetica','italic'); doc.setFontSize(6.5); doc.setTextColor(120);
  doc.text('Technicien de laboratoire · CPMI Grand-Bassam', sigX + 2, y + 25.5);

  // ✅ v13.35 — Double QR dans le PDF
  try {
    const _shareToken = r?.patient?.share_token;
    const _qrContent1 = _shareToken
      ? (APP_PUBLIC_URL + '?share=' + _shareToken)
      : ('CPMI GRAND-BASSAM | REF: ' + _refDoc + ' | DOSSIER: ' + (p?.dossier||'—') + ' | PATIENT: ' + (p?.nom||'').toUpperCase());
    const _qrContent2 = 'CPMI GRAND-BASSAM\nREF: ' + _refDoc + '\nDOSSIER: ' + (p?.dossier||'—') + '\nPATIENT: ' + (p?.nom||'').toUpperCase() + '\nANALYSE: ' + getDisplayType(r) + '\nDATE: ' + (p?.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—');

    const [_qrUrl1, _qrUrl2] = await Promise.all([
      generateQRDataURL(_qrContent1, 80),
      generateQRDataURL(_qrContent2, 80),
    ]);

    const qrSize = 18; // mm dans le PDF
    const qrY = y + 1;
    const qrX1 = W - MARGIN - qrSize * 2 - 4;
    const qrX2 = W - MARGIN - qrSize;

    if (_qrUrl1) {
      doc.addImage(_qrUrl1, 'PNG', qrX1, qrY, qrSize, qrSize);
      doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(30,58,138);
      doc.text(_shareToken ? 'Vérifier en ligne' : 'Info dossier', qrX1 + qrSize/2, qrY + qrSize + 2.5, { align: 'center' });
    }
    if (_qrUrl2) {
      doc.addImage(_qrUrl2, 'PNG', qrX2 + 2, qrY, qrSize, qrSize);
      doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(100,116,139);
      doc.text('Infos patient', qrX2 + 2 + qrSize/2, qrY + qrSize + 2.5, { align: 'center' });
    }
    // Réf sous les QR
    doc.setFont('helvetica','bold'); doc.setFontSize(5.5); doc.setTextColor(30,58,138);
    doc.text('Réf. ' + _refDoc, qrX1 + qrSize + 2, qrY + qrSize + 6, { align: 'center' });
  } catch(_qrErr) { /* QR optionnel — ne bloque pas le PDF */ }

  // ✅ v13.35 — Pied de page conformité
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6); doc.setTextColor(120);
  const _conformite = 'Document officiel CPMI Grand-Bassam · Réf. ' + _refDoc + ' · Résultats à interpréter par un professionnel de santé · Usage médical exclusif';
  doc.text(_conformite, W/2, 286, { align: 'center', maxWidth: W - 2*MARGIN });

  // Numéro de page
  doc.setTextColor(150); doc.setFont('helvetica','normal'); doc.setFontSize(7);
  doc.text('Page ' + (__i+1) + '/' + _analyses.length, W - MARGIN, 290, { align: 'right' });

  }); // ✅ v13.10 — fin de la boucle par analyse

  // Téléchargement — même convention de nommage que l'export Excel
  const filename = makeFilename(p.dossier, p.date, p.nom, getDisplayTypeShort(r)).replace(/\.xlsx$/, '.pdf');
  doc.save(filename);
  toast('PDF généré ✓', 'ok');
  } catch(err) {
    console.error('buildPDF:', err);
    toast('Erreur génération PDF : ' + (err.message||err), 'err');
  } finally {
    hideLoading(); // ✅ v13
  }
}

// ============================================================
// CONFIGURATION DES TARIFS
// ============================================================

// ──────────────────────────────────────────────────────────────
// TARIFICATION — Architecture claire :
//
//  localStorage 'tarifs_ref'  = prix de RÉFÉRENCE (gérés par admin dans Comptes)
//  localStorage 'examens_custom' = examens ajoutés par l'admin
//  px_{id} sur la fiche       = prix SESSION (modifiable par agent, réinitialisé
//                               au Nouveau patient via rechargeFichePrix())
//
// Règle : modifier la fiche → ne touche PAS aux tarifs de référence
//         modifier Comptes  → modifie les tarifs de référence ET recharge la fiche
// ──────────────────────────────────────────────────────────────


function exportRistournesPDF() {
  if (!window.jspdf?.jsPDF) { toast('Bibliothèque PDF non disponible', 'err'); return; }
  const mois = parseInt(document.getElementById('rist-mois')?.value || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('rist-annee')?.value || new Date().getFullYear());
  const rows = computeRistournesData(mois, annee);
  const { doc } = _newPDFDoc();
  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('CPMI Grand-Bassam — Ristournes prescripteurs', 14, 16);
  doc.setFontSize(11); doc.setFont(undefined, 'normal');
  doc.text(MOIS_FR[mois - 1] + ' ' + annee, 14, 23);
  doc.autoTable({
    startY: 28,
    head: [['Prescripteur', 'Nb dossiers', 'Montant brut', 'Taux %', 'Ristourne']],
    body: rows.map(r => [r.presc.nom, String(r.nb), _fmtF(r.montantBrut) + ' F', String(r.taux), _fmtF(r.ristourne) + ' F']),
    styles: { fontSize: 9 }, headStyles: { fillColor: [26, 68, 128] },
  });
  const totBrut = rows.reduce((s, r) => s + r.montantBrut, 0);
  const totRist = rows.reduce((s, r) => s + r.ristourne, 0);
  const y = (doc.lastAutoTable?.finalY || 40) + 8;
  doc.setFont(undefined, 'bold');
  doc.text('Total général : ' + _fmtF(totBrut) + ' F brut — ' + _fmtF(totRist) + ' F de ristournes', 14, y);
  doc.save('Ristournes_' + MOIS_FR[mois - 1] + '_' + annee + '.pdf');
}
async function exportRistournesExcel() {
  if (!window.ExcelJS) { toast('Bibliothèque Excel non disponible', 'err'); return; }
  const mois = parseInt(document.getElementById('rist-mois')?.value || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('rist-annee')?.value || new Date().getFullYear());
  const rows = computeRistournesData(mois, annee);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ristournes');
  ws.mergeCells('A1:E1');
  ws.getCell('A1').value = 'CPMI Grand-Bassam — Ristournes prescripteurs — ' + MOIS_FR[mois - 1] + ' ' + annee;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.addRow([]);
  const hdr = ws.addRow(['Prescripteur', 'Nb dossiers', 'Montant brut', 'Taux (%)', 'Ristourne']);
  hdr.font = { bold: true }; hdr.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A4480' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  rows.forEach(r => {
    const row = ws.addRow([r.presc.nom, r.nb, r.montantBrut, r.taux, r.ristourne]);
    row.getCell(3).numFmt = '#,##0" FCFA"'; row.getCell(5).numFmt = '#,##0" FCFA"';
  });
  const tot = ws.addRow(['TOTAL', rows.reduce((s, r) => s + r.nb, 0), rows.reduce((s, r) => s + r.montantBrut, 0), '', rows.reduce((s, r) => s + r.ristourne, 0)]);
  tot.font = { bold: true }; tot.getCell(3).numFmt = '#,##0" FCFA"'; tot.getCell(5).numFmt = '#,##0" FCFA"';
  ws.columns.forEach(c => c.width = 18); ws.getColumn(1).width = 30;
  await downloadWorkbook(wb, 'Ristournes_' + MOIS_FR[mois - 1] + '_' + annee + '.xlsx');
}

// ── FEATURE 7 : rapport d'activité mensuel (PDF) ──────────────────
function _newPDFDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfSafe = s => s == null ? '' : String(s)
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/µ/g, 'u').replace(/²/g, '2').replace(/³/g, '3')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '').trim();
  const _rawText = doc.text.bind(doc);
  doc.text = function (t, x, y, o) { t = Array.isArray(t) ? t.map(pdfSafe) : pdfSafe(t); return _rawText(t, x, y, o); };
  if (doc.autoTable) {
    const _rawAT = doc.autoTable.bind(doc);
    doc.autoTable = function (o) {
      if (o) { if (Array.isArray(o.head)) o.head = o.head.map(r => r.map(pdfSafe)); if (Array.isArray(o.body)) o.body = o.body.map(r => r.map(pdfSafe)); }
      return _rawAT(o);
    };
  }
  return { doc, jsPDF };
}
async function genererRapportMensuel() {
  if (!window.jspdf?.jsPDF) { toast('Bibliothèque PDF non disponible', 'err'); return; }
  await refreshDB();
  const mois = parseInt(document.getElementById('rapport-mois')?.value || (new Date().getMonth() + 1));
  const annee = parseInt(document.getElementById('rapport-annee')?.value || new Date().getFullYear());
  const prefix = annee + '-' + String(mois).padStart(2, '0');
  const db = getCalcDB().filter(r => _recDate(r).startsWith(prefix)); // ✅ v13.30 — exclut les fiches verrouillées du rapport PDF
  const { doc } = _newPDFDoc();
  const W = 210, M = 14;

  // Page de garde
  doc.setFillColor(26, 68, 128); doc.rect(0, 0, W, 60, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont(undefined, 'bold');
  doc.text('CPMI GRAND-BASSAM', W / 2, 28, { align: 'center' });
  doc.setFontSize(13); doc.setFont(undefined, 'normal');
  doc.text("Rapport d'activité du laboratoire", W / 2, 40, { align: 'center' });
  doc.setTextColor(0, 0, 0); doc.setFontSize(18); doc.setFont(undefined, 'bold');
  doc.text(MOIS_FR[mois - 1] + ' ' + annee, W / 2, 85, { align: 'center' });
  doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(120, 120, 120);
  doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), W / 2, 95, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Statistiques globales
  const nbFiches = db.length;
  const totalMontant = db.reduce((s, r) => s + (r.montant || 0), 0);
  const joursDistincts = new Set(db.map(r => _recDate(r)).filter(Boolean)).size || 1;
  let y = 115;
  doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.text('1. Statistiques globales', M, y); y += 8;
  doc.setFontSize(11); doc.setFont(undefined, 'normal');
  doc.text('Nombre de dossiers : ' + nbFiches, M, y); y += 6;
  doc.text('Montant total encaissé : ' + _fmtF(totalMontant) + ' FCFA', M, y); y += 6;
  doc.text('Moyenne par jour actif : ' + _fmtF(Math.round(totalMontant / joursDistincts)) + ' FCFA', M, y); y += 6;

  // Répartition par type
  const byType = {}; TYPES_ANALYSES.forEach(t => byType[t] = 0);
  db.forEach(r => { const types = isDossierRecord(r) ? (r.resultats?._types || []) : [r.type]; types.forEach(t => { if (byType[t] !== undefined) byType[t]++; }); });
  const totType = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('2. Répartition par type d\'analyse', M, y + 4);
  doc.autoTable({ startY: y + 8, head: [['Type', 'Nombre', '%']], body: TYPES_ANALYSES.filter(t => byType[t] > 0).map(t => [t, String(byType[t]), Math.round(byType[t] / totType * 100) + '%']), styles: { fontSize: 9 }, headStyles: { fillColor: [26, 68, 128] } });

  // Répartition par service
  const byService = {};
  db.forEach(r => { const s = r.patient?.service || 'Non précisé'; byService[s] = (byService[s] || 0) + 1; });
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('3. Répartition par service', M, doc.lastAutoTable.finalY + 10);
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 14, head: [['Service', 'Nombre']], body: Object.entries(byService).sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, String(n)]), styles: { fontSize: 9 }, headStyles: { fillColor: [13, 148, 136] } });

  // Top prescripteurs
  const byPresc = {};
  db.forEach(r => { const nom = (_prescripteurs.find(p => Number(p.id) === Number(r.prescripteur_id))?.nom) || r.patient?.medecin || 'Inconnu'; if (!byPresc[nom]) byPresc[nom] = { nb: 0, total: 0 }; byPresc[nom].nb++; byPresc[nom].total += (r.montant || 0); });
  const topP = Object.entries(byPresc).sort((a, b) => b[1].nb - a[1].nb).slice(0, 10);
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('4. Top prescripteurs', M, doc.lastAutoTable.finalY + 10);
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 14, head: [['Prescripteur', 'Nb dossiers', 'Montant']], body: topP.map(([nom, v]) => [nom, String(v.nb), _fmtF(v.total) + ' F']), styles: { fontSize: 9 }, headStyles: { fillColor: [26, 68, 128] } });

  // Courbe d'activité quotidienne (image du canvas)
  doc.addPage();
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('5. Courbe d\'activité quotidienne', M, 20);
  try {
    const parJour = {};
    db.forEach(r => { const d = _recDate(r); if (d) parJour[d] = (parJour[d] || 0) + 1; });
    const jours = Object.keys(parJour).sort();
    if (jours.length && typeof Chart !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = 800; cv.height = 360;
      const ch = new Chart(cv, { type: 'line', data: { labels: jours.map(j => j.slice(8)), datasets: [{ data: jours.map(j => parJour[j]), borderColor: '#1a4480', backgroundColor: 'rgba(26,68,128,.1)', fill: true, tension: .3 }] }, options: { responsive: false, animation: false, plugins: { legend: { display: false } } } });
      await new Promise(res => setTimeout(res, 250));
      doc.addImage(cv.toDataURL('image/png'), 'PNG', M, 26, 180, 80);
      ch.destroy();
    } else { doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text('Données insuffisantes pour tracer la courbe.', M, 30); }
  } catch (e) { doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text('Courbe non disponible.', M, 30); }

  // Alertes critiques
  const critiques = [];
  db.forEach(r => { if (hasCriticalValues(r)) { const al = checkValeursCritiques(r.resultats); (r.resultats?._types || []).forEach(t => al.push(...checkValeursCritiques(r.resultats[t]))); critiques.push({ p: r.patient, al }); } });
  const yc = 120;
  doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text('6. Alertes valeurs critiques du mois', M, yc);
  if (critiques.length) {
    doc.autoTable({ startY: yc + 4, head: [['Patient', 'Dossier', 'Alertes']], body: critiques.slice(0, 40).map(c => [c.p?.nom || '—', c.p?.dossier || '—', c.al.map(a => a.label + '=' + a.valeur + ' ' + a.unite).join('; ') || 'signalé']), styles: { fontSize: 8 }, headStyles: { fillColor: [220, 38, 38] } });
  } else { doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text('Aucune alerte critique enregistrée ce mois.', M, yc + 8); }

  doc.save('Rapport_activite_' + MOIS_FR[mois - 1] + '_' + annee + '.pdf');
  toast('Rapport mensuel généré ✓', 'ok');
}

document.addEventListener('DOMContentLoaded', async () => {
  const isShare = await checkShareMode();
  // Si ce n'est pas un lien de partage, le flux normal (login) prend le relais
});

</script>
</div><!-- /#app-root -->

<!-- ✅ v13.7 — Modale d'édition de compte (remplace confirm + prompt) -->
<div id="user-modal" class="modal-backdrop" style="display:none" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
  <div class="modal-box">
    <div class="modal-title" id="user-modal-title">Modifier le compte</div>
    <input type="hidden" id="um_id">
    <div id="um_name" style="font-weight:700;margin-bottom:10px"></div>
    <label class="modal-label" for="um_role">Rôle</label>
    <select class="modal-input" id="um_role" aria-label="Rôle du compte">
      <option value="agent">Agent</option>
      <option value="admin">Administrateur</option>
    </select>
    <label class="modal-label" for="um_password">Nouveau mot de passe <span style="font-weight:400;color:var(--text-muted)">(laisser vide pour ne pas changer)</span></label>
    <input class="modal-input" id="um_password" type="password" autocomplete="new-password" aria-label="Nouveau mot de passe">
    <div id="um-error" class="modal-error" role="alert"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeUserModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitUserModal()">Enregistrer</button>
    </div>
  </div>
</div>

<!-- ✅ v13.1 — Modale d'édition prescripteur (remplace les prompt() en série) -->
<div id="presc-modal" class="modal-backdrop" style="display:none" role="dialog" aria-modal="true" aria-labelledby="presc-modal-title">
  <div class="modal-box">
    <div class="modal-title" id="presc-modal-title">Modifier le prescripteur</div>
    <input type="hidden" id="pm_id">
    <label class="modal-label" for="pm_nom">Nom</label>
    <input class="modal-input" id="pm_nom" type="text" aria-label="Nom du prescripteur">
    <label class="modal-label" for="pm_spec">Spécialité</label>
    <input class="modal-input" id="pm_spec" type="text" aria-label="Spécialité">
    <label class="modal-label" for="pm_struct">Structure</label>
    <input class="modal-input" id="pm_struct" type="text" aria-label="Structure">
    <label class="modal-label" for="pm_taux">Taux de ristourne (%)</label>
    <input class="modal-input" id="pm_taux" type="number" min="0" max="100" step="0.5" aria-label="Taux de ristourne en pourcentage">
    <div id="pm-error" class="modal-error" role="alert"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closePrescModal()">Annuler</button>
      <button class="btn btn-primary" onclick="submitPrescModal()">Enregistrer</button>
    </div>
  </div>
</div>

<!-- Vue publique de vérification (QR code) -->
<div id="share-view" style="display:none;position:fixed;inset:0;background:linear-gradient(135deg,#1a4480,#2563eb,#0d9488);align-items:center;justify-content:center;z-index:3000;padding:20px">
  <div style="background:#fff;border-radius:18px;padding:32px 28px;max-width:480px;width:100%;box-shadow:0 16px 48px rgba(0,0,0,.18);font-family:'Nunito',sans-serif;text-align:center">
    <div style="width:44px;height:44px;border:4px solid #e0eaff;border-top-color:#1a4480;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 14px"></div>
    <div style="font-size:14px;color:#4a5c82;font-weight:600">Vérification du dossier…</div>
  </div>
</div>

<!-- ✅ v13.28 — Modale de changement de mot de passe obligatoire (première connexion) -->
<div id="first-login-modal" class="modal-backdrop" style="display:none;z-index:3200" role="dialog" aria-modal="true" aria-labelledby="fl-title">
  <div class="modal-box">
    <div class="modal-title" id="fl-title">🔐 Changement de mot de passe obligatoire</div>
    <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:14px">
      Pour votre sécurité, vous devez définir un nouveau mot de passe avant d'accéder à l'application.
    </p>
    <label class="modal-label" for="fl_old">Mot de passe actuel</label>
    <input class="modal-input" id="fl_old" type="password" autocomplete="current-password">
    <label class="modal-label" for="fl_new">Nouveau mot de passe <span style="font-weight:400;color:var(--text-muted)">(min. 8 caractères, au moins 1 chiffre)</span></label>
    <input class="modal-input" id="fl_new" type="password" autocomplete="new-password">
    <label class="modal-label" for="fl_confirm">Confirmer le mot de passe</label>
    <input class="modal-input" id="fl_confirm" type="password" autocomplete="new-password">
    <div id="fl-error" class="modal-error" role="alert"></div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="submitFirstLoginPassword()">Changer le mot de passe</button>
    </div>
  </div>
</div>

<div id="loading-overlay">
  <div class="loading-spinner"></div>
  <div class="loading-label" id="loading-label">Chargement…</div>
</div>

</body>
</html>
      <div id="rappel-saved-analyses" style="font-size:11px;color:var(--text-muted);margin-top:2px"></div>
