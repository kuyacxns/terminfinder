// Steuerung der App: Anmeldung, Kalenderansicht, Tagesdetails, Rangliste.
//
// Gerendert wird ausschließlich über DOM-APIs (createElement/textContent),
// niemals über innerHTML mit Nutzerdaten – damit kann eingegebener Text
// nicht als HTML ausgeführt werden.

import { supabase } from './supabaseClient.js';
import { ensureProfile, getSession, login, logout, register, updateAvatar } from './auth.js';
import { AVATAR_COLORS, AVATAR_EMOJIS } from './avatar.js';
import {
  aggregateByDate,
  buildMonthGrid,
  getTopDays,
  isEmptyEntry,
  ownEntryFor,
  rankDays,
  shiftMonth,
  toLocalIsoDate,
} from './calendarLogic.js';
import {
  MAX_NOTE_LENGTH,
  formatAvailabilityTime,
  formatDateLong,
  formatMonthLabel,
  formatTime,
  validateDisplayName,
  validatePassword,
} from './utils.js';

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const el = (id) => document.getElementById(id);

const ui = {
  authView: el('auth-view'),
  appView: el('app-view'),
  authForm: el('auth-form'),
  authName: el('auth-name'),
  authPassword: el('auth-password'),
  authSubmit: el('auth-submit'),
  authStatus: el('auth-status'),
  authTabs: document.querySelectorAll('.auth-tab'),
  authHint: el('auth-hint'),

  meAvatar: el('me-avatar'),
  meName: el('me-name'),
  profileBtn: el('profile-btn'),
  logoutBtn: el('logout-btn'),
  profilePanel: el('profile-panel'),
  emojiChoices: el('emoji-choices'),
  colorChoices: el('color-choices'),
  profileStatus: el('profile-status'),

  monthLabel: el('month-label'),
  prevMonth: el('prev-month'),
  nextMonth: el('next-month'),
  todayBtn: el('today-btn'),
  weekdays: el('calendar-weekdays'),
  grid: el('calendar-grid'),

  dayPanel: el('day-panel'),
  dayTitle: el('day-title'),
  availableToggle: el('available-toggle'),
  timeFields: el('time-fields'),
  allDayToggle: el('all-day-toggle'),
  timeInputs: el('time-inputs'),
  startTime: el('start-time'),
  endTime: el('end-time'),
  noteInput: el('note-input'),
  noteCounter: el('note-counter'),
  saveDayBtn: el('save-day-btn'),
  dayStatus: el('day-status'),
  dayPeople: el('day-people'),

  ranking: el('ranking-list'),
  rankingEmpty: el('ranking-empty'),
};

const state = {
  mode: 'login', // 'login' | 'register'
  profile: null,
  entries: [],
  year: 0,
  month: 0,
  selectedDate: null,
  draft: null, // ungespeicherte Änderungen für den gewählten Tag
};

const today = toLocalIsoDate(new Date());

init();

async function init() {
  try {
    await boot();
  } catch (err) {
    const bootText = el('boot-text');
    if (bootText) {
      bootText.textContent =
        'Die App konnte nicht gestartet werden. Bitte lade die Seite neu. ' +
        `(${err?.message ?? 'unbekannter Fehler'})`;
      el('boot').classList.add('boot-error');
    }
  }
}

async function boot() {
  renderWeekdayHeader();
  wireAuth();
  wireCalendar();
  wireDayPanel();
  wireProfile();

  const [year, month] = today.split('-').map(Number);
  state.year = year;
  state.month = month;

  const session = await getSession();
  el('boot').classList.add('hidden');

  if (session) {
    await startApp();
  } else {
    showAuth();
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showAuth();
  });
}

// ---------------------------------------------------------------- Anmeldung

