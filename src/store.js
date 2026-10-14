// 진도 및 화면 설정 저장. 이 기기의 브라우저 저장소만 쓴다. 저장소를 못 쓰는 환경에서는 메모리에만 둔다.

import { emptyProgress, parseImported } from './engine/progress.js';

const KEY = 'free-university.progress.v1';
const THEME_KEY = 'free-university.theme.v1';
let memory = null;
let memoryTheme = 'auto';

export function loadProgress() {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = (raw && parseImported(raw)) || emptyProgress();
  } catch {
    memory = emptyProgress();
  }
  return memory;
}

export function saveProgress(progress) {
  memory = progress;
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function exportProgress() {
  return JSON.stringify(loadProgress(), null, 2);
}

export function importProgress(text) {
  const data = parseImported(text);
  if (!data) return false;
  saveProgress(data);
  return true;
}

export function resetProgress() {
  memory = emptyProgress();
  try { localStorage.removeItem(KEY); } catch { /* 저장소 없음 */ }
}

export function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'auto') memoryTheme = raw;
  } catch { /* 저장소 없음 */ }
  return memoryTheme;
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function saveTheme(theme) {
  memoryTheme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* 저장소 없음 */ }
  applyTheme(theme);
}
