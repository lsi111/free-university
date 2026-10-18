// 학과 간 개념 연결 엔진. 화면 코드에 특정 학과 이름을 넣지 않고 데이터에서 자동으로 찾는다.
import { getLang, locale } from '../i18n.js';
import { foldText } from './text.js';

const STOP_TERMS = new Set([
  '첫째', '둘째', '셋째', '넷째', '다섯째', '핵심', '정의', '차이', '이유', '결과', '원인',
  '방법', '원리', '개념', '단계', '구조', '예시', '비교', '선택', '사실', '해석', '역할',
  '동시에', '경향', '비율', '가상', '자리', '내용', '늘어난다', '함께', '변환', '입력', '출력',
  '보존', '조직', '분리', '행동', '계획', '위험', '정보', '자료', '목표', '규칙', '평가',
  '근사', '요청', '저장', '가격', '규모', '가치', '비용', '수입', '공간', '주기', '경도',
  '지각', '처벌', '욕구', '증거', '세기', '조사', '형식', '결론', '의무', '기초', '과정',
  '기준', '단위', '범위', '전체', '부분', '관계', '상태', '변화', '속도', '방향', '크기',
]);

// 영어·스페인어용: 한국어 목록과 같은 성격(순서어, 지나치게 일반적인 낱말)을 모았다. 악센트와 대소문자는 접어서 비교한다.
const STOP_TERMS_EN = new Set([
  'first', 'second', 'third', 'fourth', 'fifth', 'key', 'core', 'definition', 'difference', 'reason', 'result', 'cause',
  'method', 'principle', 'concept', 'step', 'stage', 'structure', 'example', 'comparison', 'choice', 'fact', 'interpretation', 'role',
  'meanwhile', 'trend', 'ratio', 'virtual', 'place', 'content', 'together', 'conversion', 'input', 'output',
  'conservation', 'organization', 'separation', 'behavior', 'behaviour', 'plan', 'risk', 'information', 'data', 'goal', 'rule', 'evaluation',
  'approximation', 'request', 'storage', 'price', 'scale', 'value', 'cost', 'income', 'space', 'period', 'longitude',
  'perception', 'punishment', 'desire', 'evidence', 'century', 'survey', 'form', 'conclusion', 'duty', 'basics', 'process',
  'standard', 'unit', 'range', 'whole', 'part', 'relationship', 'state', 'change', 'speed', 'direction', 'size',
  'note', 'tip', 'summary', 'idea', 'case', 'type', 'model', 'order', 'question', 'answer', 'problem', 'solution',
]);

const STOP_TERMS_ES = new Set([
  'primero', 'primera', 'segundo', 'segunda', 'tercero', 'tercera', 'cuarto', 'cuarta', 'quinto', 'quinta', 'clave', 'nucleo', 'definicion', 'diferencia',
  'razon', 'motivo', 'resultado', 'causa', 'metodo', 'principio', 'concepto', 'paso', 'etapa', 'estructura', 'ejemplo', 'comparacion',
  'eleccion', 'opcion', 'hecho', 'interpretacion', 'papel', 'rol', 'mientras tanto', 'tendencia', 'proporcion', 'razon', 'virtual', 'lugar',
  'contenido', 'juntos', 'conversion', 'entrada', 'salida', 'conservacion', 'organizacion', 'separacion', 'conducta', 'plan', 'riesgo',
  'informacion', 'datos', 'meta', 'objetivo', 'regla', 'evaluacion', 'aproximacion', 'solicitud', 'almacenamiento', 'precio', 'escala',
  'valor', 'costo', 'coste', 'ingreso', 'ingresos', 'espacio', 'periodo', 'longitud', 'percepcion', 'castigo', 'deseo', 'evidencia', 'siglo',
  'encuesta', 'forma', 'conclusion', 'deber', 'bases', 'proceso', 'criterio', 'unidad', 'rango', 'todo', 'parte', 'relacion', 'estado',
  'cambio', 'velocidad', 'direccion', 'tamano', 'nota', 'consejo', 'resumen', 'idea', 'caso', 'tipo', 'modelo', 'orden', 'pregunta',
  'respuesta', 'problema', 'solucion',
]);

const isKo = () => getLang() === 'ko';

function isStopTerm(term) {
  if (isKo()) return STOP_TERMS.has(term);
  const key = foldText(term).replace(/\s+/g, ' ').trim();
  return STOP_TERMS_EN.has(key) || STOP_TERMS_ES.has(key);
}

/** 개념어 비교용 키. 한국어는 원문 그대로, 그 밖의 언어는 대소문자·악센트·공백을 접는다. */
const conceptKey = (term) => (isKo() ? term : foldText(term).replace(/\s+/g, ' ').trim());

/** 교시 설명 본문에서 강조된 핵심 개념어(**개념**)를 추출한다. 한국어는 2~15자, 라틴 문자 언어는 2~40자. */
export function extractConcepts(lesson) {
  const max = isKo() ? 15 : 40;
  const re = new RegExp(`\\*\\*([^*]{2,${max}})\\*\\*`, 'g');
  const out = new Map();
  for (const block of lesson?.explain || []) {
    if (typeof block !== 'string') continue;
    for (const m of block.matchAll(re)) {
      const term = m[1].trim();
      if (term.length < 2 || isStopTerm(term)) continue;
      if (/^[0-9\s.,+-]+$/.test(term)) continue;
      if (/[?:;~…]/.test(term)) continue;
      const key = conceptKey(term);
      if (!out.has(key)) out.set(key, term);
    }
  }
  return [...out.values()];
}

/**
 * 현재 교시와 핵심 개념어를 공유하는 다른 학과의 교시를 찾는다.
 * depts: Map<deptId, dept>
 */
export function findLessonConnections({ deptId, lesson, catalog, depts, limit = 6 }) {
  const myConcepts = new Set(extractConcepts(lesson).map(conceptKey));
  if (myConcepts.size === 0) return [];

  const results = [];
  const openCatalog = (catalog || []).filter((d) => d.status === 'open' && d.id !== deptId);

  for (const otherMeta of openCatalog) {
    const otherDept = depts instanceof Map ? depts.get(otherMeta.id) : depts?.[otherMeta.id];
    if (!otherDept?.lessons) continue;
    for (const otherLesson of otherDept.lessons) {
      const otherConcepts = extractConcepts(otherLesson);
      const shared = otherConcepts.filter((c) => myConcepts.has(conceptKey(c)));
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

  results.sort((a, b) => b.concepts.length - a.concepts.length || a.deptName.localeCompare(b.deptName, locale()));
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
        || dTags.some((tag) => myFields.has(tag));
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale()));
}