function wireAuth() {
  ui.authTabs.forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
  });

  ui.authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(ui.authStatus, '');

    const nameCheck = validateDisplayName(ui.authName.value);
    if (!nameCheck.ok) return setStatus(ui.authStatus, nameCheck.error, true);

    const passwordCheck = validatePassword(ui.authPassword.value);
    if (!passwordCheck.ok) return setStatus(ui.authStatus, passwordCheck.error, true);

    ui.authSubmit.disabled = true;
    setStatus(ui.authStatus, state.mode === 'register' ? 'Account wird angelegt ...' : 'Anmelden ...');

    try {
      if (state.mode === 'register') {
        await register(nameCheck.value, passwordCheck.value);
      } else {
        await login(nameCheck.value, passwordCheck.value);
      }
      ui.authForm.reset();
      setStatus(ui.authStatus, '');
      await startApp();
    } catch (err) {
      setStatus(ui.authStatus, err.message, true);
    } finally {
      ui.authSubmit.disabled = false;
    }
  });
}

function setAuthMode(mode) {
  state.mode = mode;
  ui.authTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  ui.authSubmit.textContent = mode === 'register' ? 'Account anlegen' : 'Anmelden';
  ui.authPassword.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  ui.authHint.textContent =
    mode === 'register'
      ? 'Nimm ruhig einen Künstlernamen – eine E-Mail-Adresse brauchst du nicht. Dein Profilbild bekommst du automatisch.'
      : 'Melde dich mit dem Namen an, mit dem du deinen Account angelegt hast.';
  setStatus(ui.authStatus, '');
}

function showAuth() {
  state.profile = null;
  state.entries = [];
  ui.appView.classList.add('hidden');
  ui.authView.classList.remove('hidden');
  // Bewusst immer "Anmelden": Wer gerade abgemeldet hat oder frisch
  // herkommt, will sich in aller Regel anmelden – nicht neu registrieren.
  setAuthMode('login');
}

async function startApp() {
  state.profile = await ensureProfile();
  ui.authView.classList.add('hidden');
  ui.appView.classList.remove('hidden');
  renderMe();
  await loadEntries();
}

// ------------------------------------------------------------------- Profil

function wireProfile() {
  ui.logoutBtn.addEventListener('click', async () => {
    await logout();
    showAuth();
  });

  ui.profileBtn.addEventListener('click', () => {
    ui.profilePanel.classList.toggle('hidden');
    if (!ui.profilePanel.classList.contains('hidden')) renderProfileChoices();
  });
}

function renderMe() {
  ui.meAvatar.replaceChildren(buildAvatar(state.profile, 'lg'));
  ui.meName.textContent = state.profile.display_name;
}

function renderProfileChoices() {
  ui.emojiChoices.replaceChildren();
  for (const emoji of AVATAR_EMOJIS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-chip';
    button.textContent = emoji;
    button.setAttribute('aria-label', `Profilbild ${emoji}`);
    button.classList.toggle('is-active', emoji === state.profile.avatar_emoji);
    button.addEventListener('click', () => saveAvatar({ emoji, color: state.profile.avatar_color }));
    ui.emojiChoices.appendChild(button);
  }

  ui.colorChoices.replaceChildren();
  for (const color of AVATAR_COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-swatch';
    button.style.background = color;
    button.setAttribute('aria-label', `Farbe ${color}`);
    button.classList.toggle('is-active', color.toLowerCase() === state.profile.avatar_color.toLowerCase());
    button.addEventListener('click', () => saveAvatar({ emoji: state.profile.avatar_emoji, color }));
    ui.colorChoices.appendChild(button);
  }
}

async function saveAvatar(avatar) {
  setStatus(ui.profileStatus, 'Wird gespeichert ...');
  try {
    state.profile = await updateAvatar(state.profile.id, avatar);
    renderMe();
    renderProfileChoices();
    render();
    setStatus(ui.profileStatus, 'Gespeichert!');
  } catch (err) {
    setStatus(ui.profileStatus, err.message, true);
  }
}

// -------------------------------------------------------------------- Daten

async function loadEntries() {
  const { data, error } = await supabase
    .from('day_entries')
    .select(
      'user_id, date, is_available, all_day, start_time, end_time, note, profiles(display_name, avatar_emoji, avatar_color)'
    );

  if (error) {
    setStatus(ui.dayStatus, 'Die Einträge konnten nicht geladen werden.', true);
    return;
  }

  state.entries = data ?? [];
  render();
}

// ------------------------------------------------------------------ Kalender

