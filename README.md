# 📅 Terminfinder

Eine kleine, kostenlose Web-App zur Terminfindung im Freundeskreis – wie
Doodle, aber selbst gehostet über **GitHub Pages** (statisches
HTML/CSS/JS, kein eigener Server) mit **Supabase** als Backend
(Postgres-Datenbank, direkt aus dem Browser über das offizielle
Client-SDK angesprochen).

Ein Organisator erstellt eine Umfrage mit ein paar Terminvorschlägen und
bekommt einen eindeutigen, nicht erratbaren Link. Alle Freunde öffnen
diesen Link auf ihrem eigenen Gerät, tragen ihren Namen ein, kreuzen an,
wann sie Zeit haben (und können eigene Terminvorschläge ergänzen). Am
Ende sieht jeder die Ergebnisse – die drei beliebtesten Termine werden
als **Top 3** hervorgehoben.

---

## Inhaltsverzeichnis

1. [Architektur & Entscheidungen](#architektur--entscheidungen)
2. [Projektstruktur](#projektstruktur)
3. [Lokal testen](#lokal-testen)
4. [Automatisierte Tests](#automatisierte-tests)
5. [Supabase einrichten](#supabase-einrichten)
6. [GitHub Pages einrichten](#github-pages-einrichten)
7. [Updates & Deployment](#updates--deployment)
8. [Bedienungsanleitung](#bedienungsanleitung)
9. [Sicherheit](#sicherheit)
10. [Eigene Domain (optional)](#eigene-domain-optional)
11. [Grenzen / bewusst nicht umgesetzt](#grenzen--bewusst-nicht-umgesetzt)

---

## Architektur & Entscheidungen

Diese App wurde ohne Rückfrage-Blocker pragmatisch umgesetzt; die
wichtigsten Entscheidungen sind hier dokumentiert:

- **Backend: Supabase statt Firebase.** Das Datenmodell aus der
  Aufgabenstellung (Poll, DateOption, Response, ResponseSelection) ist
  klar relational – Postgres mit ein paar Fremdschlüsseln und einem
  `UNIQUE`-Index passt hier natürlicher als Firestore-Collections.
  Supabase hat außerdem einen großzügigen kostenlosen Tarif, echtes SQL
  (transaktionssichere Stimmenzählung) und Row Level Security.

- **RPC-only statt offener Tabellenzugriff.** Row Level Security allein
  reicht hier nicht aus: Eine Policy wie „SELECT erlaubt“ würde zwar pro
  Zeile funktionieren, aber nichts daran hindern, dass jemand **alle**
  Umfragen einer Tabelle auflistet (`GET /polls?select=*`) und sich so
  Zugriff auf fremde, eigentlich nur über den unrätbaren Link erreichbare
  Umfragen verschafft. Deshalb ist RLS auf allen vier Tabellen aktiv,
  aber **ohne** Policies für `anon`/`authenticated` – direkter
  Tabellenzugriff ist komplett gesperrt. Die App greift stattdessen
  ausschließlich über drei `SECURITY DEFINER`-Datenbankfunktionen zu
  (`get_poll_data`, `add_date_option`, `submit_response`, siehe
  [`supabase/migrations/20260820120000_initial_schema.sql`](supabase/migrations/20260820120000_initial_schema.sql)),
  die jeweils die Poll-ID als Parameter verlangen. Ohne die UUID aus dem
  Link kommt man an nichts heran.

- **„Nur eigene Stimme ändern“ läuft über den Namen, nicht über ein
  Konto.** Die Aufgabenstellung schließt Logins bewusst aus. Ein
  erneutes Abstimmen unter demselben Namen (Groß-/Kleinschreibung
  ignoriert) aktualisiert die bestehende `response`-Zeile statt eine
  neue anzulegen – durchgesetzt über einen eindeutigen Index
  `(poll_id, lower(participant_name))` in Postgres. Das ist bewusst so
  simpel wie bei echtem Doodle: Wer den Namen eines anderen benutzt,
  kann dessen Stimme überschreiben. Eine stärkere Zuordnung würde eine
  Form von Identität (Login oder zumindest anonyme Auth) voraussetzen,
  was explizit nicht gewünscht war.

- **Passwortschutz fürs Erstellen über eine Supabase Edge Function.**
  Rein clientseitiger Code kann kein Geheimnis wahren. Die Function
  [`supabase/functions/create-poll`](supabase/functions/create-poll/index.ts)
  prüft das eingesandte Passwort serverseitig (SHA-256-Hash-Vergleich
  gegen ein Secret) und legt die Umfrage danach mit dem
  Service-Role-Key an – dieser Key existiert ausschließlich in der
  Function-Umgebung, niemals im Browser. Abstimmen über einen
  bestehenden Link bleibt bewusst passwortfrei.

- **GitHub-Actions-Build nur für die Config-Injection.** Die App selbst
  ist reines HTML/CSS/JS ohne Bundler. Der einzige Grund für einen
  Build-Schritt ist, `js/config.js` (Supabase-URL + Anon-Key) nicht im
  Klartext committen zu müssen, sondern beim Deployment aus
  Repository-Variablen zu erzeugen (siehe
  [`scripts/build.js`](scripts/build.js)). Das ist rein organisatorisch
  – die Werte selbst sind laut Supabase-Doku ohnehin für den Browser
  bestimmt und kein Geheimnis; die eigentliche Absicherung übernimmt
  RLS.

- **Schema als Supabase-Migration statt Einmal-Skript.** Das Datenbank-
  schema liegt unter `supabase/migrations/` im von der Supabase CLI
  erwarteten Format (`<Zeitstempel>_beschreibung.sql`). Verbindest du dein
  Supabase-Projekt über die GitHub-Integration mit diesem Repository
  (Supabase-Dashboard → Project Settings → Integrations → GitHub
  Connection, Production-Branch `main`), wendet Supabase neue
  Migrationen automatisch an, sobald sie auf `main` gemerged werden –
  ganz ohne manuellen Copy-Paste-Schritt im SQL-Editor. Ohne diese
  Integration funktioniert der ursprüngliche manuelle Weg (Inhalt der
  Migrationsdatei im SQL-Editor ausführen) weiterhin unverändert.

- **ES-Module + Supabase-JS per CDN (`esm.sh`).** Kein `npm install`,
  kein Bundler, direkt im Browser lauffähig. `js/pollLogic.js` und
  `js/utils.js` enthalten die reine, backend-unabhängige Logik
  (Stimmen zählen, Rangfolge, Validierung) und werden 1:1 in
  `tests/` mit dem in Node eingebauten Test-Runner getestet – ganz ohne
  zusätzliche Abhängigkeiten.

---

## Projektstruktur

```
index.html                 Startseite: neue Umfrage erstellen
poll.html                  Umfrage-/Abstimmungs-/Ergebnisseite
css/styles.css              Responsive, Mobile-First-Styling
js/
  config.example.js        Vorlage für Supabase-Verbindungsdaten
  supabaseClient.js         Erstellt den Supabase-Client
  utils.js                  Validierung, Escaping, Datumsformatierung
  pollLogic.js               Stimmen zählen, Rangfolge/Top-3 (reine Logik)
  create.js                  Seiten-Logik für index.html
  poll.js                    Seiten-Logik für poll.html
tests/
  pollLogic.test.js          Tests für Zählung/Rangfolge/Gleichstand
  utils.test.js               Tests für Validierung/Escaping
supabase/
  config.toml                  Projekt-Konfiguration (CLI/GitHub-Integration)
  migrations/                  Tabellen, RLS, RPC-Funktionen (SQL-Migrationen)
  .env.example                 Vorlage für lokale Function-Secrets
  functions/create-poll/       Edge Function: Passwortprüfung + Anlegen
scripts/build.js               Baut dist/ für GitHub Pages
.github/workflows/deploy.yml   Tests + automatisches Pages-Deployment
```

---

## Lokal testen

Voraussetzung: [Node.js](https://nodejs.org) ≥ 18 (für einen lokalen
Webserver und den Test-Runner). Kein `npm install` nötig – das Projekt
hat keine Abhängigkeiten.

1. **Supabase-Projekt einrichten** (siehe unten) und Konfigurationsdatei
   anlegen:

   ```bash
   cp js/config.example.js js/config.js
   ```

   Trage in `js/config.js` deine echte Supabase-URL und den `anon`-Key
   ein (Supabase-Dashboard → Project Settings → API). Diese Datei ist in
   `.gitignore` und wird nicht committet.

2. **Statischen Server starten** (ES-Module funktionieren nicht über
   `file://`, daher braucht es einen einfachen HTTP-Server):

   ```bash
   npx serve .
   # oder z. B.: python3 -m http.server 8080
   ```

3. Im Browser `http://localhost:3000` (bzw. den Port deines Servers)
   öffnen, eine Umfrage erstellen und den erzeugten Link in einem
   zweiten Tab / auf dem Handy öffnen, um das Abstimmen zu testen.

---

## Automatisierte Tests

Die Kernlogik (Stimmen zählen, Rangfolge inkl. Gleichstand-Fälle,
Validierung/Escaping) ist mit dem in Node eingebauten Test-Runner
getestet – keine zusätzliche Test-Bibliothek nötig:

```bash
npm test
```

Der GitHub-Actions-Workflow führt diese Tests bei jedem Push und jeder
Pull Request automatisch aus; das Deployment läuft nur, wenn sie
erfolgreich sind.

---

## Supabase einrichten

1. **Projekt anlegen:** Auf [supabase.com](https://supabase.com)
   kostenlos registrieren und ein neues Projekt erstellen (Region nahe
   an deinem Freundeskreis wählen).

2. **Datenbankschema anlegen** – zwei Wege, wähl einen:

   - **Option A (empfohlen): GitHub-Integration.** Im Supabase-Dashboard
     zu **Project Settings → Integrations → GitHub Connection** und das
     Repository `<username>/terminfinder` verbinden, als
     Production-Branch `main` auswählen. Sobald Migrationen unter
     `supabase/migrations/` auf `main` gemerged werden, wendet Supabase
     sie automatisch an – kein Copy-Paste in den SQL-Editor nötig.
     Nach dem Verbinden (oder nach jedem neuen Merge) im Dashboard unter
     **Database → Migrations** kurz prüfen, dass die Migration
     `20260820120000_initial_schema.sql` als *applied* angezeigt wird.

   - **Option B: manuell.** Im Supabase-Dashboard zu **SQL Editor** →
     **New query**, den kompletten Inhalt von
     [`supabase/migrations/20260820120000_initial_schema.sql`](supabase/migrations/20260820120000_initial_schema.sql)
     einfügen und **Run** klicken.

   Beide Wege legen dieselben vier Tabellen, Row-Level-Security (ohne
   Policies → dichter Tabellenzugriff) sowie die drei RPC-Funktionen
   `get_poll_data`, `add_date_option` und `submit_response` an. Da das
   SQL-Skript ausschließlich aus `CREATE TABLE`/`CREATE FUNCTION`/`GRANT`
   besteht (kein `SELECT`), ist „Success. No rows returned“ im SQL
   Editor die **erwartete** Erfolgsmeldung – kein Fehler. Prüfen lässt
   sich der Erfolg im **Table Editor** (die vier Tabellen sollten
   auftauchen) bzw. unter **Database → Functions** (die drei
   RPC-Funktionen sollten auftauchen).

   Künftige Schemaänderungen legst du als neue Datei in
   `supabase/migrations/` ab (z. B. mit
   `supabase migration new <beschreibung>`, falls die CLI installiert
   ist) – so bleiben Datenbank und Repository-Historie über die
   GitHub-Integration automatisch in Sync.

3. **API-Zugangsdaten notieren:** **Project Settings → API** →
   `Project URL` und den `anon` `public` Key kopieren. Diese Werte sind
   für den Einsatz im Browser vorgesehen (siehe
   [Sicherheit](#sicherheit)).

4. **Edge Function für den Passwortschutz deployen.** Voraussetzung:
   [Supabase CLI](https://supabase.com/docs/guides/cli) installiert
   (`npm install -g supabase` oder per Paketmanager) und eingeloggt
   (`supabase login`).

   ```bash
   # Projekt einmalig verknüpfen (Projekt-Ref aus der Supabase-URL,
   # z. B. https://<projekt-ref>.supabase.co):
   supabase link --project-ref <dein-projekt-ref>

   # Passwort-Hash berechnen (Beispiel mit Node):
   node -e "console.log(require('crypto').createHash('sha256').update('DEIN_PASSWORT').digest('hex'))"

   # Das Ergebnis als Secret in der Function-Umgebung hinterlegen:
   supabase secrets set POLL_CREATE_PASSWORD_HASH=<der-berechnete-hash>

   # Function deployen:
   supabase functions deploy create-poll
   ```

   `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stehen Edge Functions
   auf Supabase automatisch als Umgebungsvariablen zur Verfügung – dafür
   ist nichts weiter zu tun. Der Service-Role-Key verlässt damit nie
   deinen Rechner bzw. die Supabase-Umgebung.

   Zum lokalen Testen der Function:

   ```bash
   cp supabase/.env.example supabase/.env
   # POLL_CREATE_PASSWORD_HASH in supabase/.env eintragen
   supabase functions serve create-poll --env-file supabase/.env
   ```

5. **Abuse-Schutz (optional, empfohlen):** Im Supabase-Dashboard unter
   **Authentication → Rate Limits** bzw. **Settings → API** die
   eingebauten Kontingente prüfen/anpassen. Ein eigenes Rate-Limiting
   wie bei einem selbst betriebenen Server ist ohne eigenen Server nicht
   sinnvoll umsetzbar – die App verlässt sich hier bewusst auf die
   Bordmittel von Supabase.

---

## GitHub Pages einrichten

1. **Repository anlegen** (öffentlich – private GitHub-Pages-Seiten
   erfordern GitHub Pro/Team) und diesen Code hochladen/pushen.

2. **Repository-Variablen setzen:** **Settings → Secrets and variables
   → Actions → Variables** → **New repository variable**:
   - `SUPABASE_URL` = deine Supabase-Projekt-URL
   - `SUPABASE_ANON_KEY` = dein `anon`-Key

   (Variablen statt Secrets, weil diese Werte laut Supabase ohnehin für
   den Browser bestimmt sind – funktional wäre auch `Secrets` möglich,
   der Workflow müsste dann entsprechend `secrets.` statt `vars.`
   referenzieren.)

3. **Pages aktivieren:** **Settings → Pages** → unter **Build and
   deployment** → **Source** auf **GitHub Actions** stellen. Der
   mitgelieferte Workflow [`deploy.yml`](.github/workflows/deploy.yml)
   übernimmt den Rest.

4. **Auf `main` pushen** (oder den Workflow manuell über **Actions →
   Tests & GitHub Pages Deployment → Run workflow** anstoßen). Nach ein
   bis zwei Minuten ist die Seite unter
   `https://<username>.github.io/<repository>` erreichbar – öffentlich,
   mit HTTPS, ganz ohne Tunnel, Port-Weiterleitung oder Reverse Proxy.

---

## Updates & Deployment

Ganz normal weiterentwickeln und auf `main` pushen (bzw. per Pull
Request mergen): Der Workflow führt automatisch die Tests aus und
veröffentlicht bei Erfolg die neue Version über GitHub Pages. Kein
manuelles Server-Management, kein Neustart, keine Wartung – GitHub
übernimmt Build und Hosting, Supabase übernimmt die Datenhaltung.

---

## Bedienungsanleitung

**Umfrage erstellen:**
1. Startseite öffnen, Titel eingeben (Pflicht), optional eine
   Beschreibung.
2. Mindestens einen Terminvorschlag über den Kalender-Picker wählen,
   bei Bedarf über „+ weiteren Termin“ weitere hinzufügen.
3. Das gemeinsame Passwort eingeben und auf „Umfrage erstellen“ tippen.
4. Der erzeugte Link erscheint direkt zum Kopieren – diesen Link an
   Freunde weiterschicken (Chat, Mail, wie auch immer).

**Abstimmen:**
1. Link öffnen (funktioniert auf jedem Gerät, ohne Login).
2. Namen eingeben.
3. Alle Termine ankreuzen, an denen man Zeit hat.
4. Optional: eigenen Terminvorschlag über den Kalender-Picker ergänzen –
   erscheint sofort für alle sichtbar in der Liste.
5. Auf „Abstimmen“ tippen. Öffnet man den Link später erneut und gibt
   denselben Namen ein, wird die vorhandene Stimme automatisch
   vorausgefüllt und beim erneuten Absenden aktualisiert statt
   dupliziert.

**Ergebnisse ansehen:**
- Direkt unter dem Abstimm-Formular: alle Termine absteigend nach
  Stimmenzahl, inklusive der Namen der jeweiligen Teilnehmer.
- Die Top 3 (nach Punktegleichstand ggf. auch mehr als 3 Termine, falls
  mehrere um Platz 3 gleichauf liegen) sind farblich und mit
  „Platz 1/2/3“ hervorgehoben.
- Ergebnisse sind nach jedem Neuladen der Seite aktuell (kein
  automatisches Live-Update – das ist laut Aufgabenstellung optional
  und wurde bewusst nicht umgesetzt).

---

## Sicherheit

- **Unrätbare IDs:** Alle Poll-IDs sind UUIDv4 (`gen_random_uuid()` in
  Postgres) – keine fortlaufenden Nummern.
- **Kein Durchblättern fremder Umfragen:** Row Level Security ohne
  Policies sperrt jeden direkten Tabellenzugriff; der gesamte
  Lese-/Schreibzugriff läuft über kontrollierte `SECURITY DEFINER`
  RPC-Funktionen, die jeweils die (unrätbare) `poll_id` verlangen.
- **Eingabevalidierung & XSS-Schutz:** Titel, Beschreibung und Namen
  werden client- und serverseitig längenbegrenzt (siehe `js/utils.js`
  und die `CHECK`-Constraints in
  `supabase/migrations/20260820120000_initial_schema.sql`). Beim Rendern
  wird ausschließlich über `textContent`/DOM-APIs gearbeitet statt über
  `innerHTML`-Zusammenbau, wodurch eingegebener Text nie als HTML
  interpretiert wird.
- **Kein manuelles Zusammenbauen von Abfragen:** Der gesamte
  Datenbankzugriff läuft über die offiziellen `supabase-js`-Methoden
  (`.rpc()`, `.functions.invoke()`).
- **Passwortschutz fürs Erstellen:** serverseitig in der Edge Function
  geprüft (SHA-256-Hash-Vergleich gegen ein Supabase-Secret), nicht im
  Frontend.
- **Öffentliche Config-Werte sind kein Sicherheitsloch:** Supabase-URL
  und `anon`-Key dürfen laut Supabase-Dokumentation im Frontend
  sichtbar sein; die eigentliche Zugriffskontrolle übernimmt RLS bzw.
  die Edge Function.
- **Abuse-Schutz:** Es gibt keinen eigenen Server, der Rate-Limiting
  umsetzen könnte – stattdessen werden die eingebauten Kontingente von
  Supabase genutzt (siehe [Supabase einrichten](#supabase-einrichten),
  Punkt 5).

---

## Eigene Domain (optional)

Um die App unter einer eigenen Domain statt `github.io` zu erreichen:

1. Bei deinem Domain-Anbieter einen `CNAME`-Eintrag (für eine
   Subdomain, z. B. `termine.deine-domain.de`) auf
   `<username>.github.io` anlegen.
2. Im Repository unter **Settings → Pages → Custom domain** die Domain
   eintragen und speichern (das erzeugt automatisch eine `CNAME`-Datei
   im veröffentlichten Ordner). HTTPS wird von GitHub automatisch per
   Let's-Encrypt-Zertifikat bereitgestellt.

---

## Grenzen / bewusst nicht umgesetzt

Wie in der Aufgabenstellung vorgegeben, wurden folgende Erweiterungen
bewusst **nicht** umgesetzt (die Architektur verhindert sie aber nicht):
E-Mail-/Push-Benachrichtigungen, ICS-Kalender-Export, Mehrsprachigkeit,
echte Nutzerkonten, Live-Updates ohne Neuladen, nachträgliches
Bearbeiten/Löschen einzelner Termine durch den Organisator.
