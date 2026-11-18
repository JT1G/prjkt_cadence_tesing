Warning: truncated output (original token count: 18720)
Total output lines: 845

/* Cadence app: state, small UI helpers, one view function per section, and one click handler. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fd = s => new Date(s + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* ---------- Guest and account state ---------- */
const clone = value => JSON.parse(JSON.stringify(value));
let guestState = Store.load();
if (!guestState) { guestState = buildSeed(); Store.save(guestState); }
let S = clone(guestState); // Signed-in data replaces this in memory; it is never written to guest storage.
let activeUser = null, activeProfile = null, accountRevision = 0, cloudStatus = CadenceCloud.configured ? 'checking' : 'guest';
let accountBlocked = null, isCadenceAdmin = false, accountStatusTimer = 0, accountStatusUnavailable = false;
let cloudError = '', cloudConflict = false, pendingWrites = 0, deferredRemote = null, localDirty = false, localVersion = 0;
let accountGeneration = 0, saveQueue = Promise.resolve(), noteSaveTimer = 0, importPromptUser = '';
let pendingProfileFile = null, profileAvatarOperation = 'keep', profilePreviewUrl = '', profileCleanupPending = false;
const save = () => {
  if (accountBlocked) return Promise.resolve(false);
  if (!activeUser) {
    const ok = Store.save(S);
    if (ok) { guestState = clone(S); localDirty = false; }
    return Promise.resolve(ok);
  }
  if (cloudStatus !== 'ready') return Promise.resolve(false);
  const userId = activeUser.id, generation = accountGeneration, version = ++localVersion, snapshot = clone(S);
  localDirty = true; pendingWrites++; cloudConflict = false; cloudError = ''; renderAccountArea();
  const write = saveQueue.catch(() => {}).then(() => {
    if (!activeUser || activeUser.id !== userId || generation !== accountGeneration) throw new Error('The signed-in account changed before this save completed.');
    return CadenceCloud.writeData(snapshot, accountRevision, null, userId);
  });
  saveQueue = write.catch(() => {});
  return write.then(row => {
    if (activeUser?.id !== userId || generation !== accountGeneration) return false;
    accountRevision = row.revision;
    pendingWrites = Math.max(0, pendingWrites - 1);
    cloudError = '';
    if (version === localVersion) localDirty = false;
    renderAccountArea();
    applyDeferredRemote();
    return true;
  }).catch(error => {
    if (activeUser?.id === userId && generation === accountGeneration) {
      pendingWrites = Math.max(0, pendingWrites - 1);
      cloudError = error.message || 'Cloud save failed.';
      cloudConflict = /CADENCE_REVISION_CONFLICT/i.test(cloudError);
      renderAccountArea();
    }
    return false;
  });
};
const U = { route: '', last: '', tq: '', tc: '', tp: '', ts: '', nq: '', nid: null, month: new Date(today.getFullYear(), today.getMonth(), 1), did: null, ci: 0, qz: null, qi: 0, ans: [], res: null, tcr: '' };
const T = { mode: 'focus', left: S.timer.focus * 60, run: false, end: 0, id: 0 }; // timer lives outside views so it keeps running
const V = {}, FILL = {}, A = {};
const course = id => S.courses.find(c => c.id === id) || { name: 'General', color: '#94a3b8' };
const log = t => { S.activity.unshift({ t, at: Date.now() }); S.activity = S.activity.slice(0, 8); };
const commit = async m => { log(m); render(); const ok = await save(); toast(ok ? m : 'Changes are on this screen but could not be saved. Retry from your account panel.', !ok); };
const ST = { todo: 'To Do', doing: 'In Progress', done: 'Completed' }, PR = { low: 'Low', med: 'Medium', high: 'High' };
const TYPE = { study: ['Study session', '#cbbcff'], exam: ['Exam', '#ffc9a8'], deadline: ['Deadline', '#a5e6ef'] };

/* ---------- Derived numbers (everything on Dashboard/Progress is computed from saved data) ---------- */
const week = () => Array.from({ length: 7 }, (_, i) => { const d = off(i - 6); return { d, m: S.sessions.filter(s => s.d === d).reduce((a, s) => a + s.m, 0) }; });
const streak = () => { const has = k => S.sessions.some(s => s.d === off(k)); let n = 0, i = has(0) ? 0 : -1; while (has(i)) { n++; i--; } return n; };
const prog = cid => { const t = S.tasks.filter(x => !cid || x.course === cid); return t.length ? Math.round(100 * t.filter(x => x.status === 'done').length / t.length) : 0; };
const hrs = m => (m / 60).toFixed(1);

