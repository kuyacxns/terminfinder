-- Terminfinder – Umbau vom Abstimmungs- zum gemeinsamen Kalender.
--
-- Neues Konzept: Es gibt keine vom Organisator vorgegebenen Termine mehr,
-- über die abgestimmt wird. Stattdessen trägt jede Person direkt im Kalender
-- ein, wann sie Zeit hat – und sieht dabei, an welchen Tagen sich schon
-- andere eingetragen haben, um sich dort dazuzustellen.
--
-- ACHTUNG: Diese Migration entfernt die alten Umfrage-Tabellen samt Inhalt
-- (polls, date_options, responses, response_selections). Das ist gewollt –
-- das alte Datenmodell hat im neuen Konzept keine Entsprechung mehr.
--
-- Anwenden: Supabase-Dashboard -> SQL Editor -> New query -> Inhalt einfügen
-- -> Run. Oder per CLI mit `supabase db push`. Siehe README.md.

-- ---------------------------------------------------------------------
-- Altes Umfrage-Modell abräumen
-- ---------------------------------------------------------------------
drop function if exists get_poll_data(uuid);
drop function if exists add_date_option(uuid, date, text);
drop function if exists submit_response(uuid, text, uuid[]);

drop table if exists response_selections cascade;
drop table if exists responses cascade;
drop table if exists date_options cascade;
drop table if exists polls cascade;

-- ---------------------------------------------------------------------
-- Neues Kalender-Modell
--
-- Sicherheitskonzept (unverändert, siehe README.md):
--   Row Level Security ist aktiviert, aber es gibt bewusst KEINE Policies
--   für anon/authenticated. Direkter Tabellenzugriff über die REST-API ist
--   damit vollständig gesperrt – niemand kann "alle Kalender" auflisten und
--   so an fremde, unrätbare Kalender-IDs kommen. Der gesamte Zugriff der
--   Web-App läuft über die SECURITY DEFINER-Funktionen weiter unten, die
--   jeweils die Kalender-UUID aus dem geteilten Link verlangen.
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists calendars (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists availabilities (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references calendars(id) on delete cascade,
  participant_name text not null check (char_length(participant_name) between 1 and 100),
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists availabilities_calendar_id_idx
  on availabilities (calendar_id);

-- Verhindert Doppel-Einträge derselben Person am selben Tag (Groß-/
-- Kleinschreibung des Namens wird dabei ignoriert).
create unique index if not exists availabilities_unique_idx
  on availabilities (calendar_id, lower(participant_name), date);

alter table calendars enable row level security;
alter table availabilities enable row level security;
-- Bewusst KEINE Policies -> kein direkter Zugriff für anon/authenticated.

revoke all on calendars, availabilities from anon, authenticated;

-- ---------------------------------------------------------------------
-- get_calendar_data: Lädt einen Kalender inkl. aller Einträge (wer hat
-- wann Zeit) in einem einzigen Aufruf. Gibt NULL zurück, wenn die
-- Kalender-ID nicht existiert.
-- ---------------------------------------------------------------------
create or replace function get_calendar_data(p_calendar_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from calendars where calendars.id = p_calendar_id) then
    return null;
  end if;

  return json_build_object(
    'calendar', (
      select json_build_object(
        'id', c.id, 'title', c.title, 'description', c.description, 'created_at', c.created_at
      )
      from calendars c where c.id = p_calendar_id
    ),
    'availabilities', coalesce((
      select json_agg(
        json_build_object('participant_name', a.participant_name, 'date', a.date)
        order by a.date asc, a.participant_name asc
      )
      from availabilities a where a.calendar_id = p_calendar_id
    ), '[]'::json)
  );
end;
$$;

grant execute on function get_calendar_data(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- set_availability: Speichert, an welchen Tagen eine Person Zeit hat.
-- Bestehende Einträge derselben Person werden dabei ersetzt – erneutes
-- Eintragen unter demselben Namen aktualisiert also die Auswahl, statt
-- Duplikate anzulegen. Eine leere Liste trägt die Person komplett aus.
-- ---------------------------------------------------------------------
create or replace function set_availability(
  p_calendar_id uuid,
  p_participant_name text,
  p_dates date[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_count integer;
begin
  if not exists (select 1 from calendars where calendars.id = p_calendar_id) then
    raise exception 'Kalender nicht gefunden.';
  end if;

  v_name := btrim(coalesce(p_participant_name, ''));
  if char_length(v_name) = 0 or char_length(v_name) > 100 then
    raise exception 'Bitte gib einen gültigen Namen (1–100 Zeichen) an.';
  end if;

  if coalesce(array_length(p_dates, 1), 0) > 366 then
    raise exception 'Es können höchstens 366 Tage auf einmal gespeichert werden.';
  end if;

  delete from availabilities
   where availabilities.calendar_id = p_calendar_id
     and lower(availabilities.participant_name) = lower(v_name);

  insert into availabilities (calendar_id, participant_name, date)
  select distinct p_calendar_id, v_name, d
  from unnest(coalesce(p_dates, array[]::date[])) as d
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function set_availability(uuid, text, date[]) to anon, authenticated;
