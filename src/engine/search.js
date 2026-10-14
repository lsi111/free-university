// 학과 및 교시 본문 통합 검색 엔진. 순수 함수로만 구성되어 Node에서도 실행된다.

const byName = (a, b) => a.name.localeCompare(b.name, 'ko');

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

/** 학과 카탈로그에서 이름, 요약, 대상, 계열 이름으로 학과를 거른다. */
export function filterDepartments(catalog, fields, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return catalog;
  const fieldMap = new Map((fields || []).map((f) => [f.id, f.name]));
  return catalog.filter((d) => {
    const fName = fieldMap.get(d.field) || '';
    const tagNames = (d.tags || []).map((t) => fieldMap.get(t) || '').join(' ');
    const hay = `${d.name} ${d.summary || ''} ${d.audience || ''} ${fName} ${tagNames}`.toLowerCase();
    return hay.includes(q);
  });
}

function makeSnippet(text, qLower, radius = 38) {
  const clean = stripMarkup(text);
  const idx = clean.toLowerCase().indexOf(qLower);
  if (idx < 0) return clean.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + qLower.length + radius);
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
  const qLower = q.toLowerCase();
  const matches = [];

  const sortedCatalog = [...catalog].filter((d) => d.status === 'open').sort(byName);
  for (const meta of sortedCatalog) {
    const dept = depts instanceof Map ? depts.get(meta.id) : depts?.[meta.id];
    if (!dept?.lessons) continue;
    const trunkIndex = new Map((dept.trunk || []).map((id, i) => [id, `${i + 1}교시`]));

    for (const lesson of dept.lessons) {
      const stepLabel = trunkIndex.get(lesson.id) || '갈래';
      const titleClean = stripMarkup(lesson.title);
      if (titleClean.toLowerCase().includes(qLower)) {
        const firstExplain = (lesson.explain || []).find((b) => typeof b === 'string') || lesson.title;
        matches.push({
          deptId: meta.id,
          deptName: meta.name,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          stepLabel,
          where: '교시 제목',
          snippet: makeSnippet(firstExplain, qLower),
          score: 3,
        });
        continue;
      }

      const explainTexts = (lesson.explain || []).map((b) => (typeof b === 'string' ? b : `${b.caption || ''} ${b.alt || ''}`));
      const explainHit = explainTexts.find((t) => stripMarkup(t).toLowerCase().includes(qLower));
      if (explainHit) {
        matches.push({
          deptId: meta.id,
          deptName: meta.name,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          stepLabel,
          where: '설명',
          snippet: makeSnippet(explainHit, qLower),
          score: 2,
        });
        continue;
      }

      const exampleTexts = (lesson.examples || []).flatMap((ex) => [
        ex.title || '',
        ...(ex.body || []).map((b) => (typeof b === 'string' ? b : `${b.caption || ''} ${b.alt || ''}`)),
      ]);
      const exampleHit = exampleTexts.find((t) => stripMarkup(t).toLowerCase().includes(qLower));
      if (exampleHit) {
        matches.push({
          deptId: meta.id,
          deptName: meta.name,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          stepLabel,
          where: '예',
          snippet: makeSnippet(exampleHit, qLower),
          score: 1.5,
        });
        continue;
      }

      const checkTexts = (lesson.checks || []).map((c) => c.prompt || '');
      const checkHit = checkTexts.find((t) => stripMarkup(t).toLowerCase().includes(qLower));
      if (checkHit) {
        matches.push({
          deptId: meta.id,
          deptName: meta.name,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          stepLabel,
          where: '문항',
          snippet: makeSnippet(checkHit, qLower),
          score: 1,
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score || a.deptName.localeCompare(b.deptName, 'ko'));
  return matches.slice(0, limit);
}
