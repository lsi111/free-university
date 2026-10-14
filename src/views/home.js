// 입구: 학과 선택 및 교시 개념 검색. 학과를 고르기 전에는 어떤 학과도 기본값으로 열리지 않는다.

import { h, fill } from '../dom.js';
import { groupByField } from '../data.js';
import { deptProgress } from '../engine/progress.js';
import { filterDepartments, searchLessons } from '../engine/search.js';

export function renderHome(root, { fields, catalog, progress, query = '', loadAllDepartments }) {
  const search = h('input', {
    type: 'search', class: 'text-input search', placeholder: '학과 이름, 주제, 교시 개념으로 찾기',
    'aria-label': '학과 이름, 주제, 교시 개념으로 찾기', value: query,
  });
  const listWrap = h('div', { class: 'fields' });
  const lessonResultsWrap = h('div', { class: 'search-lessons-wrap', 'aria-live': 'polite' });
  let searchSeq = 0;

  const draw = async () => {
    const seq = ++searchSeq;
    const q = search.value.trim();
    const matchedIds = new Set(filterDepartments(catalog, fields, q).map((d) => d.id));
    const groups = groupByField(fields, catalog);

    const sections = groups.map(({ field, departments }) => {
      const shown = q ? departments.filter((d) => matchedIds.has(d.id)) : departments;
      if (q && shown.length === 0) return null;
      return h('details', { class: 'field', open: true },
        h('summary', {},
          h('span', { class: 'field-name' }, field.name),
          h('span', { class: 'field-meta' }, `${departments.length}칸 · ${field.note || ''}`)),
        h('ul', { class: 'dept-grid', role: 'list' }, shown.map((d) => h('li', {}, deptCard(d, progress)))));
    }).filter(Boolean);

    listWrap.replaceChildren(...(sections.length
      ? sections
      : [h('p', { class: 'empty' }, `"${q}"에 바로 해당하는 학과 칸이 없습니다. 아래 교시 본문 검색 결과를 확인하세요.`)]));

    if (q.length < 2 || !loadAllDepartments) {
      lessonResultsWrap.replaceChildren();
      return;
    }

    const depts = await loadAllDepartments();
    if (seq !== searchSeq) return;
    const hits = searchLessons(catalog, depts, q, { limit: 24 });
    if (hits.length === 0) {
      lessonResultsWrap.replaceChildren(
        h('section', { class: 'panel' },
          h('h2', {}, '교시 본문 검색 결과'),
          h('p', { class: 'empty' }, `"${q}"가 들어간 교시를 찾지 못했습니다.`)),
      );
      return;
    }

    lessonResultsWrap.replaceChildren(
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('h2', {}, '교시 본문 검색 결과'),
          h('span', { class: 'meta-line' }, `${hits.length}건 일치`)),
        h('ul', { class: 'lesson-list', role: 'list' },
          hits.map((hit) => h('li', { class: 'lesson-item open search-hit' },
            h('a', { href: `#/d/${hit.deptId}/l/${hit.lessonId}` },
              h('span', { class: 'lesson-no' }, `${hit.deptName} · ${hit.stepLabel}`),
              h('span', { class: 'lesson-title' }, hit.lessonTitle)),
            h('span', { class: 'lesson-state' }, hit.where),
            h('p', { class: 'lesson-needs search-snippet' }, hit.snippet))))),
    );
  };

  search.addEventListener('input', draw);
  draw();

  fill(root,
    h('section', { class: 'hero' },
      h('h1', { tabindex: '-1' }, '배울 학과를 고르세요'),
      h('p', { class: 'lede' }, '여기에는 기본 전공이 없습니다. 모든 학과가 같은 출발선에 있고, 고른 학과의 첫 교시가 바로 열립니다.'),
      h('ul', { class: 'promise', role: 'list' },
        h('li', {}, '무료'),
        h('li', {}, '순서 강요 없음'),
        h('li', {}, '학위·학점·자격 없음'),
        h('li', {}, '진도는 이 기기에만 저장'))),
    h('div', { class: 'search-row' }, search,
      h('p', { class: 'input-note' }, '학과 이름뿐 아니라 배우고 싶은 주제나 개념어를 두 글자 이상 입력하면 교시 본문까지 함께 찾습니다. 계열과 학과는 모두 가나다순입니다.')),
    listWrap,
    lessonResultsWrap,
  );
}

function deptCard(d, progress) {
  const dp = deptProgress(progress, d.id);
  const done = Object.keys(dp.lessons).length;
  const status = d.status === 'open' ? '열림' : '준비 중';
  return h('a', { class: `dept-card ${d.status}`, href: `#/d/${d.id}` },
    h('span', { class: 'dept-name' }, d.name),
    h('span', { class: 'dept-status' },
      h('span', { class: 'dot', 'aria-hidden': 'true' }), status,
      done ? h('span', { class: 'dept-done' }, ` · ${done}교시 마침`) : null));
}
