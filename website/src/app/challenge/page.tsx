'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';

const GOLD = '#D4AF37';
const INK = '#0a0e0b';
const MUTED = 'rgba(10,14,11,0.5)';
const BORDER = 'rgba(212,175,55,0.2)';

interface Challenge {
  id: string;
  challenge_date: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
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
}

export default function ChallengePage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    // Load today's challenge
    const today = new Date().toISOString().split('T')[0];
    const { data: ch } = await supabase
      .from('daily_challenges')
      .select('*')
      .eq('challenge_date', today)
      .single();
    setChallenge(ch);

    if (user && ch) {
      // Check if already answered
      const { data: resp } = await supabase
        .from('challenge_responses')
        .select('answer, correct')
        .eq('user_id', user.id)
        .eq('challenge_id', ch.id)
        .single();

      if (resp) {
        setSelected(resp.answer);
        setRevealed(true);
        setAlreadyAnswered(true);
      }

      // Load streak
      const { data: st } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', user.id)
        .single();
      setStreak(st);
    }
    setLoading(false);
  }

  async function submitAnswer(answer: string) {
    if (revealed || submitting) return;
    setSelected(answer);
    setRevealed(true);

    if (!user || !challenge) return;
    setSubmitting(true);

    const correct = answer === challenge.correct_answer;
    const today = new Date().toISOString().split('T')[0];

    // Record response
    await supabase.from('challenge_responses').insert({
      user_id: user.id,
      challenge_id: challenge.id,
      answer,
      correct,
    });

    // Update streak
    const { data: existing } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      const wasYesterday = existing.last_challenge_date === yStr;
      const newStreak = wasYesterday ? existing.current_streak + 1 : 1;
      await supabase.from('user_streaks').update({
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, existing.longest_streak),
        last_challenge_date: today,
        total_correct: existing.total_correct + (correct ? 1 : 0),
        total_attempted: existing.total_attempted + 1,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
      setStreak({
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, existing.longest_streak),
        total_correct: existing.total_correct + (correct ? 1 : 0),
        total_attempted: existing.total_attempted + 1,
        total_photos: existing.total_photos,
      });
    } else {
      await supabase.from('user_streaks').insert({
        user_id: user.id,
        current_streak: 1,
        longest_streak: 1,
        last_challenge_date: today,
        total_correct: correct ? 1 : 0,
        total_attempted: 1,
        total_photos: 0,
      });
      setStreak({ current_streak: 1, longest_streak: 1, total_correct: correct ? 1 : 0, total_attempted: 1, total_photos: 0 });
    }
    setSubmitting(false);
  }

  const options = challenge ? [
    { key: 'A', text: challenge.option_a },
    { key: 'B', text: challenge.option_b },
    { key: 'C', text: challenge.option_c },
    { key: 'D', text: challenge.option_d },
  ] : [];

  const correct = challenge?.correct_answer;
  const isCorrect = selected === correct;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: GOLD, fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 18, letterSpacing: '0.2em' }}>LOADING...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#e8e4da' }}>
      <Navigation />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '80px 24px 60px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: GOLD, fontFamily: 'Jost, sans-serif', marginBottom: 12 }}>
            DAILY CHALLENGE · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </div>
          <h1 style={{ fontSize: 32, fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400, color: '#e8e4da', lineHeight: 1.3, margin: 0 }}>
            Test your knowledge.<br />Archive the planet.
          </h1>
        </div>

        {/* Streak panel */}
        {user && streak && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BORDER, marginBottom: 40, border: `1px solid ${BORDER}` }}>
            {[
              { label: 'STREAK', value: `${streak.current_streak}🔥` },
              { label: 'BEST', value: streak.longest_streak },
              { label: 'CORRECT', value: `${streak.total_correct}/${streak.total_attempted}` },
              { label: 'PHOTOS', value: streak.total_photos },
            ].map(s => (
              <div key={s.label} style={{ background: '#0a0e0b', padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.2em', color: MUTED, fontFamily: 'Jost, sans-serif', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, color: GOLD, fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Challenge card */}
        {challenge ? (
          <div style={{ border: `1px solid ${BORDER}`, background: '#0a0e0b', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.2em', color: GOLD, fontFamily: 'Jost, sans-serif', padding: '3px 8px', border: `1px solid ${BORDER}` }}>{challenge.category.toUpperCase()}</span>
              <span style={{ fontSize: 9, letterSpacing: '0.15em', color: MUTED, fontFamily: 'Jost, sans-serif' }}>{challenge.difficulty.toUpperCase()}</span>
            </div>

            <p style={{ fontSize: 18, fontFamily: 'Cormorant Garamond, Georgia, serif', color: '#e8e4da', lineHeight: 1.6, marginBottom: 32 }}>
              {challenge.question}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {options.map(opt => {
                const isSelected = selected === opt.key;
                const isCorrectOpt = opt.key === correct;
                let bg = 'transparent';
                let borderColor = 'rgba(212,175,55,0.2)';
                let textColor = '#e8e4da';

                if (revealed) {
                  if (isCorrectOpt) { bg = 'rgba(39,174,96,0.12)'; borderColor = 'rgba(39,174,96,0.5)'; textColor = '#6fcf97'; }
                  else if (isSelected && !isCorrectOpt) { bg = 'rgba(192,57,43,0.12)'; borderColor = 'rgba(192,57,43,0.4)'; textColor = '#eb5757'; }
                  else { textColor = MUTED; }
                } else if (isSelected) {
                  bg = 'rgba(212,175,55,0.08)'; borderColor = GOLD;
                }

                return (
                  <button key={opt.key} onClick={() => submitAnswer(opt.key)} disabled={revealed}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 18px', background: bg, border: `1px solid ${borderColor}`, cursor: revealed ? 'default' : 'pointer', textAlign: 'left', transition: 'all 0.2s' }}>
                    <span style={{ fontSize: 11, color: revealed && isCorrectOpt ? '#6fcf97' : GOLD, fontFamily: 'Jost, sans-serif', letterSpacing: '0.15em', minWidth: 20, marginTop: 2 }}>{opt.key}</span>
                    <span style={{ fontSize: 15, color: textColor, fontFamily: 'Cormorant Garamond, Georgia, serif', lineHeight: 1.5 }}>{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {/* Result */}
            {revealed && (
              <div style={{ marginTop: 28, padding: '20px 24px', background: isCorrect ? 'rgba(39,174,96,0.06)' : 'rgba(192,57,43,0.06)', border: `1px solid ${isCorrect ? 'rgba(39,174,96,0.3)' : 'rgba(192,57,43,0.3)'}` }}>
                <div style={{ fontSize: 13, color: isCorrect ? '#6fcf97' : '#eb5757', fontFamily: 'Jost, sans-serif', letterSpacing: '0.15em', marginBottom: 10 }}>
                  {alreadyAnswered ? 'ALREADY ANSWERED TODAY' : isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}
                  {!alreadyAnswered && streak && <span style={{ marginLeft: 16, color: GOLD }}>{streak.current_streak} DAY STREAK 🔥</span>}
                </div>
                <p style={{ fontSize: 14, color: '#e8e4da', fontFamily: 'Cormorant Garamond, Georgia, serif', lineHeight: 1.7, margin: 0 }}>
                  {challenge.explanation}
                </p>
                <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                  <a href="/contribute" style={{ fontSize: 11, color: GOLD, fontFamily: 'Jost, sans-serif', letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 16px', border: `1px solid ${BORDER}` }}>
                    CONTRIBUTE A PHOTO →
                  </a>
                  <a href="/archive" style={{ fontSize: 11, color: MUTED, fontFamily: 'Jost, sans-serif', letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(10,14,11,0.3)' }}>
                    EXPLORE ARCHIVE
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ border: `1px solid ${BORDER}`, background: '#0a0e0b', padding: '60px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, color: MUTED, fontFamily: 'Cormorant Garamond, Georgia, serif' }}>No challenge today. Check back tomorrow.</div>
          </div>
        )}

        {/* Not logged in */}
        {!user && (
          <div style={{ marginTop: 24, padding: '20px 24px', border: `1px solid ${BORDER}`, background: '#0a0e0b', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: MUTED, fontFamily: 'Jost, sans-serif', letterSpacing: '0.1em', marginBottom: 12 }}>SIGN IN TO TRACK YOUR STREAK</div>
            <a href="/auth/login" style={{ fontSize: 11, color: GOLD, fontFamily: 'Jost, sans-serif', letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 20px', border: `1px solid ${BORDER}` }}>
              SIGN IN →
            </a>
          </div>
        )}

        {/* Come back tomorrow */}
        {alreadyAnswered && (
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: MUTED, fontFamily: 'Jost, sans-serif', letterSpacing: '0.2em' }}>
              NEXT CHALLENGE IN {24 - new Date().getHours()} HOURS · CONTRIBUTE A PHOTO TO KEEP YOUR ARCHIVE ALIVE
            </div>
          </div>
        )}

      </div>
      <Footer />
    </div>
  );
}
