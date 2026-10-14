// CI 검사. 실행: node tools/check.mjs
//  1. 카탈로그와 열린 학과 데이터 스키마
//  2. 교시 features가 화면이 아는 기능인지
//  3. 화면 코드(src/, index.html)에 학과 id·이름이 없는지
//  4. 학과를 하나씩 빼도 교실이 성립하는지 (+ 학과 0개)
//  5. 열린 학과마다 입구에서 모든 교시를 끝까지 풀 수 있는지, 오답은 통과하지 않는지

import { readFile, readdir, access } from 'node:fs/promises';
import vm from 'node:vm';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog, validateDepartment, collectFigures } from '../src/engine/schema.js';
import { solveDepartment } from './solve.mjs';
import { validateReviews } from '../src/engine/review.js';
import { validateSite } from '../src/engine/report.js';
import { groupByField } from '../src/data.js';
import { knownFeatures } from '../src/features.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'));

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const section = (t) => console.log(`\n▸ ${t}`);

const fields = await readJson('content/fields.json');
const catalog = await readJson('content/catalog.json');
const depts = new Map();
for (const meta of catalog.filter((d) => d.status === 'open')) {
  try { depts.set(meta.id, await readJson(`content/${meta.file}`)); }
  catch (e) { fail(`${meta.id}: ${meta.file}을 읽을 수 없음 (${e.message})`); }
}

// 1
section('스키마');
for (const e of validateCatalog(fields, catalog)) fail(e);
for (const [id, dept] of depts) for (const e of validateDepartment(catalog.find((d) => d.id === id), dept)) fail(e);
console.log(`  계열 ${fields.length}, 학과 칸 ${catalog.length}, 열린 학과 ${depts.size}`);

for (const [id, dept] of depts) {
  for (const { lesson, fig } of collectFigures(dept)) {
    if (fig.figure) await access(join(root, 'content', fig.figure)).catch(() => fail(`${id}/${lesson}: 그림 파일이 없음 ${fig.figure}`));
  }
}

section('검수 기록과 신고 설정');
for (const e of validateReviews(await readJson('content/reviews.json'), depts)) fail(e);
for (const e of validateSite(await readJson('content/site.json'))) fail(e);
console.log('  reviews.json, site.json 형식 확인');

// 2
section('교시 기능');
const known = new Set(knownFeatures());
for (const [id, dept] of depts) for (const l of dept.lessons) for (const f of l.features || []) {
  if (!known.has(f)) fail(`${id}/${l.id}: 화면이 모르는 기능 "${f}"`);
}

// 2b
section('수식');
{
  // 사이트가 쓰는 번들(vendor/katex)로 모든 수식을 렌더링해 본다. 한글 글꼴 경고는 무시하고 문법 오류만 본다.
  const sandbox = { module: { exports: {} }, exports: {} };
  sandbox.self = sandbox;
  vm.runInNewContext(await readFile(join(root, 'vendor/katex/katex.min.js'), 'utf8'), sandbox);
  const katex = sandbox.module.exports.renderToString ? sandbox.module.exports : sandbox.katex;
  const collect = (x, out) => {
    if (typeof x === 'string') out.push(x);
    else if (Array.isArray(x)) x.forEach((v) => collect(v, out));
    else if (x && typeof x === 'object') Object.values(x).forEach((v) => collect(v, out));
  };
  let count = 0;
  for (const [id, dept] of depts) {
    for (const l of dept.lessons) {
      const parts = [];
      collect([l.explain, l.examples, l.checks.map((c) => [c.prompt, c.options, c.pairs, c.items, c.hint, c.explanation, c.model, c.selfCheck, c.checklist])], parts);
      const texs = [];
      parts.join('\n').replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => { texs.push(t.trim()); return ''; }).replace(/\$([^$\n]+?)\$/g, (_, t) => { texs.push(t); return ''; });
      const declared = (l.features || []).includes('formula');
      if (texs.length && !declared) fail(`${id}/${l.id}: 수식($…$)을 쓰지만 features에 "formula"가 없음`);
      if (declared && !texs.length && !l.checks.some((c) => c.type === 'expression')) fail(`${id}/${l.id}: "formula"를 선언했지만 수식이 없음 (불필요한 로드)`);
      for (const t of texs) {
        count++;
        try { katex.renderToString(t, { throwOnError: true, strict: 'ignore' }); }
        catch (e) { fail(`${id}/${l.id}: TeX 오류 "${t.slice(0, 40)}" (${String(e.message).slice(0, 60)})`); }
      }
    }
  }
  console.log(`  수식 ${count}개 렌더링 확인`);
}

