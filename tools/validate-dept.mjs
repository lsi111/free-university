// 학과 원고 하나를 카탈로그에 올리기 전에 검사한다.
// 실행: node tools/validate-dept.mjs <학과id>   (content/departments/<학과id>.json 을 읽는다)
import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDepartment, collectFigures } from '../src/engine/schema.js';
import { knownFeatures } from '../src/features.js';
import { solveDepartment } from './solve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id) { console.error('사용법: node tools/validate-dept.mjs <학과id>'); process.exit(2); }

const dept = JSON.parse(await readFile(join(root, `content/departments/${id}.json`), 'utf8'));
const errors = validateDepartment({ id }, dept);
const known = new Set(knownFeatures());
for (const l of dept.lessons) for (const f of l.features || []) if (!known.has(f)) errors.push(`${l.id}: 모르는 기능 ${f}`);
for (const { lesson, fig } of collectFigures(dept)) {
  if (fig.figure) await access(join(root, 'content', fig.figure)).catch(() => errors.push(`${lesson}: 그림 파일 없음 ${fig.figure}`));
}
const solved = solveDepartment(id, dept);
errors.push(...solved.errors);
const nChecks = dept.lessons.reduce((n, l) => n + l.checks.length, 0);
if (errors.length) { console.error(errors.map((e) => `  ✗ ${e}`).join('\n')); process.exit(1); }
console.log(`통과: ${id} · ${dept.lessons.length}교시 · 문항 ${nChecks}개 · 자기 확인 교시 ${solved.self}`);
