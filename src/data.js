// 콘텐츠 불러오기. 어떤 학과가 있는지는 content/ 아래 데이터만 안다.

import { validateCatalog, validateDepartment } from './engine/schema.js';

const cache = { fields: null, catalog: null, depts: new Map(), allLoaded: false };

async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

/** 없어도 되는 설정·기록 파일. 404이거나 깨져 있으면 fallback을 쓴다. */
async function getOptionalJson(path, fallback) {
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    return res.ok ? await res.json() : fallback;
  } catch {
    return fallback;
  }
}

export const loadReviews = () => getOptionalJson('content/reviews.json', {});
export const loadSite = () => getOptionalJson('content/site.json', {});

export const byName = (a, b) => a.name.localeCompare(b.name, 'ko');

export async function loadCatalog() {
  if (!cache.catalog) {
    const [fields, catalog] = await Promise.all([getJson('content/fields.json'), getJson('content/catalog.json')]);
    const errors = validateCatalog(fields, catalog);
    cache.fields = fields;
    cache.catalog = catalog;
    cache.catalogErrors = errors;
  }
  return { fields: cache.fields, catalog: cache.catalog, errors: cache.catalogErrors };
}

/** 계열별로 묶고, 계열과 학과 모두 가나다순. 빈도나 완성도로 정렬하지 않는다. */
export function groupByField(fields, catalog) {
  return [...fields].sort(byName).map((f) => ({
    field: f,
    departments: catalog.filter((d) => d.field === f.id).sort(byName),
  }));
}

export async function loadDepartment(id) {
  const { catalog } = await loadCatalog();
  const meta = catalog.find((d) => d.id === id);
  if (!meta) return null;
  if (meta.status !== 'open') return { meta, dept: null, errors: [] };
  if (!cache.depts.has(id)) {
    const dept = await getJson(`content/${meta.file}`);
    cache.depts.set(id, { dept, errors: validateDepartment(meta, dept) });
  }
  return { meta, ...cache.depts.get(id) };
}

/** 본문 검색이나 학과 간 연결을 위해 열린 모든 학과 데이터를 불러와 Map<id, dept>로 돌려준다. */
export async function loadAllDepartments() {
  const { catalog } = await loadCatalog();
  if (!cache.allLoaded) {
    const openDepts = catalog.filter((d) => d.status === 'open');
    await Promise.all(openDepts.map((d) => loadDepartment(d.id)));
    cache.allLoaded = true;
  }
  const map = new Map();
  for (const [id, entry] of cache.depts.entries()) {
    if (entry?.dept) map.set(id, entry.dept);
  }
  return map;
}

export function fieldName(fields, id) {
  return fields.find((f) => f.id === id)?.name || id;
}
