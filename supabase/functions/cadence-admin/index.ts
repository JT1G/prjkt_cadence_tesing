import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply({ error: "Sign in to continue." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || (publishableKeys ? JSON.parse(publishableKeys).default : "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (secretKeys ? JSON.parse(secretKeys).default : "");
  const admins = new Set((Deno.env.get("CADENCE_ADMIN_USER_IDS") || "").split(",").map(x => x.trim()).filter(Boolean));
  if (!url || !anonKey || !serviceKey) return reply({ error: "The account-management service is not configured." }, 503);

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(authorization.slice("Bearer ".length));
  if (authError || !authData.user) return reply({ error: "Your session expired. Sign in again." }, 401);
  if (!admins.has(authData.user.id)) return reply({ error: "You are not authorized to manage Cadence accounts." }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const input = await req.json();
    if (input.action === "check-admin") return reply({ isAdmin: true });

    if (input.action === "list-users") {
      const profilesById = new Map<string, { user_id: string; display_name: string; status: string; ban_reason: string | null; banned_until: string | null; status_updated_at: string }>();
      for (let page = 0; page < 50; page++) {
        const { data, error } = await admin.from("cadence_profiles")
          .select("user_id,display_name,status,ban_reason,banned_until,status_updated_at")
          .order("status_updated_at", { ascending: false }).range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        for (const profile of data || []) profilesById.set(profile.user_id, profile);
        if (!data || data.length < 1000) break;
      }
      const users = new Map<string, { id: string; email: string; created_at: string }>();
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        for (const user of data.users) users.set(user.id, { id: user.id, email: user.email || "", created_at: user.created_at });
        if (data.users.length < 1000) break;
      }
      const rows = [...users.values()].map(user => {
        const profile = profilesById.get(user.id);
        const status = profile?.status || "active";
        return {
          user_id: user.id, email: user.email, created_at: user.created_at,
          display_name: profile?.display_name || "", status,
          ban_reason: profile?.ban_reason || null, banned_until: profile?.banned_until || null,
          status_updated_at: profile?.status_updated_at || user.created_at,
          ...(status === "banned" && profile?.banned_until && Date.parse(profile.banned_until) <= Date.now() ? { status: "active" } : {}),
        };
      });
      return reply({ users: rows });
    }

    const userId = String(input.userId || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return reply({ error: "Choose a valid account." }, 400);
    }
    if (userId === authData.user.id) return reply({ error: "You cannot change or delete your own admin account here." }, 400);

    if (input.action === "set-status") {
      const status = input.status;
      if (!(["active", "banned", "deleting"] as string[]).includes(status)) return reply({ error: "Choose active, banned, or deleting." }, 400);
      if (status === "deleting") return reply({ error: "Use the permanent deletion action to start deletion." }, 400);
      const reason = status === "banned" ? String(input.reason || "").trim().slice(0, 500) || null : null;
      const untilDate = status === "banned" && input.bannedUntil ? new Date(input.bannedUntil) : null;
      if (untilDate && Number.isNaN(untilDate.getTime())) return reply({ error: "Enter a valid ban end date." }, 400);
      if (untilDate && untilDate.getTime() <= Date.now()) return reply({ error: "Ban end date must be in the future." }, 400);
      const until = untilDate?.toISOString() || null;
      const { error } = await admin.from("cadence_profiles").upsert({
        user_id: userId, status, ban_reason: reason, banned_until: until, status_updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      return reply({ success: true, message: status === "banned" ? "Account banned. Their current session will lose data access immediately." : "Account reactivated." });
    }

    if (input.action === "delete-user") {
      const { error: markError } = await admin.from("cadence_profiles").upsert({
        user_id: userId, status: "deleting", ban_reason: null, banned_until: null, status_updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (markError) throw markError;

      const { data: profile, error: profileError } = await admin.from("cadence_profiles")
        .select("avatar_path").eq("user_id", userId).maybeSingle();
      if (profileError) throw profileError;
      if (profile?.avatar_path) {
        const { error } = await admin.storage.from("cadence-avatars").remove([profile.avatar_path]);
        if (error) throw error;
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;
      return reply({ success: true, message: "Account access was disabled, then the account and its owned data were permanently deleted." });
    }

    return reply({ error: "Unknown account-management action." }, 400);
  } catch (error) {
    console.error("cadence-admin operation failed", error);
    return reply({ error: error instanceof Error ? error.message : "Account management failed. Try again." }, 500);
  }
});

