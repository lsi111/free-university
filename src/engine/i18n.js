// 콘텐츠 번역 덧씌우기. 번역본은 content/i18n/<언어>/ 아래의 "문장만 담은 덧씌움 파일"이고,
// 정답·점수·구조는 항상 한국어 원본이 정한다. 덧씌움은 구조(배열 길이)가 맞을 때만 적용된다.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const FIG_KEYS = ['alt', 'caption'];
const CHECK_TEXT = ['prompt', 'hint', 'explanation', 'model', 'selfCheck'];
const CHECK_LISTS = ['options', 'items', 'checklist'];

function block(src, tr) {
  if (typeof src === 'string') return typeof tr === 'string' ? tr : src;
  if (isObj(src) && isObj(tr)) {
    const out = { ...src };
    for (const k of FIG_KEYS) if (typeof tr[k] === 'string') out[k] = tr[k];
    return out;
  }
  return src;
}

function blocks(srcList, trList) {
  if (!Array.isArray(srcList) || !Array.isArray(trList) || srcList.length !== trList.length) return srcList;
  return srcList.map((s, i) => block(s, trList[i]));
}

const sameShape = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length;

function check(src, tr) {
  if (!isObj(tr)) return src;
  const out = { ...src };
  for (const k of CHECK_TEXT) if (typeof src[k] === 'string' && typeof tr[k] === 'string') out[k] = tr[k];
  for (const k of CHECK_LISTS) if (sameShape(src[k], tr[k]) && tr[k].every((s) => typeof s === 'string')) out[k] = tr[k];
  if (sameShape(src.pairs, tr.pairs) && tr.pairs.every((p) => Array.isArray(p) && p.length === 2)) out.pairs = tr.pairs;
  if (sameShape(src.groups, tr.groups) && tr.groups.every((g, i) => sameShape(src.groups[i], g))) out.groups = tr.groups;
  if (isObj(src.figure) && isObj(tr.figure)) out.figure = block(src.figure, tr.figure);
  return out;
}

function lesson(src, tr) {
  if (!isObj(tr)) return src;
  const out = { ...src };
  if (typeof tr.title === 'string') out.title = tr.title;
  out.explain = blocks(src.explain, tr.explain);
  if (sameShape(src.examples, tr.examples)) {
    out.examples = src.examples.map((ex, i) => ({
      ...ex,
      title: typeof tr.examples[i]?.title === 'string' ? tr.examples[i].title : ex.title,
      body: blocks(ex.body, tr.examples[i]?.body),
    }));
  }
  if (sameShape(src.checks, tr.checks)) out.checks = src.checks.map((c, i) => check(c, tr.checks[i]));
  return out;
}

/** 학과 데이터에 번역을 덧씌운 새 객체를 돌려준다. overlay가 없으면 원본 그대로. */
export function applyDeptOverlay(dept, overlay) {
  if (!dept || !isObj(overlay)) return dept;
  const out = { ...dept };
  out.branches = (dept.branches || []).map((b) => {
    const t = overlay.branches?.[b.id];
    return t ? { ...b, name: t.name ?? b.name, summary: t.summary ?? b.summary } : b;
  });
  out.lessons = (dept.lessons || []).map((l) => lesson(l, overlay.lessons?.[l.id]));
  return out;
}

/** 계열·학과 카드 문구. overlay: { fields: {id: {name, note}}, departments: {id: {name, summary, audience, limits}} } */
export function applyCatalogOverlay(fields, catalog, overlay) {
  if (!isObj(overlay)) return { fields, catalog };
  const pick = (src, tr, keys) => {
    if (!isObj(tr)) return src;
    const out = { ...src };
    for (const k of keys) if (typeof tr[k] === 'string' && typeof src[k] === 'string') out[k] = tr[k];
    return out;
  };
  return {
    fields: fields.map((f) => pick(f, overlay.fields?.[f.id], ['name', 'note'])),
    catalog: catalog.map((d) => pick(d, overlay.departments?.[d.id], ['name', 'summary', 'audience', 'limits'])),
  };
}

/** 번역 대상 문장만 뽑은 덧씌움 뼈대(원문 한국어가 채워져 있다). 번역자는 값만 바꾼다. */
export function sourceOf(dept) {
  const figs = (b) => (isObj(b) ? Object.fromEntries(FIG_KEYS.filter((k) => typeof b[k] === 'string').map((k) => [k, b[k]])) : b);
  const lessons = {};
  for (const l of dept.lessons || []) {
    lessons[l.id] = {
      title: l.title,
      explain: (l.explain || []).map(figs),
      examples: (l.examples || []).map((ex) => ({ title: ex.title, body: (ex.body || []).map(figs) })),
      checks: (l.checks || []).map((c) => {
        const o = {};
        for (const k of CHECK_TEXT) if (typeof c[k] === 'string') o[k] = c[k];
        for (const k of CHECK_LISTS) if (Array.isArray(c[k])) o[k] = c[k];
        if (c.pairs) o.pairs = c.pairs;
        if (c.groups) o.groups = c.groups;
        if (isObj(c.figure)) o.figure = figs(c.figure);
        return o;
      }),
    };
  }
  const branches = {};
  for (const b of dept.branches || []) branches[b.id] = { name: b.name, summary: b.summary };
  return { branches, lessons };
}
