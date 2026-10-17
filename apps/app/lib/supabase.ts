import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill them in.'
  );
}

// Expo Router static web export renders routes in Node, where there is no
// window/localStorage. Guard session persistence so the module can be imported
// during server rendering without touching browser-only APIs.
const isServer = typeof window === 'undefined';

const noopStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    storage: isServer ? noopStorage : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    // Web handles the auth fragment itself; native does not. Never during SSR.
    detectSessionInUrl: !isServer && Platform.OS === 'web',
  },
});
