import { h, fill } from '../dom.js';
import { fieldName } from '../data.js';
import { deptReviewSummary } from '../engine/review.js';
import { deptProgress, isDone, isUnlocked, isBranchOpen, isStale, summary, lessonOrder, branchStage, STAGE_NAMES } from '../engine/progress.js';
import { findRelatedDepartments } from '../engine/connections.js';

export function renderDepartment(root, { meta, dept, errors, fields, catalog = [], progress, reviews = {} }) {
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': '위치' }, h('a', { href: '#/' }, '학과 선택'), ' › ', meta.name);
  const tags = (meta.tags || []).map((t) => fieldName(fields, t));
  const head = h('header', { class: 'dept-head' },
    crumbs,
    h('h1', { tabindex: '-1' }, meta.name),
    h('p', { class: 'lede' }, meta.summary),
    h('p', { class: 'meta-line' }, `계열: ${fieldName(fields, meta.field)}`, tags.length ? ` · 함께 걸친 계열: ${tags.join(', ')}` : ''));

  if (meta.status !== 'open') {
    fill(root, head, h('section', { class: 'panel' },
      h('h2', {}, '준비 중'),
      h('p', {}, '이 학과의 칸은 열려 있고, 교시를 쓰는 중입니다. 다른 학과와 같은 목록, 같은 위치에 있습니다.'),
      h('p', {}, h('a', { href: '#/' }, '다른 학과 고르기'))));
    return;
  }

  const dp = deptProgress(progress, meta.id);
  const s = summary(dept, dp);
  const byId = new Map(dept.lessons.map((l) => [l.id, l]));
  // 교시 번호는 학과 전체에서 이어진다(1단계 1교시 … 6단계 마지막 교시).
  const number = new Map(lessonOrder(dept).map((id, i) => [id, `${i + 1}교시`]));
  const staged = (dept.branches || []).some((b) => b.stage != null);
  const branchTitle = (b, idx) => (b.stage != null
    ? `${b.stage}단계 · ${STAGE_NAMES[b.stage]} · ${b.name}`
    : `전공 심화 갈래 ${idx + 1} · ${b.name}`);

  const lessonItem = (id, n) => {
    const l = byId.get(id);
    const done = isDone(dp, id);
    const open = isUnlocked(l, dp);
    let state;
    if (done) state = dp.lessons[id].kind === 'self' ? '마침 · 자기 확인 포함' : '마침';
    else state = open ? '열림' : '잠김';
    const needs = (l.requires || []).filter((r) => !isDone(dp, r)).map((r) => `${number.get(r) || ''} ${byId.get(r).title}`.trim());
    const title = h('span', { class: 'lesson-title' }, h('span', { class: 'lesson-no' }, n), l.title);
    return h('li', { class: `lesson-item ${done ? 'done' : open ? 'open' : 'locked'}` },
      open ? h('a', { href: `#/d/${meta.id}/l/${id}` }, title) : h('span', {}, title),
      h('span', { class: 'lesson-state' }, state,
        isStale(l, dp) ? ' · 내용 갱신됨' : '',
        l.minutes ? ` · 약 ${l.minutes}분` : ''),
      !open ? h('span', { class: 'lesson-needs' }, `먼저: ${needs.join(', ')}`) : null);
  };

  const orderedBranches = (dept.branches || []).map((b, idx) => ({ b, idx }))
    .sort((x, y) => branchStage(x.b) - branchStage(y.b) || x.idx - y.idx);
  const branches = orderedBranches.map(({ b, idx }) => {
    const opened = isBranchOpen(b, dp);
    const bDone = (b.lessons || []).filter((id) => isDone(dp, id)).length;
    const openReqs = (b.opensAfter || []).map((id) => `${number.get(id) || id}(${byId.get(id)?.title || id})`).join(', ');
    return h('section', { class: `panel branch-panel${b.stage != null ? ` stage-${b.stage}` : ''}`, id: b.stage != null ? `stage-${b.stage}` : null },
      h('div', { class: 'panel-head' },
        h('h2', {}, branchTitle(b, idx)),
        h('span', { class: 'meta-line' }, `${bDone}/${b.lessons.length} 마침`)),
      b.summary ? h('p', { class: 'input-note' }, b.summary) : null,
      opened ? null : h('p', { class: 'input-note' }, `열리는 조건: ${openReqs} 마치기`),
      h('ol', { class: 'lesson-list', role: 'list' },
        b.lessons.map((id) => opened
          ? lessonItem(id, number.get(id))
          : h('li', { class: 'lesson-item locked' },
              h('span', { class: 'lesson-title' }, h('span', { class: 'lesson-no' }, number.get(id)), byId.get(id).title),
              h('span', { class: 'lesson-state' }, '잠김')))));
  });

  const relatedDepts = findRelatedDepartments(meta, catalog);
  const relatedPanel = relatedDepts.length
    ? h('section', { class: 'panel' },
        h('h2', {}, '함께 걸친 계열의 학과'),
        h('p', { class: 'input-note' }, '이 학과와 주제가 맞닿아 있는 다른 계열의 학과들입니다.'),
        h('ul', { class: 'tag-links', role: 'list' },
          relatedDepts.map((d) => h('li', {}, h('a', { class: 'chip-link', href: `#/d/${d.id}` }, d.name)))))
    : null;

  fill(root,
    head,
    errors?.length ? errorPanel(errors) : null,
    reviewSummary(deptReviewSummary(dept, reviews[meta.id])),
    staged ? stageRoadmap(s) : null,
    h('section', { class: 'panel' },
      h('h2', {}, '누구에게 맞는가 · 교육과정 구성'),
      h('p', {}, meta.audience),
      h('p', { class: 'input-note' }, staged
        ? `이 학과는 1단계 전공기초(${s.trunkTotal}교시)부터 ${s.stagesTotal}단계${s.stages.some((x) => x.stage === 6) ? ' 학사 캡스톤' : ''}까지 총 ${s.total}교시로 구성되어 있습니다. 현재 전체 ${s.done}/${s.total}교시를 마쳤습니다.`
        : `이 학과는 1단계 공통 줄기(${s.trunkTotal}교시, 전공기초)와 2단계 전공 심화 갈래(${s.branchesTotal}개 갈래, 학사 핵심 이론·모형)를 합쳐 총 ${s.total}교시로 구성되어 있습니다. 현재 전체 ${s.done}/${s.total}교시를 마쳤습니다.`),
      meta.limits ? h('p', { class: 'limits' }, `범위 밖: ${meta.limits}`) : null),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h2', { id: 'stage-1' }, '1단계 · 전공기초 · 공통 줄기'),
        h('span', { class: 'meta-line' }, `${s.trunkDoneCount}/${s.trunkTotal} 마침`)),
      h('p', { class: 'input-note' }, staged
        ? '선행이 없는 첫 교시는 바로 열립니다. 줄기 교시를 마치면 2단계부터 차례로 열리고, 앞 단계를 마치면 다음 단계가 열립니다.'
        : '선행이 없는 첫 교시는 바로 열립니다. 주요 줄기 교시를 마치면 아래의 전공 심화 갈래들이 차례로 열립니다.'),
      h('ol', { class: 'lesson-list', role: 'list' }, dept.trunk.map((id) => lessonItem(id, number.get(id))))),
    ...branches,
    relatedPanel,
  );
}

