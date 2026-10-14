import test from 'node:test';
import assert from 'node:assert/strict';
import { value, equivalent } from '../src/engine/expr.js';
import { grade } from '../src/engine/checks.js';
import { validateDepartment } from '../src/engine/schema.js';
import { reviewState, deptReviewSummary, validateReviews } from '../src/engine/review.js';
import { buildReport, mailtoUrl, validateSite, reportTargets } from '../src/engine/report.js';
import { inline, block } from '../src/md.js';
import { stripMarkup, filterDepartments, searchLessons } from '../src/engine/search.js';
import { extractConcepts, findLessonConnections, findRelatedDepartments } from '../src/engine/connections.js';

test('수식 값 및 천 단위 쉼표 지원', () => {
  assert.equal(value('1/2'), 0.5);
  assert.equal(value('2^3^2'), 512);
  assert.equal(value('-2^2'), -4);
  assert.equal(value('1,200'), 1200);
  assert.equal(value('1,000,000 + 500'), 1000500);
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

test('적분 상수: upToConstant (대소문자 C 및 부호 허용)', () => {
  assert.ok(equivalent('x^2 + 5', 'x^2', { upToConstant: true }));
  assert.ok(equivalent('x^2 + C', 'x^2', { upToConstant: true }));
  assert.ok(equivalent('x^2 + c', 'x^2', { upToConstant: true }));
  assert.ok(equivalent('x^2 - C', 'x^2', { upToConstant: true }));
  assert.ok(!equivalent('x^2 + x', 'x^2', { upToConstant: true }));
});

test('계산형 허용 오차', () => {
  const c = { type: 'numeric', answer: 3.14, tolerance: 0.01 };
  assert.equal(grade(c, '3.141').status, 'pass');
  assert.equal(grade(c, '3.2').status, 'fail');
  assert.equal(grade({ type: 'numeric', answer: 0.5 }, '1/2').status, 'pass');
  assert.equal(grade({ type: 'numeric', answer: 1500 }, '1,500').status, 'pass');
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

test('마크다운: 인라인 코드 안의 별표(*)와 달러($)가 깨지지 않는다', () => {
  assert.equal(inline('`2*3`과 `4*5`'), '<code>2*3</code>과 <code>4*5</code>');
  assert.equal(inline('`$x$`와 $y$', { math: true }), '<code>$x$</code>와 <span class="math" data-tex="y">y</span>');
  assert.equal(block('식 `a * b`와 `c * d`를 계산한다.'), '<p>식 <code>a * b</code>와 <code>c * d</code>를 계산한다.</p>');
});

test('통합 검색: 학과 요약·대상 필터와 교시 본문 검색', () => {
  const fields = [{ id: 'f1', name: '자연' }];
  const catalog = [
    { id: 'd1', name: '가학과', field: 'f1', status: 'open', summary: '기회비용과 선택을 다룬다', audience: '입문자' },
    { id: 'd2', name: '나학과', field: 'f1', status: 'open', summary: '파동과 빛을 다룬다', audience: '비전공자' },
  ];
  assert.equal(filterDepartments(catalog, fields, '기회비용').length, 1);
  assert.equal(filterDepartments(catalog, fields, '기회비용')[0].id, 'd1');

  const depts = new Map([
    ['d1', {
      trunk: ['d1-01'],
      lessons: [{
        id: 'd1-01',
        title: '희소성과 선택',
        explain: ['포기한 대안 중 가장 큰 가치를 **기회비용**이라 한다.'],
        examples: [{ title: '예시', body: ['본문'] }],
        checks: [{ type: 'numeric', prompt: '기회비용은 얼마인가?', answer: 10 }],
      }],
    }],
  ]);
  const hits = searchLessons(catalog, depts, '기회비용');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].lessonId, 'd1-01');
  assert.equal(hits[0].where, '설명');
  assert.ok(stripMarkup('**기회비용**과 $x^2$').includes('기회비용'));
});

test('학과 간 연결: 공유 핵심 개념어 및 보조 계열 학과 탐색', () => {
  const l1 = { id: 'a-01', title: '선택', explain: ['핵심은 **기회비용**과 **비교우위**다.'] };
  const l2 = { id: 'b-02', title: '교역', explain: ['교역의 기준은 **비교우위**와 **기회비용**이다.'] };
  assert.deepEqual(extractConcepts(l1), ['기회비용', '비교우위']);

  const catalog = [
    { id: 'a', name: '가학과', field: 'f1', tags: ['f2'], status: 'open' },
    { id: 'b', name: '나학과', field: 'f2', status: 'open' },
  ];
  const depts = new Map([
    ['a', { lessons: [l1] }],
    ['b', { lessons: [l2] }],
  ]);
  const links = findLessonConnections({ deptId: 'a', lesson: l1, catalog, depts });
  assert.equal(links.length, 1);
  assert.equal(links[0].deptId, 'b');
  assert.deepEqual(links[0].concepts, ['비교우위', '기회비용']);

  const rel = findRelatedDepartments(catalog[0], catalog);
  assert.equal(rel.length, 1);
  assert.equal(rel[0].id, 'b');
});
