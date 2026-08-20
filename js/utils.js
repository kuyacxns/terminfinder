// Kleine, reine Hilfsfunktionen für Validierung und Formatierung.
// Bewusst ohne Abhängigkeiten, damit sie sowohl im Browser als auch in den
// Node-Tests (tests/) unverändert funktionieren.
//
// Hinweis zum XSS-Schutz: Es gibt hier bewusst keine escapeHtml-Funktion.
// Die Oberfläche baut kein HTML aus Nutzereingaben zusammen, sondern setzt
// Namen und Notizen ausschließlich über textContent bzw. DOM-APIs – damit
// wird eingegebener Text nie als HTML interpretiert.

export const MAX_NAME_LENGTH = 40;
export const MIN_NAME_LENGTH = 2;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NOTE_LENGTH = 500;

/**
 * Technische Domain für die Anmeldung. Sie wird nie angeschrieben – siehe
 * nameToAuthEmail(). `example.com` ist laut RFC 2606 für genau solche
 * Zwecke reserviert und wird von jeder E-Mail-Prüfung akzeptiert.
 */
const AUTH_EMAIL_DOMAIN = 'example.com';

/**
 * Einfacher, stabiler String-Hash (FNV-1a-Variante). Muss nicht
 * kryptografisch sein – er soll denselben Text nur immer auf dieselbe Zahl
 * abbilden, auch über Browser und Sitzungen hinweg.
 */
export function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Formatiert ein ISO-Datum (YYYY-MM-DD) als "Di., 01.09.2026". */
export function formatDateGerman(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Formatiert ein ISO-Datum ausführlich, z. B. "Dienstag, 1. September". */
export function formatDateLong(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Monatsname + Jahr für die Kalender-Kopfzeile, z. B. "September 2026". */
export function formatMonthLabel(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Kürzt Postgres-Zeiten ("18:00:00") auf die Anzeigeform ("18:00"). */
export function formatTime(time) {
  if (!time) return '';
  return String(time).slice(0, 5);
}

/**
 * Beschreibt, wann jemand an einem Tag Zeit hat.
 * "ganztägig" | "ab 18:00" | "18:00 – 21:00"
 */
export function formatAvailabilityTime(entry) {
  if (entry.all_day || !entry.start_time) return 'ganztägig';
  if (!entry.end_time) return `ab ${formatTime(entry.start_time)}`;
  return `${formatTime(entry.start_time)} – ${formatTime(entry.end_time)}`;
}

/** Vereinheitlicht Schreibweisen: außen trimmen, innen Leerraum zusammenfassen. */
export function canonicalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Prüft einen Anzeigenamen. Künstlernamen sind ausdrücklich erlaubt – es
 * geht nur darum, Unsinn wie leere Namen oder Romane abzufangen.
 */
export function validateDisplayName(value) {
  const name = canonicalizeName(value);
  if (name.length < MIN_NAME_LENGTH) {
    return { ok: false, error: `Dein Name braucht mindestens ${MIN_NAME_LENGTH} Zeichen.` };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Dein Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.` };
  }
  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, error: 'Dein Name braucht mindestens einen Buchstaben oder eine Zahl.' };
  }
  return { ok: true, value: name };
}

export function validatePassword(value) {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Dein Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.` };
  }
  return { ok: true, value: password };
}

/** Reduziert einen Namen auf a–z, 0–9 und "-" (kann leer herauskommen). */
export function nameToSlug(name) {
  return canonicalizeName(name)
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    // Kombinierende Akzente entfernen (é -> e), damit daraus kein "-" wird.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Baut aus dem Anzeigenamen eine stabile Kennung für die Anmeldung.
 *
 * Hintergrund: Supabase Auth meldet Accounts über eine E-Mail-Adresse an,
 * wir wollen aber ausdrücklich keine E-Mail abfragen. Deshalb erzeugen wir
 * aus dem Namen deterministisch eine technische Adresse. Dadurch kann sich
 * dieselbe Person später mit genau demselben Namen wieder anmelden, ohne
 * dass wir vor dem Login die Datenbank durchsuchen müssten (was fremde
 * Namen verraten würde). An diese Adresse wird nie eine Mail geschickt.
 *
 * Der angehängte Hash sorgt dafür, dass unterschiedliche Namen auch dann
 * unterschiedliche Accounts ergeben, wenn ihre Kurzform zufällig gleich ist
 * ("Anna Müller" vs. "Anna-Mueller") oder wenn der Name gar keine
 * lateinischen Zeichen enthält und die Kurzform leer bliebe.
 */
export function nameToAuthEmail(name) {
  const canonical = canonicalizeName(name).toLowerCase();
  const slug = nameToSlug(canonical) || 'nutzer';
  return `${slug}-${hashString(canonical).toString(36)}@${AUTH_EMAIL_DOMAIN}`;
}
