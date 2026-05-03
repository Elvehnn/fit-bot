import React, { useEffect, useMemo, useState } from 'react';
import { ApiError, ClientRow, createInvite, getClient, getClients, getSettings, updateSettings } from '../api';

type Route =
  | { name: 'clients' }
  | { name: 'client'; id: number }
  | { name: 'invite' }
  | { name: 'settings' };

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU');
}

function fullName(c: ClientRow) {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function errText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === 'trainer_not_found') return 'Доступ запрещён. Обратитесь к администратору.';
    if (e.code === 'bad_hash') return 'Ошибка подписи initData (проверьте BOT_TOKEN).';
    if (e.code === 'missing_init_data') return 'initData отсутствует (откройте через Telegram WebApp).';
    return `Ошибка API: ${e.code}`;
  }
  return `Ошибка: ${(e as any)?.message || 'unknown'}`;
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

export function App() {
  const tg = window.Telegram?.WebApp;
  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();
    try {
      tg?.setHeaderColor?.('#0b0f14');
      tg?.setBackgroundColor?.('#0b0f14');
    } catch {
      // ignore
    }
  }, [tg]);

  const [route, setRoute] = useState<Route>({ name: 'clients' });
  const [err, setErr] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [invite, setInvite] = useState<{ code: string; link: string | null } | null>(null);
  const [settings, setSettings] = useState<{ notifyOnMissedDays: boolean } | null>(null);

  const missedFirst = useMemo(() => {
    const now = Date.now();
    const isMissed = (c: ClientRow) => {
      if (!c.lastActivityAt) return true;
      const t = new Date(c.lastActivityAt).getTime();
      if (!Number.isFinite(t)) return true;
      return now - t >= 1000 * 60 * 60 * 24 * 2;
    };
    return { isMissed };
  }, []);

  async function loadClients() {
    setErr(null);
    setClients(null);
    try {
      const list = await getClients();
      // "сверху пропавшие" + сортировка по активности
      const sorted = [...list].sort((a, b) => {
        const ma = missedFirst.isMissed(a) ? 1 : 0;
        const mb = missedFirst.isMissed(b) ? 1 : 0;
        if (ma !== mb) return mb - ma;
        const da = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const db = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return db - da;
      });
      setClients(sorted);
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function openClient(id: number) {
    setErr(null);
    setSelected(null);
    setRoute({ name: 'client', id });
    try {
      const c = await getClient(id);
      setSelected(c);
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function loadInvite() {
    setErr(null);
    setInvite(null);
    setRoute({ name: 'invite' });
    try {
      const i = await createInvite();
      setInvite(i);
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function loadSettings() {
    setErr(null);
    setSettings(null);
    setRoute({ name: 'settings' });
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (e) {
      setErr(errText(e));
    }
  }

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.title}>Админка тренера</div>
        <div style={styles.nav}>
          <button style={styles.btn} onClick={() => setRoute({ name: 'clients' })}>
            Клиенты
          </button>
          <button style={styles.btn} onClick={loadInvite}>
            Invite
          </button>
          <button style={styles.btn} onClick={loadSettings}>
            Уведомления
          </button>
        </div>
      </div>

      {err ? <div style={styles.err}>{err}</div> : null}

      {route.name === 'clients' ? (
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <div style={styles.h2}>Список клиентов</div>
            <button style={styles.btn} onClick={loadClients}>
              Обновить
            </button>
          </div>

          {!clients ? (
            <div style={styles.muted}>Загрузка…</div>
          ) : clients.length === 0 ? (
            <div style={styles.muted}>Клиентов пока нет.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Фото</th>
                    <th style={styles.th}>Имя</th>
                    <th style={styles.th}>Последняя активность</th>
                    <th style={styles.th}>% соблюдения (7д)</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const missed = missedFirst.isMissed(c);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => openClient(c.id)}
                        style={{ cursor: 'pointer', background: missed ? 'rgba(255,92,92,0.06)' : undefined }}
                      >
                        <td style={styles.td}>
                          <div style={styles.avatarWrap}>
                            {c.photoUrl ? (
                              <img src={c.photoUrl} alt="" style={styles.avatar} />
                            ) : (
                              <div style={styles.avatarPh} />
                            )}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.name}>{fullName(c)}</div>
                          <div style={styles.smallMuted}>
                            id: {c.id} · tgId: {c.telegramId}
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div>{fmtDate(c.lastActivityAt)}</div>
                          {missed ? <div style={styles.badgeBad}>пропал(а)</div> : <div style={styles.badgeOk}>активен</div>}
                        </td>
                        <td style={styles.td}>{c.adherence7d === null ? <span style={styles.muted}>—</span> : c.adherence7d}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {route.name === 'client' ? (
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <button style={styles.btn} onClick={() => setRoute({ name: 'clients' })}>
              ← Назад
            </button>
            <div style={styles.h2}>Карточка клиента</div>
          </div>

          {!selected ? (
            <div style={styles.muted}>Загрузка…</div>
          ) : (
            <>
              <div style={styles.row}>
                <div style={styles.col}>
                  <div style={styles.name}>{[selected.firstName, selected.lastName].filter(Boolean).join(' ') || '—'}</div>
                  <div style={styles.smallMuted}>Последняя активность: {fmtDate(selected.lastActivityAt)}</div>
                </div>
                <a
                  style={{ ...styles.btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  onClick={(e) => {
                    // tg:// с username бота, если известен, лучше строить на бэкенде; пока открываем бот по ссылке t.me
                    e.preventDefault();
                    const uname = selected?.username ? String(selected.username).replace(/^@/, '') : '';
                    if (uname) window.open(`https://t.me/${encodeURIComponent(uname)}`, '_blank');
                    else window.open(`tg://user?id=${encodeURIComponent(String(selected.telegramId))}`, '_blank');
                  }}
                >
                  Написать клиенту (заглушка)
                </a>
              </div>

              <div style={styles.grid}>
                <div style={styles.panel}>
                  <div style={styles.panelTitle}>Анкета</div>
                  <pre style={styles.pre}>{JSON.stringify(selected.questionnaire, null, 2)}</pre>
                </div>
                <div style={styles.panel}>
                  <div style={styles.panelTitle}>Текущие показатели</div>
                  <div>Вес: {selected.current?.weight ?? '—'}</div>
                  <div>Калории: {selected.current?.calories ?? '—'}</div>
                  <div style={{ ...styles.muted, marginTop: 10 }}>Графики прогресса (заглушка)</div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {route.name === 'invite' ? (
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <div style={styles.h2}>Invite-ссылка</div>
            <button style={styles.btn} onClick={loadInvite}>
              Создать ссылку
            </button>
          </div>
          {!invite ? (
            <div style={styles.muted}>Нажмите «Создать ссылку».</div>
          ) : (
            <>
              <div style={styles.muted}>Код: {invite.code}</div>
              <div style={styles.linkBox}>{invite.link || 'Не задан BOT_USERNAME на сервере'}</div>
              {invite.link ? (
                <button style={styles.btn} onClick={() => copy(invite.link!)}>
                  Копировать
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {route.name === 'settings' ? (
        <div style={styles.card}>
          <div style={styles.cardHead}>
            <div style={styles.h2}>Настройка уведомлений</div>
          </div>
          {!settings ? (
            <div style={styles.muted}>Загрузка…</div>
          ) : (
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={settings.notifyOnMissedDays}
                onChange={async (e) => {
                  const v = e.target.checked;
                  setSettings({ notifyOnMissedDays: v });
                  try {
                    await updateSettings(v);
                  } catch (er) {
                    setErr(errText(er));
                    setSettings(await getSettings().catch(() => settings));
                  }
                }}
              />
              <span>Получать уведомления о пропавших клиентах (2+ дня)</span>
            </label>
          )}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0b0f14',
    color: '#e6edf3',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    padding: 16,
    maxWidth: 1100,
    margin: '0 auto',
  },
  top: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: 800 },
  nav: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: {
    background: '#121826',
    color: '#e6edf3',
    border: '1px solid #263041',
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: 14,
    cursor: 'pointer',
  },
  card: { background: '#121826', border: '1px solid #263041', borderRadius: 14, padding: 14 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: 700 },
  muted: { color: '#9aa4b2' },
  smallMuted: { color: '#9aa4b2', fontSize: 12 },
  err: { background: 'rgba(255,92,92,0.12)', border: '1px solid rgba(255,92,92,0.35)', padding: 12, borderRadius: 12, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', color: '#9aa4b2', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #263041', padding: 10 },
  td: { fontSize: 13, borderBottom: '1px solid #263041', padding: 10, verticalAlign: 'top' },
  avatarWrap: { width: 36, height: 36 },
  avatar: { width: 36, height: 36, borderRadius: 999, objectFit: 'cover', border: '1px solid #263041' },
  avatarPh: { width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid #263041' },
  name: { fontWeight: 700 },
  badgeOk: {
    display: 'inline-flex',
    marginTop: 6,
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid rgba(46,204,113,0.35)',
    color: '#2ecc71',
    fontSize: 12,
  },
  badgeBad: {
    display: 'inline-flex',
    marginTop: 6,
    padding: '3px 8px',
    borderRadius: 999,
    border: '1px solid rgba(255,92,92,0.35)',
    color: '#ff5c5c',
    fontSize: 12,
  },
  linkBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    border: '1px solid #263041',
    background: 'rgba(255,255,255,0.03)',
    wordBreak: 'break-all',
  },
  checkboxRow: { display: 'flex', gap: 10, alignItems: 'center' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  grid: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginTop: 12 },
  panel: { border: '1px solid #263041', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.02)' },
  panelTitle: { fontWeight: 700, marginBottom: 8 },
  pre: { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#c9d4e3', fontSize: 12 },
};

