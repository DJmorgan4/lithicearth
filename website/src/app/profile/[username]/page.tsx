'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { useParams } from 'next/navigation';

const GOLD = '#D4AF37';
const MUTED = 'rgba(232,228,218,0.45)';
const BORDER = 'rgba(212,175,55,0.15)';
const SERIF = 'Cormorant Garamond, Georgia, serif';
const SANS = 'Jost, sans-serif';

const BADGE_DEFS: Record<string, { label: string; icon: string; desc: string; color: string }> = {
  first_photo:      { label: 'First Observation', icon: '🌱', desc: 'Posted first photo to the archive', color: '#6fcf97' },
  streak_7:         { label: 'Week Streak',        icon: '🔥', desc: '7 consecutive days of engagement', color: '#f2994a' },
  streak_30:        { label: 'Month Streak',       icon: '⚡', desc: '30 consecutive days of engagement', color: '#D4AF37' },
  streak_100:       { label: 'Century',            icon: '💯', desc: '100 day streak', color: '#D4AF37' },
  photos_10:        { label: 'Field Observer',     icon: '📷', desc: '10 photos archived', color: '#56CCF2' },
  photos_50:        { label: 'Field Researcher',   icon: '🔬', desc: '50 photos archived', color: '#2F80ED' },
  photos_100:       { label: 'Field Scientist',    icon: '🛰️', desc: '100 photos archived', color: '#9B51E0' },
  accuracy_80:      { label: 'Sharp Eye',          icon: '🎯', desc: '80%+ accuracy on 20+ challenges', color: '#27AE60' },
  wetland:          { label: 'Wetland Guardian',   icon: '🌊', desc: '5+ wetland photos archived', color: '#2F80ED' },
  sacred:           { label: 'Sacred Ground',      icon: '🗿', desc: 'Documented a sacred site', color: '#D4AF37' },
  first_in_region:  { label: 'Pioneer',            icon: '📡', desc: 'First to document your region', color: '#EB5757' },
};

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  location: string;
  badges: string[];
  created_at: string;
}

interface Streak {
  current_streak: number;
  longest_streak: number;
  total_correct: number;
  total_attempted: number;
  total_photos: number;
}

