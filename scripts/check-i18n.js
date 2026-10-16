// Verifica paridade de chaves entre os dicionários pt e en da landing (regra do AGENTS.md).
const fs = require('fs');
const src = fs.readFileSync('01_Cloud_Relay_Backend/public/index.html', 'utf8');
const start = src.indexOf('const translations = {');
if (start < 0) throw new Error('translations não encontrado');
const body = src.slice(start);
const keysOf = (lang) => {
    const open = body.indexOf(`\n            ${lang}: {`);
    if (open < 0) throw new Error(`Dicionário "${lang}" não encontrado`);
    const end = body.indexOf('\n            }', open + 1);
    return new Set([...body.slice(open, end).matchAll(/^\s{16}([A-Za-z0-9_]+)\s*:/gm)].map(m => m[1]));
};
const pt = keysOf('pt'), en = keysOf('en');
const diff = [...pt].filter(k => !en.has(k)).map(k => `faltando em en: ${k}`)
    .concat([...en].filter(k => !pt.has(k)).map(k => `faltando em pt: ${k}`));
if (diff.length) { console.error(diff.join('\n')); process.exit(1); }
console.log(`i18n ok (${pt.size} chaves)`);
