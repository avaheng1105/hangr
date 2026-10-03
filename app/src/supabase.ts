import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// The live Hangr project. The anon key is public by design: it ships in the
// app, and row-level security decides what it can do. Never put the
// service_role key here. Override both in app/.env.local (see .env.example);
// set them to empty strings to run on the bundled sample items.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://kucodzbbcumwtravnuft.supabase.co';
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1Y29kemJiY3Vtd3RyYXZudWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NzEyMjQsImV4cCI6MjEwNjU0NzIyNH0.LYbtihwXW585tDCFD2H0z6cylk-trAmJZOY6X0idJSw';

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Web uses localStorage by default; AsyncStorage needs `window` there.
          ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

// Refresh the session only while the app is in the foreground.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
