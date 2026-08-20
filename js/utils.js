// Kleine, reine Hilfsfunktionen für Validierung, Escaping und Formatierung.
// Bewusst ohne Abhängigkeiten, damit sie sowohl im Browser als auch in den
// Node-Tests (tests/) unverändert funktionieren.

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_NAME_LENGTH = 100;

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

export function formatDateGerman(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function isValidName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_NAME_LENGTH;
}
