// 교시 화면: 설명 → 예 → 확인. 모든 학과가 이 하나를 쓴다.

import { h, fill } from '../dom.js';
import { blocks, inline, figure } from '../md.js';
import { applyFeatures } from '../features.js';
import { grade, CHECK_TYPES } from '../engine/checks.js';
import { deptProgress, isDone, isUnlocked, isAvailable, markDone, saveSubmission, lessonOrder, STAGE_NAMES } from '../engine/progress.js';
import { findLessonConnections } from '../engine/connections.js';
import { renderInput } from './check-inputs.js';
import { errorPanel } from './department.js';
import { reviewBadge, reportPanel } from './report.js';

export function renderLesson(root, { meta, dept, catalog = [], errors, lessonId, getProgress, setProgress, loadAllDepartments, reviews = {}, site = {} }) {
  const lesson = dept.lessons.find((l) => l.id === lessonId);
  const trunkIndex = dept.trunk.indexOf(lessonId);
  const branch = (dept.branches || []).find((b) => b.lessons.includes(lessonId));
  const branchIndex = branch ? branch.lessons.indexOf(lessonId) : -1;
  const order = lessonOrder(dept);
  const orderIdx = order.indexOf(lessonId);
  const label = trunkIndex >= 0
    ? `1단계 · 공통 ${trunkIndex + 1}교시`
    : branch
      ? branch.stage != null
        ? `${branch.stage}단계 · ${STAGE_NAMES[branch.stage]} · ${orderIdx + 1}교시`
        : `갈래 · ${branch.name} · 심화 ${branchIndex + 1}교시`
      : '';
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': '위치' },
    h('a', { href: '#/' }, '학과 선택'), ' › ', h('a', { href: `#/d/${meta.id}` }, meta.name), ' › ', label);

  if (!lesson) {
    fill(root, crumbs, h('h1', { tabindex: '-1' }, '없는 교시입니다'));
    return;
  }

  const math = (lesson.features || []).includes('formula');
  const dp0 = deptProgress(getProgress(), meta.id);
  const branchOpen = !branch || (branch.opensAfter || []).every((r) => isDone(dp0, r));
  if (!isUnlocked(lesson, dp0) || !branchOpen) {
    const byId = new Map(dept.lessons.map((l) => [l.id, l]));
    const need = [...new Set([...(lesson.requires || []), ...(branch?.opensAfter || [])])].filter((r) => !isDone(dp0, r));
    fill(root, crumbs,
      h('h1', { tabindex: '-1' }, lesson.title),
      h('section', { class: 'panel' },
        h('h2', {}, '아직 잠긴 교시'),
        h('p', {}, '먼저 마쳐야 하는 교시:'),
        h('ul', {}, need.map((id) => h('li', {}, h('a', { href: `#/d/${meta.id}/l/${id}` }, byId.get(id).title))))));
    return;
  }

  const alreadyDone = isDone(dp0, lesson.id);
  const results = lesson.checks.map(() => null); // 'auto' | 'self'
  const completion = h('div', { 'aria-live': 'polite' });
  const checkHeading = h('h2', {}, `확인 (0/${lesson.checks.length} 통과)`);

  const updateCheckHeading = () => {
    const passedCount = results.filter((r) => r != null).length;
    checkHeading.textContent = `확인 (${passedCount}/${lesson.checks.length} 통과)`;
  };

  const finishIfAll = () => {
    updateCheckHeading();
    if (results.some((r) => r == null)) return;
    if (!alreadyDone) setProgress(markDone(getProgress(), meta.id, lesson, results));
    const dp = deptProgress(getProgress(), meta.id);
    const next = dept.lessons.filter((l) => !isDone(dp, l.id) && isAvailable(dept, l, dp));
    completion.replaceChildren(h('section', { class: 'panel done-panel' },
      h('h2', {}, alreadyDone ? '다시 풀어 보았습니다' : '이 교시를 마쳤습니다'),
      results.includes('self') ? h('p', {}, '자기 확인으로 통과한 문항이 있어 진도에 "자기 확인 포함"으로 표시됩니다.') : null,
      next.length
        ? h('p', {}, '이제 열린 교시: ', ...next.flatMap((l, i) => [i ? ', ' : '', h('a', { href: `#/d/${meta.id}/l/${l.id}` }, l.title)]))
        : h('p', {}, dept.lessons.every((l) => isDone(dp, l.id))
          ? ((dept.branches || []).some((b) => b.stage === 6)
            ? '이 학과의 1단계부터 6단계 학사 캡스톤까지 모든 교시를 마쳤습니다.'
            : '이 학과의 공통 줄기와 전공 심화 갈래를 모두 마쳤습니다.')
          : '지금 새로 열린 교시는 없습니다. 학과 목록에서 남은 교시의 열리는 조건을 확인하세요.'),
      h('p', {}, h('a', { href: `#/d/${meta.id}` }, `${meta.name} 교육과정으로 돌아가기`))));
  };

  const report = reportPanel({ meta, lesson, site });
  const cards = lesson.checks.map((check, i) => checkCard({
    check, index: i, math, meta, lesson, getProgress, setProgress,
    onReport: () => report.open(`문항 ${i + 1}`),
    onPass(kind) { results[i] = kind; finishIfAll(); },
  }));

  let reviewRevealed = false;
  const reviewToggleBtn = alreadyDone
    ? h('button', {
        type: 'button',
        class: 'btn',
        onclick: () => {
          reviewRevealed = !reviewRevealed;
          cards.forEach((c) => c.revealReview(reviewRevealed));
          reviewToggleBtn.textContent = reviewRevealed ? '복습 해설 숨기기' : '복습용 해설 모두 보기';
        },
      }, '복습용 해설 모두 보기')
    : null;

  const connectionsWrap = h('div');
  if (loadAllDepartments && catalog.length) {
    loadAllDepartments().then((allDepts) => {
      const links = findLessonConnections({ deptId: meta.id, lesson, catalog, depts: allDepts, limit: 6 });
      if (!links.length) return;
      connectionsWrap.replaceChildren(
        h('section', { class: 'panel connections-panel' },
          h('h2', {}, '다른 학과와의 연결'),
          h('p', { class: 'input-note' }, '이 교시에서 다룬 핵심 개념이 다른 학과의 교시에서는 어떻게 쓰이는지 함께 살펴볼 수 있습니다.'),
          h('ul', { class: 'lesson-list', role: 'list' },
            links.map((item) => h('li', { class: 'lesson-item open' },
              h('a', { href: `#/d/${item.deptId}/l/${item.lessonId}` },
                h('span', { class: 'lesson-no' }, item.deptName),
                h('span', { class: 'lesson-title' }, item.lessonTitle)),
              h('span', { class: 'lesson-state' }, `공통 개념: ${item.concepts.join(', ')}`))))),
      );
    }).catch(() => {});
  }

  const byId = new Map(dept.lessons.map((l) => [l.id, l]));
  const prevId = orderIdx > 0 ? order[orderIdx - 1] : null;
  const nextId = orderIdx >= 0 && orderIdx < order.length - 1 ? order[orderIdx + 1] : null;
  const prevLesson = prevId ? byId.get(prevId) : null;
  const nextLesson = nextId && isAvailable(dept, byId.get(nextId), dp0) ? byId.get(nextId) : null;

  const bottomNav = h('nav', { class: 'lesson-nav', 'aria-label': '교시 이동' },
    prevLesson ? h('a', { class: 'btn', href: `#/d/${meta.id}/l/${prevLesson.id}` }, `← 이전: ${prevLesson.title}`) : null,
    h('a', { class: 'btn', href: `#/d/${meta.id}` }, `${meta.name} 목록`),
    nextLesson ? h('a', { class: 'btn', href: `#/d/${meta.id}/l/${nextLesson.id}` }, `다음: ${nextLesson.title} →`) : null,
  );

  fill(root,
    crumbs,
    errors?.length ? errorPanel(errors) : null,
    h('header', { class: 'lesson-head' },
      h('p', { class: 'eyebrow' }, `${meta.name} · ${label}${lesson.minutes ? ` · 약 ${lesson.minutes}분` : ''}`),
      h('h1', { tabindex: '-1' }, lesson.title),
      reviewBadge(lesson, reviews[meta.id]?.[lesson.id]),
      alreadyDone
        ? h('div', { class: 'done-banner' },
            h('span', { class: 'meta-line' }, '이미 마친 교시입니다. 다시 풀어도 진도는 바뀌지 않습니다.'),
            reviewToggleBtn)
        : null),
    h('section', { class: 'lesson-part' },
      h('h2', {}, '설명'),
      h('div', { class: 'prose', html: blocks(lesson.explain, { math }) })),
    h('section', { class: 'lesson-part' },
      h('h2', {}, '예'),
      lesson.examples.map((ex) => h('div', { class: 'example' },
        ex.title ? h('h3', {}, ex.title) : null,
        h('div', { class: 'prose', html: blocks(ex.body, { math }) })))),
    h('section', { class: 'lesson-part' },
      checkHeading,
      h('p', { class: 'input-note' }, '모든 문항을 통과하면 이 교시를 마칩니다. 재시도에는 제한이 없습니다.'),
      cards.map((c) => c.el)),
    completion,
    connectionsWrap,
    bottomNav,
    report.el,
  );

  applyFeatures(lesson.features, root);
}

