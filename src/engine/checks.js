// 채점 엔진은 하나, 문항 유형은 여럿. 유형은 등록 방식이라 추가해도 학과 데이터와 화면은 그대로다.
//
// grade(check, response) 결과:
//   { status: 'pass', kind: 'auto' }        자동으로 확실히 판정됨
//   { status: 'pass', kind: 'self' }        자기 점검으로 통과 (제출형)
//   { status: 'self-check' }                핵심어는 확인됨, 모범 답안과 비교 후 학습자가 확정해야 함
//   { status: 'fail', message }             다시 시도

import { compile, value, equivalent, close, ExprError } from './expr.js';

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonEmptyArray = (v) => Array.isArray(v) && v.length > 0;

function normText(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

export const CHECK_TYPES = {
  numeric: {
    label: '계산',
    auto: true,
    validate(c) {
      const e = [];
      if (typeof c.answer !== 'number' && !isStr(c.answer)) e.push('answer는 숫자나 식이어야 합니다');
      else {
        try { if (!Number.isFinite(value(String(c.answer)))) e.push('answer 값이 유한하지 않습니다'); }
        catch { e.push('answer를 계산할 수 없습니다'); }
      }
      if (c.tolerance != null && !(c.tolerance >= 0)) e.push('tolerance는 0 이상이어야 합니다');
      return e;
    },
    grade(c, resp) {
      if (!isStr(resp)) return { status: 'fail', message: '값을 입력하세요.' };
      let got;
      try { got = value(resp); } catch (err) {
        return { status: 'fail', message: err instanceof ExprError ? err.message : '값을 읽을 수 없습니다.' };
      }
      const want = value(String(c.answer));
      const ok = c.tolerance != null ? Math.abs(got - want) <= c.tolerance : close(got, want, 1e-9);
      return ok ? { status: 'pass', kind: 'auto' } : { status: 'fail', message: '값이 다릅니다.' };
    },
  },

  expression: {
    label: '식',
    auto: true,
    features: ['formula'],
    validate(c) {
      const e = [];
      if (!isStr(c.answer)) e.push('answer 식이 필요합니다');
      else {
        try { compile(c.answer, c.vars || ['x']); } catch { e.push('answer 식을 해석할 수 없습니다'); }
      }
      return e;
    },
    grade(c, resp) {
      if (!isStr(resp)) return { status: 'fail', message: '식을 입력하세요.' };
      try {
        const ok = equivalent(resp, c.answer, { vars: c.vars || ['x'], upToConstant: !!c.upToConstant });
        return ok ? { status: 'pass', kind: 'auto' } : { status: 'fail', message: '기대한 식과 값이 다릅니다.' };
      } catch (err) {
        return { status: 'fail', message: err instanceof ExprError ? err.message : '식을 읽을 수 없습니다.' };
      }
    },
  },

  choice: {
    label: '선택',
    auto: true,
    validate(c) {
      const e = [];
      if (!isNonEmptyArray(c.options) || c.options.length < 2) e.push('options가 2개 이상 필요합니다');
      if (!isNonEmptyArray(c.answer)) e.push('answer는 정답 번호 배열이어야 합니다');
      else if (c.answer.some((i) => !Number.isInteger(i) || i < 0 || i >= (c.options || []).length)) e.push('answer 번호가 options 범위를 벗어납니다');
      return e;
    },
    grade(c, resp) {
      const picked = [...new Set(resp || [])].sort();
      if (picked.length === 0) return { status: 'fail', message: '하나를 고르세요.' };
      const want = [...c.answer].sort();
      const ok = picked.length === want.length && picked.every((v, i) => v === want[i]);
      return ok ? { status: 'pass', kind: 'auto' } : { status: 'fail', message: '정답이 아닙니다.' };
    },
  },

  match: {
    label: '짝짓기',
    auto: true,
    validate(c) {
      const e = [];
      if (!isNonEmptyArray(c.pairs) || c.pairs.length < 2) e.push('pairs가 2개 이상 필요합니다');
      else if (c.pairs.some((p) => !Array.isArray(p) || p.length !== 2 || !isStr(p[0]) || !isStr(p[1]))) e.push('pairs의 각 항목은 [왼쪽, 오른쪽]이어야 합니다');
      return e;
    },
    // resp: 왼쪽 i번에 고른 오른쪽 문자열 배열
    grade(c, resp) {
      if (!Array.isArray(resp) || resp.length !== c.pairs.length || resp.some((r) => !isStr(r))) {
        return { status: 'fail', message: '모든 짝을 고르세요.' };
      }
      const wrong = c.pairs.filter((p, i) => p[1] !== resp[i]).length;
      return wrong === 0 ? { status: 'pass', kind: 'auto' } : { status: 'fail', message: `${wrong}개의 짝이 맞지 않습니다.` };
    },
  },

  order: {
    label: '순서',
    auto: true,
    validate(c) {
      const e = [];
      if (!isNonEmptyArray(c.items) || c.items.length < 3) e.push('items가 3개 이상 필요합니다');
      if (new Set(c.items || []).size !== (c.items || []).length) e.push('items에 중복이 있습니다');
      return e;
    },
    // resp: 학습자가 배열한 items
    grade(c, resp) {
      const ok = Array.isArray(resp) && resp.length === c.items.length && resp.every((v, i) => v === c.items[i]);
      return ok ? { status: 'pass', kind: 'auto' } : { status: 'fail', message: '순서가 맞지 않습니다.' };
    },
  },

  keywords: {
    label: '핵심어 서술',
    auto: false,
    validate(c) {
      const e = [];
      if (!isNonEmptyArray(c.groups)) e.push('groups(동의어 묶음 배열)가 필요합니다');
      else if (c.groups.some((g) => !isNonEmptyArray(g) || g.some((w) => !isStr(w)))) e.push('groups의 각 묶음은 단어 배열이어야 합니다');
      if (!isStr(c.model)) e.push('model(모범 답안)이 필요합니다');
      return e;
    },
    grade(c, resp) {
      const text = String(resp || '');
      const min = c.minLength ?? 30;
      if (text.replace(/\s/g, '').length < min) return { status: 'fail', message: `조금 더 써 주세요. (공백 제외 ${min}자 이상)` };
      const flat = normText(text);
      const missing = c.groups.filter((g) => !g.some((w) => flat.includes(normText(w)))).length;
      if (missing > 0) return { status: 'fail', message: `다뤄야 할 핵심 개념 중 ${missing}개가 글에 보이지 않습니다.` };
      return { status: 'self-check' };
    },
  },

  submit: {
    label: '제출',
    auto: false,
    validate(c) {
      const e = [];
      if (!isNonEmptyArray(c.checklist)) e.push('checklist(자기 점검 항목)가 필요합니다');
      return e;
    },
    // resp: { text, checked: boolean[] }
    grade(c, resp) {
      const text = String(resp?.text || '');
      const min = c.minLength ?? 1;
      if (text.replace(/\s/g, '').length < min) return { status: 'fail', message: `공백 제외 ${min}자 이상 남겨 주세요.` };
      const checked = resp?.checked || [];
      if (c.checklist.some((_, i) => !checked[i])) return { status: 'fail', message: '자기 점검 항목을 모두 확인하세요.' };
      return { status: 'pass', kind: 'self' };
    },
  },
};

export function grade(check, response) {
  const type = CHECK_TYPES[check.type];
  if (!type) return { status: 'fail', message: `알 수 없는 문항 유형: ${check.type}` };
  return type.grade(check, response);
}

/** 문항 유형이 요구하는 화면 기능(예: 수식 렌더러) */
export function featuresFor(check) {
  return CHECK_TYPES[check.type]?.features || [];
}
