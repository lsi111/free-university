// 작은 수식 해석기. eval을 쓰지 않는다.
// 지원: + - * / ^, 괄호, 암묵적 곱(2x, 3(x+1), x sin(x)), 함수, 상수 pi·e, 지정한 변수.

import { t } from '../i18n.js';

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  exp: Math.exp, ln: Math.log, log: Math.log10,
  sqrt: Math.sqrt, abs: Math.abs,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function normalize(src) {
  return String(src)
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/\*\*/g, '^');
}

function tokenize(src, vars) {
  const s = normalize(src);
  const names = [...Object.keys(FUNCS), ...Object.keys(CONSTS), ...vars]
    .sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) throw new ExprError(t('숫자를 읽을 수 없습니다: {s}', { s: s.slice(i, i + 5) }));
      out.push({ t: 'num', v: parseFloat(m[1]) });
      i += m[1].length;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      const name = names.find((n) => s.startsWith(n, i));
      if (!name) throw new ExprError(t('알 수 없는 기호: {c}', { c }));
      if (name in FUNCS) out.push({ t: 'fn', v: name });
      else if (name in CONSTS && !vars.includes(name)) out.push({ t: 'num', v: CONSTS[name] });
      else out.push({ t: 'var', v: name });
      i += name.length;
      continue;
    }
    if ('+-*/^()'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new ExprError(t('쓸 수 없는 문자: {c}', { c }));
  }
  return out;
}

export class ExprError extends Error {}

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (want) => {
    const tok = tokens[p];
    if (!tok || tok.t !== want) throw new ExprError(want === ')' ? t('괄호가 닫히지 않았습니다') : t('"{tok}"가 필요합니다', { tok: want }));
    p++;
    return tok;
  };
  const startsPrimary = (tok) => tok && (tok.t === 'num' || tok.t === 'var' || tok.t === 'fn' || tok.t === '(');

  function expr() {
    let node = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[p++].t;
      node = { op, a: node, b: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    for (;;) {
      const tok = peek();
      if (tok && (tok.t === '*' || tok.t === '/')) {
        p++;
        node = { op: tok.t, a: node, b: unary() };
      } else if (startsPrimary(tok)) {
        node = { op: '*', a: node, b: power() };
      } else break;
    }
    return node;
  }
  function unary() {
    const tok = peek();
    if (tok && tok.t === '-') { p++; return { op: 'neg', a: unary() }; }
    if (tok && tok.t === '+') { p++; return unary(); }
    return power();
  }
  function power() {
    const base = primary();
    if (peek() && peek().t === '^') { p++; return { op: '^', a: base, b: unary() }; }
    return base;
  }
  function primary() {
    const tok = peek();
    if (!tok) throw new ExprError(t('식이 중간에 끝났습니다'));
    if (tok.t === 'num') { p++; return { op: 'num', v: tok.v }; }
    if (tok.t === 'var') { p++; return { op: 'var', v: tok.v }; }
    if (tok.t === 'fn') {
      p++;
      eat('(');
      const a = expr();
      eat(')');
      return { op: 'fn', f: tok.v, a };
    }
    if (tok.t === '(') {
      p++;
      const a = expr();
      eat(')');
      return a;
    }
    throw new ExprError(t('"{tok}" 자리가 맞지 않습니다', { tok: tok.t }));
  }

  if (tokens.length === 0) throw new ExprError(t('빈 식입니다'));
  const tree = expr();
  if (p < tokens.length) throw new ExprError(t('"{tok}" 근처를 읽을 수 없습니다', { tok: tokens[p].t === 'num' ? tokens[p].v : tokens[p].v || tokens[p].t }));
  return tree;
}

function evaluate(node, env) {
  switch (node.op) {
    case 'num': return node.v;
    case 'var': return env[node.v];
    case 'neg': return -evaluate(node.a, env);
    case '+': return evaluate(node.a, env) + evaluate(node.b, env);
    case '-': return evaluate(node.a, env) - evaluate(node.b, env);
    case '*': return evaluate(node.a, env) * evaluate(node.b, env);
    case '/': return evaluate(node.a, env) / evaluate(node.b, env);
    case '^': return Math.pow(evaluate(node.a, env), evaluate(node.b, env));
    case 'fn': return FUNCS[node.f](evaluate(node.a, env));
    default: throw new ExprError(t('내부 오류'));
  }
}

/** 문자열 식을 (env) => number 함수로 바꾼다. 적분 상수 "+ C"나 "+ c"는 떼어 낸다. */
export function compile(src, vars = []) {
  const stripConst = !vars.includes('C') && !vars.includes('c');
  const cleaned = stripConst ? String(src).replace(/[+-]\s*[cC]\s*$/, '') : String(src);
  const tree = parse(tokenize(cleaned, vars));
  return (env = {}) => evaluate(tree, env);
}

/** 변수가 없는 식의 값. "1/2", "2pi" 같은 입력을 받는다. */
export function value(src) {
  return compile(src, [])({});
}

function close(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

// 결정적인 표본점. 0.3~2.9 구간이라 ln, sqrt 정의역 문제를 피한다.
function samplePoints(vars, n) {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: n }, () =>
    Object.fromEntries(vars.map((v) => [v, 0.3 + rnd() * 2.6])));
}

/** 두 식이 같은 함수인지 여러 점에서 값을 비교한다. upToConstant면 상수 차이를 허용한다. */
export function equivalent(a, b, { vars = ['x'], upToConstant = false, samples = 8 } = {}) {
  const fa = compile(a, vars);
  const fb = compile(b, vars);
  const diffs = [];
  for (const env of samplePoints(vars, samples)) {
    const va = fa(env);
    const vb = fb(env);
    const okA = Number.isFinite(va);
    const okB = Number.isFinite(vb);
    if (!okA && !okB) continue;
    if (okA !== okB) return false;
    if (upToConstant) diffs.push(va - vb);
    else if (!close(va, vb)) return false;
  }
  if (upToConstant) {
    if (diffs.length < 3) return false;
    return diffs.every((d) => close(d, diffs[0]));
  }
  return true;
}

export { close };
