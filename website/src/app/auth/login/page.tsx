 
 
'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/portal';

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = next;
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e0b] flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#5b7c6f 1px, transparent 1px), linear-gradient(90deg, #5b7c6f 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-px bg-[#5b7c6f]" />
            <span className="text-[#5b7c6f] text-xs tracking-[0.3em] font-light">LITHICEARTH</span>
          </div>
          <h1 className="text-4xl font-light text-[#e8e4da] tracking-wide leading-tight">
            Portal Access
          </h1>
          <p className="text-[#7a8a7d] text-sm font-light mt-2 tracking-wide">
            Private analytical environment
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[#5b7c6f] text-xs tracking-[0.2em] font-light mb-2">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 bg-[#111a14] border border-[#2a3d2e] text-[#e8e4da] font-light focus:outline-none focus:border-[#5b7c6f] transition-colors text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-[#5b7c6f] text-xs tracking-[0.2em] font-light mb-2">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 bg-[#111a14] border border-[#2a3d2e] text-[#e8e4da] font-light focus:outline-none focus:border-[#5b7c6f] transition-colors text-sm"
              required
            />
          </div>

          {message && (
            <p className="text-[#a85b5b] text-sm font-light">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#5b7c6f] text-[#f5f3ed] font-light tracking-[0.15em] text-sm hover:bg-[#6b8c7f] transition-colors border border-[#4a6b5e] disabled:opacity-50 mt-2"
          >
            {loading ? 'AUTHENTICATING...' : 'ENTER PORTAL'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-[#1a2a1e]">
          <p className="text-[#3a4a3e] text-xs font-light tracking-wide text-center">
            Restricted access — LithicEarth Private Portal
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
