import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://agqrjmepbkjgxubongdi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFncXJqbWVwYmtqZ3h1Ym9uZ2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQ5ODUsImV4cCI6MjA5MDM3MDk4NX0.x4qSwFnmf-wOSwnC7YkEo6qVvz7VM4nQGP-4IBz42dM';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFncXJqbWVwYmtqZ3h1Ym9uZ2RpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDc5NDk4NSwiZXhwIjoyMDkwMzcwOTg1fQ.OC8CmOTo_k1p8qqM9GYozWzlX8jo4oxBFQee2pQWp_s';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
