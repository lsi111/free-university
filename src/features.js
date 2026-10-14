// 교시가 features로 요구할 때만 불러오는 화면 기능.
// 수식 렌더러는 formula를 선언한 교시에서만 불러온다. 선언하지 않은 교시는 이 코드를 실행하지 않는다.
// 음성 발음(speech:*)과 음높이 재생(tone)은 브라우저 내장 기능만 쓰며 외부 요청이 없다.

import { h } from './dom.js';

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

function speakText(text, lang) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.92;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const prefix = lang.split('-')[0].toLowerCase();
    const matched = voices.find((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(lang.toLowerCase()))
      || voices.find((v) => v.lang?.toLowerCase().startsWith(prefix));
    if (matched) utter.voice = matched;
    window.speechSynthesis.speak(utter);
  } catch {
    // 음성 합성을 지원하지 않는 환경에서는 무시
  }
}

function extractSpeakable(raw, mode) {
  const s = String(raw || '').trim();
  if (!s || s.length > 90) return null;
  if (mode === 'latin') {
    const cleaned = s.replace(/^[~…\s-]+|[~…\s-]+$/g, '');
    if (cleaned.length < 2) return null;
    if (!/^[A-Za-zÄÖÜäöüßÉÈÊËéèêëÀÂàâÇçÎÏîïÔôÙÛÜùûüŸÿŒœÆæ'’\s,.?!0-9-]+$/.test(cleaned)) return null;
    if (!/[A-Za-zÄÖÜäöüßÉÈÊËéèêëÀÂàâÇçÎÏîïÔôÙÛÜùûüŸÿŒœÆæ]/.test(cleaned)) return null;
    if (/^(SVO|SOV|VSO)$/i.test(cleaned)) return null;
    return cleaned;
  }
  if (mode === 'ja') {
    if (!/[\u3040-\u30ff]/.test(s)) return null;
    const m = /^([\u3040-\u30ff\u4e00-\u9fff\s、。！？ー〜~]+)/.exec(s);
    const out = (m ? m[1] : s).replace(/[〜~]/g, '').trim();
    return out.length >= 1 ? out : null;
  }
  if (mode === 'zh') {
    const m = /([\u4e00-\u9fff]{1,20}[，。！？]?)/.exec(s);
    return m ? m[1] : null;
  }
  return null;
}

function attachSpeech(root, lang, mode) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const proseList = root.querySelectorAll('.prose');
  let count = 0;
  for (const prose of proseList) {
    for (const el of prose.querySelectorAll('em, strong')) {
      if (el.dataset.speechAttached) continue;
      const target = extractSpeakable(el.textContent, mode);
      if (!target) continue;
      el.dataset.speechAttached = '1';
      const btn = h('button', {
        type: 'button',
        class: 'speak-btn',
        title: `"${target}" 발음 듣기 (브라우저 내장 음성)`,
        'aria-label': `${target} 발음 듣기`,
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          speakText(target, lang);
        },
      }, '🔊');
      el.after(btn);
      count++;
    }
  }
  if (count > 0 && !root.querySelector('.speech-note')) {
    const firstPart = root.querySelector('.lesson-part .prose');
    if (firstPart) {
      firstPart.before(h('p', { class: 'input-note speech-note' },
        '🔊 표시를 누르면 브라우저 내장 음성으로 낱말·문장 발음을 들어 볼 수 있습니다(외부 전송 없음, 기기마다 음성이 다를 수 있음).'));
    }
  }
}

let audioCtx = null;
function playFrequencies(freqs, { wave = 'sine', duration = 0.55 } = {}) {
  if (typeof window === 'undefined') return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const perGain = 0.18 / Math.max(1, Math.sqrt(freqs.length));
    for (const f of freqs) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(perGain, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }
  } catch {
    // 오디오 컨텍스트 제한 시 무시
  }
}

const NOTES = [
  ['도 (C4)', 261.63],
  ['레 (D4)', 293.66],
  ['미 (E4)', 329.63],
  ['파 (F4)', 349.23],
  ['솔 (G4)', 392.00],
  ['라 (A4·440Hz)', 440.00],
  ['시 (B4)', 493.88],
  ['높은 도 (C5)', 523.25],
];

const CHORDS = [
  ['으뜸화음 (도-미-솔)', [261.63, 329.63, 392.00]],
  ['버금딸림화음 (파-라-도)', [349.23, 440.00, 523.25]],
  ['딸림화음 (솔-시-레)', [392.00, 493.88, 587.33]],
  ['단3화음 (라-도-미)', [220.00, 261.63, 329.63]],
];

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
  async 'speech:de'(root) { attachSpeech(root, 'de-DE', 'latin'); },
  async 'speech:ja'(root) { attachSpeech(root, 'ja-JP', 'ja'); },
  async 'speech:zh'(root) { attachSpeech(root, 'zh-CN', 'zh'); },
  async 'speech:fr'(root) { attachSpeech(root, 'fr-FR', 'latin'); },
  async 'speech:en'(root) { attachSpeech(root, 'en-US', 'latin'); },
  async tone(root) {
    if (typeof window === 'undefined' || root.querySelector('.tone-box')) return;
    const firstPart = root.querySelector('.lesson-part');
    if (!firstPart) return;
    let currentWave = 'sine';
    const waveSelect = h('select', {
      class: 'select tone-wave',
      'aria-label': '파형(음색) 고르기',
      onchange: (e) => { currentWave = e.target.value; },
    },
      h('option', { value: 'sine' }, '부드러운 곡선 파형 (사인파)'),
      h('option', { value: 'triangle' }, '뾰족한 삼각형 파형 (삼각파)'),
    );
    const box = h('div', { class: 'example tone-box', role: 'region', 'aria-label': '음높이와 화음 직접 들어 보기' },
      h('div', { class: 'panel-head' },
        h('h3', {}, '소리로 직접 확인하기 (브라우저 합성음)'),
        waveSelect),
      h('p', { class: 'input-note' }, '외부 음원 없이 브라우저가 계산한 진동수(Hz)로 소리를 냅니다. 기기 음량을 확인하세요.'),
      h('div', { class: 'btn-row' },
        NOTES.map(([label, freq]) => h('button', {
          type: 'button',
          class: 'btn tone-btn',
          onclick: () => playFrequencies([freq], { wave: currentWave, duration: 0.5 }),
        }, `♪ ${label}`))),
      h('div', { class: 'btn-row' },
        CHORDS.map(([label, freqs]) => h('button', {
          type: 'button',
          class: 'btn tone-btn',
          onclick: () => playFrequencies(freqs, { wave: currentWave, duration: 0.75 }),
        }, `♫ ${label}`))),
    );
    firstPart.append(box);
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
