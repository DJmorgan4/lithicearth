'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function GamePage() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0a0f0d]">
      <motion.div
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-[#0a0f0d]/90 backdrop-blur-xl border-b border-[#5b7c6f]/20"
      >
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 border border-[#5b7c6f]/50 backdrop-blur-xl text-[#d4cfc0] font-light tracking-wide hover:bg-[#5b7c6f]/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-sm">Back to Site</span>
            </motion.button>
          </Link>

          <div className="flex items-center gap-3">
            <div className="text-[#8b9d8a] font-light tracking-wider text-sm">
              LITHIC EARTH GAME
            </div>
            <div className="w-2 h-2 rounded-full bg-[#8b9d8a] animate-pulse" />
          </div>

          <motion.button
            onClick={toggleFullscreen}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2 border border-[#5b7c6f]/50 backdrop-blur-xl text-[#d4cfc0] font-light tracking-wide hover:bg-[#5b7c6f]/10 transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <Maximize2 className="w-4 h-4" strokeWidth={1.5} />
            )}
            <span className="text-sm">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </motion.button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="pt-[73px] h-screen"
      >
        <iframe
          src="https://game.lithicearth.com"
          className="w-full h-full border-0"
          title="LithicEarth Game"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="fixed inset-0 bg-[#0a0f0d] pointer-events-none z-40 flex items-center justify-center"
      >
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-[#5b7c6f]/30 border-t-[#8b9d8a] rounded-full animate-spin mx-auto mb-4" />
          <div className="text-[#8b9d8a] font-light tracking-wider text-sm">
            Loading Ancient Mysteries...
          </div>
        </div>
      </motion.div>
    </div>
  );
}