function wireCalendar() {
  ui.prevMonth.addEventListener('click', () => moveMonth(-1));
  ui.nextMonth.addEventListener('click', () => moveMonth(1));
  ui.todayBtn.addEventListener('click', () => {
    const [year, month] = today.split('-').map(Number);
    state.year = year;
    state.month = month;
    selectDay(today, { toggle: false });
  });
}

function moveMonth(delta) {
  const next = shiftMonth(state.year, state.month, delta);
  state.year = next.year;
  state.month = next.month;
  render();
}

function renderWeekdayHeader() {
  ui.weekdays.replaceChildren();
  WEEKDAY_LABELS.forEach((label, index) => {
    const cell = document.createElement('div');
    cell.className = 'weekday';
    if (index >= 5) cell.classList.add('is-weekend');
    cell.textContent = label;
    ui.weekdays.appendChild(cell);
  });
}

function render() {
  ui.monthLabel.textContent = formatMonthLabel(state.year, state.month);
  renderGrid();
  renderRanking();
  renderDayPanel();
}

function renderGrid() {
  const byDate = aggregateByDate(state.entries);
  const cells = buildMonthGrid(state.year, state.month);

  ui.grid.replaceChildren();

  for (const cell of cells) {
    const day = byDate.get(cell.iso);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day-cell';
    button.dataset.date = cell.iso;

    if (!cell.inCurrentMonth) button.classList.add('is-outside');
    if (cell.weekend) button.classList.add('is-weekend');
    if (cell.iso === today) button.classList.add('is-today');
    if (cell.iso === state.selectedDate) button.classList.add('is-selected');

    const count = day?.count ?? 0;
    if (count > 0) {
      button.classList.add('has-people');
      button.classList.add(`level-${Math.min(count, 4)}`);
    }
    if (isOwnAvailable(cell.iso)) button.classList.add('is-mine');

    const number = document.createElement('span');
    number.className = 'day-number';
    number.textContent = String(cell.day);
    button.appendChild(number);

    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'day-count';
      badge.textContent = String(count);
      button.appendChild(badge);
    }

    if (day?.notes.length) {
      const noteMark = document.createElement('span');
      noteMark.className = 'day-note-mark';
      noteMark.textContent = '📝';
      button.appendChild(noteMark);
    }

    const label = `${formatDateLong(cell.iso)}: ${
      count === 1 ? '1 Person hat Zeit' : `${count} Personen haben Zeit`
    }`;
    button.setAttribute('aria-label', label);

    button.addEventListener('click', () => selectDay(cell.iso, { toggle: true }));
    ui.grid.appendChild(button);
  }
}

function isOwnAvailable(isoDate) {
  if (state.selectedDate === isoDate && state.draft) return state.draft.is_available;
  return state.entries.some(
    (entry) => entry.user_id === state.profile?.id && entry.date === isoDate && entry.is_available
  );
}

/**
 * Ein Tipp auf einen Tag macht zwei Dinge gleichzeitig: Er trägt einen
 * direkt ein bzw. aus (das ist der häufigste Fall und soll mit einem Tipp
 * gehen) und öffnet darunter die Details für Uhrzeit und Notiz.
 */
