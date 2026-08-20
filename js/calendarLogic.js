// Reine Berechnungs-Logik rund um den gemeinsamen Kalender – unabhängig von
// Backend und DOM, damit sie sich einfach automatisiert testen lässt
// (siehe tests/calendarLogic.test.js).

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

/**
 * Fasst alle Einträge pro Tag zusammen.
 *
 * @param {{participant_name:string, date:string}[]} entries
 * @returns {Map<string, {date:string, count:number, names:string[]}>}
 */
export function aggregateByDate(entries) {
  const byDate = new Map();
  for (const entry of entries) {
    let item = byDate.get(entry.date);
    if (!item) {
      item = { date: entry.date, count: 0, names: [] };
      byDate.set(entry.date, item);
    }
    item.count += 1;
    item.names.push(entry.participant_name);
  }
  for (const item of byDate.values()) {
    item.names.sort((a, b) => a.localeCompare(b, 'de'));
  }
  return byDate;
}

/**
 * Sortiert die Tage absteigend nach Anzahl Personen (bei Gleichstand nach
 * Datum aufsteigend) und vergibt einen "dense rank" (1, 2, 2, 3, ...), damit
 * Plätze bei Gleichstand nicht übersprungen werden.
 *
 * @param {{participant_name:string, date:string}[]} entries
 */
export function rankDays(entries) {
  const days = Array.from(aggregateByDate(entries).values());

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
  return ranked.filter((day) => day.count > 0 && day.rank <= topN);
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
    cells.push({
      iso: toIsoDate(date),
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month - 1,
    });
  }
  return cells;
}

/** Verschiebt einen Monat um `delta` Monate (mit Jahreswechsel). */
export function shiftMonth(year, month, delta) {
  const zeroBased = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/**
 * Ersetzt die Einträge einer Person durch ihre aktuelle Auswahl. Damit zeigt
 * die Oberfläche sofort den Stand inklusive noch nicht gespeicherter
 * Änderungen an, ohne dass dafür der Server gefragt werden muss.
 *
 * @param {{participant_name:string, date:string}[]} entries alle gespeicherten Einträge
 * @param {string} name eigener Name ('' = niemand ausgewählt)
 * @param {Iterable<string>} selectedDates eigene, ggf. ungespeicherte Auswahl
 */
export function withOwnSelection(entries, name, selectedDates) {
  const key = name.trim().toLowerCase();
  if (!key) return [...entries];

  const others = entries.filter((entry) => entry.participant_name.trim().toLowerCase() !== key);
  const own = Array.from(selectedDates, (date) => ({ participant_name: name.trim(), date }));
  return [...others, ...own];
}

/** Alle Tage, an denen die genannte Person bereits eingetragen ist. */
export function ownDates(entries, name) {
  const key = name.trim().toLowerCase();
  if (!key) return new Set();
  return new Set(
    entries
      .filter((entry) => entry.participant_name.trim().toLowerCase() === key)
      .map((entry) => entry.date)
  );
}
