// "틀린 곳 알리기" 패널과 검수 배지. 서버로 아무것도 보내지 않는다.

import { h } from '../dom.js';
import { reportKinds, reportTargets, buildReport, mailtoUrl } from '../engine/report.js';
import { reviewLabel, reviewState } from '../engine/review.js';
import { t } from '../i18n.js';

/** 교시 머리말의 검수 배지 */
export function reviewBadge(lesson, record) {
  const state = reviewState(lesson, record);
  const detail = record ? ` · ${record.reviewer} · ${record.date}` : '';
  return h('p', { class: `review-badge ${state}` },
    h('span', { class: 'review-dot', 'aria-hidden': 'true' }),
    `${reviewLabel(state)}${state === 'unreviewed' ? '' : detail}`,
    state === 'unreviewed' ? h('span', { class: 'review-hint' }, ` ${t('사람이 확인하기 전의 내용입니다. 틀린 곳이 있으면 알려 주세요.')}`) : null);
}

/** 신고 패널. open(where)로 위치를 고른 채 열 수 있다. */
export function reportPanel({ meta, lesson, site }) {
  const targets = reportTargets(lesson);
  const where = h('select', { class: 'select', id: 'report-where' }, targets.map((target) => h('option', { value: target }, target)));
  const kind = h('select', { class: 'select', id: 'report-kind' }, reportKinds().map((k) => h('option', { value: k }, k)));
  const text = h('textarea', { class: 'textarea', rows: '4', id: 'report-text', placeholder: t('어디가 어떻게 틀렸는지, 맞다고 생각하는 내용과 근거를 적어 주세요.') });
  const output = h('textarea', { class: 'textarea mono', rows: '7', readonly: true, 'aria-label': t('만들어진 신고문') });
  const status = h('p', { class: 'feedback', role: 'status' });
  const actions = h('div', { class: 'btn-row' });
  const result = h('div', { hidden: true }, output, actions, status);

  const make = h('button', { type: 'button', class: 'btn primary' }, t('신고문 만들기'));
  make.addEventListener('click', () => {
    if (!text.value.trim()) {
      status.className = 'feedback bad';
      status.textContent = t('내용을 적어 주세요.');
      result.hidden = false;
      output.value = '';
      actions.replaceChildren();
      text.focus();
      return;
    }
    const report = buildReport({ deptName: meta.name, deptId: meta.id, lesson, where: where.value, kind: kind.value, text: text.value });
    output.value = report;
    result.hidden = false;
    status.className = 'feedback';
    status.textContent = '';

    const copy = h('button', { type: 'button', class: 'btn' }, t('복사하기'));
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(report);
        status.className = 'feedback ok';
        status.textContent = t('복사했습니다.');
      } catch {
        output.select();
        status.className = 'feedback pending';
        status.textContent = t('자동 복사가 막혀 있습니다. 선택된 글을 직접 복사하세요.');
      }
    });
    const links = [copy];
    const mail = mailtoUrl(site, report, `[Free University] ${meta.name} · ${lesson.title}`);
    if (mail) links.push(h('a', { class: 'btn', href: mail }, t('메일로 보내기')));
    if (site?.reportUrl) links.push(h('a', { class: 'btn', href: site.reportUrl, target: '_blank', rel: 'noopener noreferrer' }, t('신고 페이지 열기')));
    actions.replaceChildren(...links);
    if (!mail && !site?.reportUrl) {
      status.className = 'feedback pending';
      status.textContent = t('신고를 받는 곳이 아직 정해지지 않았습니다. 신고문은 이 기기 밖으로 나가지 않았습니다. 복사해서 보관해 두세요.');
    }
  });

  const details = h('details', { class: 'report' },
    h('summary', {}, t('틀린 곳 알리기')),
    h('p', { class: 'input-note' }, t('신고문은 이 화면에서만 만들어지며 자동으로 어디에도 전송되지 않습니다.')),
    h('div', { class: 'report-grid' },
      h('label', { for: 'report-where' }, t('위치')), where,
      h('label', { for: 'report-kind' }, t('종류')), kind),
    h('label', { for: 'report-text', class: 'report-label' }, t('내용')),
    text,
    h('div', { class: 'btn-row' }, make),
    result);

  return {
    el: details,
    open(target) {
      details.open = true;
      if (targets.includes(target)) where.value = target;
      details.scrollIntoView({ block: 'center' });
      text.focus();
    },
  };
}
