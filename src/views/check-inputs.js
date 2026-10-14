// 문항 유형별 입력 화면. 채점은 하지 않고 응답만 읽는다(read). 채점은 engine/checks.js 하나가 한다.

import { h, seededShuffle } from '../dom.js';
import { inline } from '../md.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

const INPUTS = {
  numeric(check, { saved, onSubmit }) {
    const input = h('input', {
      type: 'text', inputmode: 'decimal', class: 'text-input', autocomplete: 'off', 'aria-label': '답',
      value: saved?.text || '',
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onSubmit?.(); }
    });
    return { el: h('div', { class: 'answer-row' }, input), read: () => input.value, focusable: input };
  },

  expression(check, { saved, onSubmit }) {
    const input = h('input', {
      type: 'text', class: 'text-input mono', autocomplete: 'off', spellcheck: 'false', 'aria-label': '식',
      value: saved?.text || '',
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onSubmit?.(); }
    });
    const note = h('p', { class: 'input-note' }, '쓸 수 있는 것: + - * / ^ ( ), 2x 같은 곱 생략, sin cos exp ln sqrt, pi');
    return { el: h('div', {}, h('div', { class: 'answer-row' }, input), note), read: () => input.value, focusable: input };
  },

  choice(check, { math }) {
    const multi = check.multiple || check.answer.length > 1;
    const name = nextId('choice');
    const boxes = check.options.map((opt, i) => {
      const input = h('input', { type: multi ? 'checkbox' : 'radio', name, value: String(i) });
      return { input, label: h('label', { class: 'option' }, input, h('span', { html: inline(opt, { math }) })) };
    });
    const el = h('fieldset', { class: 'options' },
      h('legend', { class: 'sr-only' }, '선택지'),
      multi ? h('p', { class: 'input-note' }, '해당하는 것을 모두 고르세요.') : null,
      boxes.map((b) => b.label));
    return { el, read: () => boxes.filter((b) => b.input.checked).map((b) => Number(b.input.value)), focusable: boxes[0].input };
  },

  match(check, { math, seed }) {
    const uniqueRights = [...new Set(check.pairs.map((p) => p[1]))];
    const rights = seededShuffle(uniqueRights, seed);
    const selects = check.pairs.map(([left]) => {
      const id = nextId('match');
      const select = h('select', { id, class: 'select' },
        h('option', { value: '' }, '고르세요'),
        rights.map((r) => h('option', { value: r }, r)));
      return { select, row: h('div', { class: 'match-row' }, h('label', { for: id, class: 'match-left', html: inline(left, { math }) }), select) };
    });
    return { el: h('div', { class: 'match' }, selects.map((s) => s.row)), read: () => selects.map((s) => s.select.value), focusable: selects[0].select };
  },

  order(check, { math, seed }) {
    let items = seededShuffle(check.items, seed);
    if (items.every((v, i) => v === check.items[i])) items = [...items.slice(1), items[0]];
    const list = h('ol', { class: 'order-list' });
    const draw = (focusIndex, dir) => {
      list.replaceChildren(...items.map((text, i) => {
        const up = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `"${text}" 위로`, disabled: i === 0, onclick: () => move(i, -1) }, '↑');
        const down = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `"${text}" 아래로`, disabled: i === items.length - 1, onclick: () => move(i, 1) }, '↓');
        return h('li', { class: 'order-item' }, h('span', { class: 'order-text', html: inline(text, { math }) }), h('span', { class: 'order-btns' }, up, down));
      }));
      if (focusIndex != null) {
        const btns = list.children[focusIndex]?.querySelectorAll('button');
        const target = btns && (dir < 0 ? btns[0] : btns[1]);
        (target && !target.disabled ? target : btns?.[dir < 0 ? 1 : 0])?.focus();
      }
    };
    const move = (i, d) => {
      const j = i + d;
      [items[i], items[j]] = [items[j], items[i]];
      draw(j, d);
    };
    draw();
    return { el: list, read: () => [...items], focusable: list };
  },

  keywords(check, { saved, onDraft }) {
    const ta = h('textarea', { class: 'textarea', rows: '5', 'aria-label': '서술 답안' });
    ta.value = saved?.text || '';
    const min = check.minLength ?? 30;
    const count = h('span', { class: 'input-note' });
    const updateCount = () => { count.textContent = `${ta.value.replace(/\s/g, '').length}자 (공백 제외, 최소 ${min}자)`; };
    updateCount();
    ta.addEventListener('input', () => {
      updateCount();
      onDraft?.({ text: ta.value });
    });
    return { el: h('div', {}, ta, count), read: () => ta.value, focusable: ta };
  },

  submit(check, { saved, onDraft }) {
    const ta = h('textarea', { class: 'textarea', rows: '8', 'aria-label': '제출 글' });
    ta.value = saved?.text || '';
    const count = h('span', { class: 'input-note' });
    const updateCount = () => { count.textContent = `${ta.value.replace(/\s/g, '').length}자 (공백 제외, 최소 ${check.minLength ?? 1}자)`; };
    updateCount();
    const boxes = check.checklist.map((item, i) => {
      const input = h('input', { type: 'checkbox' });
      input.checked = !!saved?.checked?.[i];
      return { input, label: h('label', { class: 'option' }, input, h('span', {}, item)) };
    });
    const read = () => ({ text: ta.value, checked: boxes.map((b) => b.input.checked) });
    ta.addEventListener('input', () => { updateCount(); onDraft?.(read()); });
    boxes.forEach((b) => b.input.addEventListener('change', () => onDraft?.(read())));
    const el = h('div', {}, ta, count,
      h('fieldset', { class: 'options checklist' }, h('legend', {}, '자기 점검'), boxes.map((b) => b.label)));
    return { el, read, focusable: ta };
  },
};

export function renderInput(check, ctx) {
  const make = INPUTS[check.type];
  if (!make) return { el: h('p', { class: 'error' }, `이 화면이 모르는 문항 유형: ${check.type}`), read: () => null };
  return make(check, ctx);
}
