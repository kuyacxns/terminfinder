// Kleine, reine Hilfsfunktionen für Validierung und Formatierung.
// Bewusst ohne Abhängigkeiten, damit sie sowohl im Browser als auch in den
// Node-Tests (tests/) unverändert funktionieren.
//
// Hinweis zum XSS-Schutz: Es gibt hier bewusst keine escapeHtml-Funktion.
// Die Oberfläche baut kein HTML aus Nutzereingaben zusammen, sondern setzt
// Namen, Titel und Beschreibungen ausschließlich über textContent bzw.
// DOM-APIs – damit wird eingegebener Text nie als HTML interpretiert.

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_NAME_LENGTH = 100;

/** Formatiert ein ISO-Datum (YYYY-MM-DD) als "Di., 01.09.2026". */
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
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_NAME_LENGTH
  );
}
