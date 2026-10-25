// 번역 작업 도구.
//   node tools/i18n.mjs prep   <lang> <학과id> <작업폴더>   번역할 문장을 교시별 파일(<교시id>.json, _branches.json)로 꺼낸다
//   node tools/i18n.mjs build  <lang> <학과id> <작업폴더>   <작업폴더>/out/*.json 을 검사해 content/i18n/<lang>/<학과id>.json 으로 합친다
//   node tools/i18n.mjs verify <lang> <학과id>              이미 합쳐진 번역본을 원본에 덧씌워 구조·풀이를 다시 검사한다
//   node tools/i18n.mjs status                              언어별 번역 현황
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceOf, applyDeptOverlay } from '../src/engine/i18n.js';
import { validateDepartment } from '../src/engine/schema.js';
import { solveDepartment } from './solve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'es'];
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const HANGUL = /[가-힣]/;

const deptOf = (id) => readJson(join(root, `content/departments/${id}.json`));

/** 구조 비교: 문자열 값은 무시하고 키·배열 길이만 본다. */
function shapeErrors(src, tr, path = '') {
  if (typeof src === 'string') return typeof tr === 'string' ? [] : [`${path}: 문자열이어야 합니다`];
  if (Array.isArray(src)) {
    if (!Array.isArray(tr)) return [`${path}: 배열이어야 합니다`];
    if (src.length !== tr.length) return [`${path}: 길이 ${tr.length} ≠ 원문 ${src.length}`];
    return src.flatMap((s, i) => shapeErrors(s, tr[i], `${path}[${i}]`));
  }
  if (src && typeof src === 'object') {
    if (!tr || typeof tr !== 'object' || Array.isArray(tr)) return [`${path}: 객체여야 합니다`];
    const errs = [];
    for (const k of Object.keys(src)) errs.push(...shapeErrors(src[k], tr[k], `${path}.${k}`));
    for (const k of Object.keys(tr)) if (!(k in src)) errs.push(`${path}.${k}: 원문에 없는 키`);
    return errs;
  }
  return [];
}

function strings(v, path = '', out = []) {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) strings(v[k], `${path}.${k}`, out);
  return out;
}

/** $...$ 안의 식(\text{} 속 글자는 제외)이 원문과 같은지 */
const mathOf = (s) => (s.match(/\$\$[\s\S]+?\$\$|\$[^$]+\$/g) || []).map((m) => m.replace(/\\text\{[^}]*\}/g, '\\text{}').replace(/\s+/g, ''));

function textErrors(src, tr, lang) {
  const errs = [];
  const a = new Map(strings(src));
  for (const [p, s] of strings(tr)) {
    const o = a.get(p);
    if (!s.trim()) { errs.push(`${p}: 빈 문장`); continue; }
    if (o == null) continue;
    if (/[\x00-\x09\x0b-\x1f]/.test(s)) errs.push(`${p}: 제어문자(탭 등)가 들어 있습니다 — LaTeX 역슬래시가 JSON에서 깨졌을 수 있습니다`);
    if (mathOf(o).sort().join('\u0001') !== mathOf(s).sort().join('\u0001')) errs.push(`${p}: $...$ 수식이 원문과 다릅니다`);
    if ((o.match(/\*\*/g) || []).length !== (s.match(/\*\*/g) || []).length) errs.push(`${p}: ** 강조 표시 개수가 원문과 다릅니다`);
    if ((o.match(/\n/g) || []).length !== (s.match(/\n/g) || []).length) errs.push(`${p}: 줄바꿈 개수가 원문과 다릅니다`);
  }
  return errs;
}

function hangulWarnings(tr) {
  return strings(tr).filter(([, s]) => HANGUL.test(s)).map(([p, s]) => `${p}: 한글이 남아 있음 "${s.slice(0, 40)}"`);
}

