const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appRoot = path.join(root, 'src', 'app');
const catalogRoot = path.join(root, 'public', 'i18n');
const languages = ['en', 'vi'];

const allowedText = new Set([
  'DRAFT', 'ACTIVE', 'DISABLED', 'DELETED', 'SHADOW', 'DEPRECATED',
  'ERROR', 'WARN', 'EN', 'VI'
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    if (entry.isFile() && full.endsWith('.ts')) out.push(full);
  }
  return out;
}

function stringLiterals(value) {
  const keys = [];
  const pattern = /(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = pattern.exec(value))) {
    keys.push(match[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n'));
  }
  return keys;
}

function extractKeys(file, text) {
  const keys = [];
  let match;

  const instant = /\.instant\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  while ((match = instant.exec(text))) keys.push(match[2]);

  const directPipe = /(['"])([^'"\n{}]+?)\1\s*\|\s*translate/g;
  while ((match = directPipe.exec(text))) keys.push(match[2]);

  const ternaryPipe = /\?\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*:\s*(['"])((?:\\.|(?!\3)[\s\S])*?)\3\s*\)\s*\|\s*translate/g;
  while ((match = ternaryPipe.exec(text))) {
    keys.push(match[2], match[4]);
  }

  return keys.map(key => ({ file, key }));
}

function templateBlocks(text) {
  const blocks = [];
  const pattern = /template:\s*`([\s\S]*?)`/g;
  let match;
  while ((match = pattern.exec(text))) blocks.push(match[1]);
  return blocks;
}

function isAllowedLiteral(value) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return true;
  if (allowedText.has(trimmed)) return true;
  if (/^&[a-z]+;$/.test(trimmed)) return true;
  if (/^[A-Z0-9_./:@| -]+$/.test(trimmed)) return true;
  if (/^[a-z0-9_.:@/-]+$/.test(trimmed)) return true;
  return false;
}

function literalFindings(file, text) {
  const findings = [];
  for (const template of templateBlocks(text)) {
    const withoutBindings = template
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/{{[\s\S]*?}}/g, '');

    const textNode = />\s*([^<>{}]*[A-Za-z][^<>{}]*)\s*</g;
    let match;
    while ((match = textNode.exec(withoutBindings))) {
      const literal = match[1].replace(/\s+/g, ' ').trim();
      if (!isAllowedLiteral(literal)) findings.push({ file, literal });
    }

    const attr = /\s(?:placeholder|aria-label|title)="([^"{]*[A-Za-z][^"{]*)"/g;
    while ((match = attr.exec(template))) {
      const literal = match[1].replace(/\s+/g, ' ').trim();
      if (!isAllowedLiteral(literal)) findings.push({ file, literal });
    }
  }
  return findings;
}

const catalogs = Object.fromEntries(
  languages.map(lang => [lang, readJson(path.join(catalogRoot, `${lang}.json`))])
);
const catalogKeys = Object.fromEntries(
  languages.map(lang => [lang, new Set(Object.keys(catalogs[lang]))])
);
const sourceFiles = walk(appRoot);
const usedKeys = new Map();
const literals = [];

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const found of extractKeys(file, text)) {
    if (!found.key.trim()) continue;
    if (!usedKeys.has(found.key)) usedKeys.set(found.key, new Set());
    usedKeys.get(found.key).add(path.relative(root, found.file));
  }
  literals.push(...literalFindings(path.relative(root, file), text));
}

const missing = [];
for (const [key, files] of usedKeys) {
  for (const lang of languages) {
    if (!catalogKeys[lang].has(key)) {
      missing.push(`${lang}: ${JSON.stringify(key)} used in ${[...files].join(', ')}`);
    }
  }
}

const parity = [];
for (const key of catalogKeys.en) {
  if (!catalogKeys.vi.has(key)) parity.push(`vi missing ${JSON.stringify(key)}`);
}
for (const key of catalogKeys.vi) {
  if (!catalogKeys.en.has(key)) parity.push(`en missing ${JSON.stringify(key)}`);
}

if (missing.length || parity.length || literals.length) {
  if (missing.length) console.error(`Missing catalog keys:\n${missing.join('\n')}`);
  if (parity.length) console.error(`Catalog parity issues:\n${parity.join('\n')}`);
  if (literals.length) {
    console.error('Possible untranslated literals:');
    for (const item of literals) console.error(`${item.file}: ${JSON.stringify(item.literal)}`);
  }
  process.exit(1);
}

console.log(`i18n check passed (${usedKeys.size} used keys, ${catalogKeys.en.size} catalog keys).`);
