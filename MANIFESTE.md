# Manifeste des modules — LaboSaisie

Le code est découpé en modules chargés **dans l’ordre** par `index.html`.
Pour corriger une partie, repérez la fonction ci-dessous et éditez le fichier correspondant.

> ⚠ L’ordre de chargement compte : ne changez pas l’ordre des `<script src>` dans `index.html`.

## `js/00-background.js`
*Animation du fond d’écran (canvas). Indépendant.*

_(code d’initialisation, pas de fonction nommée)_

## `js/01-references-tarifs.js`
*Valeurs normales adaptatives (âge/sexe), tarifs de base, calcul du montant, construction des lignes de paramètres, panneau Bilan prénatal (BPN).*

Fonctions : `getPatientProfile`, `buildRefObj`, `getCustomRefs`, `saveCustomRefs`, `getUnit`, `getRef`, `interprete`, `updateAllRefs`, `getTarifsBase`, `getTarifsParams`, `saveTarifsBase`, `saveTarifsParams`, `calculateMontant`, `updateMontant`, `setAbgMode`, `makeParamRow`, `makeParamRowColored`, `onParamInput`, `onParamInputColored`, `buildBpnCompo`, `collectBpnCompo`, `buildBpnNfs`, `calcConstantesBPN`, `calcBpnFLAbsolues`, `clonePanelInto`, `buildBpnBio`, `buildBpnBacterio`, `buildBpnSero`

## `js/02-formulaires-donnees.js`
*Calculs auto (constantes hématimétriques, LDL), construction de tous les panneaux de saisie (Héma, Widal, Biochimie, Sérologie, Parasito, Groupe sanguin), navigation, connexion Supabase, chargement des données, file d’attente hors-ligne.*

Fonctions : `calcConstantes`, `calcLDL`, `buildHema`, `calcFLAbsolues`, `checkEphbTotal`, `interpretCRP`, `buildWidal`, `widalTitre`, `interpretWidal`, `buildBio`, `buildAbgGrid`, `buildAbg`, `updateAbgColor`, `adaptBacterioForm`, `interpretEtatFrais`, `checkBacteriurie`, `updateCultureFields`, `updateGramDetail`, `buildSero`, `onSeroQuantInput`, `buildParaEPS`, `buildGS`, `autoInterp`, `updateMontantCurrent`, `showView`, `ensurePanelBuilt`, `switchTab`, `resetPanel`, `getPatient`, `validatePatient`, `initSupabase`, `getDB`, `showLoading`, `hideLoading`, `refreshDB`, `ensureFull`, `refreshDBFull`, `loadSyncQueue`, `saveSyncQueue`, `queueLength`, `isNetworkError`, `updateSyncBanner`, `enqueueInsert`, `enqueueUpdate`, `removeFromQueue`, `flushSyncQueue`, `insertRecordRemote`, `updateRecordRemote`, `deleteRecordRemote`, `clearAllRemote`, `esc`, `formatDossier`, `getNextDossierNum`, `regenDossier`, `newPatient`, `getValColorInterp`, `collectResults`, `buildPatientCache`, `onPatientNameInput`, `refreshRappelPatient`, `saveRecord`, `_saveRecordImpl`

## `js/03-edition-excel.js`
*Édition d’une fiche, historique (filtres, tri, périodes), suppression, helpers dossier, et EXPORT EXCEL.*

Fonctions : `ensureInterpFresh`, `editRecord`, `showEditTypeModal`, `cancelEdit`, `loadResultsIntoForm`, `setSortCol`, `clearSearchFilters`, `setHistPeriode`, `computeHistDateRange`, `renderHistoryDebounced`, `renderHistory`, `deleteAnalyseFromDossier`, `deleteRecord`, `clearHistory`, `thinBorder`, `styleCell`, `isDossierRecord`, `getRecordTypes`, `getRecordResultats`, `getDisplayType`, `getDisplayTypeShort`, `makeFilename`, `buildProfessionalSheet`, `ensureExcelJSReady`, `safeSheetName`, `downloadWorkbook`, `exportSingle`, `exportAllExcel`

## `js/04-impression-pdf.js`
*Statistiques, IMPRESSION, reçus, et EXPORT PDF (buildPDF).*

Fonctions : `renderStats`, `getExamensManquants`, `confirmerSiExamensManquants`, `printRecord`, `printCurrentForm`, `escHTML`, `generateQRDataURL`, `buildAndPrint`, `buildPrintSections`, `printReceipt`, `exportHistoryCSV`, `printHistory`, `exportPDF`, `exportRecord`, `exportPatientComplet`, `exportPDFFromForm`, `buildPDF`

## `js/05-prescripteurs-examens.js`
*Configuration des tarifs, examens personnalisés, prescripteurs et ristournes, examens cochés (Widal partagé, examens à compléter), fiche d’examens.*

Fonctions : `getTarifsRef`, `saveTarifsRef`, `buildTarifsRefDefault`, `getExamensCustom`, `saveExamensCustom`, `getCatalogueComplet`, `showAddExamenModal`, `addExamenPersonnalise`, `removeExamenCustom`, `rechargeFichePrix`, `buildAdminExamensGrid`, `saveAdminTarifs`, `resetAdminTarifs`, `renderTarifsConfig`, `saveTarifsConfig`, `resetTarifsConfig`, `loadPrescripteurs`, `refreshPrescripteurSelects`, `onPrescripteurChange`, `showAddPrescripteur`, `savePrescripteur`, `deletePrescripteur`, `renderPrescripteursList`, `editPrescripteur`, `closePrescModal`, `submitPrescModal`, `setStatsPeriode`, `getStatsDateRange`, `filterByDateRange`, `filterDbByPeriode`, `renderRistournes`, `examExpectedRows`, `isValFilled`, `collectPendingForType`, `widalReport`, `getPendingCheckedExams`, `buildFicheExamens`, `toggleExamRow`, `syncExamRowState`, `calcFicheTotal`, `demarrerSaisie`, `markRequiredSections`, `applySectionVisibility`, `updateShowAllButton`, `toggleShowAllExams`, `enregistrerFicheIdentif`

## `js/06-auth-init.js`
*Toast, authentification/session (jeton), gestion des comptes, journal d’audit, initialisation de l’application.*

Fonctions : `toast`, `hasValidSession`, `setSession`, `TK`, `clearSession`, `isAdmin`, `doLogin`, `doLogout`, `enterApp`, `updateUserBadge`, `auditDetails`, `renderAuditLog`, `renderUsersList`, `createUserAccount`, `editUserAccount`, `closeUserModal`, `submitUserModal`, `deleteUserAccount`, `initApp`, `buildRefsEditor`, `saveRefsConfig`, `resetSectionRefs`, `resetRefsConfig`, `resetOneRef`
