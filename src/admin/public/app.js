/* global Telegram */

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU');
}

function goalLabel(goal) {
  if (goal === 'lose_weight') return 'Похудеть';
  if (goal === 'gain_weight') return 'Набрать вес';
  if (goal === 'keep_fit') return 'Поддерживать';
  return '';
}

function lifestyleLabel(l) {
  if (l === 'sedentary') return 'Сидячий';
  if (l === 'moderate') return 'Умеренный';
  if (l === 'active') return 'Активный';
  return '';
}

async function fetchUsers({ hasQuestionnaire, initData }) {
  const qs = new URLSearchParams();
  if (hasQuestionnaire && hasQuestionnaire !== 'any') qs.set('hasQuestionnaire', hasQuestionnaire);
  const sort = document.getElementById('sort')?.value || 'questionnaireDate';
  const order = document.getElementById('order')?.value || 'desc';
  qs.set('sort', sort);
  qs.set('order', order);

  const headers = {};
  if (initData) headers['x-telegram-init-data'] = initData;

  const res = await fetch(`/api/admin/users?${qs.toString()}`, {
    headers,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    const err = json?.error || `http_${res.status}`;
    throw new Error(err);
  }
  return json.users || [];
}

function render(users) {
  const state = document.getElementById('state');
  const table = document.getElementById('table');
  const tbody = document.getElementById('tbody');

  tbody.innerHTML = '';

  if (!users.length) {
    table.style.display = 'none';
    state.style.display = 'block';
    state.textContent = 'Пользователей нет по выбранному фильтру.';
    return;
  }

  state.style.display = 'none';
  table.style.display = 'table';

  for (const u of users) {
    const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
    const tg = `@${u.username}`.replace('@null', '').replace('@undefined', '');
    const qBadge = u.hasQuestionnaire
      ? `<span class="badge ok">✅ Заполнена</span>`
      : `<span class="badge no">❌ Не заполнена</span>`;

    const qDate = u.questionnaireSortDate ? fmtDate(u.questionnaireSortDate) : '';

    const qShort = u.questionnaire
      ? `<div class="small">
          <div><b>${esc(goalLabel(u.questionnaire.goal) || 'Цель: —')}</b></div>
          <div class="muted">Возраст: ${esc(u.questionnaire.age ?? '—')}, Пол: ${esc(
          u.questionnaire.gender ?? '—'
        )}</div>
          <div class="muted">Вес/рост: ${esc(u.questionnaire.weight ?? '—')} / ${esc(
          u.questionnaire.height ?? '—'
        )}</div>
          <div class="muted">Активность: ${esc(lifestyleLabel(u.questionnaire.lifestyle) || '—')}</div>
        </div>`
      : `<span class="muted">—</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div><b>${esc(fullName || '—')}</b></div>
        <div class="muted small mono">id: ${esc(u.id)} / tgId: ${esc(u.telegramId)}</div>
      </td>
      <td>
        <div>${tg ? esc(tg) : '<span class="muted">—</span>'}</div>
      </td>
      <td>
        <div>${qBadge}</div>
        <div class="muted small">${qDate ? `Дата анкеты: ${esc(qDate)}` : ''}</div>
      </td>
      <td class="small">${esc(fmtDate(u.createdAt))}</td>
      <td>${qShort}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function main() {
  const filter = document.getElementById('filter');
  const sort = document.getElementById('sort');
  const order = document.getElementById('order');
  const reload = document.getElementById('reload');
  const state = document.getElementById('state');

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor?.('#0b0f14');
      tg.setBackgroundColor?.('#0b0f14');
    } catch (e) {
      // ignore
    }
  }

  const initData = tg?.initData || '';
  if (!initData) state.textContent = 'Dev-режим: initData отсутствует (если включен ADMIN_DEV_BYPASS).';

  async function load() {
    state.style.display = 'block';
    state.textContent = 'Загрузка…';
    document.getElementById('table').style.display = 'none';

    try {
      const users = await fetchUsers({ hasQuestionnaire: filter.value, initData });
      render(users);
    } catch (e) {
      state.style.display = 'block';
      state.textContent =
        e?.message === 'forbidden'
          ? 'Доступ запрещён (вы не админ).'
          : e?.message === 'bad_hash'
            ? 'Ошибка подписи initData (проверьте BOT_TOKEN).'
            : `Ошибка загрузки: ${e?.message || 'unknown'}`;
    }
  }

  filter.addEventListener('change', load);
  sort?.addEventListener('change', load);
  order?.addEventListener('change', load);
  reload.addEventListener('click', load);

  await load();
}

main();

