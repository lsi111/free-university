// 교시 본문용 최소 마크다운. 지원: 문단, 줄바꿈, - 목록, 1. 목록, ### 제목, > 인용, **굵게**, *기울임*, `코드`.
// math 옵션이 켜진 교시에서만 $...$ / $$...$$ 를 수식 자리로 바꾼다. 실제 렌더링은 features.js가 한다.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function protectMath(src, slots) {
  return src
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      slots.push(`<span class="math math-display" data-tex="${escapeHtml(tex.trim())}">${escapeHtml(tex.trim())}</span>`);
      return `\u0000${slots.length - 1}\u0000`;
    })
    .replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      slots.push(`<span class="math" data-tex="${escapeHtml(tex)}">${escapeHtml(tex)}</span>`);
      return `\u0000${slots.length - 1}\u0000`;
    });
}

function restore(html, slots) {
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

function inlineFormat(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/** 한 줄짜리 문장(선택지, 문항 지문 등) */
export function inline(src, { math = false } = {}) {
  const slots = [];
  const text = math ? protectMath(String(src), slots) : String(src);
  return restore(inlineFormat(escapeHtml(text)), slots);
}

/** 블록 하나. 블록 안에서 문단 줄과 목록 줄이 섞여도 된다. */
export function block(src, { math = false } = {}) {
  const slots = [];
  const text = math ? protectMath(String(src), slots) : String(src);
  const lines = text.split('\n');
  const out = [];
  let para = [];
  let list = null; // { tag, items }

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((l) => inlineFormat(escapeHtml(l))).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inlineFormat(escapeHtml(i))}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    const ul = /^\s*[-•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((ul || ol)[1]);
      continue;
    }
    flushList();
    if (/^###\s+/.test(line)) { flushPara(); out.push(`<h3>${inlineFormat(escapeHtml(line.replace(/^###\s+/, '')))}</h3>`); continue; }
    if (/^>\s?/.test(line)) { flushPara(); out.push(`<blockquote>${inlineFormat(escapeHtml(line.replace(/^>\s?/, '')))}</blockquote>`); continue; }
    if (line.trim() === '') { flushPara(); continue; }
    para.push(line);
  }
  flushPara();
  flushList();
  return restore(out.join(''), slots);
}

/** 그림 블록: { figure: "경로(content/ 기준)", alt: "대체 텍스트", caption?: "설명" } */
export function figure(f, opts) {
  const cap = f.caption ? `<figcaption>${inline(f.caption, opts)}</figcaption>` : '';
  return `<figure class="figure"><img src="content/${escapeHtml(f.figure)}" alt="${escapeHtml(f.alt || '')}">${cap}</figure>`;
}

export function blocks(arr, opts) {
  return (arr || []).map((b) => (typeof b === 'string' ? block(b, opts) : figure(b, opts))).join('');
}
