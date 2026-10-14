// 진도 저장. 이 기기의 브라우저 저장소만 쓴다. 저장소를 못 쓰는 환경에서는 메모리에만 둔다.

import { emptyProgress, parseImported } from './engine/progress.js';

const KEY = 'free-university.progress.v1';
let memory = null;

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
