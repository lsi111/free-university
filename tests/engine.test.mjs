import test from 'node:test';
import assert from 'node:assert/strict';
import { value, equivalent } from '../src/engine/expr.js';
import { grade } from '../src/engine/checks.js';
import { validateDepartment } from '../src/engine/schema.js';
import { reviewState, deptReviewSummary, validateReviews } from '../src/engine/review.js';
import { buildReport, mailtoUrl, validateSite, reportTargets } from '../src/engine/report.js';

test('수식 값', () => {
  assert.equal(value('1/2'), 0.5);
  assert.equal(value('2^3^2'), 512);
  assert.equal(value('-2^2'), -4);
  assert.ok(Math.abs(value('2pi') - 2 * Math.PI) < 1e-12);
  assert.throws(() => value('2+'));
  assert.throws(() => value('alert(1)'));
});

test('식 동치: 전개, 곱 생략, 기호', () => {
  assert.ok(equivalent('x^2+2x+1', '(x+1)^2'));
  assert.ok(equivalent('3x²+2', '3*x^2+2'));
  assert.ok(equivalent('2(x+1)', '2x+2'));
  assert.ok(equivalent('sin(x)^2+cos(x)^2', '1'));
  assert.ok(!equivalent('x^2', 'x^3'));
});

test('적분 상수: upToConstant', () => {
  assert.ok(equivalent('x^2 + 5', 'x^2', { upToConstant: true }));
  assert.ok(equivalent('x^2 + C', 'x^2', { upToConstant: true }));
  assert.ok(!equivalent('x^2 + x', 'x^2', { upToConstant: true }));
});

test('계산형 허용 오차', () => {
  const c = { type: 'numeric', answer: 3.14, tolerance: 0.01 };
  assert.equal(grade(c, '3.141').status, 'pass');
  assert.equal(grade(c, '3.2').status, 'fail');
  assert.equal(grade({ type: 'numeric', answer: 0.5 }, '1/2').status, 'pass');
});

test('핵심어 서술은 통과가 아니라 자기 점검으로 넘긴다', () => {
  const c = { type: 'keywords', groups: [['정당화', '근거'], ['우연']], model: 'm', minLength: 10 };
  assert.equal(grade(c, '근거가 있었지만 맞은 것은 우연이었다').status, 'self-check');
  assert.equal(grade(c, '근거가 있었지만 맞은 것은 운이었다').status, 'fail');
  assert.equal(grade(c, '짧다').status, 'fail');
});

test('제출형은 자기 점검을 모두 해야 통과, 종류는 self', () => {
  const c = { type: 'submit', checklist: ['a', 'b'], minLength: 3 };
  assert.deepEqual(grade(c, { text: '가나다', checked: [true, true] }), { status: 'pass', kind: 'self' });
  assert.equal(grade(c, { text: '가나다', checked: [true, false] }).status, 'fail');
});

test('스키마: 다른 학과 선행, 순환, 입구 없음을 잡는다', () => {
  const meta = { id: 't' };
  const L = (id, requires) => ({ id, title: id, requires, explain: ['a'], examples: [{ body: ['b'] }], checks: [{ type: 'choice', prompt: 'p', options: ['a', 'b'], answer: [0] }] });
  const errs = validateDepartment(meta, { trunk: ['a', 'b'], lessons: [L('a', ['b']), L('b', ['a'])] });
  assert.ok(errs.some((e) => e.includes('입구')));
  assert.ok(errs.some((e) => e.includes('순환')));
  const cross = validateDepartment(meta, { trunk: ['a'], lessons: [L('a', ['other-dept-01'])] });
  assert.ok(cross.some((e) => e.includes('다른 학과')));
});

test('스키마: 식 문항은 formula 기능 선언이 필요하다', () => {
  const l = { id: 'a', title: 'a', requires: [], features: [], explain: ['a'], examples: [{ body: ['b'] }], checks: [{ type: 'expression', prompt: 'p', answer: 'x' }] };
  const errs = validateDepartment({ id: 't' }, { trunk: ['a'], lessons: [l] });
  assert.ok(errs.some((e) => e.includes('formula')));
});

test('스키마: 그림에는 alt가 필요하다', () => {
  const l = { id: 'a', title: 'a', requires: [], explain: [{ figure: 'x.svg' }], examples: [{ body: ['b'] }], checks: [{ type: 'choice', prompt: 'p', options: ['a', 'b'], answer: [0] }] };
  const errs = validateDepartment({ id: 't' }, { trunk: ['a'], lessons: [l] });
  assert.ok(errs.some((e) => e.includes('alt')));
});

test('검수 상태: 기록 없음, 같은 버전, 내용이 바뀐 뒤', () => {
  assert.equal(reviewState({ id: 'a' }, undefined), 'unreviewed');
  assert.equal(reviewState({ id: 'a' }, { version: 1 }), 'reviewed');
  assert.equal(reviewState({ id: 'a', version: 2 }, { version: 1 }), 'stale');
  const dept = { lessons: [{ id: 'a' }, { id: 'b', version: 2 }, { id: 'c' }] };
  assert.deepEqual(deptReviewSummary(dept, { a: { version: 1 }, b: { version: 1 } }), { total: 3, reviewed: 1, stale: 1, unreviewed: 1 });
});

test('검수 기록 검증: 없는 교시, 날짜, 앞선 버전, 검수자', () => {
  const depts = new Map([['d', { lessons: [{ id: 'a' }] }]]);
  assert.deepEqual(validateReviews({ d: { a: { reviewer: '홍', date: '2026-10-20', version: 1 } } }, depts), []);
  assert.ok(validateReviews({ x: {} }, depts).length);
  assert.ok(validateReviews({ d: { zz: { reviewer: '홍', date: '2026-10-20', version: 1 } } }, depts).length);
  assert.ok(validateReviews({ d: { a: { reviewer: '', date: '2026-13-40', version: 5 } } }, depts).length >= 3);
});

test('신고문: 위치와 버전이 들어가고, 받는 곳이 없으면 mailto가 없다', () => {
  const lesson = { id: 'x-01', title: '제목', version: 3, checks: [{}, {}] };
  assert.deepEqual(reportTargets(lesson), ['교시 전체', '설명', '예', '문항 1', '문항 2']);
  const r = buildReport({ deptName: '학과', deptId: 'dept', lesson, where: '문항 2', kind: '기타', text: ' 내용 ' });
  assert.ok(r.includes('x-01') && r.includes('버전 3') && r.includes('문항 2') && r.endsWith('내용'));
  assert.equal(mailtoUrl({ reportEmail: null }, r, 's'), null);
  const m = mailtoUrl({ reportEmail: 'a@b.co' }, r, '제목');
  assert.ok(m.startsWith('mailto:a@b.co?subject=') && !m.includes('\n'));
  assert.ok(mailtoUrl({ reportEmail: 'a@b.co' }, 'x'.repeat(5000), 's').length < 2500);
});

test('사이트 설정 검증', () => {
  assert.deepEqual(validateSite({ reportEmail: null, reportUrl: null }), []);
  assert.ok(validateSite({ reportEmail: 'not-an-email' }).length);
  assert.ok(validateSite({ reportUrl: 'http://insecure.example' }).length);
  assert.deepEqual(validateSite({ reportUrl: 'https://example.com/issues/new' }), []);
});
