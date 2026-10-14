// 학과 간 개념 연결 엔진. 화면 코드에 특정 학과 이름을 넣지 않고 데이터에서 자동으로 찾는다.

const STOP_TERMS = new Set([
  '첫째', '둘째', '셋째', '넷째', '다섯째', '핵심', '정의', '차이', '이유', '결과', '원인',
  '방법', '원리', '개념', '단계', '구조', '예시', '비교', '선택', '사실', '해석', '역할',
  '동시에', '경향', '비율', '가상', '자리', '내용', '늘어난다', '함께', '변환', '입력', '출력',
  '보존', '조직', '분리', '행동', '계획', '위험', '정보', '자료', '목표', '규칙', '평가',
  '근사', '요청', '저장', '가격', '규모', '가치', '비용', '수입', '공간', '주기', '경도',
  '지각', '처벌', '욕구', '증거', '세기', '조사', '형식', '결론', '의무', '기초', '과정',
  '기준', '단위', '범위', '전체', '부분', '관계', '상태', '변화', '속도', '방향', '크기',
]);

/** 교시 설명 본문에서 강조된 핵심 개념어(**개념**)를 추출한다. */
export function extractConcepts(lesson) {
  const out = new Set();
  for (const block of lesson?.explain || []) {
    if (typeof block !== 'string') continue;
    for (const m of block.matchAll(/\*\*([^*]{2,15})\*\*/g)) {
      const term = m[1].trim();
      if (term.length < 2 || STOP_TERMS.has(term)) continue;
      if (/^[0-9\s.,+-]+$/.test(term)) continue;
      if (/[?:;~…]/.test(term)) continue;
      out.add(term);
    }
  }
  return [...out];
}

/**
 * 현재 교시와 핵심 개념어를 공유하는 다른 학과의 교시를 찾는다.
 * depts: Map<deptId, dept>
 */
export function findLessonConnections({ deptId, lesson, catalog, depts, limit = 6 }) {
  const myConcepts = new Set(extractConcepts(lesson));
  if (myConcepts.size === 0) return [];

  const results = [];
  const openCatalog = (catalog || []).filter((d) => d.status === 'open' && d.id !== deptId);

  for (const otherMeta of openCatalog) {
    const otherDept = depts instanceof Map ? depts.get(otherMeta.id) : depts?.[otherMeta.id];
    if (!otherDept?.lessons) continue;
    for (const otherLesson of otherDept.lessons) {
      const otherConcepts = extractConcepts(otherLesson);
      const shared = otherConcepts.filter((c) => myConcepts.has(c));
      if (shared.length > 0) {
        results.push({
          deptId: otherMeta.id,
          deptName: otherMeta.name,
          lessonId: otherLesson.id,
          lessonTitle: otherLesson.title,
          concepts: shared,
        });
      }
    }
  }

  results.sort((a, b) => b.concepts.length - a.concepts.length || a.deptName.localeCompare(b.deptName, 'ko'));
  return results.slice(0, limit);
}

/**
 * 학과 수준에서 함께 걸친 계열(tags)로 연결된 다른 학과들을 돌려준다.
 */
export function findRelatedDepartments(meta, catalog) {
  if (!meta || !Array.isArray(catalog)) return [];
  const myFields = new Set([meta.field, ...(meta.tags || [])]);
  return catalog
    .filter((d) => d.id !== meta.id && d.status === 'open')
    .filter((d) => {
      const dTags = d.tags || [];
      return (meta.tags || []).includes(d.field)
        || dTags.includes(meta.field)
        || dTags.some((t) => myFields.has(t));
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
