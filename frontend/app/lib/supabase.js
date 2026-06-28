import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://goipxknsdzgphmmghgmt.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// We export a singleton instance of the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
