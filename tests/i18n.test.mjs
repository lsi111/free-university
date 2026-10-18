import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { t, useDict } from '../src/i18n.js';
import { foldText } from '../src/engine/text.js';
import { filterDepartments, searchLessons } from '../src/engine/search.js';
import { extractConcepts, findLessonConnections } from '../src/engine/connections.js';
import { grade } from '../src/engine/checks.js';
import { collectKeys, diffDictionary } from '../tools/i18n-keys.mjs';

const inLang = async (lang, dict, fn) => {
  useDict(lang, dict);
  try { await fn(); } finally { useDict('ko', {}); }
};

test('t(): 한국어 원문이 키이고 자리표시자를 채운다', () => {
  assert.equal(t('{n}교시', { n: 3 }), '3교시');
  useDict('en', { '{n}교시': 'Lesson {n}' });
  assert.equal(t('{n}교시', { n: 3 }), 'Lesson 3');
  assert.equal(t('사전에 없는 문장'), '사전에 없는 문장');
  useDict('ko', {});
});

test('접기: 대소문자·악센트는 무시하고 한글과 길이는 그대로', () => {
  assert.equal(foldText('Café Ñandú'), 'cafe nandu');
  assert.equal(foldText('기회비용 ABC'), '기회비용 abc');
  assert.equal(foldText('é').length, 1);
});

const catalog = [
  { id: 'e1', name: 'Economics', field: 'f1', status: 'open', summary: 'Choices and scarcity', audience: 'Beginners' },
  { id: 'e2', name: 'Física', field: 'f1', status: 'open', summary: 'Ondas y luz', audience: 'Principiantes' },
];
const lessonEn = {
  id: 'e1-01',
  title: 'Scarcity and Choice',
  explain: ['The value of the best alternative you give up is called the **Opportunity Cost** of a choice, a **trade-off** every person faces when resources are limited and wants are not.'],
  examples: [{ title: 'Example', body: ['A student picks between work and study.'] }],
  checks: [{ type: 'numeric', prompt: 'What is the opportunity cost?', answer: 10 }],
};
const lessonEs = {
  id: 'e2-01',
  title: 'Ondas y Energía',
  explain: ['Una **onda** transporta energía; la **Longitud de Onda** se mide entre crestas.'],
  examples: [{ title: 'Ejemplo', body: ['Una cuerda vibra.'] }],
  checks: [{ type: 'numeric', prompt: '¿Cuál es la frecuencia?', answer: 2 }],
};
const depts = new Map([
  ['e1', { trunk: ['e1-01'], lessons: [lessonEn] }],
  ['e2', { trunk: ['e2-01'], lessons: [lessonEs] }],
]);

test('영어 검색: 대소문자 무시, 여러 낱말, 낱말 중간에서 자르지 않는 미리보기', () => {
  return inLang('en', {}, () => {
    assert.equal(filterDepartments(catalog, [], 'SCARCITY').length, 1);
    assert.equal(filterDepartments(catalog, [], 'choices scarcity')[0].id, 'e1');
    const hits = searchLessons(catalog, depts, 'opportunity COST');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].lessonId, 'e1-01');
    assert.equal(hits[0].where, '설명'); // 사전이 비어 있으면 한국어 원문 그대로
    assert.ok(hits[0].snippet.toLowerCase().includes('opportunity cost'));
    // 낱말 중간에서 자르지 않는다: …로 시작하면 그 다음은 낱말의 첫 글자(앞이 공백이었던 자리)
    assert.ok(!/^…[a-z]/.test(hits[0].snippet) || /^…(?:\S+ )/.test(hits[0].snippet));
    // 단어 순서가 달라도 모든 낱말이 들어 있으면 일치
    assert.equal(searchLessons(catalog, depts, 'cost opportunity').length, 1);
    assert.equal(searchLessons(catalog, depts, 'opportunity galaxy').length, 0);
  });
});

test('스페인어 검색: 악센트를 무시한다', () => {
  return inLang('es', {}, () => {
    assert.equal(filterDepartments(catalog, [], 'fisica')[0].id, 'e2');
    const hits = searchLessons(catalog, depts, 'energia');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].lessonId, 'e2-01');
    assert.equal(searchLessons(catalog, depts, 'frecuencía')[0].lessonId, 'e2-01');
  });
});

test('영어·스페인어 개념 추출: 40자까지, 불용어 제외, 대소문자 합침', () => {
  return inLang('en', {}, () => {
    const l = { explain: ['**Key** and **Opportunity Cost** and **opportunity cost** and **a long compound term of physics**.'] };
    assert.deepEqual(extractConcepts(l), ['Opportunity Cost', 'a long compound term of physics']);
  });
});

test('한국어 개념 추출은 그대로: 15자 제한과 불용어', () => {
  const l = { explain: ['**핵심**과 **기회비용**, **열여섯글자를넘기는아주긴개념어입니다**'] };
  assert.deepEqual(extractConcepts(l), ['기회비용']);
});

test('영어 학과 간 연결: 악센트·대소문자가 달라도 같은 개념', () => {
  return inLang('es', {}, () => {
    const a = { id: 'a-1', title: 'A', explain: ['La **Longitud de Onda** importa.'] };
    const b = { id: 'b-1', title: 'B', explain: ['Mide la **longitud de onda** hoy.'] };
    const cat = [{ id: 'a', name: 'A', status: 'open' }, { id: 'b', name: 'B', status: 'open' }];
    const map = new Map([['a', { lessons: [a] }], ['b', { lessons: [b] }]]);
    const r = findLessonConnections({ deptId: 'a', lesson: a, catalog: cat, depts: map });
    assert.equal(r.length, 1);
    assert.equal(r[0].lessonId, 'b-1');
  });
});

test('채점 메시지는 사전을 거친다', () => {
  const check = { type: 'numeric', answer: 3 };
  assert.equal(grade(check, '').message, '값을 입력하세요.');
  useDict('en', { '값을 입력하세요.': 'Enter a value.' });
  assert.equal(grade(check, '').message, 'Enter a value.');
  useDict('ko', {});
});

test('화면 번역 사전 검사: 빠진 키와 자리표시자 불일치를 잡는다', () => {
  const keys = new Map([['{n}교시', ['x:1']], ['안녕', ['x:2']]]);
  assert.deepEqual(diffDictionary('en', keys, { '{n}교시': 'Lesson {n}', 안녕: 'Hello' }), []);
  assert.equal(diffDictionary('en', keys, { '{n}교시': 'Lesson {n}' }).length, 1);
  assert.equal(diffDictionary('en', keys, { '{n}교시': 'Lesson {x}', 안녕: 'Hello' }).length, 1);
  assert.equal(diffDictionary('en', keys, { '{n}교시': 'Lesson {n}', 안녕: 'Hello', 남는키: 'x' }).length, 1);
});

test('실제 사전 en·es에 화면의 모든 키가 있다', async () => {
  const { keys, problems } = await collectKeys();
  assert.deepEqual(problems, []);
  for (const lang of ['en', 'es']) {
    const dict = JSON.parse(await readFile(new URL(`../content/i18n/${lang}/ui.json`, import.meta.url), 'utf8'));
    assert.deepEqual(diffDictionary(lang, keys, dict), []);
  }
});
