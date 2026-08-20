import { supabase } from './supabaseClient.js';
import { MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH } from './utils.js';

const form = document.getElementById('create-form');
const dateOptionsList = document.getElementById('date-options-list');
const addDateOptionBtn = document.getElementById('add-date-option-btn');
const statusEl = document.getElementById('create-status');
const submitBtn = document.getElementById('submit-btn');
const createSection = document.getElementById('create-section');
const successSection = document.getElementById('success-section');
const shareLinkInput = document.getElementById('share-link');
const copyLinkBtn = document.getElementById('copy-link-btn');
const openPollLink = document.getElementById('open-poll-link');

function addDateOptionRow() {
  const row = document.createElement('div');
  row.className = 'date-option-row';

  const input = document.createElement('input');
  input.type = 'date';
  input.required = true;
  input.className = 'date-option-input';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-btn';
  removeBtn.setAttribute('aria-label', 'Termin entfernen');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    row.remove();
    updateRemoveButtonsVisibility();
  });

  row.append(input, removeBtn);
  dateOptionsList.appendChild(row);
  updateRemoveButtonsVisibility();
}

function updateRemoveButtonsVisibility() {
  const rows = dateOptionsList.querySelectorAll('.date-option-row');
  rows.forEach((row) => {
    const btn = row.querySelector('.remove-btn');
    btn.style.visibility = rows.length > 1 ? 'visible' : 'hidden';
  });
}

addDateOptionBtn.addEventListener('click', addDateOptionRow);
addDateOptionRow();

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('status-error', isError);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  const title = form.title.value.trim();
  const description = form.description.value.trim();
  const password = form.password.value;

  if (!title) {
    setStatus('Bitte gib einen Titel ein.', true);
    return;
  }
  if (title.length > MAX_TITLE_LENGTH) {
    setStatus(`Der Titel darf höchstens ${MAX_TITLE_LENGTH} Zeichen lang sein.`, true);
    return;
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    setStatus(`Die Beschreibung darf höchstens ${MAX_DESCRIPTION_LENGTH} Zeichen lang sein.`, true);
    return;
  }

  const dateInputs = Array.from(dateOptionsList.querySelectorAll('.date-option-input'));
  const dateOptions = [...new Set(dateInputs.map((input) => input.value).filter(Boolean))];

  if (dateOptions.length === 0) {
    setStatus('Bitte gib mindestens einen gültigen Terminvorschlag an.', true);
    return;
  }
  if (!password) {
    setStatus('Bitte gib das Passwort ein.', true);
    return;
  }

  submitBtn.disabled = true;
  setStatus('Umfrage wird erstellt ...');

  try {
    const { data, error } = await supabase.functions.invoke('create-poll', {
      body: { title, description: description || null, password, dateOptions },
    });

    if (error) {
      throw new Error(await extractFunctionErrorMessage(error));
    }
    if (!data?.id) {
      throw new Error('Unerwartete Antwort vom Server.');
    }

    showSuccess(data.id);
  } catch (err) {
    setStatus(err.message || 'Etwas ist schiefgelaufen. Bitte versuch es erneut.', true);
  } finally {
    submitBtn.disabled = false;
  }
});

async function extractFunctionErrorMessage(error) {
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch (_err) {
    // Antwort konnte nicht als JSON gelesen werden -> Fallback unten.
  }
  return error?.message || 'Die Umfrage konnte nicht erstellt werden.';
}

function showSuccess(pollId) {
  const url = new URL('poll.html', window.location.href);
  url.searchParams.set('id', pollId);

  shareLinkInput.value = url.toString();
  openPollLink.href = url.toString();

  createSection.classList.add('hidden');
  successSection.classList.remove('hidden');
  successSection.scrollIntoView({ behavior: 'smooth' });
}

copyLinkBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareLinkInput.value);
    copyLinkBtn.textContent = 'Kopiert!';
    setTimeout(() => (copyLinkBtn.textContent = 'Link kopieren'), 2000);
  } catch (_err) {
    shareLinkInput.select();
    document.execCommand('copy');
  }
});
