'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';

interface HeroProps {
  onSignInClick: () => void;
}

export function Hero({ onSignInClick }: HeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);

  return (
    <div ref={containerRef} className="relative h-screen flex items-center justify-center bg-black overflow-hidden">
      {/* The Globe - Full Screen */}
      <motion.div 
        style={{ opacity, scale }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <EarthGlobe />
      </motion.div>

      {/* Minimal Header - Floats Above */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="absolute top-0 left-0 right-0 z-50 px-8 py-6"
      >
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-light text-white/90 tracking-tight hover:text-white transition-colors">
            LithicEarth
          </Link>
          
          <nav className="flex items-center gap-8">
            <Link 
              href="/archive"
              className="text-sm font-light text-white/70 hover:text-white transition-colors tracking-wide"
            >
              Archive
            </Link>
            <button
              onClick={onSignInClick}
              className="text-sm font-light text-white/70 hover:text-white transition-colors tracking-wide"
            >
              Sign In
            </button>
          </nav>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50"
      >
        <motion.div
          animate={{ y: [0, 12, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-3"
        >
          <div className="text-xs text-white/40 tracking-[0.3em] uppercase font-light">
            Explore
          </div>
          <div className="w-px h-16 bg-linear-to-b from-white/30 to-transparent" />
        </motion.div>
      </motion.div>
    </div>
  );
}

function EarthGlobe() {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((r: number) => r + 0.1);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Earth sphere */}
      <div
        style={{ 
          transform: `rotate(${rotation}deg)`,
          width: '70vh',
          height: '70vh'
        }}
        className="rounded-full relative"
      >
        {/* Earth gradient */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(74, 144, 226, 0.3), rgba(45, 95, 63, 0.6), rgba(26, 58, 46, 0.9))'
          }}
        />
        
        {/* Atmospheric glow */}
        <div 
          className="absolute inset-0 rounded-full" 
          style={{
            boxShadow: '0 0 120px 40px rgba(100, 180, 255, 0.15)'
          }}
        />
        
        {/* Cloud layer */}
        <div
          style={{
            animation: 'spin 120s linear infinite'
          }}
          className="absolute inset-0 rounded-full bg-linear-to-br from-white/5 via-transparent to-white/5"
        />
        
        {/* Day/night terminator */}
        <div className="absolute inset-0 rounded-full bg-linear-to-r from-transparent via-black/20 to-black/40" />
      </div>

      {/* Stars */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 100 }).map((_, i) => {
          const left = Math.random() * 100;
          const top = Math.random() * 100;
          const duration = Math.random() * 3 + 2;
          const delay = Math.random() * 2;
          
          return (
            <motion.div
              key={i}
              className="absolute w-px h-px bg-white rounded-full"
              style={{
                left: `${left}%`,
                top: `${top}%`,
              }}
              animate={{
                opacity: [0.2, 1, 0.2],
              }}
              transition={{
                duration,
                repeat: Infinity,
                delay,
              }}
            />
          );
        })}
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