/** 1단계~6단계 학사 이수 로드맵 */
function stageRoadmap(s) {
  return h('nav', { class: 'panel stage-roadmap', 'aria-label': '학사 이수 로드맵' },
    h('div', { class: 'panel-head' },
      h('h2', {}, '학사 이수 로드맵'),
      h('span', { class: 'meta-line' }, `${s.stagesDoneCount}/${s.stagesTotal}단계 마침`)),
    h('ol', { class: 'stage-steps', role: 'list' },
      s.stages.map((st) => {
        const state = st.complete ? 'done' : st.open ? 'open' : 'locked';
        const label = st.complete ? '마침' : st.open ? '열림' : '잠김';
        const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
        return h('li', { class: `stage-step ${state}` },
          h('a', { href: `#stage-${st.stage}`, onclick: (e) => { e.preventDefault(); document.getElementById(`stage-${st.stage}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
            h('span', { class: 'stage-no' }, `${st.stage}단계`),
            h('span', { class: 'stage-name' }, st.name),
            h('span', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(st.total), 'aria-valuenow': String(st.done), 'aria-label': `${st.stage}단계 진도` },
              h('span', { style: `width:${pct}%` })),
            h('span', { class: 'stage-state' }, `${st.done}/${st.total} · ${label}`)));
      })));
}

export function errorPanel(errors) {
  return h('section', { class: 'panel error' },
    h('h2', {}, '데이터 오류'),
    h('ul', {}, errors.map((e) => h('li', {}, e))));
}

function reviewSummary(c) {
  const parts = [`${c.total}교시 중 검수됨 ${c.reviewed}`];
  if (c.stale) parts.push(`검수 뒤 바뀜 ${c.stale}`);
  parts.push(`검수 전 ${c.unreviewed}`);
  return h('p', { class: `review-summary ${c.reviewed === c.total ? 'all' : ''}` },
    h('strong', {}, '검수 현황 '), parts.join(' · '),
    c.unreviewed + c.stale ? h('span', { class: 'input-note' }, ' 검수 전 교시는 AI가 쓴 초안이며, 사람이 사실과 난이도를 확인하기 전입니다.') : null);
}
