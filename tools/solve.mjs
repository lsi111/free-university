// 학과 데이터를 입구에서 끝까지 풀어 보는 시뮬레이션. 정답은 통과하고 오답은 통과하지 않는지도 본다.
import { grade } from '../src/engine/checks.js';
import { emptyProgress, deptProgress, isDone, isAvailable, markDone } from '../src/engine/progress.js';

function correctResponse(c) {
  switch (c.type) {
    case 'numeric': return String(c.answer);
    case 'expression': return c.answer;
    case 'choice': return c.answer;
    case 'match': return c.pairs.map((p) => p[1]);
    case 'order': return c.items;
    case 'keywords': return c.model;
    case 'submit': return { text: '가'.repeat(c.minLength ?? 1), checked: c.checklist.map(() => true) };
    default: return null;
  }
}
function wrongResponse(c) {
  switch (c.type) {
    case 'numeric': return String(Number(c.answer) + 1);
    case 'expression': return `${c.answer} + x + 1`;
    case 'choice': return [c.options.findIndex((_, i) => !c.answer.includes(i))];
    case 'match': return c.pairs.map((p, i) => c.pairs[(i + 1) % c.pairs.length][1]);
    case 'order': return [...c.items].reverse();
    case 'keywords': return '이 글에는 필요한 개념이 하나도 들어 있지 않은 아주 길고 무관한 문장이 계속 이어집니다.';
    case 'submit': return { text: '가'.repeat(c.minLength ?? 1), checked: c.checklist.map(() => false) };
    default: return null;
  }
}

export function solveDepartment(id, dept) {
  const errors = [];
  let progress = emptyProgress();
  let guard = 0;
  for (;;) {
    const dp = deptProgress(progress, id);
    const next = dept.lessons.find((l) => !isDone(dp, l.id) && isAvailable(dept, l, dp));
    if (!next || guard++ > 2000) break;
    const kinds = [];
    next.checks.forEach((c, i) => {
      const r = grade(c, correctResponse(c));
      if (r.status === 'pass') kinds.push(r.kind);
      else if (r.status === 'self-check') kinds.push('self');
      else errors.push(`${id}/${next.id} 문항 ${i + 1}: 정답이 통과하지 않음 (${r.message})`);
      const w = grade(c, wrongResponse(c));
      if (w.status !== 'fail') errors.push(`${id}/${next.id} 문항 ${i + 1}: 오답이 통과함`);
    });
    progress = markDone(progress, id, next, kinds);
  }
  const dp = deptProgress(progress, id);
  const missed = dept.lessons.map((l) => l.id).filter((lid) => !isDone(dp, lid));
  if (missed.length) errors.push(`${id}: 도달할 수 없는 교시 ${missed.join(', ')}`);
  const self = Object.values(dp.lessons).filter((v) => v.kind === 'self').length;
  return { errors, self };
}
