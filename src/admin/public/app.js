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

function getInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function showAppErr(msg) {
  const el = document.getElementById('appErr');
  if (!el) return;
  if (!msg) {
    el.textContent = '';
    el.classList.remove('visible');
    return;
  }
  el.textContent = msg;
  el.classList.add('visible');
}

async function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers);
  const initData = getInitData();
  if (initData) headers.set('x-telegram-init-data', initData);
  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function mapTrainerErr(json, status) {
  if (json?.error === 'trainer_not_found') {
    return 'Этот раздел доступен только администраторам, у которых в базе есть запись тренера с тем же Telegram ID.';
  }
  if (json?.error === 'forbidden') return 'Доступ запрещён (вы не в списке администраторов).';
  if (json?.error === 'bad_hash') return 'Ошибка подписи Telegram (проверьте BOT_TOKEN).';
  if (json?.error === 'missing_init_data') return 'Откройте приложение через Telegram WebApp.';
  return json?.error || `Ошибка ${status}`;
}

function isClientMissed(c) {
  const now = Date.now();
  if (!c.lastActivityAt) return true;
  const t = new Date(c.lastActivityAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t >= 1000 * 60 * 60 * 24 * 2;
}

function clientsQueryString() {
  const qs = new URLSearchParams();
  const filter = document.getElementById('filter');
  if (filter?.value && filter.value !== 'any') qs.set('hasQuestionnaire', filter.value);
  const sortEl = document.getElementById('sort');
  const orderEl = document.getElementById('order');
  qs.set('sort', sortEl?.value === 'questionnaireDate' ? 'questionnaireDate' : 'activity');
  qs.set('order', orderEl?.value === 'asc' ? 'asc' : 'desc');
  return qs.toString();
}

function renderClientsList(clients) {
  const state = document.getElementById('clientsState');
  const table = document.getElementById('clientsTable');
  const tbody = document.getElementById('clientsTbody');
  tbody.innerHTML = '';

  if (!clients.length) {
    table.style.display = 'none';
    state.style.display = 'block';
    state.textContent = 'Клиентов пока нет (или нет по выбранному фильтру).';
    return;
  }

  state.style.display = 'none';
  table.style.display = 'table';

  for (const c of clients) {
    const missed = isClientMissed(c);
    const tr = document.createElement('tr');
    tr.className = `row-click${missed ? ' row-missed' : ''}`;
    tr.dataset.clientId = String(c.id);
    const photo =
      c.photoUrl ?
        `<img class="avatar" src="${esc(c.photoUrl)}" alt="" />`
      : '<span class="avatar-ph"></span>';
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
    const tg = `@${c.username}`.replace('@null', '').replace('@undefined', '');
    const qBadge = c.hasQuestionnaire
      ? `<span class="badge ok">✅ Заполнена</span>`
      : `<span class="badge no">❌ Не заполнена</span>`;
    const qDate = c.questionnaireSortDate ? fmtDate(c.questionnaireSortDate) : '';
    const qShort = c.questionnaire
      ? `<div class="small">
          <div><b>${esc(goalLabel(c.questionnaire.goal) || 'Цель: —')}</b></div>
          <div class="muted">Возраст: ${esc(c.questionnaire.age ?? '—')}, Пол: ${esc(c.questionnaire.gender ?? '—')}</div>
          <div class="muted">Вес/рост: ${esc(c.questionnaire.weight ?? '—')} / ${esc(c.questionnaire.height ?? '—')}</div>
          <div class="muted">Активность: ${esc(lifestyleLabel(c.questionnaire.lifestyle) || '—')}</div>
        </div>`
      : `<span class="muted">—</span>`;

    tr.innerHTML = `
      <td>${photo}</td>
      <td>
        <div><b>${esc(name)}</b></div>
        <div class="muted small mono">id: ${esc(c.id)} · tg: ${esc(c.telegramId)}</div>
      </td>
      <td>${tg ? esc(tg) : '<span class="muted">—</span>'}</td>
      <td>
        <div>${qBadge}</div>
        <div class="muted small">${qDate ? `Дата: ${esc(qDate)}` : ''}</div>
      </td>
      <td class="small">${esc(fmtDate(c.createdAt))}</td>
      <td>${qShort}</td>
      <td>
        <div>${esc(fmtDate(c.lastActivityAt) || '—')}</div>
        <div style="margin-top:4px"><span class="badge ${missed ? 'no' : 'ok'}">${missed ? 'пропал(а)' : 'активен'}</span></div>
      </td>
      <td>${c.adherence7d === null || c.adherence7d === undefined ? '<span class="muted">—</span>' : esc(c.adherence7d)}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function loadClients() {
  showAppErr('');
  const state = document.getElementById('clientsState');
  const table = document.getElementById('clientsTable');
  state.style.display = 'block';
  state.textContent = 'Загрузка…';
  table.style.display = 'none';
  document.getElementById('clientsTbody').innerHTML = '';

  const q = clientsQueryString();
  const { res, json } = await apiFetch(`/api/trainer/clients${q ? `?${q}` : ''}`);
  if (!res.ok || !json.ok) {
    state.textContent = mapTrainerErr(json, res.status);
    showAppErr(state.textContent);
    return;
  }
  renderClientsList(json.clients || []);
}

function openClientDetail(id) {
  showView('clientDetail');
  const state = document.getElementById('clientDetailState');
  const body = document.getElementById('clientDetailBody');
  state.classList.remove('hidden');
  state.textContent = 'Загрузка…';
  body.classList.add('hidden');
  body.innerHTML = '';

  apiFetch(`/api/trainer/client/${id}`)
    .then(({ res, json }) => {
      if (!res.ok || !json.ok) {
        state.textContent = mapTrainerErr(json, res.status);
        return;
      }
      const c = json.client;
      state.classList.add('hidden');
      body.classList.remove('hidden');
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
      const uname = c.username ? String(c.username).replace(/^@/, '') : '';
      body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:16px">${esc(name)}</div>
            <div class="muted small">Активность: ${esc(fmtDate(c.lastActivityAt) || '—')}</div>
          </div>
          <button type="button" class="open-tg" data-uname="${esc(uname)}" data-tgid="${esc(c.telegramId)}">Написать в Telegram</button>
        </div>
        <div class="grid-2">
          <div class="sub-panel">
            <h3>Анкета</h3>
            <pre class="json-pre">${esc(JSON.stringify(c.questionnaire ?? null, null, 2))}</pre>
          </div>
          <div class="sub-panel">
            <h3>Текущие показатели</h3>
            <div>Вес: ${esc(c.current?.weight ?? '—')}</div>
            <div>Калории: ${esc(c.current?.calories ?? '—')}</div>
          </div>
        </div>
      `;
      body.querySelector('.open-tg')?.addEventListener('click', (ev) => {
        const u = ev.currentTarget.getAttribute('data-uname');
        const tid = ev.currentTarget.getAttribute('data-tgid');
        if (u) window.open(`https://t.me/${encodeURIComponent(u)}`, '_blank');
        else window.open(`tg://user?id=${encodeURIComponent(tid)}`, '_blank');
      });
    })
    .catch(() => {
      state.textContent = 'Ошибка сети';
    });
}

