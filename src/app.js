import { loadCatalog, loadDepartment, loadAllDepartments, loadReviews, loadSite } from './data.js';
import { loadProgress, saveProgress, loadTheme, saveTheme, applyTheme } from './store.js';
import { renderHome } from './views/home.js';
import { renderDepartment, errorPanel } from './views/department.js';
import { renderLesson } from './views/lesson.js';
import { renderProgress } from './views/progress.js';
import { h } from './dom.js';
import { LANGS, getLang, initI18n, setLang, t } from './i18n.js';

const main = document.getElementById('main');

const themeLabel = (k) => ({ auto: t('테마: 자동'), light: t('테마: 밝게'), dark: t('테마: 어둡게') })[k];
const THEME_ORDER = ['auto', 'light', 'dark'];

function setupThemeToggle() {
  const current = loadTheme();
  applyTheme(current);
  const nav = document.querySelector('.site-header nav');
  if (!nav || nav.querySelector('.theme-btn')) return;
  const btn = h('button', {
    type: 'button',
    class: 'theme-btn',
    'aria-label': '화면 밝기 테마 전환',
    onclick: () => {
      const next = THEME_ORDER[(THEME_ORDER.indexOf(loadTheme()) + 1) % THEME_ORDER.length];
      saveTheme(next);
      btn.textContent = themeLabel(next);
    },
  }, themeLabel(current));
  nav.append(btn);
}

function setupLangSwitch() {
  const nav = document.querySelector('.site-header nav');
  if (!nav || nav.querySelector('.lang-select')) return;
  const sel = h('select', {
    class: 'lang-select',
    'aria-label': 'Language / 언어',
    onchange: () => { setLang(sel.value); location.reload(); },
  }, ...Object.entries(LANGS).map(([code, name]) => h('option', { value: code }, name)));
  sel.value = getLang();
  nav.append(sel);
}

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
    renderHome(view, { fields, catalog, progress, loadAllDepartments });
  } else if (route.name === 'progress') {
    await renderProgress(view, { catalog, progress, rerender: render });
  } else {
    const loaded = await loadDepartment(route.dept);
    if (!loaded) {
      view.replaceChildren(h('h1', { tabindex: '-1' }, '없는 학과입니다'), h('p', {}, h('a', { href: '#/' }, '학과 선택으로')));
    } else if (route.name === 'dept' || !loaded.dept) {
      renderDepartment(view, { ...loaded, fields, catalog, progress, reviews });
    } else {
      renderLesson(view, {
        ...loaded,
        catalog,
        lessonId: route.lesson,
        getProgress: loadProgress,
        setProgress: saveProgress,
        loadAllDepartments,
        reviews,
        site,
      });
    }
  }

  document.title = `${main.querySelector('h1')?.textContent || ''} · Free University`;
  window.scrollTo(0, 0);
  main.querySelector('h1')?.focus({ preventScroll: true });
}

{
  // ?lang=en 처럼 주소로 언어를 고르면 그 선택을 저장하고 주소에서는 뗀다.
  const q = new URLSearchParams(location.search).get('lang');
  if (q && LANGS[q]) { setLang(q); history.replaceState(null, '', location.pathname + location.hash); }
}
await initI18n();
setupThemeToggle();
setupLangSwitch();
window.addEventListener('hashchange', render);
render().catch((err) => {
  main.replaceChildren(h('section', { class: 'panel error' }, h('h1', {}, '불러오지 못했습니다'), h('p', {}, String(err.message || err)),
    h('p', { class: 'input-note' }, 'index.html을 파일로 직접 열면 콘텐츠를 읽을 수 없습니다. 로컬 서버로 여세요 (README 참고).')));
});
