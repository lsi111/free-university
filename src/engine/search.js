// 학과 및 교시 본문 통합 검색 엔진. 순수 함수로만 구성되어 Node에서도 실행된다.

import { lessonOrder, lessonStage } from './progress.js';
import { getLang, locale, t } from '../i18n.js';
import { foldText } from './text.js';

const byName = (a, b) => a.name.localeCompare(b.name, locale());

/** 마크다운·수식 기호를 걷어내고 검색·미리보기용 평문으로 바꾼다. */
export function stripMarkup(s) {
  return String(s || '')
    .replace(/\$\$([\s\S]+?)\$\$/g, ' $1 ')
    .replace(/\$([^$\n]+?)\$/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/^\s*(?:[-•]|\d+\.|###|>)\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 검색어를 접어서(대소문자·악센트 무시) 비교 도구로 만든다.
 * 한국어는 검색어 전체를 한 덩어리로, 그 밖의 언어는 낱말 단위로 쪼개 모든 낱말이 들어 있으면 일치로 본다.
 */
function makeMatcher(query) {
  const q = foldText(String(query || '').trim());
  const tokens = getLang() === 'ko' ? [q] : q.split(/\s+/).filter(Boolean);
  return {
    tokens,
    /** 접은 본문 안에서 가장 앞선 낱말의 { idx, len }. 하나라도 없으면 null */
    find(folded) {
      let best = null;
      for (const tk of tokens) {
        const idx = folded.indexOf(tk);
        if (idx < 0) return null;
        if (!best || idx < best.idx) best = { idx, len: tk.length };
      }
      return best;
    },
    test(text) {
      return !!tokens.length && this.find(foldText(stripMarkup(text))) !== null;
    },
  };
}

/** 학과 카탈로그에서 이름, 요약, 대상, 계열 이름으로 학과를 거른다. */
export function filterDepartments(catalog, fields, query) {
  const raw = String(query || '').trim();
  if (!raw) return catalog;
  const matcher = makeMatcher(raw);
  const fieldMap = new Map((fields || []).map((f) => [f.id, f.name]));
  return catalog.filter((d) => {
    const fName = fieldMap.get(d.field) || '';
    const tagNames = (d.tags || []).map((tag) => fieldMap.get(tag) || '').join(' ');
    const hay = foldText(`${d.name} ${d.summary || ''} ${d.audience || ''} ${fName} ${tagNames}`);
    return matcher.find(hay) !== null;
  });
}

function makeSnippet(text, matcher, radius) {
  const latin = getLang() !== 'ko';
  const r = radius ?? (latin ? 60 : 38);
  const clean = stripMarkup(text);
  let folded = foldText(clean);
  if (folded.length !== clean.length) folded = clean.toLowerCase();
  const hit = matcher.find(folded);
  if (!hit) return clean.slice(0, r * 2);
  let start = Math.max(0, hit.idx - r);
  let end = Math.min(clean.length, hit.idx + hit.len + r);
  if (latin) {
    // 낱말 중간에서 자르지 않는다.
    if (start > 0) { const sp = clean.indexOf(' ', start); if (sp >= 0 && sp < hit.idx) start = sp + 1; }
    if (end < clean.length) { const sp = clean.lastIndexOf(' ', end); if (sp > hit.idx + hit.len) end = sp; }
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return `${prefix}${clean.slice(start, end)}${suffix}`;
}

/**
 * 열린 학과들의 교시 전체에서 제목, 설명, 예, 문항을 검색한다.
 * depts: Map<deptId, dept>
 */
export function searchLessons(catalog, depts, query, { limit = 30 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const matcher = makeMatcher(q);
  const matches = [];

  const sortedCatalog = [...catalog].filter((d) => d.status === 'open').sort(byName);
  for (const meta of sortedCatalog) {
    const dept = depts instanceof Map ? depts.get(meta.id) : depts?.[meta.id];
    if (!dept?.lessons) continue;
    const staged = (dept.branches || []).some((b) => b.stage != null);
    const orderIndex = new Map(lessonOrder(dept).map((id, i) => [id, i + 1]));

    for (const lesson of dept.lessons) {
      const stage = lessonStage(dept, lesson.id);
      const stepLabel = stage === 1 || staged
        ? t('{stage}단계 · {n}교시', { stage, n: orderIndex.get(lesson.id) })
        : t('갈래');
      const base = { deptId: meta.id, deptName: meta.name, lessonId: lesson.id, lessonTitle: lesson.title, stepLabel };

      if (matcher.test(lesson.title)) {
        const firstExplain = (lesson.explain || []).find((b) => typeof b === 'string') || lesson.title;
        matches.push({ ...base, where: t('교시 제목'), snippet: makeSnippet(firstExplain, matcher), score: 3 });
        continue;
      }

      const explainTexts = (lesson.explain || []).map((b) => (typeof b === 'string' ? b : `${b.caption || ''} ${b.alt || ''}`));
      const explainHit = explainTexts.find((x) => matcher.test(x));
      if (explainHit) {
        matches.push({ ...base, where: t('설명'), snippet: makeSnippet(explainHit, matcher), score: 2 });
        continue;
      }

      const exampleTexts = (lesson.examples || []).flatMap((ex) => [
        ex.title || '',
        ...(ex.body || []).map((b) => (typeof b === 'string' ? b : `${b.caption || ''} ${b.alt || ''}`)),
      ]);
      const exampleHit = exampleTexts.find((x) => matcher.test(x));
      if (exampleHit) {
        matches.push({ ...base, where: t('예'), snippet: makeSnippet(exampleHit, matcher), score: 1.5 });
        continue;
      }

      const checkTexts = (lesson.checks || []).map((c) => c.prompt || '');
      const checkHit = checkTexts.find((x) => matcher.test(x));
      if (checkHit) {
        matches.push({ ...base, where: t('문항'), snippet: makeSnippet(checkHit, matcher), score: 1 });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score || a.deptName.localeCompare(b.deptName, locale()));
  return matches.slice(0, limit);
}
