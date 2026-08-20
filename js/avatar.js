// Profilbilder ohne Datei-Upload: Jeder Account bekommt automatisch ein
// buntes Emoji-Avatar, das sich aus dem Namen ableitet – gleicher Name,
// gleiches Bild. Wer mag, kann Emoji und Farbe später im Profil ändern.
//
// Reine Funktionen ohne DOM-Zugriff, damit sie in den Node-Tests laufen.

import { canonicalizeName, hashString } from './utils.js';

export const AVATAR_EMOJIS = [
  '🦊', '🐼', '🐨', '🦁', '🐸', '🐙', '🦄', '🐝',
  '🐧', '🦉', '🐳', '🦖', '🌸', '🌵', '🍕', '🎸',
  '🚀', '⚡', '🌈', '🍀', '🔥', '🎈', '🍩', '🎨',
];

export const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e',
];

/** Leitet Emoji und Farbe deterministisch aus dem Namen ab. */
export function defaultAvatarFor(name) {
  const hash = hashString(canonicalizeName(name).toLowerCase());
  return {
    emoji: AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length],
    // Zweiter, verschobener Wert, damit Emoji und Farbe nicht gekoppelt sind.
    color: AVATAR_COLORS[Math.floor(hash / AVATAR_EMOJIS.length) % AVATAR_COLORS.length],
  };
}

/** Kürzel für sehr enge Darstellungen (z. B. Tooltip-freie Listen). */
export function initialsFor(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
