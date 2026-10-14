import { h, fill } from '../dom.js';
import { byName, loadDepartment } from '../data.js';
import { deptProgress, summary } from '../engine/progress.js';
import { exportProgress, importProgress, resetProgress } from '../store.js';

export async function renderProgress(root, { catalog, progress, rerender }) {
  const started = catalog.filter((d) => Object.keys(deptProgress(progress, d.id).lessons).length > 0).sort(byName);
  const rows = await Promise.all(started.map(async (meta) => {
    const { dept } = await loadDepartment(meta.id);
    if (!dept) return null;
    const s = summary(dept, deptProgress(progress, meta.id));
    const pct = Math.round((s.done / s.total) * 100);
    return h('li', { class: 'progress-row' },
      h('a', { href: `#/d/${meta.id}` }, meta.name),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(s.total), 'aria-valuenow': String(s.done), 'aria-label': `${meta.name} 진도` },
        h('span', { style: `width:${pct}%` })),
      h('span', { class: 'meta-line' }, `${s.done}/${s.total}`, s.self ? ` · 자기 확인 ${s.self}` : '', s.trunkDone ? ' · 공통 줄기 끝' : ''));
  }));

  const status = h('p', { class: 'feedback', role: 'status' });
  const fileInput = h('input', { type: 'file', accept: 'application/json', class: 'sr-only', id: 'import-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const ok = importProgress(await file.text());
    status.textContent = ok ? '진도를 가져왔습니다.' : '진도 파일 형식이 아닙니다.';
    if (ok) rerender();
  });

  fill(root,
    h('nav', { class: 'crumbs', 'aria-label': '위치' }, h('a', { href: '#/' }, '학과 선택'), ' › 내 진도'),
    h('h1', { tabindex: '-1' }, '내 진도'),
    h('p', { class: 'lede' }, '학과마다 진도가 따로 남습니다. 자동 채점으로 통과한 것과 자기 확인으로 통과한 것을 구분해 보여 줍니다.'),
    h('section', { class: 'panel' },
      rows.filter(Boolean).length
        ? h('ul', { class: 'progress-list', role: 'list' }, rows.filter(Boolean))
        : h('p', { class: 'empty' }, '아직 시작한 학과가 없습니다. ', h('a', { href: '#/' }, '학과 고르기'))),
    h('section', { class: 'panel' },
      h('h2', {}, '진도 옮기기'),
      h('p', { class: 'input-note' }, '진도는 이 브라우저에만 저장됩니다. 다른 기기로 옮기려면 파일로 내보낸 뒤 가져오세요. 서버로는 아무것도 보내지 않습니다.'),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => download() }, '파일로 내보내기'),
        h('label', { class: 'btn', for: 'import-file' }, '파일에서 가져오기'),
        fileInput,
        h('button', { type: 'button', class: 'btn danger', onclick: () => {
          if (confirm('모든 학과의 진도와 제출한 글을 이 기기에서 지울까요? 되돌릴 수 없습니다.')) { resetProgress(); rerender(); }
        } }, '진도 지우기')),
      status),
  );
}

function download() {
  const blob = new Blob([exportProgress()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'free-university-progress.json' });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
