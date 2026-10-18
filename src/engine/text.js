// 검색·개념 연결용 글자 접기. 대소문자와 악센트(é→e)를 무시하되 한글은 그대로 둔다.
// 글자 하나가 글자 하나로 바뀌므로(길이 보존) 접은 글에서 찾은 위치를 원문에 그대로 쓸 수 있다.

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;

function foldChar(ch) {
  if (ch.length !== 1 || HANGUL.test(ch)) return ch;
  const base = ch.normalize('NFD')[0].toLowerCase();
  return base.length === 1 ? base : ch;
}

export function foldText(s) {
  // NFC로 먼저 맞춰 두면 "e + 결합 악센트"도 한 글자(é)가 되어 길이가 같아진다.
  return Array.from(String(s || '').normalize('NFC'), foldChar).join('');
}
