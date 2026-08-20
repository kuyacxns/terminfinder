// Vorlage für die Supabase-Verbindungsdaten dieser App.
//
// Lokale Entwicklung:
//   cp js/config.example.js js/config.js
//   ... und die beiden Platzhalter unten durch deine echten Werte ersetzen
//       (Supabase-Dashboard -> Project Settings -> API).
//   js/config.js ist in .gitignore und wird NICHT committet.
//
// Deployment über GitHub Pages:
//   Der GitHub-Actions-Workflow (.github/workflows/deploy.yml) erzeugt
//   dist/js/config.js automatisch aus genau dieser Datei, indem er die
//   Platzhalter durch die Repository-Variablen SUPABASE_URL und
//   SUPABASE_ANON_KEY ersetzt. Du musst js/config.js dafür NICHT committen.
//
// Hinweis zur Sicherheit: Die Supabase-URL und der "anon"-Key sind
// öffentliche, für den Browser bestimmte Werte (kein Geheimnis) – die
// eigentliche Absicherung erfolgt über Row Level Security in der
// Datenbank, siehe supabase/migrations/ und README.md.

export const SUPABASE_URL = '__SUPABASE_URL__';
export const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
