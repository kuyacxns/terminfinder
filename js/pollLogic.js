// Reine Berechnungs-Logik für Ergebnisse & Rangfolge – unabhängig vom
// Backend, damit sie sich einfach und schnell automatisiert testen lässt
// (siehe tests/pollLogic.test.js).

/**
 * Zählt für jeden Terminvorschlag die Stimmen aus, sortiert absteigend nach
 * Stimmenzahl (bei Gleichstand nach Datum aufsteigend) und vergibt einen
 * "dense rank" (1, 2, 2, 3, ...), damit Plätze bei Gleichstand nicht
 * übersprungen werden.
 *
 * @param {{id:string, date:string, proposed_by?:string|null}[]} dateOptions
 * @param {{participant_name:string, date_option_ids:string[]}[]} responses
 */
export function computeResults(dateOptions, responses) {
  const byId = new Map();
  for (const option of dateOptions) {
    byId.set(option.id, {
      id: option.id,
      date: option.date,
      proposedBy: option.proposed_by ?? null,
      votes: 0,
      voters: [],
    });
  }

  for (const response of responses) {
    const ids = response.date_option_ids || [];
    for (const optionId of ids) {
      const entry = byId.get(optionId);
      if (entry) {
        entry.votes += 1;
        entry.voters.push(response.participant_name);
      }
    }
  }

  const results = Array.from(byId.values());
  results.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  return assignDenseRanks(results);
}

function assignDenseRanks(sortedResults) {
  let rank = 0;
  let lastVotes = null;
  return sortedResults.map((item) => {
    if (item.votes !== lastVotes) {
      rank += 1;
      lastVotes = item.votes;
    }
    return { ...item, rank };
  });
}

/**
 * Liefert alle Termine, deren Platz innerhalb der Top N liegt. Bei
 * Punktegleichstand um den letzten Platz werden alle gleichauf liegenden
 * Termine mit ausgegeben (dense ranking), statt willkürlich einen davon
 * wegzulassen. Termine ganz ohne Stimmen zählen nicht als "Top".
 *
 * @param {ReturnType<typeof computeResults>} results
 * @param {number} topN
 */
export function getTopResults(results, topN = 3) {
  return results.filter((item) => item.votes > 0 && item.rank <= topN);
}