interface Post {
  id: string;
  title: string;
  category: string;
  image_url: string;
  lat: number;
  lng: number;
  astra_caption: string;
  created_at: string;
}

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [rank, setRank] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwn, setIsOwn] = useState(false);

  const supabase = createClient();

  useEffect(() => { load(); }, [username]);

  async function load() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username.toLowerCase())
      .single();

    if (!prof) { setNotFound(true); setLoading(false); return; }
    setProfile(prof);
    if (user?.id === prof.id) setIsOwn(true);

    const [streakRes, postsRes, rankRes] = await Promise.allSettled([
      supabase.from('user_streaks').select('*').eq('user_id', prof.id).single(),
      supabase.from('posts').select('*').eq('user_id', prof.id).order('created_at', { ascending: false }).limit(24),
      supabase.from('user_streaks').select('user_id').order('current_streak', { ascending: false }),
    ]);

    if (streakRes.status === 'fulfilled') setStreak(streakRes.value.data);
    if (postsRes.status === 'fulfilled') setPosts(postsRes.value.data || []);
    if (rankRes.status === 'fulfilled') {
      const idx = (rankRes.value.data || []).findIndex((e: any) => e.user_id === prof.id);
      setRank(idx >= 0 ? idx + 1 : 0);
    }

    setLoading(false);
  }

  const accuracy = streak && streak.total_attempted > 0
    ? Math.round((streak.total_correct / streak.total_attempted) * 100) : 0;

  const earnedBadges = (profile?.badges || []).filter(b => BADGE_DEFS[b]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: GOLD, fontFamily: SERIF, fontSize: 18, letterSpacing: '0.2em' }}>LOADING...</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#e8e4da' }}>
      <Navigation />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontFamily: SERIF, color: GOLD, marginBottom: 16 }}>404</div>
        <div style={{ fontSize: 20, fontFamily: SERIF, color: '#e8e4da', marginBottom: 8 }}>Explorer not found</div>
        <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS, marginBottom: 32 }}>@{username} hasn't joined the archive yet.</div>
        <a href="/archive" style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '10px 24px', border: `1px solid ${BORDER}` }}>EXPLORE THE ARCHIVE →</a>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#e8e4da' }}>
      <Navigation />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px 80px' }}>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40, paddingBottom: 32, borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: GOLD, fontFamily: SANS, marginBottom: 10 }}>ARCHIVED PLANET · FIELD CONTRIBUTOR</div>
            <div style={{ fontSize: 40, fontFamily: SERIF, fontWeight: 400, color: '#e8e4da', marginBottom: 4 }}>{profile?.display_name || profile?.username}</div>
            <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS, marginBottom: 8 }}>@{profile?.username}</div>
            {profile?.bio && <div style={{ fontSize: 14, color: '#e8e4da', fontFamily: SERIF, lineHeight: 1.6, maxWidth: 500 }}>{profile.bio}</div>}
            {profile?.location && <div style={{ fontSize: 11, color: MUTED, fontFamily: SANS, marginTop: 6 }}>📍 {profile.location}</div>}
            <div style={{ fontSize: 10, color: MUTED, fontFamily: SANS, marginTop: 8 }}>
              Member since {new Date(profile?.created_at || '').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            {rank > 0 && (
              <div style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', padding: '4px 12px', border: `1px solid ${BORDER}` }}>
                GLOBAL RANK #{rank}
              </div>
            )}
            {isOwn && (
              <a href="/profile" style={{ fontSize: 10, color: MUTED, fontFamily: SANS, letterSpacing: '0.1em', textDecoration: 'none', padding: '4px 10px', border: `1px solid rgba(212,175,55,0.1)` }}>
                EDIT PROFILE
              </a>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BORDER, marginBottom: 40 }}>
          {[
            { label: 'STREAK', value: `${streak?.current_streak || 0}🔥`, sub: `Best: ${streak?.longest_streak || 0}` },
            { label: 'ACCURACY', value: `${accuracy}%`, sub: `${streak?.total_correct || 0}/${streak?.total_attempted || 0}` },
            { label: 'ARCHIVED', value: streak?.total_photos || posts.length, sub: 'total photos' },
            { label: 'RANK', value: rank > 0 ? `#${rank}` : '—', sub: 'global' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0a0e0b', padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: MUTED, fontFamily: SANS, marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontFamily: SERIF, color: GOLD, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: SANS }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Badges */}
        {earnedBadges.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.25em', color: MUTED, fontFamily: SANS, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>
              BADGES — {earnedBadges.length} EARNED
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {earnedBadges.map(badgeKey => {
                const b = BADGE_DEFS[badgeKey];
                return (
                  <div key={badgeKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', border: `1px solid ${BORDER}`, background: '#0a0e0b' }}
                    title={b.desc}>
                    <span style={{ fontSize: 20 }}>{b.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, color: b.color, fontFamily: SANS, letterSpacing: '0.1em' }}>{b.label.toUpperCase()}</div>
                      <div style={{ fontSize: 10, color: MUTED, fontFamily: SANS }}>{b.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All badges available */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', color: MUTED, fontFamily: SANS, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>
            ALL BADGES
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(BADGE_DEFS).map(([key, b]) => {
              const earned = (profile?.badges || []).includes(key);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: `1px solid ${earned ? BORDER : 'rgba(212,175,55,0.06)'}`, background: earned ? '#0a0e0b' : 'transparent', opacity: earned ? 1 : 0.35 }}
                  title={b.desc}>
                  <span style={{ fontSize: 16 }}>{b.icon}</span>
                  <span style={{ fontSize: 10, color: earned ? b.color : MUTED, fontFamily: SANS, letterSpacing: '0.08em' }}>{b.label.toUpperCase()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Photo archive */}
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.25em', color: MUTED, fontFamily: SANS, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>
            ARCHIVE — {posts.length} CONTRIBUTIONS
          </div>
          {posts.length === 0 ? (
            <div style={{ padding: '60px', border: `1px dashed ${BORDER}`, textAlign: 'center' }}>
              <div style={{ fontSize: 16, color: MUTED, fontFamily: SERIF }}>No contributions yet</div>
              {isOwn && <a href="/contribute" style={{ display: 'inline-block', marginTop: 16, fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 20px', border: `1px solid ${BORDER}` }}>CONTRIBUTE YOUR FIRST PHOTO →</a>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
              {posts.map(p => (
                <div key={p.id} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: '#0a0e0b', border: `1px solid ${BORDER}` }}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, color: MUTED, fontFamily: SANS }}>NO IMAGE</span>
                      </div>
                  }
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.9))' }}>
                    <div style={{ fontSize: 11, color: '#e8e4da', fontFamily: SERIF, lineHeight: 1.3 }}>{p.title}</div>
                    <div style={{ fontSize: 8, color: GOLD, fontFamily: SANS, letterSpacing: '0.1em', marginTop: 2 }}>{p.category?.toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      <Footer />
    </div>
  );
}
