-- Terminfinder – Supabase-Datenbankschema (initiale Migration)
--
-- Wird automatisch angewendet, sobald dieses Repository per GitHub-
-- Integration mit deinem Supabase-Projekt verbunden ist (Supabase-
-- Dashboard -> Project Settings -> Integrations -> GitHub Connection)
-- und diese Datei auf den verbundenen Branch (i. d. R. main) gemerged
-- wird. Ohne diese Integration kannst du den Inhalt stattdessen einmalig
-- manuell im Supabase-Dashboard ausführen: Project -> SQL Editor ->
-- New query -> Inhalt einfügen -> Run.
--
-- Sicherheitskonzept (siehe README.md, Abschnitt "Sicherheit"):
--   Row Level Security ist auf allen vier Tabellen aktiviert, aber es gibt
--   bewusst KEINE Policies für anon/authenticated. Dadurch ist direkter
--   Tabellenzugriff über die REST-API vollständig gesperrt – niemand kann
--   z. B. "alle Umfragen" auflisten und so an unrätbare Poll-IDs kommen.
--
--   Der komplette Zugriff der Web-App läuft stattdessen ausschließlich
--   über die unten definierten SECURITY DEFINER-Funktionen (RPCs). Jede
--   dieser Funktionen verlangt die poll_id (die unrätbare UUID aus dem
--   Umfrage-Link) als Parameter und arbeitet nur innerhalb dieser einen
--   Umfrage. Das Erstellen neuer Umfragen läuft bewusst NICHT über eine
--   RPC, sondern über die Edge Function supabase/functions/create-poll,
--   da dort zusätzlich das gemeinsame Passwort geprüft wird.

create extension if not exists pgcrypto;

create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists date_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  date date not null,
  proposed_by text check (proposed_by is null or char_length(proposed_by) <= 100),
  created_at timestamptz not null default now(),
  unique (poll_id, date)
);

create index if not exists date_options_poll_id_idx on date_options (poll_id);

create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  participant_name text not null check (char_length(participant_name) between 1 and 100),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists responses_poll_id_idx on responses (poll_id);

-- Sorgt für "gleicher Name -> gleiche Response wird aktualisiert" (Groß-/
-- Kleinschreibung wird ignoriert), siehe submit_response() weiter unten.
create unique index if not exists responses_poll_participant_uidx
  on responses (poll_id, lower(participant_name));

create table if not exists response_selections (
  response_id uuid not null references responses(id) on delete cascade,
  date_option_id uuid not null references date_options(id) on delete cascade,
  primary key (response_id, date_option_id)
);

create index if not exists response_selections_date_option_id_idx
  on response_selections (date_option_id);

alter table polls enable row level security;
alter table date_options enable row level security;
alter table responses enable row level security;
alter table response_selections enable row level security;
-- Bewusst KEINE Policies -> kein direkter Zugriff für anon/authenticated.

revoke all on polls, date_options, responses, response_selections
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- get_poll_data: Lädt eine Umfrage inkl. aller Terminvorschläge und
-- Antworten (inkl. Namen der Abstimmenden) in einem einzigen Aufruf.
-- Gibt NULL zurück, wenn die poll_id nicht existiert.
-- ---------------------------------------------------------------------
create or replace function get_poll_data(p_poll_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result json;
begin
  select json_build_object(
    'poll', (
      select json_build_object(
        'id', id, 'title', title, 'description', description, 'created_at', created_at
      )
      from polls where id = p_poll_id
    ),
    'date_options', coalesce((
      select json_agg(
        json_build_object('id', d.id, 'date', d.date, 'proposed_by', d.proposed_by)
        order by d.date asc
      )
      from date_options d where d.poll_id = p_poll_id
    ), '[]'::json),
    'responses', coalesce((
      select json_agg(
        json_build_object(
          'id', r.id,
          'participant_name', r.participant_name,
          'submitted_at', r.submitted_at,
          'updated_at', r.updated_at,
          'date_option_ids', coalesce((
            select json_agg(rs.date_option_id)
            from response_selections rs
            where rs.response_id = r.id
          ), '[]'::json)
        )
        order by r.submitted_at asc
      )
      from responses r where r.poll_id = p_poll_id
    ), '[]'::json)
  )
  into v_result;

  if (v_result -> 'poll') is null then
    return null;
  end if;

  return v_result;
end;
$$;

grant execute on function get_poll_data(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- add_date_option: Fügt einen neuen Terminvorschlag hinzu. Existiert das
-- Datum für diese Umfrage schon, wird einfach der bestehende Eintrag
-- zurückgegeben (kein Fehler, kein Duplikat).
-- ---------------------------------------------------------------------
create or replace function add_date_option(
  p_poll_id uuid,
  p_date date,
  p_proposed_by text default null
)
returns table(id uuid, date date, proposed_by text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposed_by text;
begin
  if not exists (select 1 from polls where polls.id = p_poll_id) then
    raise exception 'Umfrage nicht gefunden.';
  end if;

  v_proposed_by := nullif(btrim(coalesce(p_proposed_by, '')), '');
  if v_proposed_by is not null and char_length(v_proposed_by) > 100 then
    v_proposed_by := left(v_proposed_by, 100);
  end if;

  insert into date_options (poll_id, date, proposed_by)
  values (p_poll_id, p_date, v_proposed_by)
  on conflict (poll_id, date) do nothing;

  return query
    select d.id, d.date, d.proposed_by
    from date_options d
    where d.poll_id = p_poll_id and d.date = p_date;
end;
$$;

grant execute on function add_date_option(uuid, date, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- submit_response: Legt die Stimme eines Teilnehmers an oder aktualisiert
-- sie, falls unter demselben Namen (Groß-/Kleinschreibung egal) für diese
-- Umfrage bereits abgestimmt wurde. date_option_ids, die nicht zu dieser
-- Umfrage gehören, werden defensiv ignoriert.
-- ---------------------------------------------------------------------
create or replace function submit_response(
  p_poll_id uuid,
  p_participant_name text,
  p_date_option_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_response_id uuid;
begin
  if not exists (select 1 from polls where polls.id = p_poll_id) then
    raise exception 'Umfrage nicht gefunden.';
  end if;

  v_name := btrim(coalesce(p_participant_name, ''));
  if char_length(v_name) = 0 or char_length(v_name) > 100 then
    raise exception 'Bitte gib einen gültigen Namen (1–100 Zeichen) an.';
  end if;

  insert into responses (poll_id, participant_name)
  values (p_poll_id, v_name)
  on conflict (poll_id, lower(participant_name))
  do update set participant_name = excluded.participant_name, updated_at = now()
  returning id into v_response_id;

  delete from response_selections where response_id = v_response_id;

  insert into response_selections (response_id, date_option_id)
  select v_response_id, d.id
  from date_options d
  where d.poll_id = p_poll_id
    and d.id = any (coalesce(p_date_option_ids, array[]::uuid[]));

  return v_response_id;
end;
$$;

grant execute on function submit_response(uuid, text, uuid[]) to anon, authenticated;
