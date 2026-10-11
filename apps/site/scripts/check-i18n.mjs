// Fails the build when a locale is missing a key (or has an extra one) relative to en.json.
import { readFileSync } from 'node:fs';

const load = (l) => JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), 'utf8'));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const placeholders = (s) => (String(s).match(/\{[a-zA-Z]+\}|\[[A-Z_]+\]/g) ?? []).sort().join(',');
const get = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);

const en = load('en');
const enKeys = flat(en);
let bad = 0;
for (const locale of ['ja']) {
  const other = load(locale);
  const keys = new Set(flat(other));
  for (const k of enKeys) {
    if (!keys.has(k)) (console.error(`i18n: ${locale} is missing "${k}"`), bad++);
    else if (placeholders(get(en, k)) !== placeholders(get(other, k)))
      (console.error(`i18n: ${locale} "${k}" placeholders differ from en`), bad++);
  }
  for (const k of keys) if (!enKeys.includes(k)) (console.error(`i18n: ${locale} has extra key "${k}"`), bad++);
}
if (bad) process.exit(1);
console.log(`i18n: ${enKeys.length} keys present in all locales`);
