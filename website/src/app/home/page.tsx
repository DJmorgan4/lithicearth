'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/Navigation';

const GOLD = '#D4AF37';
const MUTED = 'rgba(232,228,218,0.45)';
const BORDER = 'rgba(212,175,55,0.15)';
const SERIF = 'Cormorant Garamond, Georgia, serif';
const SANS = 'Jost, sans-serif';

interface Challenge {
  id: string;
  question: string;
  option_a: string; option_b: string; option_c: string; option_d: string;
  correct_answer: string;
  explanation: string;
  category: string;
  difficulty: string;
}

interface Streak {
  current_streak: number;
  longest_streak: number;
  total_correct: number;
  total_attempted: number;
  total_photos: number;
  last_photo_date: string;
}

interface Profile {
  username: string;
  display_name: string;
  badges: string[];
}

interface RecentPost {
  id: string;
  title: string;
  category: string;
  image_url: string;
  lat: number;
  lng: number;
  astra_caption: string;
  profiles?: { username: string };
  created_at: string;
}

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [photoedToday, setPhotoedToday] = useState(false);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/'; return; }
    setUser(user);

    const today = new Date().toISOString().split('T')[0];

    const [profileRes, streakRes, challengeRes, postsRes] = await Promise.allSettled([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('user_streaks').select('*').eq('user_id', user.id).single(),
      supabase.from('daily_challenges').select('*').eq('challenge_date', today).single(),
      supabase.from('posts').select('id, title, category, image_url, lat, lng, astra_caption, created_at, user_id').order('created_at', { ascending: false }).limit(6),
    ]);

    if (profileRes.status === 'fulfilled') setProfile(profileRes.value.data);
    if (streakRes.status === 'fulfilled') setStreak(streakRes.value.data);
    if (challengeRes.status === 'fulfilled') setChallenge(challengeRes.value.data);
    if (postsRes.status === 'fulfilled') setRecentPosts(postsRes.value.data || []);

    // Check if already answered today's challenge
    if (challengeRes.status === 'fulfilled' && challengeRes.value.data) {
      const { data: resp } = await supabase
        .from('challenge_responses')
        .select('answer')
        .eq('user_id', user.id)
        .eq('challenge_id', challengeRes.value.data.id)
        .single();
      if (resp) { setSelected(resp.answer); setRevealed(true); setAlreadyAnswered(true); }
    }

    // Check if photo posted today
    const { data: todayPhoto } = await supabase
      .from('posts')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', today + 'T00:00:00')
      .limit(1)
      .single();
    setPhotoedToday(!!todayPhoto);

    setLoading(false);
  }

  async function submitAnswer(answer: string) {
    if (revealed || !challenge || !user) return;
    setSelected(answer); setRevealed(true);
    const correct = answer === challenge.correct_answer;
    const today = new Date().toISOString().split('T')[0];

    await supabase.from('challenge_responses').insert({ user_id: user.id, challenge_id: challenge.id, answer, correct });

    const { data: existing } = await supabase.from('user_streaks').select('*').eq('user_id', user.id).single();
    if (existing) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      const wasYesterday = existing.last_challenge_date === yStr;
      const newStreak = wasYesterday ? existing.current_streak + 1 : 1;
      const updated = {
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, existing.longest_streak),
        last_challenge_date: today,
        total_correct: existing.total_correct + (correct ? 1 : 0),
        total_attempted: existing.total_attempted + 1,
        updated_at: new Date().toISOString(),
      };
      await supabase.from('user_streaks').update(updated).eq('user_id', user.id);
      setStreak({ ...existing, ...updated });
    }
  }

  const opts = challenge ? [
    { key: 'A', text: challenge.option_a },
    { key: 'B', text: challenge.option_b },
    { key: 'C', text: challenge.option_c },
    { key: 'D', text: challenge.option_d },
  ] : [];

  const isCorrect = selected === challenge?.correct_answer;
  const accuracy = streak && streak.total_attempted > 0 ? Math.round((streak.total_correct / streak.total_attempted) * 100) : 0;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: GOLD, fontFamily: SERIF, fontSize: 18, letterSpacing: '0.2em' }}>LOADING...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#e8e4da' }}>
      <Navigation />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 40, paddingBottom: 24, borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.3em', color: GOLD, fontFamily: SANS, marginBottom: 8 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
            </div>
            <h1 style={{ fontSize: 36, fontFamily: SERIF, fontWeight: 400, color: '#e8e4da', margin: 0, lineHeight: 1.2 }}>
              Welcome back, {profile?.display_name || profile?.username || 'Explorer'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 24, textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: 32, fontFamily: SERIF, color: GOLD, lineHeight: 1 }}>{streak?.current_streak || 0}<span style={{ fontSize: 20 }}>🔥</span></div>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: SANS, letterSpacing: '0.2em' }}>DAY STREAK</div>
            </div>
            <div>
              <div style={{ fontSize: 32, fontFamily: SERIF, color: GOLD, lineHeight: 1 }}>{accuracy}%</div>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: SANS, letterSpacing: '0.2em' }}>ACCURACY</div>
            </div>
            <div>
              <div style={{ fontSize: 32, fontFamily: SERIF, color: GOLD, lineHeight: 1 }}>{streak?.total_photos || 0}</div>
              <div style={{ fontSize: 9, color: MUTED, fontFamily: SANS, letterSpacing: '0.2em' }}>PHOTOS</div>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>

          {/* Daily Challenge */}
          <div style={{ border: `1px solid ${BORDER}`, background: '#0a0e0b', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.25em', color: GOLD, fontFamily: SANS }}>TODAY'S CHALLENGE</div>
              {alreadyAnswered && <div style={{ fontSize: 9, color: MUTED, fontFamily: SANS, letterSpacing: '0.1em' }}>COMPLETED ✓</div>}
            </div>

            {challenge ? (
              <>
                <div style={{ fontSize: 9, padding: '3px 8px', border: `1px solid ${BORDER}`, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', display: 'inline-block', marginBottom: 14 }}>
                  {challenge.category.toUpperCase()} · {challenge.difficulty.toUpperCase()}
                </div>
                <p style={{ fontSize: 16, fontFamily: SERIF, color: '#e8e4da', lineHeight: 1.6, marginBottom: 20 }}>{challenge.question}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {opts.map(opt => {
                    const isSelected = selected === opt.key;
                    const isCorrectOpt = opt.key === challenge.correct_answer;
                    let bg = 'transparent', borderColor = 'rgba(212,175,55,0.15)', textColor = '#e8e4da';
                    if (revealed) {
                      if (isCorrectOpt) { bg = 'rgba(39,174,96,0.1)'; borderColor = 'rgba(39,174,96,0.4)'; textColor = '#6fcf97'; }
                      else if (isSelected) { bg = 'rgba(192,57,43,0.1)'; borderColor = 'rgba(192,57,43,0.3)'; textColor = '#eb5757'; }
                      else textColor = MUTED;
                    } else if (isSelected) { bg = 'rgba(212,175,55,0.08)'; borderColor = GOLD; }
                    return (
                      <button key={opt.key} onClick={() => submitAnswer(opt.key)} disabled={revealed}
                        style={{ display: 'flex', gap: 12, padding: '11px 14px', background: bg, border: `1px solid ${borderColor}`, cursor: revealed ? 'default' : 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 10, color: revealed && isCorrectOpt ? '#6fcf97' : GOLD, fontFamily: SANS, letterSpacing: '0.1em', minWidth: 16 }}>{opt.key}</span>
                        <span style={{ fontSize: 13, color: textColor, fontFamily: SERIF, lineHeight: 1.5 }}>{opt.text}</span>
                      </button>
                    );
                  })}
                </div>
                {revealed && (
                  <div style={{ marginTop: 16, padding: '14px 16px', background: isCorrect ? 'rgba(39,174,96,0.05)' : 'rgba(192,57,43,0.05)', border: `1px solid ${isCorrect ? 'rgba(39,174,96,0.2)' : 'rgba(192,57,43,0.2)'}` }}>
                    <div style={{ fontSize: 11, color: isCorrect ? '#6fcf97' : '#eb5757', fontFamily: SANS, letterSpacing: '0.1em', marginBottom: 8 }}>
                      {alreadyAnswered ? 'ALREADY ANSWERED' : isCorrect ? `CORRECT · ${streak?.current_streak || 1} DAY STREAK` : 'INCORRECT'}
                    </div>
                    <p style={{ fontSize: 12, color: '#e8e4da', fontFamily: SERIF, lineHeight: 1.6, margin: 0 }}>{challenge.explanation}</p>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontFamily: SERIF }}>No challenge today. Check back tomorrow.</div>
            )}
          </div>

          {/* Photo contribution */}
          <div style={{ border: `1px solid ${BORDER}`, background: '#0a0e0b', padding: 28, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.25em', color: GOLD, fontFamily: SANS }}>TODAY'S CONTRIBUTION</div>
              {photoedToday && <div style={{ fontSize: 9, color: MUTED, fontFamily: SANS, letterSpacing: '0.1em' }}>SUBMITTED ✓</div>}
            </div>

            {photoedToday ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '40px 0' }}>
                <div style={{ fontSize: 48, fontFamily: SERIF, color: GOLD }}>✓</div>
                <div style={{ fontSize: 16, fontFamily: SERIF, color: '#e8e4da', textAlign: 'center' }}>Photo archived for today</div>
                <div style={{ fontSize: 12, color: MUTED, fontFamily: SANS, textAlign: 'center', lineHeight: 1.6 }}>Your observation is pinned to the globe. Come back tomorrow to continue your archive.</div>
                <a href="/archive" style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 20px', border: `1px solid ${BORDER}`, marginTop: 8 }}>VIEW ON GLOBE →</a>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 16, fontFamily: SERIF, color: '#e8e4da', lineHeight: 1.6, marginBottom: 8 }}>
                  Document what surrounds you. One photo per day builds the archive.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    'Wetlands, rivers, lakes — any water',
                    'Vegetation change, disturbed land',
                    'Sacred sites, ancient formations',
                    'Urban heat, pollution, erosion',
                    'Wildlife, migration, habitat',
                  ].map((idea, i) => (
                    <div key={i} style={{ fontSize: 12, color: MUTED, fontFamily: SANS, display: 'flex', gap: 10 }}>
                      <span style={{ color: GOLD }}>→</span> {idea}
                    </div>
                  ))}
                </div>
                <a href="/contribute" style={{ display: 'block', marginTop: 'auto', padding: '14px 20px', background: GOLD, color: '#000', textAlign: 'center', fontFamily: SANS, fontSize: 12, letterSpacing: '0.15em', textDecoration: 'none', fontWeight: 500 }}>
                  CONTRIBUTE TODAY'S PHOTO →
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Recent archive feed */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.25em', color: MUTED, fontFamily: SANS }}>RECENT ARCHIVE — WHAT OTHERS ARE DOCUMENTING</div>
            <a href="/archive" style={{ fontSize: 10, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none' }}>VIEW GLOBE →</a>
          </div>
          {recentPosts.length === 0 ? (
            <div style={{ padding: '40px', border: `1px dashed ${BORDER}`, textAlign: 'center', color: MUTED, fontFamily: SERIF }}>
              No photos in the archive yet. Be the first to contribute.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {recentPosts.map(post => (
                <div key={post.id} style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: '#0a0e0b', border: `1px solid ${BORDER}` }}>
                  {post.image_url
                    ? <img src={post.image_url} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, color: MUTED, fontFamily: SANS, letterSpacing: '0.15em' }}>NO IMAGE</span>
                      </div>
                  }
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,0.9))' }}>
                    <div style={{ fontSize: 13, color: '#e8e4da', fontFamily: SERIF, lineHeight: 1.3, marginBottom: 3 }}>{post.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 9, color: GOLD, fontFamily: SANS, letterSpacing: '0.1em' }}>{post.category?.toUpperCase()}</span>
                      {post.lat && <span style={{ fontSize: 9, color: MUTED, fontFamily: SANS }}>{Number(post.lat).toFixed(2)}°, {Number(post.lng).toFixed(2)}°</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BORDER, marginTop: 32 }}>
          {[
            { href: '/archive', label: 'Archive Globe', desc: 'Explore all pins' },
            { href: '/challenge', label: 'Challenge', desc: 'Full challenge view' },
            { href: '/profile', label: 'Your Profile', desc: 'Stats & badges' },
            { href: '/contribute', label: 'Contribute', desc: 'Add a photo' },
          ].map(link => (
            <a key={link.href} href={link.href} style={{ background: '#0a0e0b', padding: '16px 18px', textDecoration: 'none', display: 'block' }}>
              <div style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', marginBottom: 4 }}>{link.label.toUpperCase()} →</div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: SANS }}>{link.desc}</div>
            </a>
          ))}
        </div>

      </div>
    </div>
  );
}