function applyChecks(id, dept, overlay) {
  const merged = applyDeptOverlay(dept, overlay);
  const errs = validateDepartment({ id }, merged);
  merged.lessons.forEach((l) => l.checks.forEach((c, i) => {
    if (c.type === 'match' && new Set(c.pairs.map((p) => p[1])).size !== c.pairs.length) errs.push(`${l.id} 문항 ${i + 1}: 짝짓기 오른쪽 문장이 서로 같습니다`);
    if (c.type === 'choice' && new Set(c.options).size !== c.options.length) errs.push(`${l.id} 문항 ${i + 1}: 선택지가 서로 같습니다`);
  }));
  errs.push(...solveDepartment(id, merged).errors);
  return errs;
}

const [cmd, lang, id, work] = process.argv.slice(2);

if (cmd === 'prep') {
  const dept = await deptOf(id);
  const src = sourceOf(dept);
  await mkdir(join(work, 'out'), { recursive: true });
  await writeFile(join(work, '_branches.json'), JSON.stringify(src.branches, null, 1));
  for (const [lid, v] of Object.entries(src.lessons)) await writeFile(join(work, `${lid}.json`), JSON.stringify(v, null, 1));
  console.log(`${id}: 원문 ${Object.keys(src.lessons).length}개 교시 + _branches.json → ${work}\n번역본은 ${join(work, 'out')}/ 에 같은 파일명으로 쓰세요.`);
} else if (cmd === 'build' || cmd === 'verify') {
  const dept = await deptOf(id);
  const src = sourceOf(dept);
  let overlay;
  const errors = [];
  const warns = [];
  if (cmd === 'build') {
    overlay = { branches: {}, lessons: {} };
    const read = async (name, source, into, key) => {
      let tr;
      try { tr = await readJson(join(work, 'out', name)); } catch { errors.push(`${name}: 번역 파일이 없거나 JSON이 아닙니다`); return; }
      for (const e of shapeErrors(source, tr, name)) errors.push(e);
      for (const e of textErrors(source, tr, lang)) errors.push(`${name}${e}`);
      warns.push(...hangulWarnings(tr).map((w) => `${name}${w}`));
      into[key] = tr;
    };
    await read('_branches.json', src.branches, overlay, 'branches');
    for (const lid of Object.keys(src.lessons)) await read(`${lid}.json`, src.lessons[lid], overlay.lessons, lid);
  } else {
    overlay = await readJson(join(root, `content/i18n/${lang}/${id}.json`));
    errors.push(...shapeErrors(src, overlay, id), ...textErrors(src, overlay, lang));
    warns.push(...hangulWarnings(overlay));
  }
  if (!errors.length) errors.push(...applyChecks(id, dept, overlay));
  const total = strings(overlay).length;
  if (total && warns.length / total > 0.25) errors.push(`번역되지 않은 문장이 너무 많습니다 (한글 포함 ${warns.length}/${total})`);
  if (warns.length) console.log(`한글이 남은 곳 ${warns.length}개 (한국어 예문·고유명 인용이면 정상):\n${warns.slice(0, 8).map((w) => `  · ${w}`).join('\n')}`);
  if (errors.length) { console.error(errors.slice(0, 40).map((e) => `  ✗ ${e}`).join('\n') + (errors.length > 40 ? `\n  … 외 ${errors.length - 40}개` : '')); process.exit(1); }
  if (cmd === 'build') {
    await mkdir(join(root, `content/i18n/${lang}`), { recursive: true });
    await writeFile(join(root, `content/i18n/${lang}/${id}.json`), JSON.stringify(overlay));
  }
  console.log(`통과: ${lang}/${id} · ${Object.keys(src.lessons).length}교시`);
} else if (cmd === 'status') {
  const catalog = await readJson(join(root, 'content/catalog.json'));
  const open = catalog.filter((d) => d.status === 'open').map((d) => d.id);
  for (const l of LANGS) {
    let have = [];
    try { have = (await readdir(join(root, `content/i18n/${l}`))).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { /* 없음 */ }
    const done = open.filter((d) => have.includes(d));
    console.log(`${l}: 학과 ${done.length}/${open.length}${have.includes('catalog') ? ' · catalog ✓' : ''}${have.includes('ui') ? ' · ui ✓' : ''}`);
    if (done.length < open.length) console.log(`   남음: ${open.filter((d) => !done.includes(d)).join(', ')}`);
  }
} else {
  console.error('사용법은 파일 위 주석 참고');
  process.exit(2);
}