function checkCard({ check, index, math, meta, lesson, getProgress, setProgress, onPass, onReport }) {
  const type = CHECK_TYPES[check.type];
  const subKey = `${lesson.id}:${index}`;
  const saved = deptProgress(getProgress(), meta.id).submissions[subKey];
  const button = h('button', { type: 'button', class: 'btn primary' }, check.type === 'submit' ? '제출하기' : '확인');
  const input = renderInput(check, {
    math,
    seed: `${lesson.id}:${index}`,
    saved,
    onDraft: (draft) => setProgress(saveSubmission(getProgress(), meta.id, subKey, { ...draft, at: new Date().toISOString() })),
    onSubmit: () => { if (!button.disabled && !button.hidden && button.isConnected) button.click(); },
  });

  const fieldset = h('fieldset', { class: 'plain' }, input.el);
  const feedback = h('p', { class: 'feedback', role: 'status' });
  const extra = h('div', { class: 'extra' });
  let fails = 0;

  const render = (node) => { extra.append(node); applyFeatures(lesson.features, node); };
  const showHint = () => {
    if (check.hint && !extra.querySelector('.hint')) render(h('div', { class: 'hint' }, h('strong', {}, '힌트 '), h('span', { html: inline(check.hint, { math }) })));
  };
  const showExplanation = (afterPass) => {
    if (check.explanation && !extra.querySelector('.explanation')) {
      render(h('div', { class: 'explanation' }, h('strong', {}, '해설 '), h('span', { html: inline(check.explanation, { math }) }),
        afterPass ? null : h('p', { class: 'input-note' }, '해설을 본 뒤에도 직접 답해야 통과합니다.')));
    }
  };

  const pass = (kind) => {
    fieldset.disabled = true;
    button.remove();
    card.classList.add('passed');
    feedback.className = 'feedback ok';
    feedback.textContent = kind === 'self' ? '자기 확인으로 통과했습니다.' : '맞았습니다.';
    showExplanation(true);
    onPass(kind);
  };

  const selfCheckFlow = () => {
    fieldset.disabled = true;
    button.hidden = true;
    feedback.className = 'feedback pending';
    feedback.textContent = '필요한 개념은 모두 들어 있습니다. 자동 채점은 여기까지만 판정합니다. 모범 답안과 비교해 직접 확인하세요.';
    const items = check.selfCheck?.length ? check.selfCheck : ['내 답이 모범 답안의 요지를 담고 있다'];
    const boxes = items.map((t) => h('input', { type: 'checkbox' }));
    const confirm = h('button', { type: 'button', class: 'btn primary', disabled: true }, '자기 확인으로 통과');
    const sync = () => { confirm.disabled = !boxes.every((b) => b.checked); };
    boxes.forEach((b) => b.addEventListener('change', sync));
    const rewrite = h('button', { type: 'button', class: 'btn' }, '다시 쓰기');
    const panel = h('div', { class: 'self-check' },
      h('h4', {}, '모범 답안'),
      h('blockquote', { html: inline(check.model, { math }) }),
      h('fieldset', { class: 'options checklist' }, h('legend', {}, '내 답과 비교하기'),
        items.map((t, i) => h('label', { class: 'option' }, boxes[i], h('span', {}, t)))),
      h('div', { class: 'btn-row' }, confirm, rewrite));
    confirm.addEventListener('click', () => { panel.querySelector('fieldset').disabled = true; confirm.remove(); rewrite.remove(); pass('self'); });
    rewrite.addEventListener('click', () => {
      panel.remove();
      fieldset.disabled = false;
      button.hidden = false;
      feedback.textContent = '';
      input.focusable?.focus();
    });
    render(panel);
  };

  button.addEventListener('click', () => {
    const resp = input.read();
    const result = grade(check, resp);
    if (check.type === 'submit') {
      setProgress(saveSubmission(getProgress(), meta.id, subKey, { ...resp, at: new Date().toISOString() }));
    } else if (check.type === 'keywords' && typeof resp === 'string' && resp.trim()) {
      setProgress(saveSubmission(getProgress(), meta.id, subKey, { text: resp, at: new Date().toISOString() }));
    }
    if (result.status === 'pass') return pass(result.kind);
    if (result.status === 'self-check') return selfCheckFlow();
    fails += 1;
    feedback.className = 'feedback bad';
    feedback.textContent = result.message || '다시 시도해 보세요.';
    if (fails >= 2) showHint();
    if (fails >= 3) showExplanation(false);
  });

  const card = h('section', { class: 'check-card', 'aria-label': `문항 ${index + 1}` },
    h('p', { class: 'check-meta' }, `문항 ${index + 1} · ${type?.label || check.type}`,
      h('button', { type: 'button', class: 'link-btn', onclick: onReport }, '이 문항 신고')),
    h('div', { class: 'check-prompt', html: inline(check.prompt, { math }) }),
    check.figure ? h('div', { html: figure(check.figure, { math }) }) : null,
    fieldset,
    h('div', { class: 'btn-row' }, button),
    feedback,
    extra);

  return {
    el: card,
    revealReview(show) {
      if (show) {
        showHint();
        showExplanation(true);
      } else if (!card.classList.contains('passed')) {
        extra.querySelector('.hint')?.remove();
        extra.querySelector('.explanation')?.remove();
      }
    },
  };
}
