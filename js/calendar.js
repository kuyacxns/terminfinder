import { supabase } from './supabaseClient.js';
import { formatDateGerman, isValidName, MAX_NAME_LENGTH } from './utils.js';
import {
  aggregateByDate,
  buildMonthGrid,
  getTopDays,
  ownDates,
  rankDays,
  shiftMonth,
  toLocalIsoDate,
  withOwnSelection,
} from './calendarLogic.js';

const NAME_STORAGE_KEY = 'terminfinder-name';

const calendarId = new URLSearchParams(window.location.search).get('id');

const els = {
  loading: document.getElementById('loading'),
  errorBox: document.getElementById('error-box'),
  content: document.getElementById('calendar-content'),
  title: document.getElementById('calendar-title'),
  description: document.getElementById('calendar-description'),
  shareLink: document.getElementById('share-link'),
  copyLinkBtn: document.getElementById('copy-link-btn'),
  nameInput: document.getElementById('participant-name'),
  prevMonthBtn: document.getElementById('prev-month-btn'),
  nextMonthBtn: document.getElementById('next-month-btn'),
  monthLabel: document.getElementById('month-label'),
  grid: document.getElementById('calendar-grid'),
  saveBtn: document.getElementById('save-btn'),
  saveStatus: document.getElementById('save-status'),
  overviewList: document.getElementById('overview-list'),
  overviewEmpty: document.getElementById('overview-empty'),
};

/** Vom Server geladener Stand: { calendar, availabilities: [{participant_name, date}] } */
let calendarData = null;
/** Eigene Auswahl inkl. noch nicht gespeicherter Änderungen. */
let selectedDates = new Set();
/** Gibt es ungespeicherte Änderungen? */
let hasUnsavedChanges = false;

const today = new Date();
const todayIso = toLocalIsoDate(today);
let view = { year: today.getFullYear(), month: today.getMonth() + 1 };

init();

async function init() {
  if (!calendarId || !isUuidLike(calendarId)) {
    showError('Dieser Link ist ungültig. Bitte prüfe, ob du den vollständigen Link kopiert hast.');
    return;
  }

  els.shareLink.value = window.location.href;

  const savedName = safeLocalStorageGet(NAME_STORAGE_KEY);
  if (savedName) els.nameInput.value = savedName;

  els.copyLinkBtn.addEventListener('click', copyShareLink);
  els.nameInput.addEventListener('input', handleNameChange);
  els.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  els.nextMonthBtn.addEventListener('click', () => changeMonth(1));
  els.saveBtn.addEventListener('click', handleSave);

  await loadCalendar();
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function loadCalendar() {
  els.loading.classList.remove('hidden');
  els.errorBox.classList.add('hidden');

  const { data, error } = await supabase.rpc('get_calendar_data', { p_calendar_id: calendarId });

  els.loading.classList.add('hidden');

  if (error) {
    showError('Der Kalender konnte nicht geladen werden. Bitte versuch es später erneut.');
    return;
  }
  if (!data || !data.calendar) {
    showError('Diesen Kalender gibt es nicht. Prüfe, ob der Link vollständig ist.');
    return;
  }

  calendarData = data;
  syncSelectionFromServer();
  render();
  els.content.classList.remove('hidden');
}

/** Übernimmt die gespeicherten Tage der aktuell eingetragenen Person. */
function syncSelectionFromServer() {
  selectedDates = ownDates(calendarData.availabilities, els.nameInput.value);
  hasUnsavedChanges = false;
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove('hidden');
  els.content.classList.add('hidden');
}

function handleNameChange() {
  // Beim Namenswechsel den Stand der neuen Person laden – ungespeicherte
  // Änderungen der vorherigen Person gehören nicht zu diesem Namen.
  syncSelectionFromServer();
  setSaveStatus('');
  render();
}

function changeMonth(delta) {
  view = shiftMonth(view.year, view.month, delta);
  renderGrid();
}

function render() {
  els.title.textContent = calendarData.calendar.title;
  if (calendarData.calendar.description) {
    els.description.textContent = calendarData.calendar.description;
    els.description.classList.remove('hidden');
  } else {
    els.description.classList.add('hidden');
  }

  renderGrid();
  renderOverview();
  updateSaveButton();
}

/** Aktueller Stand inkl. eigener, ggf. ungespeicherter Auswahl. */
function effectiveEntries() {
  return withOwnSelection(calendarData.availabilities, els.nameInput.value, selectedDates);
}

function renderGrid() {
  const byDate = aggregateByDate(effectiveEntries());

  els.monthLabel.textContent = new Date(Date.UTC(view.year, view.month - 1, 1)).toLocaleDateString(
    'de-DE',
    { month: 'long', year: 'numeric', timeZone: 'UTC' }
  );

  els.grid.innerHTML = '';

  for (const cell of buildMonthGrid(view.year, view.month)) {
    const dayInfo = byDate.get(cell.iso);
    const count = dayInfo ? dayInfo.count : 0;
    const isMine = selectedDates.has(cell.iso);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-cell';
    button.dataset.date = cell.iso;

    if (!cell.inCurrentMonth) {
      button.classList.add('is-outside');
      button.disabled = true;
    }
    if (cell.iso === todayIso) button.classList.add('is-today');
    if (isMine) button.classList.add('is-mine');
    else if (count > 0) button.classList.add('has-others');

    const dayNumber = document.createElement('span');
    dayNumber.className = 'cell-day';
    dayNumber.textContent = String(cell.day);
    button.appendChild(dayNumber);

    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'cell-count';
      badge.textContent = String(count);
      button.appendChild(badge);
    }

    const names = dayInfo ? dayInfo.names.join(', ') : 'Noch niemand';
    button.setAttribute(
      'aria-label',
      `${formatDateGerman(cell.iso)} – ${names}${isMine ? ' (du bist eingetragen)' : ''}`
    );
    button.title = names;

    if (cell.inCurrentMonth) {
      button.addEventListener('click', () => toggleDate(cell.iso));
    }

    els.grid.appendChild(button);
  }
}

