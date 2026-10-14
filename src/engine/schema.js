// 학과 데이터 검증. 화면과 CI가 같은 규칙을 쓴다.

import { CHECK_TYPES } from './checks.js';

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const STATUSES = ['open', 'preparing'];

export function validateCatalog(fields, catalog) {
  const errors = [];
  const fieldIds = new Set();
  for (const f of fields) {
    if (!isStr(f.id) || !isStr(f.name)) errors.push(`계열 항목에 id/name이 없습니다: ${JSON.stringify(f)}`);
    if (fieldIds.has(f.id)) errors.push(`계열 id 중복: ${f.id}`);
    fieldIds.add(f.id);
  }
  const ids = new Set();
  const names = new Set();
  for (const d of catalog) {
    const at = `학과 ${d.id || '(id 없음)'}`;
    if (!isStr(d.id) || !/^[a-z][a-z0-9-]*$/.test(d.id)) errors.push(`${at}: id는 영문 소문자·숫자·하이픈`);
    if (ids.has(d.id)) errors.push(`${at}: id 중복`);
    ids.add(d.id);
    if (!isStr(d.name)) errors.push(`${at}: name 없음`);
    if (names.has(d.name)) errors.push(`${at}: name 중복`);
    names.add(d.name);
    if (!fieldIds.has(d.field)) errors.push(`${at}: 알 수 없는 계열 ${d.field}`);
    for (const t of d.tags || []) if (!fieldIds.has(t)) errors.push(`${at}: 알 수 없는 보조 계열 ${t}`);
    if (!STATUSES.includes(d.status)) errors.push(`${at}: status는 open 또는 preparing`);
    if (!isStr(d.summary)) errors.push(`${at}: summary 없음`);
    if (d.status === 'open') {
      if (!isStr(d.file)) errors.push(`${at}: 열린 학과는 file이 필요합니다`);
      if (!isStr(d.audience)) errors.push(`${at}: 열린 학과는 audience가 필요합니다`);
    }
    if (d.status === 'preparing' && d.file) errors.push(`${at}: 준비 중 학과에는 file이 없어야 합니다`);
  }
  return errors;
}

/** 그림 참조를 모아 돌려준다. 파일 존재 검사는 tools/check.mjs가 한다. */
export function collectFigures(dept) {
  const out = [];
  for (const l of dept.lessons || []) {
    for (const b of l.explain || []) if (b && typeof b === 'object') out.push({ lesson: l.id, fig: b });
    for (const ex of l.examples || []) for (const b of ex.body || []) if (b && typeof b === 'object') out.push({ lesson: l.id, fig: b });
    for (const c of l.checks || []) if (c.figure) out.push({ lesson: l.id, fig: c.figure });
  }
  return out;
}

export function validateDepartment(meta, dept) {
  const errors = [];
  const at = (s) => `${meta.id}: ${s}`;
  const lessons = dept.lessons || [];
  const byId = new Map();
  for (const l of lessons) {
    if (!isStr(l.id)) { errors.push(at('id 없는 교시')); continue; }
    if (byId.has(l.id)) errors.push(at(`교시 id 중복 ${l.id}`));
    byId.set(l.id, l);
  }

  const trunk = dept.trunk || [];
  if (trunk.length === 0) errors.push(at('공통 줄기(trunk)가 비어 있습니다'));
  const placed = new Set();
  for (const id of trunk) {
    if (!byId.has(id)) errors.push(at(`줄기의 ${id}가 lessons에 없습니다`));
    placed.add(id);
  }
  for (const b of dept.branches || []) {
    if (!isStr(b.id) || !isStr(b.name)) errors.push(at('갈래에 id/name이 없습니다'));
    for (const id of b.opensAfter || []) {
      if (!trunk.includes(id)) errors.push(at(`갈래 ${b.id}의 opensAfter ${id}는 같은 학과 줄기의 교시여야 합니다`));
    }
    if (!(b.lessons || []).length) errors.push(at(`갈래 ${b.id}에 교시가 없습니다`));
    for (const id of b.lessons || []) {
      if (!byId.has(id)) errors.push(at(`갈래 ${b.id}의 ${id}가 lessons에 없습니다`));
      if (placed.has(id)) errors.push(at(`${id}가 두 곳에 배치되었습니다`));
      placed.add(id);
    }
  }
  for (const id of byId.keys()) if (!placed.has(id)) errors.push(at(`${id}가 줄기나 갈래 어디에도 없습니다`));

  // 교시 내용
  for (const l of lessons) {
    const la = (s) => at(`${l.id} ${s}`);
    if (!isStr(l.title)) errors.push(la('title 없음'));
    if (!Array.isArray(l.explain) || l.explain.length === 0) errors.push(la('설명(explain) 없음'));
    if (!Array.isArray(l.examples) || l.examples.length === 0) errors.push(la('예(examples)가 1개 이상 필요합니다'));
    if (!Array.isArray(l.checks) || l.checks.length === 0) errors.push(la('확인 문항이 없습니다'));
    for (const r of l.requires || []) {
      if (!byId.has(r)) errors.push(la(`선행 ${r}이 이 학과에 없습니다 (다른 학과 교시는 선행이 될 수 없습니다)`));
    }
    (l.checks || []).forEach((c, i) => {
      const type = CHECK_TYPES[c.type];
      if (!type) { errors.push(la(`문항 ${i + 1}: 알 수 없는 유형 ${c.type}`)); return; }
      if (!isStr(c.prompt)) errors.push(la(`문항 ${i + 1}: prompt 없음`));
      for (const e of type.validate(c)) errors.push(la(`문항 ${i + 1}: ${e}`));
      for (const f of type.features || []) {
        if (!(l.features || []).includes(f)) errors.push(la(`문항 ${i + 1}: ${type.label} 유형은 features에 "${f}"가 필요합니다`));
      }
    });
  }

  for (const { lesson, fig } of collectFigures(dept)) {
    if (!isStr(fig.figure)) errors.push(at(`${lesson}: 그림 블록에 figure 경로가 없습니다`));
    if (!isStr(fig.alt)) errors.push(at(`${lesson}: 그림 ${fig.figure || ''}에 alt(대체 텍스트)가 없습니다`));
  }

  // 입구와 순환
  if (!lessons.some((l) => (l.requires || []).length === 0)) errors.push(at('입구(선행 없는 교시)가 없습니다'));
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') { errors.push(at(`선행 순환: ${[...path, id].join(' → ')}`)); return; }
    state.set(id, 'visiting');
    for (const r of byId.get(id)?.requires || []) if (byId.has(r)) visit(r, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of byId.keys()) visit(id, []);

  // 갈래 교시는 갈래가 열린 뒤에만 의미가 있다. 줄기 교시가 갈래 교시를 선행으로 요구하면 안 된다.
  const branchIds = new Set((dept.branches || []).flatMap((b) => b.lessons || []));
  for (const id of trunk) {
    for (const r of byId.get(id)?.requires || []) {
      if (branchIds.has(r)) errors.push(at(`줄기 교시 ${id}가 갈래 교시 ${r}를 선행으로 요구합니다`));
    }
  }
  return errors;
}
