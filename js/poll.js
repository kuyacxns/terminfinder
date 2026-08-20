import { supabase } from './supabaseClient.js';
import { formatDateGerman, isValidDateString, isValidName, MAX_NAME_LENGTH } from './utils.js';
import { computeResults, getTopResults } from './pollLogic.js';

const NAME_STORAGE_KEY = 'terminfinder-name';

const pollId = new URLSearchParams(window.location.search).get('id');

const els = {
  loading: document.getElementById('loading'),
  errorBox: document.getElementById('error-box'),
  content: document.getElementById('poll-content'),
  title: document.getElementById('poll-title'),
  description: document.getElementById('poll-description'),
  shareLink: document.getElementById('share-link'),
  copyLinkBtn: document.getElementById('copy-link-btn'),
  voteForm: document.getElementById('vote-form'),
  nameInput: document.getElementById('participant-name'),
  optionsList: document.getElementById('vote-options-list'),
  newDateInput: document.getElementById('new-date-input'),
  addDateBtn: document.getElementById('add-date-btn'),
  addDateStatus: document.getElementById('add-date-status'),
  voteStatus: document.getElementById('vote-status'),
  submitVoteBtn: document.getElementById('submit-vote-btn'),
  resultsList: document.getElementById('results-list'),
  resultsEmpty: document.getElementById('results-empty'),
};

let pollData = null; // { poll, date_options, responses }

init();

