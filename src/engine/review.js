// 검수 기록 규칙. 화면과 도구가 같은 규칙을 쓴다.
// reviews.json 형태: { [deptId]: { [lessonId]: { reviewer, date, version, notes? } } }

export const REVIEW_STATES = {
  unreviewed: '검수 전 · AI 초안',
  reviewed: '검수됨',
  stale: '검수 뒤 내용이 바뀜',
};

export function lessonVersion(lesson) {
  return lesson.version || 1;
}

/** 교시 하나의 검수 상태. record가 없으면 검수 전. */
export function reviewState(lesson, record) {
  if (!record) return 'unreviewed';
  return lessonVersion(lesson) > (record.version || 1) ? 'stale' : 'reviewed';
}

export function deptReviewSummary(dept, deptRecords = {}) {
  const counts = { total: dept.lessons.length, reviewed: 0, stale: 0, unreviewed: 0 };
  for (const l of dept.lessons) counts[reviewState(l, deptRecords[l.id])] += 1;
  return counts;
}

/** depts: Map<deptId, dept>. 학과 id나 교시 id가 없거나 형식이 틀리면 오류 문자열을 모아 돌려준다. */
export function validateReviews(reviews, depts) {
  const errors = [];
  if (!reviews || typeof reviews !== 'object' || Array.isArray(reviews)) return ['reviews.json은 객체여야 합니다'];
  for (const [deptId, records] of Object.entries(reviews)) {
    const dept = depts.get(deptId);
    if (!dept) { errors.push(`검수 기록: 열린 학과가 아닌 ${deptId}`); continue; }
    const byId = new Map(dept.lessons.map((l) => [l.id, l]));
    for (const [lessonId, r] of Object.entries(records || {})) {
      const at = `검수 기록 ${deptId}/${lessonId}`;
      const lesson = byId.get(lessonId);
      if (!lesson) { errors.push(`${at}: 없는 교시`); continue; }
      if (typeof r.reviewer !== 'string' || !r.reviewer.trim()) errors.push(`${at}: reviewer(검수자) 필요`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || Number.isNaN(Date.parse(r.date))) errors.push(`${at}: date는 YYYY-MM-DD`);
      if (!Number.isInteger(r.version) || r.version < 1) errors.push(`${at}: version은 1 이상의 정수`);
      else if (r.version > lessonVersion(lesson)) errors.push(`${at}: 검수한 version(${r.version})이 교시의 version(${lessonVersion(lesson)})보다 큼`);
    }
  }
  return errors;
}