function selectDay(isoDate, { toggle }) {
  const switchingDay = state.selectedDate !== isoDate;

  if (switchingDay) {
    state.selectedDate = isoDate;
    state.draft = { ...ownEntryFor(state.entries, state.profile.id, isoDate) };
  }
  if (toggle) {
    state.draft.is_available = !state.draft.is_available;
  }

  render();
  ui.dayPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --------------------------------------------------------------- Tagesdetail

function wireDayPanel() {
  ui.availableToggle.addEventListener('change', () => {
    state.draft.is_available = ui.availableToggle.checked;
    renderDayPanel();
    renderGrid();
    renderRanking();
  });

  ui.allDayToggle.addEventListener('change', () => {
    state.draft.all_day = ui.allDayToggle.checked;
    if (state.draft.all_day) {
      state.draft.start_time = null;
      state.draft.end_time = null;
    } else if (!state.draft.start_time) {
      state.draft.start_time = '18:00';
    }
    renderDayPanel();
  });

  ui.startTime.addEventListener('change', () => {
    state.draft.start_time = ui.startTime.value || null;
  });
  ui.endTime.addEventListener('change', () => {
    state.draft.end_time = ui.endTime.value || null;
  });

  ui.noteInput.addEventListener('input', () => {
    state.draft.note = ui.noteInput.value;
    ui.noteCounter.textContent = `${ui.noteInput.value.length}/${MAX_NOTE_LENGTH}`;
  });

  ui.saveDayBtn.addEventListener('click', saveDay);
}

function renderDayPanel() {
  if (!state.selectedDate || !state.draft) {
    ui.dayPanel.classList.add('is-empty');
    ui.dayTitle.textContent = 'Tippe einen Tag an';
    ui.dayPeople.replaceChildren();
    return;
  }

  ui.dayPanel.classList.remove('is-empty');
  ui.dayTitle.textContent = formatDateLong(state.selectedDate);

  ui.availableToggle.checked = state.draft.is_available;
  ui.timeFields.classList.toggle('hidden', !state.draft.is_available);
  ui.allDayToggle.checked = state.draft.all_day !== false;
  ui.timeInputs.classList.toggle('hidden', state.draft.all_day !== false);
  ui.startTime.value = formatTime(state.draft.start_time);
  ui.endTime.value = formatTime(state.draft.end_time);
  ui.noteInput.value = state.draft.note ?? '';
  ui.noteCounter.textContent = `${(state.draft.note ?? '').length}/${MAX_NOTE_LENGTH}`;

  renderDayPeople();
}

function renderDayPeople() {
  const day = aggregateByDate(state.entries).get(state.selectedDate);
  ui.dayPeople.replaceChildren();

  const available = (day?.available ?? []).filter((entry) => entry.user_id !== state.profile.id);
  const notes = (day?.notes ?? []).filter((entry) => entry.user_id !== state.profile.id);

  if (available.length === 0 && notes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Sonst hat sich für diesen Tag noch niemand eingetragen.';
    ui.dayPeople.appendChild(empty);
    return;
  }

  if (available.length > 0) {
    ui.dayPeople.appendChild(sectionTitle('Hat Zeit'));
    const list = document.createElement('ul');
    list.className = 'people-list';
    for (const entry of available) {
      list.appendChild(personRow(entry, formatAvailabilityTime(entry)));
    }
    ui.dayPeople.appendChild(list);
  }

  if (notes.length > 0) {
    ui.dayPeople.appendChild(sectionTitle('Notizen'));
    const list = document.createElement('ul');
    list.className = 'people-list';
    for (const entry of notes) {
      list.appendChild(personRow(entry, entry.note, true));
    }
    ui.dayPeople.appendChild(list);
  }
}

function sectionTitle(text) {
  const title = document.createElement('h4');
  title.className = 'section-title';
  title.textContent = text;
  return title;
}

function personRow(entry, detail, isNote = false) {
  const item = document.createElement('li');
  item.className = 'person-row';
  item.appendChild(buildAvatar(entry.profiles, 'sm'));

  const text = document.createElement('div');
  text.className = 'person-text';

  const name = document.createElement('span');
  name.className = 'person-name';
  name.textContent = entry.profiles?.display_name ?? 'Unbekannt';
  text.appendChild(name);

  const info = document.createElement('span');
  info.className = isNote ? 'person-note' : 'person-time';
  info.textContent = detail;
  text.appendChild(info);

  item.appendChild(text);
  return item;
}

async function saveDay() {
  if (!state.selectedDate || !state.draft) return;

  const draft = state.draft;
  if (draft.is_available && !draft.all_day && !draft.start_time) {
    return setStatus(ui.dayStatus, 'Bitte gib eine Startzeit an – oder wähle "ganzer Tag".', true);
  }
  if (draft.start_time && draft.end_time && draft.end_time <= draft.start_time) {
    return setStatus(ui.dayStatus, 'Das Ende muss nach dem Start liegen.', true);
  }
  if ((draft.note ?? '').length > MAX_NOTE_LENGTH) {
    return setStatus(ui.dayStatus, `Die Notiz darf höchstens ${MAX_NOTE_LENGTH} Zeichen lang sein.`, true);
  }

  ui.saveDayBtn.disabled = true;
  setStatus(ui.dayStatus, 'Wird gespeichert ...');

  try {
    if (isEmptyEntry(draft)) {
      const { error } = await supabase
        .from('day_entries')
        .delete()
        .eq('user_id', state.profile.id)
        .eq('date', draft.date);
      if (error) throw error;
    } else {
      const payload = {
        user_id: state.profile.id,
        date: draft.date,
        is_available: draft.is_available,
        all_day: draft.is_available ? draft.all_day !== false : true,
        start_time: draft.is_available && draft.all_day === false ? draft.start_time : null,
        end_time: draft.is_available && draft.all_day === false ? draft.end_time || null : null,
        note: (draft.note ?? '').trim() || null,
      };
      const { error } = await supabase
        .from('day_entries')
        .upsert(payload, { onConflict: 'user_id,date' });
      if (error) throw error;
    }

    setStatus(ui.dayStatus, 'Gespeichert!');
    await loadEntries();
    state.draft = { ...ownEntryFor(state.entries, state.profile.id, state.selectedDate) };
    renderDayPanel();
  } catch (_err) {
    setStatus(ui.dayStatus, 'Das Speichern hat nicht geklappt. Bitte versuch es erneut.', true);
  } finally {
    ui.saveDayBtn.disabled = false;
  }
}

// ------------------------------------------------------------------ Rangliste

function renderRanking() {
  const entries = draftAwareEntries();
  const ranked = rankDays(entries, { from: today });
  const top = new Set(getTopDays(ranked, 3).map((day) => day.date));

  ui.ranking.replaceChildren();
  ui.rankingEmpty.classList.toggle('hidden', ranked.length > 0);

  for (const day of ranked.slice(0, 12)) {
    const item = document.createElement('li');
    item.className = 'rank-row';
    if (top.has(day.date)) item.classList.add('is-top', `rank-${day.rank}`);

    const rank = document.createElement('span');
    rank.className = 'rank-badge';
    rank.textContent = top.has(day.date) ? `#${day.rank}` : '';
    item.appendChild(rank);

    const main = document.createElement('div');
    main.className = 'rank-main';

    const date = document.createElement('span');
    date.className = 'rank-date';
    date.textContent = formatDateLong(day.date);
    main.appendChild(date);

    const count = document.createElement('span');
    count.className = 'rank-count';
    count.textContent = day.count === 1 ? '1 Person hat Zeit' : `${day.count} Personen haben Zeit`;
    main.appendChild(count);

    const avatars = document.createElement('div');
    avatars.className = 'rank-avatars';
    for (const entry of day.available) {
      const avatar = buildAvatar(entry.profiles, 'sm');
      avatar.title = `${entry.profiles?.display_name ?? ''} (${formatAvailabilityTime(entry)})`;
      avatars.appendChild(avatar);
    }
    main.appendChild(avatars);

    item.appendChild(main);

    item.addEventListener('click', () => {
      const [year, month] = day.date.split('-').map(Number);
      state.year = year;
      state.month = month;
      selectDay(day.date, { toggle: false });
    });

    ui.ranking.appendChild(item);
  }
}

/**
 * Rangliste und Kalender sollen sofort auf Änderungen reagieren, auch wenn
 * sie noch nicht gespeichert sind – sonst wirkt die Oberfläche träge.
 */
function draftAwareEntries() {
  if (!state.selectedDate || !state.draft || !state.profile) return state.entries;

  const others = state.entries.filter(
    (entry) => !(entry.user_id === state.profile.id && entry.date === state.selectedDate)
  );
  if (isEmptyEntry(state.draft)) return others;

  return [...others, { ...state.draft, profiles: profileSummary(state.profile) }];
}

function profileSummary(profile) {
  return {
    display_name: profile.display_name,
    avatar_emoji: profile.avatar_emoji,
    avatar_color: profile.avatar_color,
  };
}

// ------------------------------------------------------------------ Bausteine

function buildAvatar(profile, size = 'md') {
  const avatar = document.createElement('span');
  avatar.className = `avatar avatar-${size}`;
  avatar.style.background = profile?.avatar_color ?? '#6366f1';
  avatar.textContent = profile?.avatar_emoji ?? '🙂';
  return avatar;
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('status-error', isError);
}
