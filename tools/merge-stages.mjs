// 2~6단계 원고(조각 파일)를 학과 데이터에 합친다. docs/BACHELOR_6STAGE_PLAN.md의 틀을 그대로 따른다.
// 실행: node tools/merge-stages.mjs <학과id> <조각.json>
//
// 조각 형식:
// {
//   "stages": { "2": { "name": "…", "summary": "…" }, …, "6": { … } },
//   "lessons": [ 14개 교시 (07~20 순서). id·requires·version은 이 도구가 채운다 ]
// }
//
// - 교시 id는 <줄기 접두어>-07 … -20.
// - 같은 단계 안에서는 앞 교시가 다음 교시의 선행이다. 단계의 첫 교시는 단계를 여는 교시를 선행으로 둔다.
// - 단계 개방: 2단계 ← 줄기 3교시, 3단계 ← 줄기 4교시, 4단계 ← 줄기 6교시,
//   5단계 ← 07·10·13교시, 6단계 ← 09·12·15·18교시.
// - 이미 있던 id의 교시는 내용이 바뀌었으므로 version을 하나 올린다(이미 마친 사람에게 "내용 갱신됨").

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, fragPath] = process.argv.slice(2);
if (!id || !fragPath) { console.error('사용법: node tools/merge-stages.mjs <학과id> <조각.json>'); process.exit(2); }

const deptPath = join(root, `content/departments/${id}.json`);
const dept = JSON.parse(await readFile(deptPath, 'utf8'));
// 조각은 JSON이거나, 수식의 역슬래시를 그대로 쓰기 위해 default export를 가진 .mjs일 수 있다.
const frag = fragPath.endsWith('.mjs')
  ? (await import(pathToFileURL(resolve(fragPath)).href)).default
  : JSON.parse(await readFile(fragPath, 'utf8'));

const COUNTS = { 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 };

// "formula" 기능은 원고에서 판단한다: 수식($…$)이나 식 문항이 있으면 선언하고, 없으면 뺀다(tools/check.mjs 규칙과 같음).
const strings = (x, out = []) => {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
};
const usesMath = (l) => /\$[^$\n]+?\$/.test(strings([l.explain, l.examples, l.checks]).join('\n'))
  || (l.checks || []).some((c) => c.type === 'expression');
const featuresOf = (l) => [...(l.features || []).filter((f) => f !== 'formula'), ...(usesMath(l) ? ['formula'] : [])];
if (dept.trunk.length !== 6) throw new Error('줄기가 6교시가 아닙니다');
if (frag.lessons.length !== 14) throw new Error(`교시가 14개여야 합니다 (지금 ${frag.lessons.length})`);
const prefix = dept.trunk[0].replace(/-\d+$/, '');
const no = (n) => `${prefix}-${String(n).padStart(2, '0')}`;
const T = (n) => dept.trunk[n - 1];

const OPENS = { 2: [T(3)], 3: [T(4)], 4: [T(6)], 5: [no(7), no(10), no(13)], 6: [no(9), no(12), no(15), no(18)] };
const oldById = new Map(dept.lessons.map((l) => [l.id, l]));
const trunkLessons = dept.trunk.map((tid) => oldById.get(tid));

const branches = [];
const lessons = [];
let n = 7;
for (const stage of [2, 3, 4, 5, 6]) {
  const meta = frag.stages[stage];
  if (!meta?.name) throw new Error(`${stage}단계 name이 없습니다`);
  const ids = [];
  for (let i = 0; i < COUNTS[stage]; i++, n++) {
    const src = frag.lessons[n - 7];
    const lid = no(n);
    const prev = oldById.get(lid);
    const { id: _ignore, requires: _r, version: _v, ...body } = src;
    lessons.push({
      id: lid,
      title: body.title,
      minutes: body.minutes ?? 35,
      requires: i === 0 ? [] : [ids[i - 1]],
      features: featuresOf(body),
      version: prev ? (prev.version || 1) + 1 : 1,
      ...Object.fromEntries(Object.entries(body).filter(([k]) => !['title', 'minutes', 'features'].includes(k))),
    });
    ids.push(lid);
  }
  branches.push({ id: `${prefix}-s${stage}`, stage, name: meta.name, summary: meta.summary || '', opensAfter: OPENS[stage], lessons: ids });
}

dept.branches = branches;
dept.lessons = [...trunkLessons, ...lessons];
await writeFile(deptPath, JSON.stringify(dept, null, 2) + '\n', 'utf8');
console.log(`${id}: 2~6단계 ${lessons.length}교시 합침 (${prefix}-07 ~ ${prefix}-20)`);
