# 📅 Terminfinder

Ein gemeinsamer Kalender für den Freundeskreis: Jede/r trägt direkt ein,
wann Zeit ist – und sieht dabei, an welchen Tagen sich schon andere
eingetragen haben, um sich dort dazuzustellen. Am Ende zeigt eine
Übersicht, an welchen Tagen die meisten können.

Läuft als statische Web-App über **GitHub Pages** (reines HTML/CSS/JS,
kein eigener Server) mit **Supabase** als Backend (Postgres, direkt aus
dem Browser über das offizielle Client-SDK angesprochen).

**So läuft's ab:** Jemand legt einen Kalender an und bekommt einen
eindeutigen, nicht erratbaren Link. Alle öffnen diesen Link auf ihrem
eigenen Gerät, tippen ihren Namen ein und markieren im Kalender die Tage,
an denen sie Zeit haben. Kein Login, keine Registrierung.

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

- **Backend: Supabase statt Firebase.** Das Datenmodell ist klar
  relational – Postgres mit Fremdschlüsseln und einem eindeutigen Index
  passt hier natürlicher als Firestore-Collections. Supabase hat
  außerdem einen großzügigen kostenlosen Tarif, echtes SQL und Row Level
  Security.

- **Zwei Tabellen genügen.** Ein `calendar` (Titel, Beschreibung) und
  beliebig viele `availabilities` (`calendar_id`, `participant_name`,
  `date`). Ein Tag „existiert“ im Kalender genau dann, wenn sich jemand
  dafür eingetragen hat – es braucht also keine vom Organisator
  vorgegebenen Terminoptionen und keine separate Abstimmungstabelle.

- **RPC-only statt offener Tabellenzugriff.** Row Level Security allein
  reicht hier nicht aus: Eine Policy wie „SELECT erlaubt“ würde zwar pro
  Zeile funktionieren, aber nichts daran hindern, dass jemand **alle**
  Kalender auflistet (`GET /calendars?select=*`) und sich so Zugriff auf
  fremde, eigentlich nur über den unrätbaren Link erreichbare Kalender
  verschafft. Deshalb ist RLS auf beiden Tabellen aktiv, aber **ohne**
  Policies für `anon`/`authenticated` – direkter Tabellenzugriff ist
  komplett gesperrt. Die App greift ausschließlich über zwei
  `SECURITY DEFINER`-Datenbankfunktionen zu (`get_calendar_data`,
  `set_availability`), die jeweils die Kalender-ID als Parameter
  verlangen. Ohne die UUID aus dem Link kommt man an nichts heran.

- **„Nur den eigenen Eintrag ändern“ läuft über den Namen, nicht über
  ein Konto.** Logins sind bewusst ausgeschlossen. `set_availability`
  ersetzt alle Einträge derselben Person (Groß-/Kleinschreibung
  ignoriert) – erneutes Eintragen unter demselben Namen aktualisiert
  also die Auswahl, statt Duplikate anzulegen; abgesichert zusätzlich
  über einen eindeutigen Index auf
  `(calendar_id, lower(participant_name), date)`. Das ist bewusst so
  simpel wie bei Doodle: Wer den Namen einer anderen Person benutzt,
  kann deren Eintrag überschreiben. Eine stärkere Zuordnung würde eine
  Form von Identität voraussetzen, die hier nicht gewünscht ist.

- **Passwortschutz fürs Anlegen über eine Supabase Edge Function.**
  Rein clientseitiger Code kann kein Geheimnis wahren. Die Function
  [`supabase/functions/create-calendar`](supabase/functions/create-calendar/index.ts)
  prüft das eingesandte Passwort serverseitig (SHA-256-Hash-Vergleich
  gegen ein Secret) und legt den Kalender danach mit dem
  Service-Role-Key an – dieser Key existiert ausschließlich in der
  Function-Umgebung, niemals im Browser. Sich in einen bestehenden
  Kalender einzutragen bleibt passwortfrei.

- **Lokal auswählen, bewusst speichern.** Ein Tipp auf einen Tag ändert
  die Auswahl zunächst nur lokal; erst „Änderungen speichern“ schreibt
  sie in die Datenbank. Das ist robuster als Auto-Save pro Tipp (keine
  halbfertigen Zustände bei wackligem Mobilfunknetz) und macht trotzdem
  sofort sichtbar, wie sich die eigene Auswahl auf die Übersicht
  auswirkt.

