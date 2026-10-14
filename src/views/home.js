// 입구: 학과 선택. 학과를 고르기 전에는 어떤 학과의 내용도 보이지 않는다(이름과 상태만).

import { h, fill } from '../dom.js';
import { groupByField } from '../data.js';
import { deptProgress } from '../engine/progress.js';

export function renderHome(root, { fields, catalog, progress, query = '' }) {
  const groups = groupByField(fields, catalog);
  const search = h('input', {
    type: 'search', class: 'text-input search', placeholder: '학과 이름으로 찾기',
    'aria-label': '학과 이름으로 찾기', value: query,
  });
  const listWrap = h('div', { class: 'fields' });

  const draw = () => {
    const q = search.value.trim();
    const sections = groups.map(({ field, departments }) => {
      const shown = q ? departments.filter((d) => d.name.includes(q)) : departments;
      if (q && shown.length === 0) return null;
      return h('details', { class: 'field', open: true },
        h('summary', {},
          h('span', { class: 'field-name' }, field.name),
          h('span', { class: 'field-meta' }, `${departments.length}칸 · ${field.note || ''}`)),
        h('ul', { class: 'dept-grid', role: 'list' }, shown.map((d) => h('li', {}, deptCard(d, progress)))));
    }).filter(Boolean);
    listWrap.replaceChildren(...(sections.length ? sections : [h('p', { class: 'empty' }, `"${q}"에 맞는 학과 칸이 없습니다.`)]));
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
      h('p', { class: 'input-note' }, '계열은 찾기 위한 묶음입니다. 서열이 아니며, 계열과 학과 모두 가나다순입니다.')),
    listWrap,
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
