#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   LaboSaisie — construction du site d'un LABORATOIRE CLIENT

   Usage : node scripts/construire-client.js <client> [dossier de sortie]
     <client> : nom du fichier clients/config/<client>.json
     sortie   : clients/<client>/ par défaut

   Tant que la configuration n'a pas « actif: true » ET l'adresse + la clé
   publique de SA base Supabase, le site est INACTIF : ses pages affichent
   « Service en cours d'activation » et aucun code de l'application ne
   s'exécute. Une copie client ne peut JAMAIS être branchée sur la base de
   production ni sur la base de test du CPMI.

   Procédure complète d'activation : docs/CLIENTS.md
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { RACINE, bases, construireCopie } = require('./lib-copie');

const client = process.argv[2];
if (!client || !/^[a-z0-9-]+$/.test(client)) {
  console.error('Usage : node scripts/construire-client.js <client>   (lettres minuscules, chiffres, tirets)');
  process.exit(1);
}
// CLIENT_CONFIG : autre fichier de configuration (tests).
const fichierConfig = process.env.CLIENT_CONFIG || path.join(RACINE, 'clients', 'config', client + '.json');
const c = JSON.parse(fs.readFileSync(fichierConfig, 'utf8'));
const SORTIE = process.argv[3] ? path.resolve(process.argv[3]) : path.join(RACINE, 'clients', client);

// Les noms sont insérés dans des chaînes du code : apostrophe droite → typographique,
// et aucun caractère qui casserait le HTML ou le JavaScript.
const propre = (s, champ) => {
  const v = String(s || '').trim().replace(/'/g, '’');
  if (!v || /["<>&\\`$]/.test(v)) { console.error('Configuration : « ' + champ + ' » vide ou invalide'); process.exit(1); }
  return v;
};
const nom = propre(c.nom, 'nom');
const sousTitre = propre(c.sous_titre || 'Laboratoire d’analyses médicales', 'sous_titre');
const marque = {
  long: nom,
  LONG: nom.toUpperCase(),
  court: propre(c.nom_court || nom, 'nom_court'),
  sigle: propre(c.sigle || c.nom_court || nom, 'sigle'),
  sousTitre,
  sousTitreBr: sousTitre.replace(' ', '<br>'),
  lieu: propre(c.lieu || 'Côte d’Ivoire', 'lieu'),
  prefixeRef: propre(c.prefixe_references || 'REF', 'prefixe_references').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'REF',
};

// Base du client : jamais celle du CPMI (production ou test).
let base = null;
if (c.actif) {
  if (!c.supabase_url || !c.supabase_cle) { console.error('Client actif sans supabase_url / supabase_cle'); process.exit(1); }
  base = { hote: new URL(c.supabase_url).host.split('.')[0], cle: c.supabase_cle };
  const { PROD, TEST } = bases();
  if ([PROD.hote, TEST.hote].includes(base.hote) || [PROD.cle, TEST.cle].includes(base.cle)) {
    console.error('REFUS : un client doit avoir SA propre base, pas celle du CPMI.'); process.exit(1);
  }
}

const { VERSION_COPIE } = construireCopie({
  sortie: SORTIE,
  marque,
  base,
  prefixeStockage: 'client-' + client + ':',
  commentaireStockage: 'Laboratoire client : stockage du navigateur séparé des autres sites du même domaine.',
  suffixeVersion: '-' + client,
  prefixeCache: 'labo-CLIENT-' + client + '-',
  bandeau: '',
  inactive: !base,
  notice: (v, h) => 'Site du laboratoire « ' + nom + ' » construit depuis la version ' + v
    + (base ? ' (base ' + h + ').\n' : ' — INACTIF (aucune base branchée).\n')
    + 'Ne pas modifier à la main : relancer node scripts/construire-client.js ' + client + '\n',
});

// Chaque module doit rester du JavaScript valide après le changement de nom.
const casses = [];
for (const f of fs.readdirSync(path.join(SORTIE, 'js'))) {
  const r = spawnSync(process.execPath, ['--check', path.join(SORTIE, 'js', f)]);
  if (r.status !== 0) casses.push(f);
}
if (casses.length) { console.error('JavaScript invalide après renommage : ' + casses.join(', ')); process.exit(1); }

console.log('Site « ' + nom + ' » construit dans ' + path.relative(RACINE, SORTIE) + '/ — version ' + VERSION_COPIE
  + (base ? ', base ' + base.hote : ' — INACTIF'));
