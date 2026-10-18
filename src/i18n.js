// 화면 언어. 한국어 원문이 곧 키다: t('원문')은 ko에서 원문 그대로, 다른 언어에서는 사전 번역을 돌려준다.
// 사전: content/i18n/<언어>/ui.json  { "원문": "번역" }. 값에 {이름} 자리표시자를 쓸 수 있다.
// Node(검사 도구)에서도 import되므로 브라우저 전용 API는 모두 방어적으로 쓴다.

export const LANGS = { ko: '한국어', en: 'English', es: 'Español' };
export const DEFAULT_LANG = 'ko';
const KEY = 'fu-lang';
const LOCALES = { ko: 'ko', en: 'en', es: 'es' };

let lang = DEFAULT_LANG;
let dict = {};

function detect() {
  try {
    const saved = globalThis.localStorage?.getItem(KEY);
    if (saved && LANGS[saved]) return saved;
  } catch { /* 저장소를 못 쓰면 무시 */ }
  const nav = (globalThis.navigator?.language || '').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : DEFAULT_LANG;
}

export const getLang = () => lang;
export const locale = () => LOCALES[lang] || 'ko';

/** 시작할 때 한 번: 언어를 정하고 사전을 불러온다. */
export async function initI18n(forced) {
  lang = forced && LANGS[forced] ? forced : detect();
  dict = {};
  if (lang !== DEFAULT_LANG) {
    try {
      const res = await fetch(`content/i18n/${lang}/ui.json`, { cache: 'no-cache' });
      if (res.ok) dict = await res.json();
    } catch { /* 사전이 없으면 한국어 원문 */ }
  }
  if (globalThis.document?.documentElement) document.documentElement.lang = lang;
  return lang;
}

export function setLang(next) {
  if (!LANGS[next]) return;
  try { globalThis.localStorage?.setItem(KEY, next); } catch { /* 무시 */ }
}

export function fill(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

/** t('원문 {n}개', { n: 3 }) */
export function t(ko, vars) {
  return fill(dict[ko] ?? ko, vars);
}

/** 테스트용: 사전을 직접 주입한다. */
export function useDict(nextLang, nextDict) { lang = nextLang; dict = nextDict || {}; }
