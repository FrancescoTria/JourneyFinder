// Creates a configured Supabase client used throughout the app
// to talk with your hosted Postgres database.
import { createClient } from "@supabase/supabase-js";

// Replace these two values with the URL and anon key from your Supabase project
// (Impostali dalla dashboard di Supabase → Project Settings → API).
const SUPABASE_URL = "https://vnnrxoptpybkbtiepzqt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubnJ4b3B0cHlia2J0aWVwenF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMTE5NTQsImV4cCI6MjA3OTY4Nzk1NH0.x-hFkdmKu4OJ7hQVTdTQF7waXsyv4H_nTIQ_S0wDpWM";

// Single shared client instance so every screen reuses the same configuration.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