- **Alles in UTC gerechnet.** Das Kalenderraster und die Datumsanzeige
  arbeiten durchgehend mit UTC-Datumsanteilen, passend zum `date`-Typ in
  Postgres. Nur „heute“ wird aus der lokalen Zeitzone abgeleitet – sonst
  würde der Kalender um 00:30 Uhr deutscher Zeit noch den Vortag
  markieren. Die Tests laufen bewusst auch unter fremden Zeitzonen
  (siehe [Automatisierte Tests](#automatisierte-tests)).

- **GitHub-Actions-Build nur für die Config-Injection.** Die App ist
  reines HTML/CSS/JS ohne Bundler. Der einzige Grund für einen
  Build-Schritt ist, `js/config.js` (Supabase-URL + Anon-Key) nicht im
  Klartext committen zu müssen, sondern beim Deployment aus
  Repository-Variablen zu erzeugen (siehe
  [`scripts/build.js`](scripts/build.js)). Die Werte selbst sind laut
  Supabase-Doku ohnehin für den Browser bestimmt und kein Geheimnis; die
  eigentliche Absicherung übernimmt RLS.

- **ES-Module + Supabase-JS per CDN (`esm.sh`).** Kein `npm install`,
  kein Bundler, direkt im Browser lauffähig. `js/calendarLogic.js`
  enthält die reine, backend- und DOM-unabhängige Logik (Kalenderraster,
  Auszählung, Rangfolge) und wird 1:1 mit dem in Node eingebauten
  Test-Runner getestet – ganz ohne zusätzliche Abhängigkeiten.

---

## Projektstruktur

```
index.html                     Startseite: neuen Kalender anlegen
kalender.html                  Kalenderansicht: eintragen + Übersicht
css/styles.css                 Responsive, Mobile-First-Styling
js/
  config.example.js            Vorlage für Supabase-Verbindungsdaten
  supabaseClient.js            Erstellt den Supabase-Client
  utils.js                     Validierung, Datumsformatierung
  calendarLogic.js             Kalenderraster, Auszählung, Rangfolge (reine Logik)
  create.js                    Seiten-Logik für index.html
  calendar.js                  Seiten-Logik für kalender.html
tests/
  calendarLogic.test.js        Tests für Raster, Auszählung, Gleichstände
  utils.test.js                Tests für Validierung/Datumsformat
supabase/
  config.toml                  Projekt-Konfiguration (CLI/GitHub-Integration)
  migrations/                  SQL-Migrationen (Tabellen, RLS, RPC-Funktionen)
  .env.example                 Vorlage für lokale Function-Secrets
  functions/create-calendar/   Edge Function: Passwortprüfung + Anlegen
scripts/build.js               Baut dist/ für GitHub Pages
.github/workflows/deploy.yml   Tests + automatisches Pages-Deployment
```

---

## Lokal testen

Voraussetzung: [Node.js](https://nodejs.org) ≥ 18. Kein `npm install`
nötig – das Projekt hat keine Abhängigkeiten.

1. **Supabase-Projekt einrichten** (siehe unten) und Konfigurationsdatei
   anlegen:

   ```bash
   cp js/config.example.js js/config.js
   ```

   Trage in `js/config.js` deine Supabase-URL und den `anon`-Key ein
   (Supabase-Dashboard → Project Settings → API). Diese Datei ist in
   `.gitignore` und wird nicht committet.

2. **Statischen Server starten** (ES-Module funktionieren nicht über
   `file://`):

   ```bash
   npx serve .
   # oder: python3 -m http.server 8080
   ```

3. Im Browser öffnen, einen Kalender anlegen und den erzeugten Link in
   einem zweiten Tab bzw. auf dem Handy öffnen, um das Eintragen unter
   verschiedenen Namen zu testen.

---

## Automatisierte Tests

Die Kernlogik (Kalenderraster inkl. Schaltjahren und Monatswechseln,
Auszählung pro Tag, Rangfolge inkl. Gleichstand-Fällen, Ersetzen der
eigenen Auswahl) ist mit dem in Node eingebauten Test-Runner getestet:

```bash
npm test
```

Weil Datumslogik gern an Zeitzonen scheitert, lohnt sich zusätzlich ein
Durchlauf unter einer fremden Zeitzone:

```bash
TZ=Pacific/Auckland npm test
TZ=America/Los_Angeles npm test
```

Der GitHub-Actions-Workflow führt die Tests bei jedem Push und jeder
Pull Request aus; das Deployment läuft nur, wenn sie erfolgreich sind.

---

## Supabase einrichten

1. **Projekt anlegen:** Auf [supabase.com](https://supabase.com)
   kostenlos registrieren und ein neues Projekt erstellen.

2. **Datenbankschema anlegen** – zwei Wege, wähl einen:

   - **Option A (am schnellsten): manuell im SQL Editor.**
     Supabase-Dashboard → **SQL Editor** → **New query**, den kompletten
     Inhalt der Migrationsdateien aus
     [`supabase/migrations/`](supabase/migrations) **in
     Dateinamen-Reihenfolge** einfügen und jeweils **Run** klicken.

   - **Option B: über die Supabase CLI.**

     ```bash
     supabase link --project-ref <dein-projekt-ref>
     supabase db push
     ```

     Praktisch für künftige Schemaänderungen: neue Migrationsdatei mit
     `supabase migration new <beschreibung>` anlegen, committen, dann
     erneut `supabase db push`.

   > **Hinweis zur GitHub-Integration:** Verbindest du dein
   > Supabase-Projekt über **Project Settings → Integrations → GitHub
   > Connection** mit diesem Repository, richtet Supabase vor allem
   > *Preview-Branches für Pull Requests* ein. Neue Migrationen werden
   > dadurch **nicht automatisch** in die Produktionsdatenbank
   > übernommen – verlass dich also auf Option A oder B.

   Das legt die Tabellen `calendars` und `availabilities`,
   Row-Level-Security (ohne Policies → dichter Tabellenzugriff) sowie
   die RPC-Funktionen `get_calendar_data` und `set_availability` an. Da
   die Skripte ausschließlich aus `CREATE`/`GRANT`/`DROP` bestehen (kein
   `SELECT`), ist **„Success. No rows returned“** im SQL Editor die
   erwartete Erfolgsmeldung – kein Fehler. Prüfen lässt sich der Erfolg
   im **Table Editor** (beide Tabellen sichtbar) bzw. unter **Database →
   Functions** (beide RPC-Funktionen sichtbar).

3. **API-Zugangsdaten notieren:** **Project Settings → API** →
   `Project URL` und den `anon` `public` Key kopieren.

4. **Edge Function für den Passwortschutz deployen.** Voraussetzung:
   [Supabase CLI](https://supabase.com/docs/guides/cli) installiert und
   eingeloggt (`supabase login`). Die Befehle müssen **im Wurzelordner
   dieses Repositorys** laufen, damit die CLI `supabase/functions/`
   findet.

   ```bash
   # Projekt einmalig verknüpfen (nur die Projekt-Ref, nicht die volle URL,
   # z. B. aus https://<projekt-ref>.supabase.co):
   supabase link --project-ref <dein-projekt-ref>

   # Passwort-Hash berechnen (Beispiel mit Node):
   node -e "console.log(require('crypto').createHash('sha256').update('DEIN_PASSWORT').digest('hex'))"

   # Das Ergebnis als Secret in der Function-Umgebung hinterlegen:
   supabase secrets set CALENDAR_CREATE_PASSWORD_HASH=<der-berechnete-hash>

   # Function deployen:
   supabase functions deploy create-calendar
   ```

   `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` stehen Edge Functions
   automatisch zur Verfügung – dafür ist nichts weiter zu tun. Der
   Service-Role-Key verlässt damit nie die Supabase-Umgebung.

   Zum lokalen Testen der Function:

   ```bash
   cp supabase/.env.example supabase/.env
   # CALENDAR_CREATE_PASSWORD_HASH in supabase/.env eintragen
   supabase functions serve create-calendar --env-file supabase/.env
   ```

5. **Abuse-Schutz (optional, empfohlen):** Ein eigenes Rate-Limiting ist
   ohne eigenen Server nicht sinnvoll umsetzbar – die App verlässt sich
   bewusst auf die eingebauten Kontingente von Supabase
   (**Settings → API**).

---

## GitHub Pages einrichten

1. **Repository anlegen** (öffentlich – private GitHub-Pages-Seiten
   erfordern GitHub Pro/Team) und diesen Code pushen.

2. **Repository-Variablen setzen:** **Settings → Secrets and variables
   → Actions → Variables** → **New repository variable**:
   - `SUPABASE_URL` = deine Supabase-Projekt-URL
   - `SUPABASE_ANON_KEY` = dein `anon`-Key

3. **Pages aktivieren:** **Settings → Pages** → **Source** auf
   **GitHub Actions** stellen (nicht „Deploy from a branch“).

4. **Deployment-Branch freigeben:** **Settings → Environments →
   `github-pages`** → unter **Deployment branches and tags** sicherstellen,
   dass `main` erlaubt ist. Fehlt das, bricht der Workflow mit
   *„Branch 'main' is not allowed to deploy to github-pages due to
   environment protection rules“* ab.

5. **Auf `main` pushen.** Nach ein bis zwei Minuten ist die Seite unter
   `https://<username>.github.io/<repository>` erreichbar – öffentlich,
   mit HTTPS, ohne Tunnel oder Port-Weiterleitung.

---

## Updates & Deployment

Ganz normal weiterentwickeln und auf `main` pushen (bzw. per Pull
Request mergen): Der Workflow führt die Tests aus und veröffentlicht bei
Erfolg automatisch die neue Version über GitHub Pages. Kein manuelles
Server-Management, kein Neustart, keine Wartung.

Ändert sich das **Datenbankschema**, gehört zusätzlich eine neue
Migration nach `supabase/migrations/` und einmalig `supabase db push`
(oder der SQL Editor) dazu – Supabase übernimmt Migrationen nicht
automatisch beim Push. Ändert sich die **Edge Function**, ist einmalig
`supabase functions deploy create-calendar` nötig.

---

## Bedienungsanleitung

**Kalender anlegen:**
1. Startseite öffnen, Titel eingeben (Pflicht), optional eine
   Beschreibung.
2. Das gemeinsame Passwort eingeben und auf „Kalender anlegen“ tippen.
3. Den erzeugten Link kopieren und an die Freunde schicken.

**Eintragen, wann du Zeit hast:**
1. Link öffnen (jedes Gerät, ohne Login).
2. Namen eintragen – warst du schon mal da, werden deine bisherigen Tage
   automatisch geladen.
3. Im Kalender die Tage antippen, an denen du Zeit hast. Nochmal
   antippen entfernt dich wieder. Mit ‹ und › zwischen den Monaten
   wechseln.
4. Auf „Änderungen speichern“ tippen – danach sehen alle anderen deine
   Tage ebenfalls.

**Sehen, wer wann kann:**
- Im Kalender sind Tage, an denen schon jemand Zeit hat, hell
  hervorgehoben; die Zahl in der Ecke zeigt, wie viele Leute das sind.
  Deine eigenen Tage sind kräftig eingefärbt. Wer genau an einem Tag
  kann, steht im Tooltip der Zelle (Desktop) und in der Übersicht.
- Unter „Wer kann wann?“ stehen alle Tage absteigend nach Anzahl der
  Personen, jeweils mit Namen. Die drei bestbesuchten Tage sind als
  Platz 1/2/3 hervorgehoben; bei Gleichstand um Platz 3 werden alle
  gleichauf liegenden Tage angezeigt statt willkürlich einer davon
  weggelassen.
- Der Stand ist nach jedem Neuladen aktuell (kein Live-Update – das ist
  bewusst nicht umgesetzt).

---

## Sicherheit

- **Unrätbare IDs:** Kalender-IDs sind UUIDv4 (`gen_random_uuid()`) –
  keine fortlaufenden Nummern.
- **Kein Durchblättern fremder Kalender:** Row Level Security ohne
  Policies sperrt jeden direkten Tabellenzugriff; der gesamte Zugriff
  läuft über `SECURITY DEFINER`-RPC-Funktionen, die die unrätbare
  `calendar_id` verlangen.
- **Eingabevalidierung:** Titel, Beschreibung und Namen werden client-
  und serverseitig längenbegrenzt (siehe `js/utils.js`, die Edge
  Function und die `CHECK`-Constraints in den Migrationen). Die Anzahl
  der auf einmal gespeicherten Tage ist ebenfalls begrenzt.
- **XSS-Schutz:** Die Oberfläche baut kein HTML aus Nutzereingaben
  zusammen, sondern setzt alle dynamischen Texte über
  `textContent`/DOM-APIs – eingegebener Text wird damit nie als HTML
  interpretiert.
- **Kein manuelles Zusammenbauen von Abfragen:** Der Datenbankzugriff
  läuft ausschließlich über die offiziellen `supabase-js`-Methoden
  (`.rpc()`, `.functions.invoke()`).
- **Passwortschutz fürs Anlegen:** serverseitig in der Edge Function
  geprüft (SHA-256-Hash gegen ein Supabase-Secret), nicht im Frontend.
- **Öffentliche Config-Werte sind kein Sicherheitsloch:** Supabase-URL
  und `anon`-Key dürfen laut Supabase-Doku im Frontend sichtbar sein;
  die Zugriffskontrolle übernehmen RLS und die Edge Function.

---

## Eigene Domain (optional)

1. Beim Domain-Anbieter einen `CNAME`-Eintrag (z. B.
   `termine.deine-domain.de`) auf `<username>.github.io` anlegen.
2. Im Repository unter **Settings → Pages → Custom domain** die Domain
   eintragen und speichern. HTTPS stellt GitHub automatisch per
   Let's-Encrypt-Zertifikat bereit.

---

## Grenzen / bewusst nicht umgesetzt

E-Mail-/Push-Benachrichtigungen, ICS-Kalender-Export, Mehrsprachigkeit,
echte Nutzerkonten, Live-Updates ohne Neuladen sowie das nachträgliche
Bearbeiten/Löschen fremder Einträge durch den Organisator. Die
Architektur verhindert diese Erweiterungen nicht.
