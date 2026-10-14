// 검수 현황 보기와 검수 기록 남기기.
//   node tools/review.mjs status
//   node tools/review.mjs add <학과id> <교시id|all> --reviewer "이름" [--date 2026-10-20] [--notes "메모"]
// 검수 기록은 content/reviews.json 에 쌓인다. 교시의 version을 올리면 그 교시는 "검수 뒤 바뀜"이 된다.
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewState, deptReviewSummary, validateReviews, lessonVersion } from '../src/engine/review.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'));

const catalog = await readJson('content/catalog.json');
const reviews = await readJson('content/reviews.json');
const depts = new Map();
for (const meta of catalog.filter((d) => d.status === 'open')) depts.set(meta.id, { meta, dept: await readJson(`content/${meta.file}`) });
const deptsOnly = new Map([...depts].map(([id, v]) => [id, v.dept]));

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'status') {
  let total = 0, reviewed = 0;
  for (const [id, { meta, dept }] of [...depts].sort((a, b) => a[1].meta.name.localeCompare(b[1].meta.name, 'ko'))) {
    const c = deptReviewSummary(dept, reviews[id]);
    total += c.total; reviewed += c.reviewed;
    const mark = c.reviewed === c.total ? '✓' : c.reviewed + c.stale > 0 ? '△' : '·';
    console.log(`${mark} ${meta.name.padEnd(8, '　')} 검수됨 ${c.reviewed}/${c.total}${c.stale ? `  (바뀜 ${c.stale})` : ''}`);
  }
  console.log(`\n전체 ${reviewed}/${total}교시 검수됨`);
} else if (cmd === 'add') {
  const [deptId, lessonArg] = rest;
  const flag = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const reviewer = flag('reviewer');
  const date = flag('date') || new Date().toISOString().slice(0, 10);
  const notes = flag('notes');
  const entry = depts.get(deptId);
  if (!entry || !lessonArg || !reviewer) {
    console.error('사용법: node tools/review.mjs add <학과id> <교시id|all> --reviewer "이름" [--date YYYY-MM-DD] [--notes "메모"]');
    process.exit(2);
  }
  const lessons = lessonArg === 'all' ? entry.dept.lessons : entry.dept.lessons.filter((l) => l.id === lessonArg);
  if (!lessons.length) { console.error(`${deptId}에 ${lessonArg} 교시가 없습니다`); process.exit(2); }
  reviews[deptId] ||= {};
  for (const l of lessons) {
    reviews[deptId][l.id] = { reviewer, date, version: lessonVersion(l), ...(notes ? { notes } : {}) };
  }
  const errors = validateReviews(reviews, deptsOnly);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  await writeFile(join(root, 'content/reviews.json'), `${JSON.stringify(reviews, null, 2)}\n`);
  console.log(`${entry.meta.name}: ${lessons.length}교시를 ${reviewer} 검수(${date})로 기록했습니다.`);
} else {
  console.error('명령: status | add');
  process.exit(2);
}
