// 오류 신고문 만들기. 서버로 아무것도 보내지 않는다. 학습자가 직접 복사하거나, 설정된 받는 곳으로 직접 연다.

import { t } from '../i18n.js';

export function reportKinds() {
  return [t('사실이 틀림'), t('문항·정답이 이상함'), t('그림이 이상함'), t('오탈자·표현'), t('이해하기 어려움'), t('기타')];
}

/** 신고할 위치의 선택지. 교시 구조에서 만든다. */
export function reportTargets(lesson) {
  return [
    t('교시 전체'),
    t('설명'),
    t('예'),
    ...lesson.checks.map((_, i) => t('문항 {n}', { n: i + 1 })),
  ];
}

export function buildReport({ deptName, deptId, lesson, where, kind, text }) {
  return [
    t('[Free University 오류 신고]'),
    t('학과: {name} ({id})', { name: deptName, id: deptId }),
    t('교시: {title} ({id}, 내용 버전 {version})', { title: lesson.title, id: lesson.id, version: lesson.version || 1 }),
    t('위치: {where}', { where }),
    t('종류: {kind}', { kind }),
    t('내용:'),
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
