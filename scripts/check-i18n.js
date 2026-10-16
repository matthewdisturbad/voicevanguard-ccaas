// Verifica paridade de chaves entre os dicionários pt e en: landing, console, widget e extensão.
const fs = require('fs');

function balanced(src, openIdx) {
    let depth = 0, inStr = null;
    for (let i = openIdx; i < src.length; i++) {
        const c = src[i];
        if (inStr) { if (c === '\\') i++; else if (c === inStr) inStr = null; continue; }
        if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return src.slice(openIdx, i + 1);
    }
    throw new Error('chaves não balanceadas');
}
function dictBody(src, lang) {
    const m = new RegExp(`(?:^|\\n)\\s*(?:const\\s+)?${lang}\\s*[:=]\\s*\\{`).exec(src);
    if (!m) throw new Error(`dicionário "${lang}" não encontrado`);
    return balanced(src, m.index + m[0].lastIndexOf('{'));
}
function keysOf(body) {
    // Chaves do primeiro nível do objeto; ignora o conteúdo de strings e de objetos aninhados.
    const keys = new Set();
    let depth = 0, i = 0;
    while (i < body.length) {
        const c = body[i];
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < body.length && body[j] !== c) j += body[j] === '\\' ? 2 : 1;
            if (depth === 1 && /^\s*:/.test(body.slice(j + 1, j + 8))) keys.add(body.slice(i + 1, j));
            i = j + 1; continue;
        }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (depth === 1 && /[A-Za-z_]/.test(c) && /[\s,{]/.test(body[i - 1])) {
            const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(body.slice(i, i + 80));
            if (m) { keys.add(m[1]); i += m[0].length; continue; }
        }
        i++;
    }
    return keys;
}
let failed = false;
for (const f of [
    '01_Cloud_Relay_Backend/public/index.html',
    '01_Cloud_Relay_Backend/public/app.html',
    '01_Cloud_Relay_Backend/public/widget.html',
    '03_Chrome_Edge_Extension/i18n.js',
]) {
    const src = fs.readFileSync(f, 'utf8');
    const pt = keysOf(dictBody(src, 'pt')), en = keysOf(dictBody(src, 'en'));
    const diff = [...pt].filter(k => !en.has(k)).map(k => `faltando em en: ${k}`)
        .concat([...en].filter(k => !pt.has(k)).map(k => `faltando em pt: ${k}`));
    if (diff.length) { failed = true; console.error(`${f}\n  ${diff.join('\n  ')}`); }
    else console.log(`i18n ok ${f} (${pt.size} chaves)`);
}
if (failed) process.exit(1);