async function trainerInvitePost() {
  return apiFetch('/api/trainer/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

async function loadSettings() {
  showAppErr('');
  const state = document.getElementById('settingsState');
  const row = document.getElementById('settingsRow');
  state.classList.remove('hidden');
  row.classList.add('hidden');
  state.textContent = 'Загрузка…';

  const { res, json } = await apiFetch('/api/trainer/settings');
  if (!res.ok || !json.ok) {
    state.textContent = mapTrainerErr(json, res.status);
    showAppErr(state.textContent);
    return;
  }
  state.classList.add('hidden');
  row.classList.remove('hidden');
  const cb = document.getElementById('notifyMissed');
  cb.checked = !!json.settings?.notifyOnMissedDays;
}

function wireSettingsCheckbox() {
  const cb = document.getElementById('notifyMissed');
  cb?.addEventListener('change', async () => {
    const v = cb.checked;
    const { res, json } = await apiFetch('/api/trainer/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifyOnMissedDays: v }),
    });
    if (!res.ok || !json.ok) {
      showAppErr(mapTrainerErr(json, res.status));
      const reload = await apiFetch('/api/trainer/settings');
      if (reload.res.ok && reload.json.ok) cb.checked = !!reload.json.settings?.notifyOnMissedDays;
      return;
    }
    showAppErr('');
  });
}

function setNavActive(view) {
  document.querySelectorAll('#mainNav .nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

function showView(name) {
  const map = {
    clients: 'viewClients',
    invite: 'viewInvite',
    settings: 'viewSettings',
    clientDetail: 'viewClientDetail',
  };
  Object.values(map).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const showId = map[name];
  if (showId) document.getElementById(showId)?.classList.remove('hidden');

  if (name === 'clientDetail') setNavActive('');
  else setNavActive(name);
}

async function main() {
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

  const initData = getInitData();
  const clientsState = document.getElementById('clientsState');

  document.querySelectorAll('#mainNav .nav-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.view;
      showView(v);
      if (v === 'clients') await loadClients();
      if (v === 'settings') await loadSettings();
    });
  });

  document.getElementById('clientsTbody')?.addEventListener('click', (e) => {
    const tr = e.target.closest?.('tr[data-client-id]');
    if (!tr) return;
    const id = Number(tr.dataset.clientId);
    if (Number.isFinite(id)) openClientDetail(id);
  });

  document.getElementById('clientDetailBack')?.addEventListener('click', () => {
    showView('clients');
    loadClients();
  });

  const filter = document.getElementById('filter');
  const sortEl = document.getElementById('sort');
  const orderEl = document.getElementById('order');
  const reload = document.getElementById('reload');

  const createInviteBtn = document.getElementById('createInvite');
  const inviteBlock = document.getElementById('inviteBlock');
  const inviteLinkEl = document.getElementById('inviteLink');
  const copyInviteBtn = document.getElementById('copyInvite');
  const inviteStatusEl = document.getElementById('inviteStatus');

  let lastInviteLink = '';

  createInviteBtn?.addEventListener('click', async () => {
    if (!inviteStatusEl) return;
    inviteStatusEl.textContent = '';
    inviteStatusEl.classList.remove('ok');
    createInviteBtn.disabled = true;
    try {
      const { res, json } = await trainerInvitePost();
      if (!res.ok || !json.ok) {
        throw new Error(mapTrainerErr(json, res.status));
      }
      lastInviteLink = json.invite?.link || '';
      if (!lastInviteLink) throw new Error('Пустая ссылка (проверьте BOT_USERNAME)');
      if (inviteLinkEl) inviteLinkEl.value = lastInviteLink;
      inviteBlock?.classList.add('visible');
    } catch (e) {
      inviteStatusEl.textContent = e?.message || 'Не удалось создать ссылку';
    } finally {
      createInviteBtn.disabled = false;
    }
  });

  copyInviteBtn?.addEventListener('click', async () => {
    if (!inviteLinkEl || !inviteStatusEl) return;
    if (!lastInviteLink && inviteLinkEl.value) lastInviteLink = inviteLinkEl.value;
    if (!lastInviteLink) return;
    try {
      await navigator.clipboard.writeText(lastInviteLink);
      inviteStatusEl.textContent = 'Скопировано';
      inviteStatusEl.classList.add('ok');
    } catch (e) {
      inviteLinkEl.focus();
      inviteLinkEl.select();
      inviteStatusEl.textContent = 'Выделите текст и скопируйте вручную';
      inviteStatusEl.classList.remove('ok');
    }
  });

  if (!initData && clientsState) {
    clientsState.textContent = 'Dev-режим: initData отсутствует (если включен ADMIN_DEV_BYPASS).';
  }

  filter.addEventListener('change', loadClients);
  sortEl?.addEventListener('change', loadClients);
  orderEl?.addEventListener('change', loadClients);
  reload.addEventListener('click', loadClients);

  wireSettingsCheckbox();

  await loadClients();
}

main();
