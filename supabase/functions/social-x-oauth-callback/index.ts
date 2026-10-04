import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { safeDatabaseError } from "../_shared/x-oauth.ts";
import { handleOAuthCallback } from "../_shared/x-oauth-callback-handler.ts";

const socialXOauthCallbackFunction = {
  fetch(req: Request): Promise<Response> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    return handleOAuthCallback(req, {
      supabaseUrl,
      rpc: async (name, args) => {
        const client = createClient(
          supabaseUrl,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await client.rpc(name, args);
        if (error) throw safeDatabaseError(error);
        return data;
      },
    });
  },
};
export default socialXOauthCallbackFunction;