// 3
section('화면 코드에 학과 이름 없음');
async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else if (['.js', '.css', '.html'].includes(extname(p))) out.push(p);
  }
  return out;
}
async function svgFiles() {
  const out = [];
  const walkSvg = async (dir) => {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) await walkSvg(p);
      else if (extname(p) === '.svg') out.push(p);
    }
  };
  await walkSvg(join(root, 'content'));
  return out;
}
const uiFiles = [...await walk(join(root, 'src')), join(root, 'index.html')];
let scanned = 0;
for (const file of uiFiles) {
  const text = await readFile(file, 'utf8');
  scanned++;
  for (const d of catalog) {
    const idRe = new RegExp(`(?<![A-Za-z0-9_-])${d.id.replace(/-/g, '\\-')}(?![A-Za-z0-9_-])`);
    if (idRe.test(text)) fail(`${file.replace(root + '/', '')}: 학과 id "${d.id}"가 들어 있음`);
    if (text.includes(d.name)) fail(`${file.replace(root + '/', '')}: 학과 이름 "${d.name}"이 들어 있음`);
  }
}
console.log(`  파일 ${scanned}개 × 학과 ${catalog.length}개 검사`);

// 3b
section('실행 중 외부 호출 없음 (AI·API 비용 원칙)');
// 사이트가 실행 중에 접속해도 되는 외부 주소. 지금은 없다. 늘리려면 여기에 이유와 함께 추가한다.
const ALLOWED_HOSTS = new Map();
const BANNED = [/api[_-]?key/i, /\bfetch\s*\(\s*['"`]https?:/i, /openai|anthropic|api\.|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i];
let externalSeen = 0;
for (const file of [...uiFiles, ...await svgFiles()]) {
  const text = await readFile(file, 'utf8');
  const rel = file.replace(root + '/', '');
  for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    const host = m[1].toLowerCase();
    if (host === 'www.w3.org' || host === 'localhost' || host.endsWith('.localhost')) continue; // xmlns, 개발 서버
    externalSeen++;
    if (!ALLOWED_HOSTS.has(host)) fail(`${rel}: 허용되지 않은 외부 주소 ${host}`);
  }
  for (const re of BANNED) if (re.test(text)) fail(`${rel}: 외부 서비스 호출로 보이는 코드 (${re})`);
}
console.log(`  허용 목록 ${ALLOWED_HOSTS.size}곳, 발견된 외부 주소 ${externalSeen}개`);

// 4
section('어느 학과를 빼도 교실이 성립');
const variants = [...catalog.map((d) => ({ label: `${d.name} 제외`, list: catalog.filter((x) => x.id !== d.id) })), { label: '학과 0개', list: [] }];
for (const { label, list } of variants) {
  const errs = validateCatalog(fields, list);
  if (errs.length) { fail(`${label}: ${errs[0]}`); continue; }
  try {
    const groups = groupByField(fields, list);
    if (groups.length !== fields.length) fail(`${label}: 계열이 사라짐`);
  } catch (e) { fail(`${label}: 묶기 실패 ${e.message}`); }
  for (const d of list.filter((x) => x.status === 'open')) {
    if (validateDepartment(d, depts.get(d.id)).length) fail(`${label}: ${d.name} 데이터가 깨짐`);
  }
}
console.log(`  ${variants.length}가지 구성 검사`);

// 5
section('입구에서 끝까지 풀기');
for (const [id, dept] of depts) {
  const { errors, self } = solveDepartment(id, dept);
  for (const e of errors) fail(e);
  console.log(`  ${catalog.find((d) => d.id === id).name}: ${dept.lessons.length}교시 모두 풀림 (자기 확인 포함 ${self})`);
}

console.log(failures ? `\n실패 ${failures}건` : '\n모든 검사 통과');
process.exit(failures ? 1 : 0);
