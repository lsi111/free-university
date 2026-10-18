// 화면 번역 사전 검사. 화면 코드(src/, index.html)가 쓰는 번역 키를 모두 뽑아
// content/i18n/<언어>/ui.json 과 대조한다: 빠진 키, 남는 키, {자리표시자} 불일치를 찾는다.
//   node tools/i18n-keys.mjs          검사 (문제가 있으면 종료 코드 1)
//   node tools/i18n-keys.mjs --list   키 목록을 JSON으로 출력
// 키는 t('한국어 원문') / t("…") 의 문자열과 index.html 의 data-i18n* 속성 값이다.

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const UI_LANGS = ['en', 'es'];

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else if (extname(p) === '.js') out.push(p);
  }
  return out;
}

function stripComments(src) {
  // 줄 번호가 어긋나지 않도록 블록 주석은 줄바꿈만 남기고 지운다.
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
}

function unquote(lit) {
  const body = lit.slice(1, -1);
  return body.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (m, c) => {
    if (c[0] === 'u' && c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r' })[c] ?? c;
  });
}

const placeholders = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

/** 화면 코드가 쓰는 키: Map<키, 위치[]>. 문자열이 아닌 인자로 t()를 부르면 problems에 담는다. */
export async function collectKeys() {
  const keys = new Map();
  const problems = [];
  const add = (key, where) => { if (!keys.has(key)) keys.set(key, []); keys.get(key).push(where); };

  const files = (await walk(join(root, 'src'))).filter((f) => !f.endsWith(join('src', 'i18n.js')));
  const LIT = /\bt\(\s*('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\$])*`)/g;
  const ANY = /\bt\(\s*([^\s)])/g;
  for (const file of files) {
    const rel = file.slice(root.length + 1).replace(/\\/g, '/');
    const src = stripComments(await readFile(file, 'utf8'));
    const lineOf = (idx) => src.slice(0, idx).split('\n').length;
    const litAt = new Set();
    for (const m of src.matchAll(LIT)) {
      litAt.add(m.index);
      add(unquote(m[1]), `${rel}:${lineOf(m.index)}`);
    }
    for (const m of src.matchAll(ANY)) {
      if (!litAt.has(m.index)) problems.push(`${rel}:${lineOf(m.index)}: t()의 첫 인자가 문자열 리터럴이 아닙니다`);
    }
  }

  const html = await readFile(join(root, 'index.html'), 'utf8');
  for (const m of html.matchAll(/\sdata-i18n(?:-[a-z-]+)?="([^"]*)"/g)) {
    add(m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'), `index.html:${html.slice(0, m.index).split('\n').length}`);
  }
  return { keys, problems };
}

/** 사전 하나를 키 집합과 대조해 오류 문자열을 모아 돌려준다. */
export function diffDictionary(lang, keys, dict) {
  const errors = [];
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return [`${lang}: ui.json이 객체가 아닙니다`];
  for (const [key, where] of keys) {
    if (!(key in dict)) { errors.push(`${lang}: 번역 없음 "${key}" (${where[0]})`); continue; }
    const value = dict[key];
    if (typeof value !== 'string' || !value.trim()) { errors.push(`${lang}: 번역이 비어 있음 "${key}"`); continue; }
    const a = placeholders(key).join(',');
    const b = placeholders(value).join(',');
    if (a !== b) errors.push(`${lang}: {자리표시자}가 다름 "${key}" → "${value}" (원문 {${a}} / 번역 {${b}})`);
  }
  for (const key of Object.keys(dict)) if (!keys.has(key)) errors.push(`${lang}: 쓰이지 않는 키 "${key}"`);
  return errors;
}

export async function checkUiDictionaries() {
  const { keys, problems } = await collectKeys();
  const errors = [...problems];
  for (const lang of UI_LANGS) {
    let dict = null;
    try { dict = JSON.parse(await readFile(join(root, 'content', 'i18n', lang, 'ui.json'), 'utf8')); }
    catch (e) { errors.push(`${lang}: content/i18n/${lang}/ui.json을 읽을 수 없음 (${e.message})`); continue; }
    errors.push(...diffDictionary(lang, keys, dict));
  }
  return { count: keys.size, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--list')) {
    const { keys } = await collectKeys();
    console.log(JSON.stringify([...keys.keys()], null, 2));
  } else {
    const { count, errors } = await checkUiDictionaries();
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.log(errors.length ? `\n실패 ${errors.length}건` : `키 ${count}개, 언어 ${UI_LANGS.join('·')} 모두 일치`);
    process.exit(errors.length ? 1 : 0);
  }
}
