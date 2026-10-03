import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const googleAuthEnabled =
  process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true";

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: { storageKey: "instatic-talksx:gourmet:auth" },
      })
    : null;
