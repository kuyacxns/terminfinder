// Supabase Edge Function: create-poll
//
// Schlanker "Türsteher" fürs Erstellen neuer Umfragen. Rein clientseitiger
// JS-Code könnte ein Passwort niemals wirklich geheim halten – deshalb
// läuft die Prüfung hier serverseitig: Das eingesandte Passwort wird
// gehasht (SHA-256) und mit dem Hash aus der Umgebungsvariable
// POLL_CREATE_PASSWORD_HASH verglichen. Erst danach wird mit dem
// Service-Role-Key (der nur hier, nie im Browser, existiert) die Umfrage
// angelegt.
//
// Deployment (siehe README.md für Details):
//   supabase functions deploy create-poll
//   supabase secrets set POLL_CREATE_PASSWORD_HASH=<sha256-hex-des-passworts>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_DATE_OPTIONS = 50;
const MAX_PASSWORD_LENGTH = 200;

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isValidDateString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Methode nicht erlaubt.', 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Ungültige Anfrage.', 400);
  }

  const { title, description, password, dateOptions } = body ?? {};

  if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return errorResponse('Bitte gib das Passwort ein.', 400);
  }

  const expectedHash = Deno.env.get('POLL_CREATE_PASSWORD_HASH');
  if (!expectedHash) {
    console.error('POLL_CREATE_PASSWORD_HASH ist nicht gesetzt.');
    return errorResponse('Server ist nicht korrekt konfiguriert.', 500);
  }

  const submittedHash = await sha256Hex(password);
  if (submittedHash !== expectedHash.trim().toLowerCase()) {
    return errorResponse('Falsches Passwort.', 401);
  }

  if (typeof title !== 'string' || title.trim().length === 0 || title.length > MAX_TITLE) {
    return errorResponse('Bitte gib einen gültigen Titel ein (1–200 Zeichen).', 400);
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) {
      return errorResponse('Die Beschreibung ist zu lang (max. 2000 Zeichen).', 400);
    }
  }

  if (!Array.isArray(dateOptions) || dateOptions.length === 0 || dateOptions.length > MAX_DATE_OPTIONS) {
    return errorResponse('Bitte gib mindestens einen Terminvorschlag an.', 400);
  }

  const cleanDates = [...new Set(dateOptions)].filter(isValidDateString);
  if (cleanDates.length === 0) {
    return errorResponse('Bitte gib mindestens ein gültiges Datum an.', 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in der Function-Umgebung.');
    return errorResponse('Server ist nicht korrekt konfiguriert.', 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .insert({ title: title.trim(), description: description ? description.trim() : null })
    .select('id')
    .single();

  if (pollError || !poll) {
    console.error(pollError);
    return errorResponse('Umfrage konnte nicht erstellt werden.', 500);
  }

  const { error: optionsError } = await supabase
    .from('date_options')
    .insert(cleanDates.map((date) => ({ poll_id: poll.id, date })));

  if (optionsError) {
    console.error(optionsError);
    return errorResponse('Terminvorschläge konnten nicht gespeichert werden.', 500);
  }

  return jsonResponse({ id: poll.id }, 200);
});
