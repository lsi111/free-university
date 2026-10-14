import { loadCatalog, loadDepartment, loadReviews, loadSite } from './data.js';
import { loadProgress, saveProgress } from './store.js';
import { renderHome } from './views/home.js';
import { renderDepartment, errorPanel } from './views/department.js';
import { renderLesson } from './views/lesson.js';
import { renderProgress } from './views/progress.js';
import { h } from './dom.js';

const main = document.getElementById('main');

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'd' && parts[1] && parts[2] === 'l' && parts[3]) return { name: 'lesson', dept: parts[1], lesson: parts[3] };
  if (parts[0] === 'd' && parts[1]) return { name: 'dept', dept: parts[1] };
  if (parts[0] === 'progress') return { name: 'progress' };
  return { name: 'home' };
}

async function render() {
  const route = parseRoute();
  const { fields, catalog, errors } = await loadCatalog();
  const progress = loadProgress();
  const [reviews, site] = await Promise.all([loadReviews(), loadSite()]);
  main.replaceChildren();
  if (errors.length) main.append(errorPanel(errors));
  const view = h('div');
  main.append(view);

  if (route.name === 'home') {
    renderHome(view, { fields, catalog, progress });
  } else if (route.name === 'progress') {
    await renderProgress(view, { catalog, progress, rerender: render });
  } else {
    const loaded = await loadDepartment(route.dept);
    if (!loaded) {
      view.replaceChildren(h('h1', { tabindex: '-1' }, '없는 학과입니다'), h('p', {}, h('a', { href: '#/' }, '학과 선택으로')));
    } else if (route.name === 'dept' || !loaded.dept) {
      renderDepartment(view, { ...loaded, fields, progress, reviews });
    } else {
      renderLesson(view, { ...loaded, lessonId: route.lesson, getProgress: loadProgress, setProgress: saveProgress, reviews, site });
    }
  }

  document.title = `${main.querySelector('h1')?.textContent || ''} · Free University`;
  window.scrollTo(0, 0);
  main.querySelector('h1')?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', render);
render().catch((err) => {
  main.replaceChildren(h('section', { class: 'panel error' }, h('h1', {}, '불러오지 못했습니다'), h('p', {}, String(err.message || err)),
    h('p', { class: 'input-note' }, 'index.html을 파일로 직접 열면 콘텐츠를 읽을 수 없습니다. 로컬 서버로 여세요 (README 참고).')));
});