async function init() {
  if (!pollId || !isUuidLike(pollId)) {
    showError('Dieser Link ist ungültig. Bitte prüfe, ob du den vollständigen Link kopiert hast.');
    return;
  }

  els.shareLink.value = window.location.href;

  const nameFromStorage = safeLocalStorageGet(NAME_STORAGE_KEY);
  if (nameFromStorage) els.nameInput.value = nameFromStorage;

  await loadPoll();

  els.copyLinkBtn.addEventListener('click', copyShareLink);
  els.addDateBtn.addEventListener('click', handleAddDateOption);
  els.voteForm.addEventListener('submit', handleSubmitVote);
  els.nameInput.addEventListener('blur', () => {
    if (pollData) renderVoteOptions();
  });
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function loadPoll() {
  els.loading.classList.remove('hidden');
  els.errorBox.classList.add('hidden');

  const { data, error } = await supabase.rpc('get_poll_data', { p_poll_id: pollId });

  els.loading.classList.add('hidden');

  if (error) {
    showError('Die Umfrage konnte nicht geladen werden. Bitte versuch es später erneut.');
    return;
  }
  if (!data || !data.poll) {
    showError('Diese Umfrage wurde nicht gefunden. Prüfe, ob der Link vollständig ist.');
    return;
  }

  pollData = data;
  render();
  els.content.classList.remove('hidden');
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove('hidden');
  els.content.classList.add('hidden');
}

function render() {
  els.title.textContent = pollData.poll.title;
  if (pollData.poll.description) {
    els.description.textContent = pollData.poll.description;
    els.description.classList.remove('hidden');
  } else {
    els.description.classList.add('hidden');
  }

  renderVoteOptions();
  renderResults();
}

function renderVoteOptions() {
  els.optionsList.innerHTML = '';

  const currentName = els.nameInput.value.trim().toLowerCase();
  const existingResponse = currentName
    ? pollData.responses.find((r) => r.participant_name.trim().toLowerCase() === currentName)
    : null;
  const selectedIds = new Set(existingResponse ? existingResponse.date_option_ids : []);

  els.submitVoteBtn.textContent = existingResponse ? 'Stimme aktualisieren' : 'Abstimmen';

  const sortedOptions = [...pollData.date_options].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  for (const option of sortedOptions) {
    const voters = pollData.responses.filter((r) => r.date_option_ids.includes(option.id));

    const row = document.createElement('label');
    row.className = 'vote-option-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = option.id;
    checkbox.checked = selectedIds.has(option.id);
    checkbox.className = 'vote-checkbox';

    const textWrap = document.createElement('div');
    textWrap.className = 'vote-option-text';

    const dateEl = document.createElement('span');
    dateEl.className = 'vote-option-date';
    dateEl.textContent = formatDateGerman(option.date);

    const votersEl = document.createElement('span');
    votersEl.className = 'vote-option-voters';
    votersEl.textContent =
      voters.length > 0 ? `Bisher zugesagt: ${voters.map((v) => v.participant_name).join(', ')}` : 'Noch keine Zusagen';

    textWrap.append(dateEl, votersEl);
    row.append(checkbox, textWrap);
    els.optionsList.appendChild(row);
  }
}

function renderResults() {
  const results = computeResults(pollData.date_options, pollData.responses);
  const topResults = new Set(getTopResults(results, 3).map((r) => r.id));

  els.resultsList.innerHTML = '';

  if (results.every((r) => r.votes === 0)) {
    els.resultsEmpty.classList.remove('hidden');
  } else {
    els.resultsEmpty.classList.add('hidden');
  }

  for (const result of results) {
    const item = document.createElement('li');
    item.className = 'result-row';
    if (topResults.has(result.id)) {
      item.classList.add('result-top', `result-rank-${result.rank}`);
    }

    const rankEl = document.createElement('span');
    rankEl.className = 'result-rank';
    rankEl.textContent = topResults.has(result.id) ? `Platz ${result.rank}` : '';

    const mainEl = document.createElement('div');
    mainEl.className = 'result-main';

    const dateEl = document.createElement('span');
    dateEl.className = 'result-date';
    dateEl.textContent = formatDateGerman(result.date);

    const countEl = document.createElement('span');
    countEl.className = 'result-count';
    countEl.textContent = result.votes === 1 ? '1 Stimme' : `${result.votes} Stimmen`;

    const votersEl = document.createElement('span');
    votersEl.className = 'result-voters';
    votersEl.textContent = result.voters.length > 0 ? result.voters.join(', ') : 'Noch keine Stimmen';

    mainEl.append(dateEl, countEl, votersEl);
    item.append(rankEl, mainEl);
    els.resultsList.appendChild(item);
  }
}

async function handleAddDateOption() {
  const dateValue = els.newDateInput.value;
  if (!isValidDateString(dateValue)) {
    setAddDateStatus('Bitte wähle ein gültiges Datum.', true);
    return;
  }

  const proposedBy = els.nameInput.value.trim() || null;

  els.addDateBtn.disabled = true;
  setAddDateStatus('Wird hinzugefügt ...');

  const { error } = await supabase.rpc('add_date_option', {
    p_poll_id: pollId,
    p_date: dateValue,
    p_proposed_by: proposedBy,
  });

  els.addDateBtn.disabled = false;

  if (error) {
    setAddDateStatus('Der Terminvorschlag konnte nicht hinzugefügt werden.', true);
    return;
  }

  setAddDateStatus('Termin hinzugefügt!');
  els.newDateInput.value = '';
  await loadPoll();
}

function setAddDateStatus(message, isError = false) {
  els.addDateStatus.textContent = message;
  els.addDateStatus.classList.toggle('status-error', isError);
}

async function handleSubmitVote(event) {
  event.preventDefault();

  const name = els.nameInput.value.trim();
  if (!isValidName(name)) {
    setVoteStatus(`Bitte gib einen Namen ein (max. ${MAX_NAME_LENGTH} Zeichen).`, true);
    return;
  }

  const selectedIds = Array.from(els.optionsList.querySelectorAll('.vote-checkbox:checked')).map(
    (checkbox) => checkbox.value
  );

  els.submitVoteBtn.disabled = true;
  setVoteStatus('Deine Stimme wird gespeichert ...');

  const { error } = await supabase.rpc('submit_response', {
    p_poll_id: pollId,
    p_participant_name: name,
    p_date_option_ids: selectedIds,
  });

  els.submitVoteBtn.disabled = false;

  if (error) {
    setVoteStatus('Deine Stimme konnte nicht gespeichert werden. Bitte versuch es erneut.', true);
    return;
  }

  safeLocalStorageSet(NAME_STORAGE_KEY, name);
  setVoteStatus('Danke! Deine Stimme wurde gespeichert.');
  await loadPoll();
}

function setVoteStatus(message, isError = false) {
  els.voteStatus.textContent = message;
  els.voteStatus.classList.toggle('status-error', isError);
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
    // localStorage ist nur ein Komfort-Feature (Name vorausfüllen) – kein Problem, wenn es fehlschlägt.
  }
}
