function requireEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY') {
  const value = import.meta.env[name];
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

export const publicEnv = {
  supabaseUrl: requireEnv('VITE_SUPABASE_URL'),
  supabasePublishableKey: requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
};
