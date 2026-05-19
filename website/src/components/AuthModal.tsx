'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'username'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');

  const supabase = createClient();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = '/home';
    } catch (err: any) { setMessage(err.message); }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMessage('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      if (data.user) { setUserId(data.user.id); setMode('username'); }
    } catch (err: any) { setMessage(err.message); }
    setLoading(false);
  };

  const handleUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || username.length < 3) { setMessage('Username must be at least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { setMessage('Letters, numbers, and underscores only'); return; }
    setLoading(true); setMessage('');
    try {
      const uid = userId || (await supabase.auth.getUser()).data.user?.id;
      if (!uid) throw new Error('Not authenticated');
      const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.toLowerCase()).single();
      if (existing) throw new Error('Username already taken');
      const { error } = await supabase.from('profiles').insert({ id: uid, username: username.toLowerCase(), display_name: username });
      if (error) throw error;
      await supabase.from('user_streaks').upsert({ user_id: uid, current_streak: 0, longest_streak: 0, total_correct: 0, total_attempted: 0, total_photos: 0 });
      window.location.href = '/home';
    } catch (err: any) { setMessage(err.message); }
    setLoading(false);
  };

  const inp = "w-full px-4 py-3 bg-[#0a0e0b] border border-[#D4AF37]/20 text-[#e8e4da] font-light focus:outline-none focus:border-[#D4AF37]/60 transition placeholder-[#e8e4da]/20";
  const lbl = "block text-[#D4AF37]/60 text-xs font-light tracking-[0.2em] uppercase mb-2";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="relative bg-[#0a0e0b] border border-[#D4AF37]/20 max-w-md w-full">
            <button onClick={onClose} className="absolute top-4 right-4 text-[#e8e4da]/40 hover:text-[#e8e4da] text-2xl font-light">x</button>
            <div className="p-8">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-6 h-px bg-[#D4AF37]/40" />
                  <span className="text-[#D4AF37]/60 text-[10px] tracking-[0.3em] font-light">
                    {mode === 'signin' ? 'SIGN IN' : mode === 'signup' ? 'JOIN THE ARCHIVE' : 'CHOOSE YOUR NAME'}
                  </span>
                </div>
                <h2 className="text-3xl font-light text-[#e8e4da] tracking-wide" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
                  {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Begin archiving' : 'Your field identity'}
                </h2>
                {mode === 'username' && <p className="text-[#e8e4da]/40 text-sm font-light mt-2">This is how you appear on the globe and leaderboard.</p>}
              </div>

              {mode === 'signin' && (
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div><label className={lbl}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} required /></div>
                  <div><label className={lbl}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inp} required /></div>
                  {message && <p className="text-red-400 text-sm font-light">{message}</p>}
                  <button type="submit" disabled={loading} className="w-full py-3.5 bg-[#D4AF37] text-black font-light tracking-[0.15em] uppercase hover:bg-[#c49f27] transition disabled:opacity-50">
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              )}

              {mode === 'signup' && (
                <form onSubmit={handleSignUp} className="space-y-5">
                  <div><label className={lbl}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inp} required /></div>
                  <div><label className={lbl}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inp} required minLength={6} /></div>
                  {message && <p className="text-red-400 text-sm font-light">{message}</p>}
                  <button type="submit" disabled={loading} className="w-full py-3.5 bg-[#D4AF37] text-black font-light tracking-[0.15em] uppercase hover:bg-[#c49f27] transition disabled:opacity-50">
                    {loading ? 'Creating account...' : 'Create Account'}
                  </button>
                </form>
              )}

              {mode === 'username' && (
                <form onSubmit={handleUsername} className="space-y-5">
                  <div>
                    <label className={lbl}>Username</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3 text-[#D4AF37]/40 text-sm">@</span>
                      <input type="text" value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
                        className={inp + ' pl-8'} placeholder="fieldexplorer" required minLength={3} maxLength={20} />
                    </div>
                    <p className="text-[#e8e4da]/30 text-xs mt-2 font-light">Letters, numbers, underscores. 3-20 characters.</p>
                  </div>
                  {message && <p className="text-red-400 text-sm font-light">{message}</p>}
                  <button type="submit" disabled={loading} className="w-full py-3.5 bg-[#D4AF37] text-black font-light tracking-[0.15em] uppercase hover:bg-[#c49f27] transition disabled:opacity-50">
                    {loading ? 'Saving...' : 'Enter the Archive'}
                  </button>
                </form>
              )}

              {mode !== 'username' && (
                <div className="mt-6 text-center">
                  <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}
                    className="text-[#D4AF37]/50 hover:text-[#D4AF37] text-sm font-light tracking-wide transition">
                    {mode === 'signin' ? "Don't have an account? Join the archive" : 'Already a contributor? Sign in'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
