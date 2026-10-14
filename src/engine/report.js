// 오류 신고문 만들기. 서버로 아무것도 보내지 않는다. 학습자가 직접 복사하거나, 설정된 받는 곳으로 직접 연다.

export const REPORT_KINDS = ['사실이 틀림', '문항·정답이 이상함', '그림이 이상함', '오탈자·표현', '이해하기 어려움', '기타'];

/** 신고할 위치의 선택지. 교시 구조에서 만든다. */
export function reportTargets(lesson) {
  return [
    '교시 전체',
    '설명',
    '예',
    ...lesson.checks.map((_, i) => `문항 ${i + 1}`),
  ];
}

export function buildReport({ deptName, deptId, lesson, where, kind, text }) {
  return [
    '[Free University 오류 신고]',
    `학과: ${deptName} (${deptId})`,
    `교시: ${lesson.title} (${lesson.id}, 내용 버전 ${lesson.version || 1})`,
    `위치: ${where}`,
    `종류: ${kind}`,
    '내용:',
    String(text || '').trim(),
  ].join('\n');
}

const MAX_MAILTO_BODY = 1800;

/** site.reportEmail이 있으면 mailto 주소를, 없으면 null. */
export function mailtoUrl(site, report, subject) {
  if (!site?.reportEmail) return null;
  const body = report.length > MAX_MAILTO_BODY ? `${report.slice(0, MAX_MAILTO_BODY)}…` : report;
  return `mailto:${site.reportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function validateSite(site) {
  const errors = [];
  if (!site || typeof site !== 'object' || Array.isArray(site)) return ['site.json은 객체여야 합니다'];
  if (site.reportEmail != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.reportEmail)) errors.push('site.json: reportEmail 형식이 이메일이 아닙니다');
  if (site.reportUrl != null && !/^https:\/\/[^\s]+$/.test(site.reportUrl)) errors.push('site.json: reportUrl은 https:// 로 시작해야 합니다');
  return errors;
}
