// 교시가 features로 요구할 때만 불러오는 화면 기능.
// 수식 렌더러는 formula를 선언한 교시에서만 불러온다. 선언하지 않은 교시는 이 코드를 실행하지 않는다.

const KATEX_BASE = 'vendor/katex'; // 저장소 안의 KaTeX 0.16.9 (vendor/katex/README.txt)

let katexPromise = null;

function loadKatex() {
  if (katexPromise) return katexPromise;
  katexPromise = new Promise((resolve) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${KATEX_BASE}/katex.min.css`;
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = `${KATEX_BASE}/katex.min.js`;
    js.onload = () => resolve(window.katex || null);
    js.onerror = () => resolve(null); // 오프라인이면 TeX 원문을 그대로 보여 준다
    document.head.appendChild(js);
  });
  return katexPromise;
}

const LOADERS = {
  async formula(root) {
    const katex = await loadKatex();
    for (const el of root.querySelectorAll('.math[data-tex]')) {
      if (!katex) { el.classList.add('math-fallback'); continue; }
      try {
        katex.render(el.dataset.tex, el, {
          displayMode: el.classList.contains('math-display'),
          throwOnError: false,
        });
      } catch {
        el.classList.add('math-fallback');
      }
    }
  },
};

export const loadedFeatures = new Set();

export async function applyFeatures(features, root) {
  for (const f of features || []) {
    const loader = LOADERS[f];
    if (!loader) continue;
    loadedFeatures.add(f);
    await loader(root);
  }
}

export function knownFeatures() {
  return Object.keys(LOADERS);
}
