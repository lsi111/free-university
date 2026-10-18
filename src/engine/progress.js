// 진도 규칙. 저장 방식과 분리된 순수 함수다.
// 진도 형태: { [deptId]: { lessons: { [lessonId]: { kind: 'auto'|'self', at, version } }, submissions: {...} } }

import { t } from '../i18n.js';

export function emptyProgress() {
  return {};
}

export function deptProgress(progress, deptId) {
  return progress[deptId] || { lessons: {}, submissions: {} };
}

export function isDone(dp, lessonId) {
  return !!dp.lessons[lessonId];
}

export function isUnlocked(lesson, dp) {
  return (lesson.requires || []).every((r) => isDone(dp, r));
}

export function isBranchOpen(branch, dp) {
  return (branch.opensAfter || []).every((r) => isDone(dp, r));
}

/** 교시를 마쳤다고 기록한 새 진도 객체를 돌려준다. 하나라도 자기 점검이면 kind는 self. */
export function markDone(progress, deptId, lesson, kinds) {
  const dp = deptProgress(progress, deptId);
  const kind = kinds.includes('self') ? 'self' : 'auto';
  return {
    ...progress,
    [deptId]: {
      ...dp,
      lessons: { ...dp.lessons, [lesson.id]: { kind, at: new Date().toISOString(), version: lesson.version || 1 } },
    },
  };
}

export function saveSubmission(progress, deptId, key, payload) {
  const dp = deptProgress(progress, deptId);
  return {
    ...progress,
    [deptId]: { ...dp, submissions: { ...dp.submissions, [key]: payload } },
  };
}

/** 단계 이름. 학과와 무관한 학사 과정의 층위다. */
export function stageName(stage) {
  const names = { 1: t('전공기초'), 2: t('전공필수 I'), 3: t('전공필수 II'), 4: t('전공필수 III'), 5: t('전공심화 IV'), 6: t('전공종합 V') };
  return names[stage];
}

export function branchStage(branch) {
  return branch?.stage ?? 2;
}

export function branchOf(dept, lessonId) {
  return (dept.branches || []).find((b) => (b.lessons || []).includes(lessonId)) || null;
}

/** 교시의 단계: 줄기는 1, 갈래는 stage(없으면 2) */
export function lessonStage(dept, lessonId) {
  if ((dept.trunk || []).includes(lessonId)) return 1;
  const b = branchOf(dept, lessonId);
  return b ? branchStage(b) : null;
}

/** 교시를 지금 열 수 있는지: 선행을 마쳤고, 갈래 교시라면 갈래도 열렸다. */
export function isAvailable(dept, lesson, dp) {
  if (!isUnlocked(lesson, dp)) return false;
  const b = branchOf(dept, lesson.id);
  return !b || isBranchOpen(b, dp);
}

/** 학과 전체 교시 순서: 줄기 다음 갈래를 단계 순으로 (같은 단계는 적힌 순서) */
export function lessonOrder(dept) {
  const branches = (dept.branches || []).map((b, i) => ({ b, i }))
    .sort((x, y) => branchStage(x.b) - branchStage(y.b) || x.i - y.i);
  return [...(dept.trunk || []), ...branches.flatMap(({ b }) => b.lessons || [])];
}

/** 단계별 이수 현황. 데이터에 있는 단계만 돌려준다. */
export function stageSummary(dept, dp) {
  const groups = new Map();
  const add = (stage, branch, ids) => {
    if (!groups.has(stage)) groups.set(stage, { stage, name: stageName(stage) || t('{n}단계', { n: stage }), branches: [], lessons: [] });
    const g = groups.get(stage);
    if (branch) g.branches.push(branch);
    g.lessons.push(...ids);
  };
  add(1, null, dept.trunk || []);
  for (const b of dept.branches || []) add(branchStage(b), b, b.lessons || []);
  return [...groups.values()].sort((a, b) => a.stage - b.stage).map((g) => {
    const done = g.lessons.filter((id) => isDone(dp, id)).length;
    const open = g.stage === 1 || g.branches.some((b) => isBranchOpen(b, dp));
    return { stage: g.stage, name: g.name, total: g.lessons.length, done, open, complete: g.lessons.length > 0 && done === g.lessons.length, branches: g.branches };
  });
}

export function summary(dept, dp) {
  const ids = dept.lessons.map((l) => l.id);
  const done = ids.filter((id) => isDone(dp, id));
  const trunkDoneCount = (dept.trunk || []).filter((id) => isDone(dp, id)).length;
  const branches = dept.branches || [];
  const branchesDoneCount = branches.filter((b) => (b.lessons || []).every((id) => isDone(dp, id))).length;
  const stages = stageSummary(dept, dp);
  const middle = stages.filter((s) => s.stage >= 2 && s.stage <= 5);
  const allDone = ids.length > 0 && done.length === ids.length;
  return {
    stages,
    stagesTotal: stages.length,
    stagesDoneCount: stages.filter((s) => s.complete).length,
    // 2~5단계(전공필수·전공심화)를 모두 마쳤는가
    majorDone: middle.length > 0 && middle.every((s) => s.complete),
    // 6단계 캡스톤까지 있는 학과에서 모든 교시를 마쳤는가
    bachelorDone: allDone && stages.some((s) => s.stage === 6),
    total: ids.length,
    done: done.length,
    self: done.filter((id) => dp.lessons[id].kind === 'self').length,
    trunkTotal: (dept.trunk || []).length,
    trunkDoneCount,
    trunkDone: (dept.trunk || []).every((id) => isDone(dp, id)),
    branchesTotal: branches.length,
    branchesDoneCount,
    allDone,
  };
}

/** 내용이 갱신되었는지: 통과 당시 버전보다 지금 버전이 높으면 true */
export function isStale(lesson, dp) {
  const rec = dp.lessons[lesson.id];
  return !!rec && (lesson.version || 1) > (rec.version || 1);
}

/** 가져오기용 검사. 형태가 맞지 않으면 null */
export function parseImported(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    for (const v of Object.values(data)) {
      if (!v || typeof v !== 'object' || typeof v.lessons !== 'object') return null;
    }
    return data;
  } catch {
    return null;
  }
}
