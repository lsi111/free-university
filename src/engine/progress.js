// 진도 규칙. 저장 방식과 분리된 순수 함수다.
// 진도 형태: { [deptId]: { lessons: { [lessonId]: { kind: 'auto'|'self', at, version } }, submissions: {...} } }

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

export function summary(dept, dp) {
  const ids = dept.lessons.map((l) => l.id);
  const done = ids.filter((id) => isDone(dp, id));
  const trunkDoneCount = (dept.trunk || []).filter((id) => isDone(dp, id)).length;
  const branches = dept.branches || [];
  const branchesDoneCount = branches.filter((b) => (b.lessons || []).every((id) => isDone(dp, id))).length;
  return {
    total: ids.length,
    done: done.length,
    self: done.filter((id) => dp.lessons[id].kind === 'self').length,
    trunkTotal: (dept.trunk || []).length,
    trunkDoneCount,
    trunkDone: (dept.trunk || []).every((id) => isDone(dp, id)),
    branchesTotal: branches.length,
    branchesDoneCount,
    allDone: ids.length > 0 && done.length === ids.length,
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
