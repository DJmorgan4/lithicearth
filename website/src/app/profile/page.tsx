'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';

const GOLD = '#D4AF37';
const INK = '#0a0e0b';
const MUTED = 'rgba(232,228,218,0.45)';
const BORDER = 'rgba(212,175,55,0.15)';
const SURFACE = 'rgba(255,255,255,0.03)';
const FS = 'Jost, sans-serif';
const SERIF = 'Cormorant Garamond, Georgia, serif';

interface UserStreak {
  current_streak: number;
  longest_streak: number;
  total_correct: number;
  total_attempted: number;
  total_photos: number;
  last_challenge_date: string;
  last_photo_date: string;
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

interface LeaderboardEntry {
  user_id: string;
  current_streak: number;
  total_correct: number;
  total_photos: number;
  uploader_name: string;
}

interface AstraMsg { role: 'user' | 'astra'; text: string; }

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'archive' | 'leaderboard' | 'astra'>('overview');
  const [astraInput, setAstraInput] = useState('');
  const [astraMsgs, setAstraMsgs] = useState<AstraMsg[]>([
    { role: 'astra', text: 'Ask me anything about the environment, ecology, geology, wetlands, remote sensing, or what the archive is showing across the planet.' }
  ]);
  const [astraLoading, setAstraLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/auth/login'; return; }
    setUser(user);

    const [streakRes, postsRes, lbRes] = await Promise.allSettled([
      supabase.from('user_streaks').select('*').eq('user_id', user.id).single(),
      supabase.from('posts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('user_streaks').select('user_id, current_streak, total_correct, total_photos').order('current_streak', { ascending: false }).limit(10),
    ]);

    if (streakRes.status === 'fulfilled') setStreak(streakRes.value.data);
    if (postsRes.status === 'fulfilled') setPosts(postsRes.value.data || []);
    if (lbRes.status === 'fulfilled') setLeaderboard(lbRes.value.data || []);
    setLoading(false);
  }

  async function askAstra() {
    if (!astraInput.trim() || astraLoading) return;
    const q = astraInput.trim();
    setAstraInput('');
    setAstraMsgs(p => [...p, { role: 'user', text: q }]);
    setAstraLoading(true);
    try {
      const res = await fetch('https://astarte-works.vercel.app/api/astra/core', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, source: 'lithicearth-profile', domain: 'conservation' }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      setAstraMsgs(p => [...p, { role: 'astra', text: data.response || 'No response from ASTRA.' }]);
    } catch {
      setAstraMsgs(p => [...p, { role: 'astra', text: 'ASTRA is unavailable. Try again shortly.' }]);
    }
    setAstraLoading(false);
  }

  const accuracy = streak && streak.total_attempted > 0
    ? Math.round((streak.total_correct / streak.total_attempted) * 100) : 0;

  const myRank = leaderboard.findIndex(e => e.user_id === user?.id) + 1;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: GOLD, fontFamily: SERIF, fontSize: 18, letterSpacing: '0.2em' }}>LOADING...</div>
    </div>
  );

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'archive', label: 'My Archive' },
    { key: 'leaderboard', label: 'Leaderboard' },
    { key: 'astra', label: 'Ask ASTRA' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#e8e4da' }}>
      <Navigation />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '80px 24px 80px' }}>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40, paddingBottom: 32, borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: GOLD, fontFamily: FS, marginBottom: 10 }}>ARCHIVED PLANET · FIELD CONTRIBUTOR</div>
            <div style={{ fontSize: 32, fontFamily: SERIF, fontWeight: 400, color: '#e8e4da', marginBottom: 4 }}>
              {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Explorer'}
            </div>
            <div style={{ fontSize: 12, color: MUTED, fontFamily: FS }}>{user?.email}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {myRank > 0 && <div style={{ fontSize: 11, color: GOLD, fontFamily: FS, letterSpacing: '0.15em' }}>RANK #{myRank}</div>}
            <div style={{ fontSize: 40, fontFamily: SERIF, color: GOLD, lineHeight: 1 }}>{streak?.current_streak || 0}<span style={{ fontSize: 24 }}>🔥</span></div>
            <div style={{ fontSize: 10, color: MUTED, fontFamily: FS, letterSpacing: '0.15em' }}>DAY STREAK</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 36 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{
              padding: '10px 20px', fontSize: 11, fontFamily: FS, letterSpacing: '0.15em',
              background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.key ? GOLD : 'transparent'}`,
              color: tab === t.key ? GOLD : MUTED, cursor: 'pointer', transition: 'all 0.2s',
            }}>{t.label.toUpperCase()}</button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div>
            {/* Stat grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BORDER, marginBottom: 32 }}>
              {[
                { label: 'CURRENT STREAK', value: `${streak?.current_streak || 0} days`, sub: `Best: ${streak?.longest_streak || 0}` },
                { label: 'ACCURACY', value: `${accuracy}%`, sub: `${streak?.total_correct || 0} / ${streak?.total_attempted || 0} correct` },
                { label: 'PHOTOS ARCHIVED', value: streak?.total_photos || 0, sub: posts.length > 0 ? posts[0].category : 'No photos yet' },
                { label: 'GLOBAL RANK', value: myRank > 0 ? `#${myRank}` : '—', sub: 'by streak length' },
              ].map(s => (
                <div key={s.label} style={{ background: '#0a0e0b', padding: '20px 16px' }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.2em', color: MUTED, fontFamily: FS, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontFamily: SERIF, color: GOLD, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: MUTED, fontFamily: FS }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Accuracy bar */}
            <div style={{ marginBottom: 32, padding: '20px 24px', background: SURFACE, border: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 10, letterSpacing: '0.2em', color: MUTED, fontFamily: FS }}>CHALLENGE ACCURACY</span>
                <span style={{ fontSize: 13, color: GOLD, fontFamily: SERIF }}>{accuracy}%</span>
              </div>
              <div style={{ height: 4, background: 'rgba(212,175,55,0.1)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${accuracy}%`, background: GOLD, borderRadius: 2, transition: 'width 1s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 9, color: MUTED, fontFamily: FS }}>0%</span>
                <span style={{ fontSize: 9, color: MUTED, fontFamily: FS }}>100%</span>
              </div>
            </div>

            {/* Recent photos */}
            {posts.length > 0 && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.2em', color: MUTED, fontFamily: FS, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>RECENT ARCHIVE CONTRIBUTIONS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                  {posts.slice(0, 6).map(p => (
                    <div key={p.id} style={{ aspectRatio: '1', position: 'relative', overflow: 'hidden', background: '#0a0e0b', border: `1px solid ${BORDER}` }}>
                      {p.image_url
                        ? <img src={p.image_url} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 10, color: MUTED, fontFamily: FS, letterSpacing: '0.15em' }}>NO IMAGE</span>
                          </div>
                      }
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}>
                        <div style={{ fontSize: 11, color: '#e8e4da', fontFamily: SERIF, lineHeight: 1.3 }}>{p.title}</div>
                        <div style={{ fontSize: 9, color: GOLD, fontFamily: FS, letterSpacing: '0.1em', marginTop: 2 }}>{p.category?.toUpperCase()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {posts.length === 0 && (
              <div style={{ padding: '40px 24px', border: `1px dashed ${BORDER}`, textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: MUTED, fontFamily: SERIF, marginBottom: 12 }}>No archive contributions yet</div>
                <a href="/contribute" style={{ fontSize: 11, color: GOLD, fontFamily: FS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 20px', border: `1px solid ${BORDER}` }}>CONTRIBUTE YOUR FIRST PHOTO →</a>
              </div>
            )}
          </div>
        )}

        {/* ARCHIVE TAB */}
        {tab === 'archive' && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: MUTED, fontFamily: FS, marginBottom: 20 }}>{posts.length} CONTRIBUTIONS TO THE ARCHIVE</div>
            {posts.length === 0 ? (
              <div style={{ padding: '60px 24px', border: `1px dashed ${BORDER}`, textAlign: 'center' }}>
                <div style={{ fontSize: 16, color: MUTED, fontFamily: SERIF, marginBottom: 16 }}>Your archive is empty</div>
                <a href="/contribute" style={{ fontSize: 11, color: GOLD, fontFamily: FS, letterSpacing: '0.15em', textDecoration: 'none', padding: '10px 24px', border: `1px solid ${BORDER}` }}>CONTRIBUTE A PHOTO →</a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {posts.map(p => (
                  <div key={p.id} style={{ display: 'flex', gap: 16, padding: '16px', background: SURFACE, border: `1px solid ${BORDER}` }}>
                    {p.image_url && (
                      <img src={p.image_url} alt={p.title} style={{ width: 80, height: 80, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontFamily: SERIF, color: '#e8e4da' }}>{p.title}</span>
                        <span style={{ fontSize: 9, color: GOLD, fontFamily: FS, letterSpacing: '0.1em' }}>{p.category?.toUpperCase()}</span>
                      </div>
                      {p.astra_caption && (
                        <div style={{ fontSize: 12, color: MUTED, fontFamily: FS, lineHeight: 1.6, marginBottom: 6, fontStyle: 'italic' }}>
                          "{p.astra_caption}"
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: MUTED, fontFamily: FS }}>
                        {p.lat && p.lng ? `${Number(p.lat).toFixed(4)}°, ${Number(p.lng).toFixed(4)}°` : 'Location not recorded'} · {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {tab === 'leaderboard' && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: MUTED, fontFamily: FS, marginBottom: 20 }}>TOP CONTRIBUTORS BY STREAK</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: BORDER }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 100px', gap: 0, background: '#0a0e0b', padding: '10px 16px' }}>
                {['#', 'CONTRIBUTOR', 'STREAK', 'ACCURACY', 'PHOTOS'].map(h => (
                  <div key={h} style={{ fontSize: 9, letterSpacing: '0.2em', color: MUTED, fontFamily: FS }}>{h}</div>
                ))}
              </div>
              {leaderboard.map((entry, i) => {
                const isMe = entry.user_id === user?.id;
                const acc = entry.total_correct && entry.total_correct > 0 ? Math.round((entry.total_correct / Math.max(entry.total_correct + 5, 10)) * 100) : 0;
                return (
                  <div key={entry.user_id} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 100px',
                    padding: '14px 16px', background: isMe ? 'rgba(212,175,55,0.06)' : '#0a0e0b',
                    border: isMe ? `1px solid rgba(212,175,55,0.3)` : 'none',
                  }}>
                    <div style={{ fontSize: 14, fontFamily: SERIF, color: i < 3 ? GOLD : MUTED }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div style={{ fontSize: 13, fontFamily: SERIF, color: isMe ? GOLD : '#e8e4da' }}>
                      {isMe ? 'You' : `Explorer ${entry.user_id.slice(0, 6)}`}
                      {isMe && <span style={{ fontSize: 9, color: GOLD, fontFamily: FS, marginLeft: 8, letterSpacing: '0.1em' }}>← YOU</span>}
                    </div>
                    <div style={{ fontSize: 13, fontFamily: SERIF, color: '#e8e4da' }}>{entry.current_streak}🔥</div>
                    <div style={{ fontSize: 13, fontFamily: SERIF, color: '#e8e4da' }}>{entry.total_correct || 0}</div>
                    <div style={{ fontSize: 13, fontFamily: SERIF, color: '#e8e4da' }}>{entry.total_photos || 0}</div>
                  </div>
                );
              })}
              {leaderboard.length === 0 && (
                <div style={{ background: '#0a0e0b', padding: '40px', textAlign: 'center', fontSize: 14, color: MUTED, fontFamily: SERIF }}>
                  No contributors yet. Be the first.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ASTRA TAB */}
        {tab === 'astra' && (
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: MUTED, fontFamily: FS, marginBottom: 20 }}>ASTRA — ENVIRONMENTAL INTELLIGENCE</div>
            <div style={{ border: `1px solid ${BORDER}`, background: '#0a0e0b', display: 'flex', flexDirection: 'column', height: 520 }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {astraMsgs.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: msg.role === 'astra' ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: GOLD, fontFamily: FS, letterSpacing: '0.05em' }}>
                      {msg.role === 'astra' ? 'A' : 'U'}
                    </div>
                    <div style={{ maxWidth: '75%', padding: '12px 16px', background: msg.role === 'astra' ? SURFACE : 'rgba(212,175,55,0.06)', border: `1px solid ${msg.role === 'astra' ? BORDER : 'rgba(212,175,55,0.2)'}`, fontSize: 13, fontFamily: msg.role === 'astra' ? SERIF : FS, color: '#e8e4da', lineHeight: 1.7 }}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {astraLoading && (
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(212,175,55,0.15)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: GOLD, fontFamily: FS }}>A</div>
                    <div style={{ padding: '12px 16px', border: `1px solid ${BORDER}`, fontSize: 12, color: MUTED, fontFamily: FS, letterSpacing: '0.1em' }}>ASTRA THINKING...</div>
                  </div>
                )}
              </div>
              {/* Input */}
              <div style={{ padding: '16px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10 }}>
                <input
                  value={astraInput}
                  onChange={e => setAstraInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && askAstra()}
                  placeholder="Ask about wetlands, ecosystems, geology, the archive..."
                  style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, padding: '10px 14px', fontSize: 13, fontFamily: FS, color: '#e8e4da', outline: 'none' }}
                />
                <button onClick={askAstra} disabled={astraLoading || !astraInput.trim()} style={{ padding: '10px 20px', background: astraInput.trim() ? GOLD : 'transparent', border: `1px solid ${BORDER}`, color: astraInput.trim() ? '#000' : MUTED, fontSize: 11, fontFamily: FS, letterSpacing: '0.15em', cursor: astraInput.trim() ? 'pointer' : 'default' }}>
                  SEND
                </button>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 10, color: MUTED, fontFamily: FS, letterSpacing: '0.1em' }}>
              ASTRA draws from 300+ indexed documents — wetland science, ASTM standards, remote sensing, ecology, geology, and the LithicEarth archive.
            </div>
          </div>
        )}

      </div>
      <Footer />
    </div>
  );
}
