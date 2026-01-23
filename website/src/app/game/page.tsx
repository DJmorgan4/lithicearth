'use client';

import Link from 'next/link';

export default function GamePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-6xl font-bold text-white mb-4">
          🎮 Game Coming Soon
        </h1>
        <p className="text-xl text-slate-400 mb-8">
          The ancient world awaits...
        </p>

        <Link
          href="/"
          className="inline-block px-8 py-4 bg-cyan-500 text-white rounded-full font-semibold hover:bg-cyan-400 transition"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}

