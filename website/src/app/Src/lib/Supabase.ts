import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export type Photo = {
  id: string;
  user_id: string;
  image_url: string;
  thumbnail_url?: string;
  title?: string;
  description?: string;
  latitude: number;
  longitude: number;
  country?: string;
  city?: string;
  created_at: string;
  likes_count: number;
  views_count: number;
  profiles?: Profile;
};

export type Profile = {
  id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  created_at: string;
};
