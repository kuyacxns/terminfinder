# 📅 Terminfinder

Ein gemeinsamer Kalender für den Freundeskreis: Jede/r legt sich einen
Account an, tippt im Kalender die Tage an, an denen Zeit ist, und unten
steht sofort, an welchen Tagen die meisten können.

Die App ist eine rein statische Web-App auf GitHub Pages – kein eigener
Server, keine Wartung. Die gemeinsamen Daten liegen in einem kostenlosen
Supabase-Projekt (Postgres).

**Live:** `https://<username>.github.io/terminfinder`

---

## Inhalt

- [Was die App kann](#was-die-app-kann)
- [Bedienung](#bedienung)
- [Passwort vergessen](#passwort-vergessen)
- [Technische Entscheidungen](#technische-entscheidungen)
- [Projektstruktur](#projektstruktur)
- [Einrichtung: Supabase](#einrichtung-supabase)
- [Einrichtung: GitHub Pages](#einrichtung-github-pages)
- [Lokal testen](#lokal-testen)
- [Updates veröffentlichen](#updates-veröffentlichen)
- [Sicherheit](#sicherheit)
- [Automatisierte Tests](#automatisierte-tests)
- [Eigene Domain](#eigene-domain)

---

## Was die App kann

- **Account mit Name und Passwort** – keine E-Mail-Adresse nötig. Ein
  Künstlername genügt („Krümelmonster" ist völlig in Ordnung).
- **Profilbild automatisch** – jeder Account bekommt beim Anlegen ein
  buntes Emoji-Bild, das sich aus dem Namen ableitet. Emoji und Farbe
  lassen sich jederzeit ändern.
- **Ein Tipp = eingetragen** – im Monatskalender einen Tag antippen, fertig.
  Nochmal antippen trägt wieder aus.
- **Uhrzeit oder ganzer Tag** – wer nur abends kann, trägt „ab 19:00" oder
  „18:00 – 22:00" ein.
- **Notizen pro Tag** – unabhängig davon, ob man Zeit hat. Auch „bin im
  Urlaub" oder „bringe Kuchen mit" ist eine sinnvolle Notiz. Notizen sehen
  alle.
- **Übersicht unten** – alle Tage absteigend danach sortiert, wann die
  meisten Zeit haben. Die Top 3 sind farbig hervorgehoben; bei Gleichstand
  um Platz 3 werden alle gleichauf liegenden Tage angezeigt.
- **Wochenenden bunt** – Samstag und Sonntag sind farblich abgesetzt.
- **Für's Handy gebaut** – große Tap-Ziele, alles einspaltig, dunkles
  Design wird automatisch unterstützt.

---

## Bedienung

1. **Account anlegen:** Seite öffnen → Tab *Account anlegen* → Name und
   Passwort (mindestens 8 Zeichen) eingeben. Das Profilbild kommt
   automatisch.
2. **Eintragen:** Im Kalender den gewünschten Tag antippen – er wird sofort
   als „du hast Zeit" markiert.
3. **Verfeinern:** Direkt unter dem Kalender öffnet sich der Tag. Dort
   lassen sich *Ganzer Tag* abwählen und eine Uhrzeit setzen sowie eine
   Notiz schreiben. Danach auf **Speichern** tippen.
4. **Schauen, was die anderen machen:** Im selben Bereich stehen alle, die
   an dem Tag Zeit haben (mit ihren Uhrzeiten), und darunter alle Notizen.
5. **Besten Tag finden:** Ganz unten steht die Rangliste. Ein Tipp auf eine
   Zeile springt zu dem Tag im Kalender.

Die Farben im Kalender bedeuten:

| Darstellung | Bedeutung |
|---|---|
| Oranger Hintergrund | Samstag/Sonntag |
| Türkis, je kräftiger desto mehr | So viele Leute haben Zeit |
| Grüner Rahmen | Du hast an dem Tag Zeit |
| Blauer Rahmen | Heute |
| Zahl unten rechts | Anzahl Personen mit Zeit |
| 📝 | Für diesen Tag gibt es Notizen |

---

## Passwort vergessen

Weil die App bewusst keine E-Mail-Adressen speichert, gibt es **kein
automatisches „Passwort vergessen"** – es gäbe keinen Weg, den
Zurücksetzen-Link zuzustellen. Die App weist beim Anlegen und beim
Anmelden darauf hin.

Als Betreiber/in des Supabase-Projekts kannst du ein Passwort im Dashboard
neu setzen:

1. **Authentication → Users** öffnen.
2. Die betroffene Person suchen. Sie steht dort unter ihrer technischen
   Kennung, also z. B. `kruemelmonster-1a2b3c@terminfinder.invalid` – der Anfang
   entspricht dem Namen in Kleinbuchstaben mit ausgeschriebenen Umlauten.
3. Über das Menü am Zeilenende **Reset password** bzw. das Bearbeiten des
   Benutzers ein neues Passwort vergeben und der Person durchgeben.

Alternativ legt die Person einfach einen neuen Account mit leicht
verändertem Namen an. Ihre bisherigen Einträge bleiben dann allerdings
unter dem alten Namen stehen; löschen lassen sie sich im **Table Editor**
unter `day_entries`.

---

## Technische Entscheidungen

- **Supabase statt Firebase.** Die Daten sind tabellarisch (Personen, Tage,
  Einträge), und die Rangliste ist eine simple Gruppierung – dafür ist
  Postgres die natürlichere Wahl als eine Dokumentendatenbank. Dazu kommt,
  dass Row Level Security die Zugriffsregeln direkt neben den Daten
  beschreibt, statt in einer eigenen Regelsprache.

- **Supabase Auth statt selbstgebauter Anmeldung.** Passwörter werden dort
  serverseitig gehasht (bcrypt) gespeichert und sind für die App nie
  lesbar. Eine eigene Lösung im Browser könnte das nicht leisten.

- **Name statt E-Mail.** Da ausdrücklich keine E-Mail-Adresse abgefragt
  werden soll, Supabase Auth aber eine braucht, erzeugt die App aus dem
  Namen deterministisch eine technische Adresse
  (`krümelmonster` → `kruemelmonster-<hash>@terminfinder.invalid`, siehe
  `nameToAuthEmail()` in [`js/utils.js`](js/utils.js)). An diese Adresse
  geht nie eine Mail. Der angehängte Hash sorgt dafür, dass „Anna Müller"
  und „Anna-Mueller" verschiedene Accounts bleiben und dass auch Namen
  ohne lateinische Buchstaben funktionieren.

  Die Domain ist bewusst `.invalid`: Laut RFC 2606 ist sie dauerhaft nicht
  auflösbar, es kann also selbst bei versehentlich aktiviertem Mailversand
  nichts bei einer echten Person landen. `example.com` funktioniert hier
  **nicht** – Supabase lehnt diese Adresse gezielt als Test-Domain ab
  (`email_address_invalid`).

- **Profilbilder ohne Datei-Upload.** Ein Emoji plus Farbe reicht als
  Erkennungszeichen, passt zum bunten Design und spart Storage-Bucket,
  Upload-Limits und Bildzuschnitt komplett ein.

- **Zugriff nur über RLS-Policies, keine RPC-Funktionen.** Anders als in
  früheren Versionen dieser App gibt es jetzt echte Accounts – damit lässt
  sich direkt in den Zugriffsregeln formulieren „jede/r darf alles lesen,
  aber nur die eigenen Zeilen ändern". Das ist deutlich weniger Code als
  der Umweg über `SECURITY DEFINER`-Funktionen.

- **Eine Tabellenzeile pro Person und Tag.** Verfügbarkeit und Notiz landen
  gemeinsam in `day_entries`, weil sie sich immer auf dasselbe Paar
  (Person, Tag) beziehen. Eine Notiz ohne Verfügbarkeit ist ausdrücklich
  erlaubt.

- **Tippen speichert nicht sofort.** Ein Tipp auf einen Tag ändert die
  Auswahl erst nur lokal; gespeichert wird per Knopf. Bei wackligem
  Mobilfunknetz ist das robuster als ein Schreibvorgang pro Tipp – man
  sieht, ob es geklappt hat.

- **Datumslogik in UTC.** Alle Kalenderberechnungen laufen in UTC, damit
  Sommerzeit-Umstellungen keine Tage verschieben. Nur „heute" wird aus der
  lokalen Zeitzone bestimmt – sonst wäre um 00:30 Uhr noch der Vortag
  markiert.

- **Kein Bundler.** Reines HTML/CSS/JS mit ES-Modulen; das Supabase-SDK
  kommt per CDN. Der Build-Schritt existiert nur, um die Supabase-Zugangs-
  daten beim Deployment einzusetzen (siehe unten). Falls das CDN einmal
  nicht erreichbar ist, zeigt die Seite eine verständliche Meldung statt
  einer leeren Seite.

---

## Projektstruktur

```
index.html                      die komplette App (Anmeldung + Kalender)
css/styles.css                  buntes, mobile-first Design
js/
  app.js                        Steuerung: Ansichten, Kalender, Speichern
  auth.js                       Registrierung, Anmeldung, Profil
  avatar.js                     Emoji-Profilbilder aus dem Namen
  calendarLogic.js              reine Logik: Raster, Zählen, Rangfolge
  utils.js                      Validierung, Formatierung, Namens-Kennung
  supabaseClient.js             Supabase-Client
  config.example.js             Vorlage für die Zugangsdaten
supabase/
  config.toml                   Projekt-Konfiguration für die Supabase CLI
  migrations/                   Datenbankschema als SQL-Migrationen
scripts/build.js                kopiert nach dist/ und setzt die Config ein
tests/                          automatisierte Tests (Node-Test-Runner)
.github/workflows/deploy.yml    Tests + Veröffentlichung auf GitHub Pages
```

---

## Einrichtung: Supabase

### 1. Projekt anlegen

Auf [supabase.com](https://supabase.com) kostenlos registrieren und ein
neues Projekt erstellen (Region in der Nähe wählen). Das dabei vergebene
**Datenbank-Passwort** gut aufbewahren – die CLI fragt später danach.

### 2. Datenbankschema anlegen

Zwei Wege, wähl einen:

- **Option A (am schnellsten): manuell im SQL Editor.**
  Supabase-Dashboard → **SQL Editor** → **New query**, den kompletten Inhalt
  von [`supabase/migrations/20260820210000_accounts_notes_times.sql`](supabase/migrations/20260820210000_accounts_notes_times.sql)
  einfügen und **Run** klicken.

- **Option B: über die Supabase CLI.**

  ```bash
  supabase link --project-ref <dein-projekt-ref>
  supabase db push
  ```

  Der Projekt-Ref ist die 20-stellige Kennung aus der Projekt-URL
  (`https://<projekt-ref>.supabase.co`) – ohne `https://` und ohne
  `.supabase.co`.

> **Hinweis zur GitHub-Integration:** Verbindest du dein Supabase-Projekt
> über **Project Settings → Integrations → GitHub Connection** mit diesem
> Repository, richtet Supabase vor allem *Preview-Branches für Pull
> Requests* ein. Migrationen werden dadurch **nicht automatisch** in die
> Produktionsdatenbank übernommen. Verlass dich also auf Option A oder B.

Da das SQL-Skript ausschließlich aus `create`/`grant`/`alter` besteht (kein
`select`), ist **„Success. No rows returned"** die *erwartete*
Erfolgsmeldung – kein Fehler. Prüfen lässt sich das Ergebnis im **Table
Editor**: Dort sollten `profiles` und `day_entries` auftauchen.

### 3. Anmelde-Einstellungen setzen (wichtig!)

**Authentication → Sign In / Providers → Email** öffnen. Dort sind **zwei
verschiedene Schalter** relevant – beide müssen stimmen:

| Schalter | Muss sein | Warum |
|---|---|---|
| **Email** (der Anbieter selbst) | **an** | Ist er aus, schlägt jede Registrierung mit „Email signups are disabled" fehl. |
| **Confirm email** (darin) | **aus** | Sonst wartet Supabase auf eine Bestätigungsmail, die bei unseren technischen Adressen nie ankommt. |

Der Anbieter „Email" ist die Überschrift des Abschnitts, „Confirm email"
eine Option darin – nicht verwechseln. Nach dem Ändern **Save** drücken.

Ob es passt, lässt sich ohne Anmeldung prüfen:

```bash
curl -s "https://<projekt-ref>.supabase.co/auth/v1/settings" -H "apikey: <anon-key>"
```

In der Antwort sollten `"email": true` (im Block `external`) und
`"mailer_autoconfirm": true` stehen. Steht dort `"mailer_autoconfirm": false`,
ist „Confirm email" noch an.

### 4. Zugangsdaten ins Frontend

**Project Settings → API** öffnen und zwei Werte kopieren:

| Wert im Dashboard | wird zu |
|---|---|
| `Project URL` | `SUPABASE_URL` |
| `anon` `public` Key | `SUPABASE_ANON_KEY` |

Beide Werte sind für den Browser bestimmt und **kein Geheimnis** – sie
stehen bei jeder Supabase-Web-App im Quelltext. Die eigentliche
Absicherung übernimmt Row Level Security (siehe [Sicherheit](#sicherheit)).

Wie sie ins Deployment kommen, steht im nächsten Abschnitt.

### 5. Aufräumen (nur beim Umstieg von einer älteren Version)

Frühere Versionen dieser App nutzten eine Edge Function als Passwortschutz
fürs Anlegen von Umfragen. Die wird nicht mehr gebraucht:

```bash
supabase functions delete create-calendar   # bzw. create-poll
supabase secrets unset CALENDAR_CREATE_PASSWORD_HASH
```

---

## Einrichtung: GitHub Pages

### 1. Repository-Variablen setzen

**Settings → Secrets and variables → Actions → Tab „Variables"** →
**New repository variable**, zweimal:

- `SUPABASE_URL` → die Project URL aus Supabase
- `SUPABASE_ANON_KEY` → der `anon`-Key aus Supabase

> Bewusst *Variables*, nicht *Secrets*: GitHub maskiert Secrets in
> Build-Ausgaben, und die Werte landen ohnehin sichtbar im
> ausgelieferten JavaScript. Als Variablen bleiben Fehler nachvollziehbar.

### 2. Pages aktivieren

**Settings → Pages → Build and deployment → Source** auf **GitHub Actions**
stellen (nicht „Deploy from a branch").

### 3. Deployment-Branch freigeben

**Settings → Environments → github-pages → Deployment branches and tags**
prüfen: `main` muss erlaubt sein, sonst bricht der Deploy mit
*„Branch main is not allowed to deploy to github-pages"* ab.

### 4. Fertig

Beim nächsten Push auf `main` läuft der Workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): Er führt die
Tests aus, baut `dist/` (dabei wird `js/config.js` aus den Variablen
erzeugt) und veröffentlicht das Ergebnis. Danach ist die Seite unter
`https://<username>.github.io/terminfinder` erreichbar – öffentlich, mit
HTTPS, ohne Tunnel oder Portfreigabe.

---

## Lokal testen

```bash
cp js/config.example.js js/config.js
```

In `js/config.js` die beiden Platzhalter durch die echten Supabase-Werte
ersetzen. Die Datei steht in `.gitignore` und wird nicht committet.

Danach einen beliebigen statischen Server starten – wegen der ES-Module
funktioniert ein direkter Doppelklick auf `index.html` nicht:

```bash
python3 -m http.server 8000
# oder: npx serve .
```

Dann `http://localhost:8000` öffnen.

**Vom Handy im selben WLAN testen:** die lokale IP des Rechners
herausfinden (`ipconfig` bzw. `ip addr`) und am Handy
`http://<lokale-ip>:8000` aufrufen.

---

## Updates veröffentlichen

Einfach auf `main` pushen:

```bash
git add .
git commit -m "Beschreibung der Änderung"
git push
```

Der Workflow testet, baut und veröffentlicht automatisch. Kein
Server-Neustart, kein manuelles Hochladen. Der Fortschritt steht im
**Actions**-Tab des Repositories.

Ändert sich das Datenbankschema, kommt eine **neue** Datei in
`supabase/migrations/` dazu (bestehende nicht nachträglich ändern) und wird
per `supabase db push` oder im SQL Editor angewendet.

---

## Sicherheit

- **Passwörter** verwaltet Supabase Auth: gehasht mit bcrypt, für die App
  nie im Klartext lesbar. Die App sieht nur ein signiertes Token.

- **Zugriffsregeln (Row Level Security)** sind auf beiden Tabellen aktiv:

  | Rolle | `profiles` | `day_entries` |
  |---|---|---|
  | nicht angemeldet (`anon`) | kein Zugriff | kein Zugriff |
  | angemeldet | alle lesen, **nur eigenes** ändern | alle lesen, **nur eigene** ändern/löschen |

  Erzwungen wird das über `auth.uid()`, also über das signierte Token –
  ein manipulierter Client kann sich damit nicht als jemand anderes
  ausgeben oder fremde Einträge löschen.

- **Ohne Login ist die Datenbank komplett dicht.** `anon` hat auf beiden
  Tabellen keinerlei Rechte. Wer nicht angemeldet ist, sieht keine Namen,
  keine Termine und keine Notizen.

- **Eingaben werden begrenzt und geprüft**, sowohl im Browser als auch per
  `check`-Constraint in der Datenbank: Name 2–40 Zeichen, Passwort
  mindestens 8 Zeichen, Notizen höchstens 500 Zeichen.

- **Kein XSS.** Die Oberfläche baut nirgends HTML aus Nutzereingaben
  zusammen, sondern setzt Namen und Notizen ausschließlich über
  `textContent` bzw. DOM-APIs. Eingegebener Text kann damit nicht als
  HTML ausgeführt werden.

- **Missbrauchsschutz** übernehmen die eingebauten Kontingente von
  Supabase (Rate Limits auf den Auth-Endpunkten). Klassisches
  Rate-Limiting ist ohne eigenen Server nicht sinnvoll umsetzbar.

### ⚠️ Registrierung ist offen

Wer die URL kennt, kann sich einen Account anlegen und damit den Kalender
sehen. Das ist so gewollt („für die Accounterstellung nur einen Namen
eingeben"), sollte aber bewusst sein: Die URL ist der einzige Schutz.

Wenn der Kalender enger geschützt sein soll, gibt es zwei einfache Wege:

1. **Registrierung nach der Startphase abschalten:** Supabase-Dashboard →
   **Authentication → Sign In / Providers → Email** → *„Allow new users to
   sign up"* aus. Bestehende Accounts funktionieren weiter, neue kann nur
   noch ein Admin im Dashboard anlegen.
2. **Einladungscode** vor die Registrierung setzen – dafür bräuchte es
   wieder eine kleine Edge Function als Türsteher. Sag Bescheid, falls das
   gewünscht ist.

---

## Automatisierte Tests

```bash
npm test
```

Nutzt den in Node eingebauten Test-Runner, ohne zusätzliche
Abhängigkeiten. Abgedeckt ist die Logik, bei der sich Fehler leicht
einschleichen und schwer auffallen:

- **Zählen und Rangfolge** – wer hat wann Zeit, Sortierung, „dense
  ranking" bei Gleichstand, Top 3 inklusive Gleichstand um Platz 3
- **Notizen** – zählen nicht als Verfügbarkeit, sind aber unabhängig davon
  möglich
- **Kalenderraster** – Wochenstart Montag, Monate mit/ohne Vorlauf,
  Schaltjahre, Wochenend-Markierung, Monatswechsel über Jahresgrenzen
- **Accounts** – Namensvalidierung inkl. Künstlernamen, Umlaute und
  Akzente in der Namens-Kennung, Stabilität und Kollisionsfreiheit der
  abgeleiteten Anmelde-Kennung
- **Profilbilder** – deterministisch, gültige Werte, gute Streuung
- **Zeitangaben** – „ganztägig", „ab 19:00", „18:00 – 21:30"

Die Tests laufen zusätzlich bei jedem Push und bei jedem Pull Request in
GitHub Actions; schlagen sie fehl, wird nicht veröffentlicht.

---

## Eigene Domain

1. Beim Domain-Anbieter einen `CNAME`-Eintrag anlegen, z. B.
   `kalender.deinedomain.de` → `<username>.github.io`.
2. Im Repository unter **Settings → Pages → Custom domain** die Domain
   eintragen und speichern.
3. **Enforce HTTPS** aktivieren, sobald das Zertifikat ausgestellt ist
   (dauert meist wenige Minuten).

GitHub legt dabei eine `CNAME`-Datei im Repository an. Damit der
Build-Schritt sie nicht verwirft, muss sie in
[`scripts/build.js`](scripts/build.js) zu `ITEMS_TO_COPY` hinzugefügt
werden.
