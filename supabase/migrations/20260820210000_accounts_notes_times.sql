-- Terminfinder – Umbau auf Accounts, Notizen und Uhrzeiten.
--
-- Neues Konzept:
--   * Es gibt genau EINEN gemeinsamen Kalender (kein Anlegen, kein Titel,
--     keine Beschreibung mehr) – die App ist der Kalender.
--   * Wer mitmachen will, legt sich einen Account an: Name (Künstlername
--     genügt) + Passwort. Dazu gibt es automatisch ein buntes Profilbild.
--   * Pro Tag kann jede Person eintragen, ob sie Zeit hat – ganztägig oder
--     zu einer bestimmten Uhrzeit – und zusätzlich eine Notiz hinterlassen,
--     unabhängig davon, ob sie an dem Tag Zeit hat.
--
-- ACHTUNG: Diese Migration entfernt die Tabellen des vorherigen Modells
-- (calendars, availabilities) samt Inhalt. Das ist gewollt – ohne
-- Benutzerkonten lassen sich die alten Einträge keiner Person zuordnen.
--
-- Anwenden: Supabase-Dashboard -> SQL Editor -> New query -> Inhalt einfügen
-- -> Run. Oder per CLI mit `supabase db push`. Siehe README.md.

-- ---------------------------------------------------------------------
-- Vorheriges Modell abräumen
-- ---------------------------------------------------------------------
drop function if exists get_calendar_data(uuid);
drop function if exists set_availability(uuid, text, date[]);

drop table if exists availabilities cascade;
drop table if exists calendars cascade;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles: der öffentliche Teil eines Accounts (Anzeigename + Profilbild).
--
-- Die eigentlichen Zugangsdaten liegen in auth.users und werden von
-- Supabase Auth verwaltet – Passwörter werden dort gehasht gespeichert und
-- sind für die App zu keinem Zeitpunkt lesbar.
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_emoji text not null default '🙂' check (char_length(avatar_emoji) between 1 and 8),
  avatar_color text not null default '#6366f1' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

-- Namen sind eindeutig (unabhängig von Groß-/Kleinschreibung), damit im
-- Kalender klar ist, wer gemeint ist.
create unique index if not exists profiles_display_name_idx
  on profiles (lower(display_name));

-- ---------------------------------------------------------------------
-- day_entries: ein Eintrag pro Person und Tag.
--
-- Bewusst eine Zeile für beides (Verfügbarkeit + Notiz): Eine Notiz ohne
-- Verfügbarkeit ist ausdrücklich erlaubt (is_available = false), ebenso
-- Verfügbarkeit ohne Notiz.
-- ---------------------------------------------------------------------
create table if not exists day_entries (
  id uuid primary key default gen_random_uuid(),
  -- Verweist auf profiles statt direkt auf auth.users, damit PostgREST
  -- Eintrag und Profil in einer Abfrage zusammen ausliefern kann.
  user_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  is_available boolean not null default false,
  all_day boolean not null default true,
  start_time time,
  end_time time,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, date),

  -- Wer nicht den ganzen Tag Zeit hat, muss eine Startzeit angeben.
  constraint day_entries_needs_start_time check (all_day or start_time is not null),
  -- Ende darf nicht vor dem Start liegen.
  constraint day_entries_time_order check (
    start_time is null or end_time is null or end_time > start_time
  )
);

create index if not exists day_entries_date_idx on day_entries (date);

-- updated_at automatisch mitführen.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists day_entries_set_updated_at on day_entries;
create trigger day_entries_set_updated_at
  before update on day_entries
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Zugriffsregeln (Row Level Security)
--
-- Grundregel: Ohne Login geht gar nichts (`anon` bekommt keinerlei Rechte).
-- Angemeldete sehen den gemeinsamen Kalender vollständig – das ist der
-- Sinn der App –, dürfen aber ausschließlich ihre EIGENEN Einträge und ihr
-- eigenes Profil anlegen, ändern und löschen. Erzwungen wird das über
-- auth.uid(), also über das signierte Token des angemeldeten Accounts;
-- ein manipulierter Client kann das nicht umgehen.
-- ---------------------------------------------------------------------
alter table profiles enable row level security;
alter table day_entries enable row level security;

revoke all on profiles, day_entries from anon;
grant select, insert, update on profiles to authenticated;
grant select, insert, update, delete on day_entries to authenticated;

drop policy if exists "Angemeldete sehen alle Profile" on profiles;
create policy "Angemeldete sehen alle Profile"
  on profiles for select to authenticated using (true);

drop policy if exists "Eigenes Profil anlegen" on profiles;
create policy "Eigenes Profil anlegen"
  on profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Eigenes Profil ändern" on profiles;
create policy "Eigenes Profil ändern"
  on profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Angemeldete sehen alle Einträge" on day_entries;
create policy "Angemeldete sehen alle Einträge"
  on day_entries for select to authenticated using (true);

drop policy if exists "Eigene Einträge anlegen" on day_entries;
create policy "Eigene Einträge anlegen"
  on day_entries for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Eigene Einträge ändern" on day_entries;
create policy "Eigene Einträge ändern"
  on day_entries for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Eigene Einträge löschen" on day_entries;
create policy "Eigene Einträge löschen"
  on day_entries for delete to authenticated using (auth.uid() = user_id);
