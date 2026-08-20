// Registrierung und Anmeldung – nur mit Name und Passwort.
//
// Umgesetzt über Supabase Auth: Passwörter werden dort serverseitig gehasht
// gespeichert (bcrypt) und sind für die App nie lesbar. Nach der Anmeldung
// hängt Supabase an jede Datenbank-Anfrage ein signiertes Token, aus dem die
// Zugriffsregeln (siehe supabase/migrations/) `auth.uid()` ableiten. Ein
// manipulierter Client kann sich damit nicht als jemand anderes ausgeben.
//
// Da wir bewusst keine E-Mail-Adresse abfragen, wird aus dem Namen eine
// technische Kennung erzeugt – siehe nameToAuthEmail() in utils.js.

import { supabase } from './supabaseClient.js';
import { defaultAvatarFor } from './avatar.js';
import { nameToAuthEmail } from './utils.js';

/** Legt einen neuen Account an und meldet ihn direkt an. */
export async function register(displayName, password) {
  const avatar = defaultAvatarFor(displayName);

  const { data, error } = await supabase.auth.signUp({
    email: nameToAuthEmail(displayName),
    password,
    options: {
      data: {
        display_name: displayName,
        avatar_emoji: avatar.emoji,
        avatar_color: avatar.color,
      },
    },
  });

  if (error) throw new Error(translateAuthError(error, 'register'));

  if (!data.session) {
    // Passiert, wenn in Supabase die E-Mail-Bestätigung aktiv ist. Da unsere
    // Adressen technisch sind, käme nie eine Bestätigungsmail an.
    throw new Error(
      'Der Account wurde angelegt, aber die Anmeldung ist noch gesperrt. ' +
        'In den Supabase-Einstellungen muss "Confirm email" deaktiviert sein (siehe README).'
    );
  }

  await ensureProfile(displayName);
  return data.session;
}

/** Meldet einen bestehenden Account an. */
export async function login(displayName, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: nameToAuthEmail(displayName),
    password,
  });

  if (error) throw new Error(translateAuthError(error, 'login'));

  await ensureProfile(displayName);
  return data.session;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * Stellt sicher, dass zum angemeldeten Account eine Profilzeile existiert.
 *
 * Warum nicht einfach beim Registrieren anlegen? Falls das Anlegen damals
 * fehlschlug (z. B. abgebrochene Verbindung), käme die Person sonst nie
 * wieder in einen brauchbaren Zustand – ohne Profil lassen sich wegen der
 * Fremdschlüssel-Beziehung keine Kalendereinträge speichern.
 */
export async function ensureProfile(fallbackName) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return null;

  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_emoji, avatar_color')
    .eq('id', user.id)
    .maybeSingle();

  if (selectError) throw new Error('Dein Profil konnte nicht geladen werden.');
  if (existing) return existing;

  const meta = user.user_metadata ?? {};
  const name = meta.display_name || fallbackName || 'Unbekannt';
  const avatar = defaultAvatarFor(name);

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      display_name: name,
      avatar_emoji: meta.avatar_emoji || avatar.emoji,
      avatar_color: meta.avatar_color || avatar.color,
    })
    .select('id, display_name, avatar_emoji, avatar_color')
    .single();

  if (insertError) {
    if (isUniqueViolation(insertError)) {
      throw new Error('Diesen Namen benutzt schon jemand. Bitte wähle einen anderen.');
    }
    throw new Error('Dein Profil konnte nicht angelegt werden.');
  }
  return created;
}

/** Ändert Emoji und Farbe des eigenen Profilbilds. */
export async function updateAvatar(userId, { emoji, color }) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_emoji: emoji, avatar_color: color })
    .eq('id', userId)
    .select('id, display_name, avatar_emoji, avatar_color')
    .single();

  if (error) throw new Error('Dein Profilbild konnte nicht gespeichert werden.');
  return data;
}

function isUniqueViolation(error) {
  return error?.code === '23505';
}

/**
 * Übersetzt die englischen Supabase-Meldungen in verständliche Hinweise.
 * Beim Login bleibt die Meldung bewusst unspezifisch ("Name oder Passwort
 * stimmt nicht"), damit sich über die Fehlermeldung nicht herausfinden
 * lässt, welche Namen es überhaupt gibt.
 */
function translateAuthError(error, context) {
  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '').toLowerCase();

  // Fehlkonfiguration des Supabase-Projekts – betrifft Registrierung und
  // Anmeldung gleichermaßen und ist nur im Dashboard zu beheben. Deshalb
  // hier eine Meldung, die genau sagt, welcher Schalter gemeint ist.
  if (code === 'email_provider_disabled' || message.includes('email signups are disabled')) {
    return (
      'Anmeldungen sind im Supabase-Projekt abgeschaltet. Unter ' +
      'Authentication → Sign In / Providers muss der Anbieter "Email" ' +
      'eingeschaltet sein (und darin "Confirm email" aus).'
    );
  }

  if (context === 'register') {
    if (message.includes('already registered') || message.includes('already been registered')) {
      return 'Diesen Namen benutzt schon jemand. Bitte wähle einen anderen.';
    }
    if (message.includes('password')) {
      return 'Das Passwort ist zu kurz oder zu einfach.';
    }
    if (message.includes('email') && message.includes('invalid')) {
      return 'Mit diesem Namen kommt die Anmeldung nicht zurecht. Bitte wähle einen anderen.';
    }
    if (
      code === 'signup_disabled' ||
      message.includes('signups not allowed') ||
      message.includes('signup is disabled')
    ) {
      return 'Neue Accounts sind in den Supabase-Einstellungen gerade deaktiviert.';
    }
    // Unbekannter Fall: Originalmeldung anhängen. Ohne sie lässt sich von
    // außen nicht erkennen, woran es lag – das kostete beim Einrichten
    // schon einmal unnötig Zeit.
    return `Der Account konnte nicht angelegt werden. (${error?.message ?? 'unbekannter Fehler'})`;
  }

  if (message.includes('invalid login credentials')) {
    return 'Name oder Passwort stimmt nicht.';
  }
  if (message.includes('email not confirmed')) {
    return 'Dieser Account ist noch nicht freigeschaltet. In Supabase muss "Confirm email" aus sein (siehe README).';
  }
  return 'Die Anmeldung hat nicht geklappt. Bitte versuch es erneut.';
}