/* ---------- UI helpers ---------- */
const P = { dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', planner: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4', tasks: 'M9 11l3 3 8-8M4 12v8h16v-5', notes: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3', cards: 'M3 6h14v12H3zM7 3h14v12', quiz: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 115 0c0 2-2.500 2-2.500 4M12 17h.01', timer: 'M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l3 2M9 2h6', courses: 'M4 5l8-3 8 3-8 3zM6 10v6c3 2 9 2 12 0v-6', progress: 'M4 20V10M10 20V4M16 20v-8M22 20H2' };
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;
const NAV = [['dashboard', 'Dashboard'], ['planner', 'Planner'], ['tasks', 'Assignments'], ['notes', 'Notes'], ['cards', 'Flashcards'], ['quiz', 'Quizzes'], ['timer', 'Focus timer'], ['courses', 'Courses'], ['progress', 'Progress']];
const ring = (p, c) => `<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${p}%"><circle class="rt" cx="50" cy="50" r="40"/><circle class="rf" cx="50" cy="50" r="40" style="stroke:${c};--o:${251.3 * (1 - p / 100)}"/><text x="50" y="57" text-anchor="middle">${p}%</text></svg>`;
const bar = (p, c) => `<div class="bar"><i style="width:${p}%;background:${c}"></i></div>`;
const stat = (l, v, s) => `<div class="card stat lift"><div><span>${l}</span><b class="big">${v}</b><span>${s}</span></div></div>`;
const opts = (list, sel) => list.map(([k, x]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(x)}</option>`).join('');
const cOpts = () => S.courses.map(c => [c.id, c.name]);

let lastFocus = null;
const modal = $('#modal'), sheetEl = $('#sheet');
function sheet(html) { lastFocus = document.activeElement; sheetEl.innerHTML = html; const isProfile = Boolean(sheetEl.querySelector('#profile-title')); modal.setAttribute('aria-label', isProfile ? 'Edit profile' : 'Dialog'); modal.classList.toggle('profile-modal', isProfile); modal.classList.add('open'); sheetEl.querySelector('input,select,textarea,button')?.focus(); }
function closeSheet() { if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl); profilePreviewUrl = ''; pendingProfileFile = null; profileAvatarOperation = 'keep'; modal.classList.remove('open', 'profile-modal'); sheetEl.innerHTML = ''; lastFocus?.focus?.(); }
function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.id); toast.id = setTimeout(() => t.className = '', 2600); }
function ask(msg, yes, label = 'Delete') { sheet(`<h2>Are you sure?</h2><p class="mut" style="margin-bottom:18px">${esc(msg)}</p><div class="row"><button class="btn dng" id="yes">${label}</button><button class="btn" data-close>Cancel</button></div>`); $('#yes').onclick = () => { closeSheet(); yes(); }; }

function profileAvatarMarkup(profile, name) {
  return profile?.avatarUrl
    ? `<img src="${esc(profile.avatarUrl)}" alt="" aria-hidden="true">`
    : esc((String(name || 'S').trim()[0] || 'S').toUpperCase());
}

function renderIdentity() {
  const name = activeUser ? (activeProfile?.display_name || 'Set display name') : S.name;
  const avatar = $('#av'), who = $('#who'), trigger = $('.me');
  if (who) who.textContent = name;
  if (avatar) avatar.innerHTML = profileAvatarMarkup(activeUser ? activeProfile : null, name);
  if (trigger) {
    trigger.dataset.act = activeUser ? 'profile-edit' : 'name';
    trigger.setAttribute('aria-label', activeUser ? 'Edit your profile' : 'Edit your name');
  }
}

function renderAccountArea() {
  const el = $('#account-area'); if (!el) return;
  renderIdentity();
  if (accountBlocked) {
    el.innerHTML = `<strong>${accountBlocked.status === 'deleting' ? 'Account deletion in progress' : 'Account access paused'}</strong><small class="account-message" role="status">${accountBlocked.status === 'deleting' ? 'This account is being permanently deleted. Its study data is no longer accessible.' : `This account is banned.${accountBlocked.reason ? ` Reason: ${esc(accountBlocked.reason)}` : ''}${accountBlocked.until ? ` Ban ends: ${esc(new Date(accountBlocked.until).toLocaleString())}.` : ''}`}</small><div class="account-actions"><button class="btn sm" data-act="blocked-guest">Continue as guest</button><button class="btn sm" data-act="blocked-signin">Sign in to another account</button></div>`;
    return;
  }
  if (cloudStatus === 'checking' || cloudStatus === 'loading') {
    el.innerHTML = '<p class="mut account-message" role="status">Loading account…</p>';
    return;
  }
  if (activeUser && cloudStatus === 'error') {
    el.innerHTML = `<div class="account-identity"><span class="account-avatar">${profileAvatarMarkup(activeProfile, activeProfile?.display_name || 'Student')}</span><span class="account-meta"><strong>${esc(activeProfile?.display_name || 'Your account')}</strong><small class="account-email" title="${esc(activeUser.email)}">${esc(activeUser.email)}</small></span></div><small class="account-message account-error" role="status">${esc(cloudError || 'Could not load account data.')}</small><div class="account-actions"><button class="btn sm" data-act="account-retry">Retry load</button><button class="btn sm" data-act="auth-signout">Sign out</button></div>`;
    return;
  }
  if (!activeUser) {
    el.innerHTML = `<div class="account-actions"><button class="btn sm" data-act="auth-signin">Sign in</button><button class="btn sm pri" data-act="auth-signup">Sign up</button></div>${cloudError ? `<small class="account-message">${esc(cloudError)}</small>` : ''}`;
    return;
  }
  const status = pendingWrites ? 'Saving to your account…' : cloudConflict ? 'Another device saved newer data. Reload the cloud copy before editing further.' : cloudError ? `Sync issue: ${cloudError}` : 'Synced to your account';
  el.innerHTML = `<div class="account-identity"><span class="account-avatar">${profileAvatarMarkup(activeProfile, activeProfile?.display_name || 'Student')}</span><span class="account-meta"><strong>${esc(activeProfile?.display_name || 'Set display name')}</strong><small class="account-email" title="${esc(activeUser.email)}">${esc(activeUser.email)}</small></span></div><small class="account-message${cloudError ? ' account-error' : ''}" role="status">${esc(status)}</small><div class="account-actions"><button class="btn sm" data-act="profile-edit">Edit profile</button>${isCadenceAdmin ? '<button class="btn sm" data-act="admin-users">Manage accounts</button>' : ''}${cloudConflict ? '<button class="btn sm" data-act="cloud-reload">Reload cloud data</button>' : cloudError ? '<button class="btn sm" data-act="cloud-retry">Retry save</button>' : ''}<button class="btn sm" data-act="import-guest">Import browser data</button><button class="btn sm" data-act="auth-signout">Sign out</button></div>`;
}

const accountStatusActive = profile => profile?.status === 'active' || profile?.status === 'banned' && profile.banned_until && Date.parse(profile.banned_until) <= Date.now();
async function blockAccount(profile, userId) {
  if (!activeUser || activeUser.id !== userId || accountStatusActive(profile)) return;
  accountBlocked = { status: profile.status, reason: profile.ban_reason || '', until: profile.banned_until || '' };
  accountGeneration++; CadenceCloud.stopWatching(); clearInterval(accountStatusTimer); accountStatusTimer = 0;
  accountStatusUnavailable = false;
  clearPrivateViewState(); saveQueue = Promise.resolve(); clearInterval(T.id); T.run = false;
  activeUser = null; activeProfile = null; pendingWrites = 0; deferredRemote = null; localDirty = false;
  accountRevision = 0; S = clone(guestState); cloudStatus = 'blocked';
  render();
  await CadenceCloud.signOut().catch(() => {});
}

async function recheckAccountStatus(userId, generation) {
  if (!activeUser || activeUser.id !== userId || generation !== accountGeneration) return;
  try {
    const profile = await CadenceCloud.readAccountStatus(userId);
    if (!activeUser || activeUser.id !== userId || generation !== accountGeneration) return;
    if (!accountStatusActive(profile)) { await blockAccount(profile, userId); return; }
    if (profile.status === 'active') activeProfile = { ...activeProfile, ...profile };
    if (accountStatusUnavailable) {
      accountStatusUnavailable = false; cloudStatus = 'ready'; cloudError = ''; render();
    }
  } catch (error) {
    if (['23503', 'CADENCE_PROFILE_MISSING'].includes(error?.code) && activeUser?.id === userId && generation === accountGeneration) {
      await blockAccount({ status: 'deleting' }, userId);
      return;
    }
    // RLS still blocks protected reads and writes during a network outage.
    accountStatusUnavailable = true; cloudStatus = 'error';
    cloudError = 'Cadence cannot verify this account’s status. Reconnect to protect and reload your private study data.';
    render();
  }
}

async function openAdminUsers() {
  if (!activeUser || !isCadenceAdmin) return;
  sheet('<h2 id="admin-users-title">Manage accounts</h2><p class="mut">Loading account records…</p><div id="admin-users-list" aria-live="polite"></div><div class="row"><button class="btn" data-close>Close</button></div>');
  modal.setAttribute('aria-label', 'Manage Cadence accounts');
  const list = $('#admin-users-list');
  try {
    const { users } = await CadenceCloud.adminRequest({ action: 'list-users' });
    if (!list || !document.contains(list)) return;
    list.innerHTML = users.length ? users.map(user => `<article class="admin-user"><div><strong>${esc(user.email)}</strong><small>${esc(user.display_name || 'No display name')} · ${esc(user.status)}</small>${user.status === 'banned' && user.ban_reason ? `<small>Reason: ${esc(user.ban_reason)}</small>` : ''}${user.status === 'banned' && user.banned_until ? `<small>Until ${esc(new Date(user.banned_until).toLocaleString())}</small>` : ''}</div><div class="admin-actions"><button class="btn sm" data-act="admin-ban" data-id="${esc(user.user_id)}">Ban</button><button class="btn sm" data-act="admin-activate" data-id="${esc(user.user_id)}">Activate</button><button class="btn sm dng" data-act="admin-delete" data-id="${esc(user.user_id)}">Delete</button></div></article>`).join('') : '<p class="mut">No user profiles found.</p>';
  } catch (error) {
    if (list && document.contains(list)) list.innerHTML = `<p class="err" role="alert">${esc(error.message || 'Account list could not be loaded.')}</p><button class="btn" data-act="admin-users">Retry</button>`;
  }
}

function updateAccountStatus(userId, status, reason = '', until = '') {
  if (!activeUser || !isCadenceAdmin) return;
  const isDelete = status === 'deleting';
  reason = isDelete ? '' : reason.trim();
  until = isDelete ? '' : until;
  const action = async () => {
    try {
      const result = await CadenceCloud.adminRequest(isDelete
        ? { action: 'delete-user', userId }
        : { action: 'set-status', userId, status, reason, bannedUntil: until || null });
      toast(result.message || 'Account status updated.');
      await openAdminUsers();
    } catch (error) { toast(error.message || 'Account status could not be updated.', true); }
  };
  ask(isDelete ? 'This first disables the account, then permanently deletes its Auth account, study data, profile, and avatar. This cannot be undone.' : status === 'banned' ? 'This immediately blocks account data access. The account and its data are preserved.' : 'This restores account access.', action, isDelete ? 'Delete permanently' : status === 'banned' ? 'Ban account' : 'Activate account');
}

function showBanForm(userId) {
  sheet(`<h2>Ban account</h2><p class="mut">The account and its study data remain intact, but access is blocked immediately.</p><form id="admin-ban-form" data-user-id="${esc(userId)}"><label>Reason (optional)<textarea name="reason" maxlength="500" rows="3"></textarea></label><label>Ban ends (optional)<input name="until" type="datetime-local"></label><p class="mut">If you set an end date, the account automatically regains data access after that time.</p><div class="row"><button class="btn dng">Review ban</button><button class="btn" type="button" data-close>Cancel</button></div></form>`);
}

function normalizeState(value) {
  const defaults = buildSeed();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const state = { ...defaults, ...clone(value) };
  for (const key of ['courses', 'tasks', 'events', 'notes', 'decks', 'quizzes', 'quizLog', 'sessions', 'activity']) {
    if (!Array.isArray(state[key])) state[key] = defaults[key];
  }
  state.timer = { ...defaults.timer, ...(state.timer && typeof state.timer === 'object' ? state.timer : {}) };
  return state;
}

function showAuthForm(mode, presetEmail = '') {
  if (!CadenceCloud.configured) {
    sheet(`<h2>Set up account sync</h2><p class="mut">Add your Supabase project URL and publishable key to <b>supabase-config.js</b>, then run the database migration. Until then, Cadence stays in guest mode on this device.</p><p class="mut"><a href="ACCOUNT_SETUP.md" target="_blank" rel="noreferrer">Open account setup instructions</a></p><div class="row"><button class="btn" data-close>Close</button></div>`);
    return;
  }
  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Sign in to Cadence';
  const hint = mode === 'signup' ? 'We’ll email you a confirmation link before your account can sync.' : mode === 'reset' ? 'We’ll send a secure password reset link to your email.' : 'Your subjects and study records will load from your account.';
  sheet(`<h2>${title}</h2><p class="mut auth-hint">${hint}</p><form id="auth-form" data-mode="${mode}" novalidate><label>Email<input id="auth-email" name="email" type="email" autocomplete="email" value="${esc(presetEmail)}" required></label>${mode !== 'reset' ? `<label>Password<input name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="8" required></label>` : ''}<p id="auth-message" class="err auth-message" role="status" aria-live="polite"></p><div class="row"><button class="btn pri" id="auth-submit">${mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>${mode === 'signin' ? '<button type="button" class="btn text-button" data-act="auth-forgot">Forgot password?</button>' : ''}<button type="button" class="btn" data-close>Cancel</button></div></form>${mode === 'signin' ? '<p class="auth-switch">New to Cadence? <button class="text-button" data-act="auth-switch-signup">Sign up</button></p>' : mode === 'signup' ? '<p class="auth-switch">Already have an account? <button class="text-button" data-act="auth-switch-signin">Sign in</button></p>' : '<p class="auth-switch"><button class="text-button" data-act="auth-switch-signin">Back to sign in</button></p>'}`);
}

function showPasswordUpdate() {
  sheet('<h2>Choose a new password</h2><p class="mut auth-hint">Use at least 8 characters for your new password.</p><form id="password-form" novalidate><label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label><p id="password-message" class="err auth-message" role="status" aria-live="polite"></p><div class="row"><button class="btn pri" id="password-submit">Save new password</button></div></form>');
}

function showProfileForm() {
  if (!activeUser || cloudStatus !== 'ready') return;
  const name = activeProfile?.display_name ||…8720 tokens truncated… ' quizzes')}${stat('Study streak', streak(), 'days')}</section>
  <section class="grid two"><div class="card"><h2>Weekly activity</h2><div class="cols">${w.map(x => `<div class="col"><i style="height:${Math.max(2, 100 * x.m / max)}%" title="${x.m} min"></i>${new Date(x.d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' })}</div>`).join('')}</div></div>
  <div class="card"><h2>Study time by course</h2><div class="row" style="align-items:center"><div class="donut" style="background:conic-gradient(${grad})" role="img" aria-label="Study time distribution"></div><div>${by.map(x => `<small><i class="dot" style="background:${x.c.color}"></i>${esc(x.c.name)}: ${x.m} min</small>`).join('') || '<small>Complete a focus session to see this.</small>'}</div></div></div></section>
  <section class="grid two"><div class="card"><h2>Course completion</h2>${S.courses.map(c => `<small>${esc(c.name)} · ${prog(c.id)}%</small>${bar(prog(c.id), c.color)}`).join('')}</div>
  <div class="card"><h2>Quiz performance</h2>${ql.map(r => `<small>${esc(r.title)} · ${fd(r.d)} · ${r.pct}%</small>${bar(r.pct, r.pct >= 70 ? '#15a362' : '#ff9f6b')}`).join('') || '<p class="empty">Take a quiz to see your scores here.</p>'}</div></section>`; };

/* ---------- Actions (buttons use data-act="name") ---------- */
const byId = (arr, id) => arr.find(x => x.id === id);
const cycle = { todo: 'doing', doing: 'done', done: 'todo' };
Object.assign(A, {
  nav: () => document.body.classList.toggle('nav'),
  'blocked-guest': () => { accountBlocked = null; accountStatusUnavailable = false; cloudStatus = 'guest'; activeUser = null; activeProfile = null; S = clone(guestState); render(); toast('Continuing with this browser’s guest data.'); },
  'blocked-signin': () => { accountBlocked = null; accountStatusUnavailable = false; cloudStatus = 'guest'; activeUser = null; activeProfile = null; S = clone(guestState); render(); showAuthForm('signin'); },
  'admin-users': () => { void openAdminUsers(); },
  'admin-ban': d => showBanForm(d.id),
  'admin-activate': d => updateAccountStatus(d.id, 'active'),
  'admin-delete': d => updateAccountStatus(d.id, 'deleting'),
  mo: d => { U.month = +d.n ? new Date(U.month.getFullYear(), U.month.getMonth() + +d.n, 1) : new Date(today.getFullYear(), today.getMonth(), 1); render(); },
  'ev-add': d => openForm('Add event', EVF, { type: 'study', date: d.d || iso(today) }, x => { S.events.push({ id: uid(), ...x }); commit('Scheduled ' + x.title); }),
  'ev-edit': d => { const e = byId(S.events, d.id); openForm('Edit event', EVF, e, x => { Object.assign(e, x); commit('Updated ' + x.title); }, () => ask(`Delete "${e.title}"?`, () => { S.events = S.events.filter(y => y !== e); commit('Deleted event ' + e.title); })); },
  't-add': () => S.courses.length ? openForm('Add assignment', TF(), { course: S.courses[0].id, priority: 'med', status: 'todo', due: off(7) }, x => { S.tasks.push({ id: uid(), ...x }); commit('Added ' + x.title); }) : toast('Add a course first.', true),
  't-edit': d => { const t = byId(S.tasks, d.id); openForm('Edit assignment', TF(), t, x => { Object.assign(t, x); commit('Updated ' + x.title); }); },
  't-del': d => { const t = byId(S.tasks, d.id); ask(`Delete "${t.title}"?`, () => { S.tasks = S.tasks.filter(x => x !== t); commit('Deleted ' + t.title); }); },
  't-tog': d => { const t = byId(S.tasks, d.id); t.status = t.status === 'done' ? 'todo' : 'done'; commit(t.status === 'done' ? 'Completed ' + t.title : 'Reopened ' + t.title); },
  't-cyc': d => { const t = byId(S.tasks, d.id); t.status = cycle[t.status]; commit(`${t.title}: ${ST[t.status]}`); },
  'n-new': () => { const n = { id: uid(), title: 'Untitled note', course: S.courses[0]?.id || '', body: '', updated: Date.now() }; S.notes.push(n); U.nid = n.id; U.nq = ''; commit('Created a note'); },
  'n-pick': d => { U.nid = d.id; render(); },
  'n-del': () => { const n = note(); ask(`Delete "${n.title}"?`, () => { S.notes = S.notes.filter(x => x !== n); U.nid = null; commit('Deleted note ' + n.title); }); },
  deck: d => { U.did = d.id; U.ci = 0; render(); },
  'deck-add': () => openForm('New deck', [['name', 'Deck name', 'text', 1]], {}, x => { const d = { id: uid(), name: x.name, cards: [] }; S.decks.push(d); U.did = d.id; commit('Created deck ' + x.name); }),
  'deck-del': () => { const d = deck(); ask(`Delete deck "${d.name}" and its cards?`, () => { S.decks = S.decks.filter(x => x !== d); U.did = null; commit('Deleted deck ' + d.name); }); },
  'card-add': () => openForm('Add card', [['q', 'Question', 'textarea', 1], ['a', 'Answer', 'textarea', 1]], {}, x => { deck().cards.push({ id: uid(), ...x }); U.ci = deck().cards.length - 1; commit('Added a flashcard'); }),
  'fl-flip': () => $('.fc').classList.toggle('flip'),
  'fl-next': () => { U.ci = (U.ci + 1) % deck().cards.length; render(); },
  'fl-prev': () => { const n = deck().cards.length; U.ci = (U.ci + n - 1) % n; render(); },
  'fl-mark': d => { const dk = deck(); dk.cards[U.ci].st = d.s; U.ci = (U.ci + 1) % dk.cards.length; render(); save().then(ok => { if (!ok) toast('Card progress could not be saved. Retry from your account panel.', true); }); },
  'fl-shuffle': () => { const c = deck().cards; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } U.ci = 0; render(); save().then(ok => toast(ok ? 'Deck shuffled' : 'Shuffle could not be saved. Retry from your account panel.', !ok)); },
  'q-start': d => { U.qz = d.id; U.qi = 0; U.ans = []; U.res = null; render(); },
  'q-exit': () => { U.qz = null; U.res = null; render(); },
  'q-next': () => { if (U.ans[U.qi] === undefined) return toast('Choose an answer first.', true); U.qi++; render(); },
  'q-prev': () => { U.qi--; render(); },
  'q-submit': () => { const q = S.quizzes.find(z => z.id === U.qz); if (q.qs.some((_, i) => U.ans[i] === undefined)) return toast('Answer every question before submitting.', true);
    const score = q.qs.filter((x, i) => U.ans[i] === x.a).length, pct = Math.round(100 * score / q.qs.length); U.res = { score, pct }; S.quizLog.push({ d: iso(new Date()), title: q.title, pct }); commit(`Scored ${pct}% on ${q.title}`); },
  'tm-mode': d => setMode(d.m),
  'tm-toggle': () => { if (T.run) { tick(); stopTimer(); } else { T.run = true; T.end = Date.now() + T.left * 1000; T.id = setInterval(tick, 250); } paint(); },
  'tm-reset': () => setMode(T.mode),
  'tm-set': () => openForm('Customize timer (minutes)', [['focus', 'Focus', 'number', 1], ['short', 'Short break', 'number', 1], ['long', 'Long break', 'number', 1]], S.timer, async x => {
    const v = ['focus', 'short', 'long'].map(k => +x[k]); if (v.some(n => !(n >= 1 && n <= 180))) return 'Enter whole minutes between 1 and 180.';
    const previous = S.timer; S.timer = { focus: v[0], short: v[1], long: v[2] };
    if (!(await save())) { S.timer = previous; toast('Timer settings could not be saved.', true); return false; }
    setMode(T.mode); toast('Timer updated'); }),
  'c-add': () => openForm('Add course', CF, { color: '#6d4aff' }, x => { S.courses.push({ id: uid(), ...x }); commit('Added course ' + x.name); }),
  'c-edit': d => { const c = byId(S.courses, d.id); openForm('Edit course', CF, c, x => { Object.assign(c, x); commit('Updated ' + x.name); }, () => ask(`Delete "${c.name}"? Its assignments and notes stay, filed under General.`, () => { S.courses = S.courses.filter(y => y !== c); commit('Deleted course ' + c.name); })); },
  'auth-signin': () => showAuthForm('signin'),
  'auth-signup': () => showAuthForm('signup'),
  'auth-forgot': () => showAuthForm('reset', $('#auth-email')?.value || ''),
  'auth-switch-signup': () => showAuthForm('signup', $('#auth-email')?.value || ''),
  'auth-switch-signin': () => showAuthForm('signin', $('#auth-email')?.value || ''),
  'profile-edit': () => showProfileForm(),
  'profile-remove-photo': () => {
    if (!activeProfile?.avatar_path && !profileCleanupPending) return;
    if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    profilePreviewUrl = ''; pendingProfileFile = null; profileAvatarOperation = 'remove';
    $('#profile-image').value = '';
    $('#profile-preview').innerHTML = `<span>${profileAvatarMarkup(null, $('#profile-name').value || 'Student')}</span>`;
    $('#profile-message').textContent = activeProfile?.avatar_path ? 'The picture will be removed when you save.' : 'Cadence will retry removing the old image when you save.';
  },
  'auth-signout': async () => { await switchToUser(null); const { error } = await CadenceCloud.signOut().catch(error => ({ error })); toast(error ? 'Signed out of Cadence on this device. Remote sign-out could not be confirmed.' : 'Signed out. Guest data is still available in this browser.', Boolean(error)); },
  'import-guest': () => showImportPrompt(),
  'import-confirm': () => { void importGuestData(); },
  'import-decline': () => { closeSheet(); toast('Guest data stays in this browser. Use “Import browser data” in your account panel whenever you are ready.'); },
  'cloud-retry': async () => { const ok = await save(); toast(ok ? 'Changes saved to your account.' : 'Save failed. Check your connection and try again.', !ok); },
  'cloud-reload': () => { void reloadAccountData(); },
  'account-retry': () => { void reloadAccountData(); },
  name: () => openForm('Your name', [['name', 'Name', 'text', 1]], S, async x => { const previous = S.name; S.name = x.name; if (!(await save())) { S.name = previous; render(); toast('Name could not be saved.', true); return false; } render(); toast('Name saved'); }),
  reset: () => ask('This replaces all your data with the sample data.', async () => { const previous = S; S = buildSeed(); stopTimer(); T.left = dur(T.mode); render(); if (!(await save())) { S = previous; render(); toast('Reset could not be saved. Your previous data is restored.', true); return; } toast('Demo data restored'); }, 'Reset')
});
const CF = [['name', 'Course name', 'text', 1], ['desc', 'Description', 'text'], ['color', 'Color', 'color']];

/* ---------- Events and router ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (accountBlocked && b && !['blocked-guest', 'blocked-signin'].includes(b.dataset.act)) return;
  if (b) { A[b.dataset.act]?.(b.dataset); return; }
  if (e.target === modal || e.target.closest('[data-close]')) closeSheet();
  if (e.target.closest('#nav a')) document.body.classList.remove('nav');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSheet(); document.body.classList.remove('nav'); return; }
  if (e.key === 'Tab' && modal.classList.contains('open')) {
    const focusable = [...sheetEl.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !sheetEl.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
document.addEventListener('submit', async e => {
  const form = e.target;
  if (form.id === 'admin-ban-form') {
    e.preventDefault();
    const fields = new FormData(form), userId = form.dataset.userId;
    const reason = String(fields.get('reason') || '').trim();
    const untilLocal = String(fields.get('until') || '');
    const parsedUntil = untilLocal ? Date.parse(untilLocal) : NaN;
    if (untilLocal && Number.isNaN(parsedUntil)) { toast('Enter a valid ban end date.', true); return; }
    const until = untilLocal ? new Date(parsedUntil).toISOString() : '';
    updateAccountStatus(userId, 'banned', reason, until);
    return;
  }
  if (form.id === 'profile-form') {
    e.preventDefault();
    if (!activeUser || cloudStatus !== 'ready') return;
    const userId = activeUser.id, generation = accountGeneration;
    const name = String(new FormData(form).get('displayName') || '').trim();
    const button = $('#profile-save'), status = $('#profile-message');
    if (!name || name.length > 60) { status.textContent = 'Enter a display name with 1 to 60 characters.'; $('#profile-name').focus(); return; }
    button.disabled = true; button.textContent = 'Saving…'; status.textContent = 'Saving profile…';
    const stillCurrent = () => activeUser?.id === userId && accountGeneration === generation;
    try {
      if (name !== (activeProfile?.display_name || '')) {
        activeProfile = await CadenceCloud.updateProfileName(name, userId);
        if (!stillCurrent()) return;
        renderAccountArea();
      }
      if (profileAvatarOperation === 'replace' && pendingProfileFile) {
        activeProfile = await CadenceCloud.uploadAvatar(pendingProfileFile, userId);
        if (!stillCurrent()) return;
        profileCleanupPending = false;
      } else if (profileAvatarOperation === 'remove') {
        const result = await CadenceCloud.removeAvatar(userId);
        if (!stillCurrent()) return;
        activeProfile = result.profile;
        profileCleanupPending = Boolean(result.cleanupError);
        renderAccountArea();
        closeSheet();
        toast(result.cleanupError ? 'Could not remove the picture. It is still on your profile; try again.' : 'Profile saved and picture removed.', Boolean(result.cleanupError));
        return;
      }
      if (!stillCurrent()) return;
      renderAccountArea(); closeSheet(); toast('Profile saved.');
    } catch (error) {
      if (!stillCurrent()) return;
      renderAccountArea();
      status.textContent = error.message || 'Profile could not be saved. Check your connection and try again.';
      status.classList.add('profile-error'); button.disabled = false; button.textContent = 'Save changes';
    }
    return;
  }
  if (form.id === 'auth-form') {
    e.preventDefault();
    const fields = new FormData(form), mode = form.dataset.mode, email = String(fields.get('email') || '').trim(), password = String(fields.get('password') || '');
    const button = $('#auth-submit'), message = $('#auth-message');
    if (!email) { message.textContent = 'Enter your email address.'; return; }
    if (mode !== 'reset' && password.length < 8) { message.textContent = 'Use a password with at least 8 characters.'; return; }
    button.disabled = true; button.textContent = mode === 'signup' ? 'Creating account…' : mode === 'reset' ? 'Sending link…' : 'Signing in…';
    message.className = 'err auth-message'; message.textContent = 'Please wait…';
    try {
      if (mode === 'signup') {
        const { data, error } = await CadenceCloud.signUp(email, password);
        if (error) throw error;
        if (data.session?.user) {
          await switchToUser(data.session.user); closeSheet(); toast('Account created. Your Cadence data is loading.');
        } else {
          message.className = 'mut auth-message'; message.textContent = 'Account created. Check your email and confirm the address before signing in.';
          form.elements.password.value = ''; button.textContent = 'Confirmation email sent';
        }
      } else if (mode === 'signin') {
        const { data, error } = await CadenceCloud.signIn(email, password);
        if (error) throw error;
        await switchToUser(data.user); closeSheet();
        if (cloudStatus === 'error') toast('Signed in, but account data could not load. Try again from the account screen.', true);
        else toast('Signed in. Your account data is ready.');
      } else {
        const { error } = await CadenceCloud.requestPasswordReset(email);
        if (error) throw error;
        message.className = 'mut auth-message'; message.textContent = 'If an account uses this email, a password reset link is on its way.';
        button.textContent = 'Reset link sent';
      }
    } catch (error) {
      message.className = 'err auth-message'; message.textContent = error.message || 'The request failed. Check your connection and try again.';
      button.disabled = false; button.textContent = mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in';
    }
  }
  if (form.id === 'password-form') {
    e.preventDefault();
    const fields = new FormData(form), password = String(fields.get('password') || ''), confirm = String(fields.get('confirm') || ''), button = $('#password-submit'), message = $('#password-message');
    if (password.length < 8) { message.textContent = 'Use at least 8 characters.'; return; }
    if (password !== confirm) { message.textContent = 'The passwords do not match.'; return; }
    button.disabled = true; button.textContent = 'Updating password…'; message.textContent = 'Please wait…';
    try {
      const { error } = await CadenceCloud.updatePassword(password);
      if (error) throw error;
      closeSheet(); toast('Your password has been updated.');
    } catch (error) {
      message.textContent = error.message || 'Password update failed. Try again.'; button.disabled = false; button.textContent = 'Save new password';
    }
  }
});
document.addEventListener('input', e => {
  const t = e.target, f = t.dataset.f, n = t.dataset.n;
  if (t.name === 'opt') U.ans[U.qi] = +t.value;
  else if (f === 'tcr') U.tcr = t.value;
  else if (f) { U[f] = t.value; FILL[U.route]?.(); }
  else if (n && note()) {
    const x = note(); x[n] = t.value; x.updated = Date.now(); localDirty = true;
    $('#saved').textContent = 'Saving…'; clearTimeout(noteSaveTimer); FILL.notes(); renderAccountArea();
    noteSaveTimer = setTimeout(persistNoteDraft, 450);
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.n && note() && noteSaveTimer) persistNoteDraft();
});

function render() {
  renderAccountArea();
  if (accountBlocked) {
    const reason = accountBlocked.status === 'banned' && accountBlocked.reason ? `<p><strong>Reason:</strong> ${esc(accountBlocked.reason)}</p>` : '';
    const until = accountBlocked.status === 'banned' && accountBlocked.until ? `<p><strong>Ban ends:</strong> ${esc(new Date(accountBlocked.until).toLocaleString())}</p>` : '';
    $('#view').innerHTML = `<div class="page"><section class="card account-blocked-screen" role="alert"><p class="profile-eyebrow">CADENCE ACCOUNT</p><h1>${accountBlocked.status === 'deleting' ? 'This account is being deleted' : 'This account is banned'}</h1><p>${accountBlocked.status === 'deleting' ? 'Access to this account has been disabled while its data is permanently removed.' : 'You can’t access study data from this account right now.'}</p>${reason}${until}<div class="row"><button class="btn pri" data-act="blocked-guest">Continue as guest</button><button class="btn" data-act="blocked-signin">Sign in to another account</button></div></section></div>`;
    return;
  }
  if (cloudStatus === 'checking' || cloudStatus === 'loading') {
    accountLoadView(cloudStatus === 'checking' ? 'Checking for a signed-in account…' : 'Loading your private study data from the cloud.');
    return;
  }
  if (cloudStatus === 'error' && activeUser) {
    accountLoadView('Cadence could not load your private data. Guest records remain separate.', true);
    return;
  }
  U.route = location.hash.slice(1); if (!V[U.route]) U.route = 'dashboard';
  const enter = U.last !== U.route; U.last = U.route;
  $('#view').innerHTML = `<div class="page${enter ? ' enter' : ''}">${V[U.route]()}</div>`;
  FILL[U.route]?.(); if (U.route === 'timer') paint();
  document.querySelectorAll('#nav a').forEach(a => a.dataset.r === U.route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  renderIdentity();
  if (enter) window.scrollTo(0, 0);
}
$('#nav').innerHTML = NAV.map(([r, l]) => `<a href="#${r}" data-r="${r}">${ic(r)}<span>${l}</span></a>`).join('');
window.addEventListener('hashchange', render);
void bootAccount();
})();