function toggleDate(iso) {
  const name = els.nameInput.value.trim();
  if (!isValidName(name)) {
    setSaveStatus(`Bitte trag zuerst deinen Namen ein (max. ${MAX_NAME_LENGTH} Zeichen).`, true);
    els.nameInput.focus();
    return;
  }

  if (selectedDates.has(iso)) selectedDates.delete(iso);
  else selectedDates.add(iso);

  hasUnsavedChanges = true;
  setSaveStatus('');
  renderGrid();
  renderOverview();
  updateSaveButton();
}

function renderOverview() {
  const ranked = rankDays(effectiveEntries());
  const topDates = new Set(getTopDays(ranked, 3).map((day) => day.date));

  els.overviewEmpty.classList.toggle('hidden', ranked.length > 0);
  els.overviewList.innerHTML = '';

  for (const day of ranked) {
    const item = document.createElement('li');
    item.className = 'overview-row';
    if (topDates.has(day.date)) {
      item.classList.add('overview-top', `overview-rank-${day.rank}`);
    }

    const rankEl = document.createElement('span');
    rankEl.className = 'overview-rank';
    rankEl.textContent = topDates.has(day.date) ? `Platz ${day.rank}` : '';

    const main = document.createElement('div');
    main.className = 'overview-main';

    const dateEl = document.createElement('span');
    dateEl.className = 'overview-date';
    dateEl.textContent = formatDateGerman(day.date);

    const countEl = document.createElement('span');
    countEl.className = 'overview-count';
    countEl.textContent = day.count === 1 ? '1 Person hat Zeit' : `${day.count} Personen haben Zeit`;

    const namesEl = document.createElement('span');
    namesEl.className = 'overview-names';
    namesEl.textContent = day.names.join(', ');

    main.append(dateEl, countEl, namesEl);
    item.append(rankEl, main);
    els.overviewList.appendChild(item);
  }
}

function updateSaveButton() {
  const name = els.nameInput.value.trim();

  if (!isValidName(name)) {
    els.saveBtn.disabled = true;
    els.saveBtn.textContent = 'Zuerst Namen eintragen';
    return;
  }
  els.saveBtn.disabled = !hasUnsavedChanges;
  els.saveBtn.textContent = hasUnsavedChanges ? 'Änderungen speichern' : 'Alles gespeichert';
}

async function handleSave() {
  const name = els.nameInput.value.trim();
  if (!isValidName(name)) {
    setSaveStatus(`Bitte trag zuerst deinen Namen ein (max. ${MAX_NAME_LENGTH} Zeichen).`, true);
    return;
  }

  els.saveBtn.disabled = true;
  setSaveStatus('Wird gespeichert ...');

  const { error } = await supabase.rpc('set_availability', {
    p_calendar_id: calendarId,
    p_participant_name: name,
    p_dates: [...selectedDates].sort(),
  });

  if (error) {
    setSaveStatus('Das hat leider nicht geklappt. Bitte versuch es erneut.', true);
    updateSaveButton();
    return;
  }

  safeLocalStorageSet(NAME_STORAGE_KEY, name);
  await loadCalendar();
  setSaveStatus('Gespeichert – die anderen sehen deine Tage jetzt auch.');
}

function setSaveStatus(message, isError = false) {
  els.saveStatus.textContent = message;
  els.saveStatus.classList.toggle('status-error', isError);
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(els.shareLink.value);
    els.copyLinkBtn.textContent = 'Kopiert!';
    setTimeout(() => (els.copyLinkBtn.textContent = 'Link kopieren'), 2000);
  } catch (_err) {
    els.shareLink.select();
    document.execCommand('copy');
  }
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_err) {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_err) {
    // localStorage ist nur Komfort (Name vorausfüllen) – Fehler sind unkritisch.
  }
}
