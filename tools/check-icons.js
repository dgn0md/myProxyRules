'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'Script/mihomoScript.js'), 'utf8');
const base = 'https://fastly.jsdelivr.net/gh/dgn0md/myProxyRules@main/Icons/svg/';
if (!script.includes(`const iconBaseUrl = '${base}';`)) throw new Error('Icon URL must reference this repository');
const references = [...script.matchAll(/\$\{iconBaseUrl\}([^`]+\.svg)/g)].map((match) => match[1]);
if (!references.length) throw new Error('No icon references found');
for (const reference of new Set(references)) {
  if (!/^(common|flag)\/[A-Za-z0-9_()+.-]+\.svg$/.test(reference)) throw new Error(`Invalid icon path: ${reference}`);
  const file = path.join(root, 'Icons/svg', reference);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing referenced icon: ${reference}`);
}
console.log(`Verified ${new Set(references).size} referenced icons in this repository`);
