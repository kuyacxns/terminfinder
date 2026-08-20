import { supabase } from './supabaseClient.js';
import { MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH } from './utils.js';

const form = document.getElementById('create-form');
const statusEl = document.getElementById('create-status');
const submitBtn = document.getElementById('submit-btn');
const createSection = document.getElementById('create-section');
const successSection = document.getElementById('success-section');
const shareLinkInput = document.getElementById('share-link');
const copyLinkBtn = document.getElementById('copy-link-btn');
const openCalendarLink = document.getElementById('open-calendar-link');

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
  if (!password) {
    setStatus('Bitte gib das Passwort ein.', true);
    return;
  }

  submitBtn.disabled = true;
  setStatus('Kalender wird angelegt ...');

  try {
    const { data, error } = await supabase.functions.invoke('create-calendar', {
      body: { title, description: description || null, password },
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
  return error?.message || 'Der Kalender konnte nicht angelegt werden.';
}

function showSuccess(calendarId) {
  const url = new URL('kalender.html', window.location.href);
  url.searchParams.set('id', calendarId);

  shareLinkInput.value = url.toString();
  openCalendarLink.href = url.toString();

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
