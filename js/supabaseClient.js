import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if (SUPABASE_URL.startsWith('__') || SUPABASE_ANON_KEY.startsWith('__')) {
  // eslint-disable-next-line no-console
  console.warn(
    'Terminfinder: js/config.js enthält noch Platzhalter. Bitte Supabase-URL und Anon-Key eintragen (siehe README.md).'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
