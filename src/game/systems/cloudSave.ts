import { createClient, type User } from "@supabase/supabase-js";

export type CloudSaveStatus = "disabled" | "signed-out" | "syncing" | "synced" | "error";

// These are deliberately public browser credentials. Row-level security on game_saves
// ensures a player can only ever read or write their own archive.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : undefined;

export const cloudSaveEnabled = !!supabase;

export async function currentCloudUser(): Promise<User | undefined> {
  if (!supabase) return undefined;
  // getSession is local and correctly represents a first-time device as signed out.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? undefined;
}

function cloudSaveEmail(saveName: string) {
  const normalized = saveName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length < 3 || normalized.length > 42) {
    throw new Error("Choose a save name between 3 and 42 letters or numbers.");
  }
  // This is an account identifier only. Turning off email confirmation means no
  // authentication email is ever sent, avoiding the shared SMTP quota entirely.
  return `save-${normalized}@ourlittleworld.local`;
}

export async function signInOrCreateCloudSave(saveName: string, password: string) {
  if (!supabase) throw new Error("Cloud saves are not configured for this build.");
  if (password.length < 8) throw new Error("Use a cloud-save password with at least 8 characters.");
  const email = cloudSaveEmail(saveName);
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data.user) return { email, created: false };

  const signUp = await supabase.auth.signUp({ email, password, options: { data: { save_name: saveName.trim() } } });
  if (signUp.error) throw signUp.error;
  if (!signUp.data.session || !signUp.data.user) {
    throw new Error("That save name already exists. Check its password, or choose a different save name.");
  }
  return { email, created: true };
}

export async function readCloudArchive(userId: string): Promise<unknown | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.from("game_saves").select("archive").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.archive;
}

export async function writeCloudArchive(userId: string, archive: object) {
  if (!supabase) return;
  const { error } = await supabase.from("game_saves").upsert(
    { user_id: userId, archive, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function signOutOfCloud() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
