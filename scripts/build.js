// Sehr einfacher, abhängigkeitsfreier Build-Schritt für GitHub Pages.
//
// Kopiert die statischen Dateien (index.html, poll.html, css/, js/) nach
// dist/ und erzeugt dist/js/config.js aus js/config.example.js, wobei die
// Platzhalter __SUPABASE_URL__ / __SUPABASE_ANON_KEY__ durch die
// gleichnamigen Umgebungsvariablen ersetzt werden (im GitHub-Actions-
// Workflow kommen sie aus den Repository-Variablen, siehe README.md).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

const ITEMS_TO_COPY = ['index.html', 'poll.html', 'css', 'js'];

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

async function build() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });

  for (const item of ITEMS_TO_COPY) {
    await copyRecursive(path.join(root, item), path.join(distDir, item));
  }

  const template = await fs.readFile(path.join(root, 'js', 'config.example.js'), 'utf8');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      'Warnung: SUPABASE_URL / SUPABASE_ANON_KEY sind nicht gesetzt. dist/js/config.js enthält Platzhalter statt echter Werte.'
    );
  }

  const filled = template
    .replaceAll('__SUPABASE_URL__', supabaseUrl || '__SUPABASE_URL__')
    .replaceAll('__SUPABASE_ANON_KEY__', supabaseAnonKey || '__SUPABASE_ANON_KEY__');

  await fs.writeFile(path.join(distDir, 'js', 'config.js'), filled, 'utf8');

  console.log('Build abgeschlossen: dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
