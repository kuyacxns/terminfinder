// Reine Berechnungs-Logik rund um den gemeinsamen Kalender – unabhängig von
// Backend und DOM, damit sie sich einfach automatisiert testen lässt
// (siehe tests/calendarLogic.test.js).
//
// Ein "Eintrag" (day_entry) hat die Form:
//   { user_id, date, is_available, all_day, start_time, end_time, note,
//     profiles: { display_name, avatar_emoji, avatar_color } }

const MS_PER_DAY = 86400000;

/** Wandelt ein Date-Objekt anhand seiner UTC-Anteile in YYYY-MM-DD um. */
export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Wandelt ein Date-Objekt anhand der lokalen Zeitzone in YYYY-MM-DD um.
 * Für "heute" ist das die richtige Wahl: Um 00:30 Uhr deutscher Zeit wäre
 * das UTC-Datum noch der Vortag – der Kalender würde dann den falschen Tag
 * markieren bzw. am Monatsanfang den falschen Monat öffnen.
 */
export function toLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Samstag oder Sonntag? (Grundlage für die bunte Wochenend-Markierung.) */
export function isWeekend(isoDate) {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Fasst alle Einträge pro Tag zusammen.
 *
 * `available` enthält nur die Leute, die an dem Tag Zeit haben,
 * `notes` alle Notizen – auch von Leuten ohne Zeit, denn eine Notiz soll
 * ausdrücklich unabhängig von der Verfügbarkeit möglich sein.
 *
 * @param {object[]} entries
 * @returns {Map<string, {date:string, count:number, available:object[], notes:object[]}>}
 */
export function aggregateByDate(entries) {
  const byDate = new Map();

  for (const entry of entries) {
    let day = byDate.get(entry.date);
    if (!day) {
      day = { date: entry.date, count: 0, available: [], notes: [] };
      byDate.set(entry.date, day);
    }
    if (entry.is_available) {
      day.available.push(entry);
      day.count += 1;
    }
    if (entry.note && entry.note.trim()) {
      day.notes.push(entry);
    }
  }

  const byName = (a, b) => displayName(a).localeCompare(displayName(b), 'de');
  for (const day of byDate.values()) {
    day.available.sort(byName);
    day.notes.sort(byName);
  }
  return byDate;
}

function displayName(entry) {
  return entry.profiles?.display_name ?? '';
}

/**
 * Sortiert die Tage absteigend nach Anzahl Personen (bei Gleichstand nach
 * Datum aufsteigend) und vergibt einen "dense rank" (1, 2, 2, 3, ...), damit
 * Plätze bei Gleichstand nicht übersprungen werden.
 *
 * Tage ohne Verfügbarkeiten (also reine Notiz-Tage) tauchen in der
 * Rangliste nicht auf – dort geht es darum, wann die meisten Zeit haben.
 *
 * @param {object[]} entries
 * @param {{from?: string}} [options] `from` blendet frühere Tage aus
 */
export function rankDays(entries, options = {}) {
  const { from } = options;

  const days = Array.from(aggregateByDate(entries).values())
    .filter((day) => day.count > 0)
    .filter((day) => !from || day.date >= from);

  days.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  let rank = 0;
  let lastCount = null;
  return days.map((day) => {
    if (day.count !== lastCount) {
      rank += 1;
      lastCount = day.count;
    }
    return { ...day, rank };
  });
}

/**
 * Liefert die Tage, an denen die meisten Leute Zeit haben. Bei Gleichstand um
 * den letzten Platz werden alle gleichauf liegenden Tage mit ausgegeben
 * (dense ranking), statt willkürlich einen davon wegzulassen.
 *
 * @param {ReturnType<typeof rankDays>} ranked
 * @param {number} topN
 */
export function getTopDays(ranked, topN = 3) {
  return ranked.filter((day) => day.rank <= topN);
}

/**
 * Baut das Raster für die Monatsansicht: immer 6 Wochen à 7 Tage (42 Zellen),
 * beginnend am Montag. Tage aus dem Vor-/Folgemonat sind mit
 * `inCurrentMonth: false` markiert, damit die Kalenderhöhe stabil bleibt.
 *
 * Gerechnet wird durchgehend in UTC – dadurch gibt es keine
 * Sommerzeit-Sprünge, und die ISO-Strings passen zum `date`-Typ in Postgres.
 *
 * @param {number} year
 * @param {number} month 1–12
 */
export function buildMonthGrid(year, month) {
  const firstOfMonth = Date.UTC(year, month - 1, 1);
  // getUTCDay(): 0 = Sonntag. Wir wollen Montag als ersten Wochentag.
  const leadingDays = (new Date(firstOfMonth).getUTCDay() + 6) % 7;
  const gridStart = firstOfMonth - leadingDays * MS_PER_DAY;

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart + i * MS_PER_DAY);
    const iso = toIsoDate(date);
    cells.push({
      iso,
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month - 1,
      weekend: isWeekend(iso),
    });
  }
  return cells;
}

/** Verschiebt einen Monat um `delta` Monate (mit Jahreswechsel). */
export function shiftMonth(year, month, delta) {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/**
 * Findet den eigenen Eintrag für einen Tag – oder gibt einen leeren
 * Standard-Eintrag zurück, damit die Oberfläche immer mit derselben Form
 * arbeiten kann.
 */
export function ownEntryFor(entries, userId, isoDate) {
  const found = entries.find((entry) => entry.user_id === userId && entry.date === isoDate);
  return (
    found ?? {
      user_id: userId,
      date: isoDate,
      is_available: false,
      all_day: true,
      start_time: null,
      end_time: null,
      note: '',
    }
  );
}

/** Alle Tage, an denen die genannte Person Zeit hat. */
export function ownAvailableDates(entries, userId) {
  return new Set(
    entries.filter((entry) => entry.user_id === userId && entry.is_available).map((e) => e.date)
  );
}

/**
 * Ist der Eintrag komplett leer (keine Zeit, keine Notiz)? Solche Zeilen
 * werden beim Speichern gelöscht statt angelegt.
 */
export function isEmptyEntry(entry) {
  return !entry.is_available && !(entry.note && entry.note.trim());
}
