#!/usr/bin/env node
// Lance toute la suite et renvoie un code de sortie non nul si un test échoue.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tests = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let failed = [];
for (const t of tests) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, t)],
                 { stdio: 'inherit', env: { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } });
  } catch { failed.push(t); }
}
console.log('\n' + '═'.repeat(60));
if (failed.length) { console.log('ÉCHEC : ' + failed.join(', ')); process.exit(1); }
console.log(`Tous les tests passent (${tests.length} fichiers).`);
