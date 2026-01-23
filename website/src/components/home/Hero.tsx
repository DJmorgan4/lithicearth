'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Sparkles, Globe, Camera } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

interface HeroProps {
  onSignInClick: () => void;
}

export function Hero({ onSignInClick }: HeroProps) {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], [0, 300]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={containerRef} className="relative min-h-screen flex items-center justify-center bg-[#0a0f0d] overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f0d] via-[#1a2820] to-[#0a0f0d]" />
        <motion.div 
          className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-[#5b7c6f]/20 rounded-full blur-[120px]"
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-[#8b9d8a]/20 rounded-full blur-[100px]"
          animate={{
            scale: [1.2, 1, 1.2],
            x: [0, -30, 0],
            y: [0, -50, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
      }} />

      <motion.div style={{ y, opacity }} className="relative z-10 w-full max-w-[1400px] mx-auto px-6 py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex justify-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#5b7c6f]/10 to-[#8b9d8a]/10 border border-[#5b7c6f]/30 backdrop-blur-xl rounded-full">
            <Sparkles className="w-4 h-4 text-[#8b9d8a]" strokeWidth={1.5} />
            <span className="text-[#d4cfc0] text-sm font-light tracking-wide">Launching 2026</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="text-center mb-8"
        >
          <h1 className="text-7xl md:text-8xl lg:text-9xl font-extralight text-white mb-6 leading-[0.9] tracking-tighter">
            Document
            <br />
            <span className="bg-gradient-to-r from-[#8b9d8a] via-[#5b7c6f] to-[#8b9d8a] bg-clip-text text-transparent font-light">
              the Planet
            </span>
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="text-xl md:text-2xl text-[#b5b0a0] max-w-2xl mx-auto font-light leading-relaxed"
          >
            A permanent, georeferenced archive of Earth—built by people, preserved for generations.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1 }}
          className="flex justify-center gap-16 mb-16"
        >
          <div className="text-center">
            <div className="text-5xl font-extralight text-[#8b9d8a] mb-2">0</div>
            <div className="text-sm text-[#7a8a7d] tracking-widest uppercase font-light">Photographs</div>
          </div>
          <div className="w-px bg-gradient-to-b from-transparent via-[#5b7c6f]/30 to-transparent" />
          <div className="text-center">
            <div className="text-5xl font-extralight text-[#8b9d8a] mb-2">∞</div>
            <div className="text-sm text-[#7a8a7d] tracking-widest uppercase font-light">Years Ahead</div>
          </div>
          <div className="w-px bg-gradient-to-b from-transparent via-[#5b7c6f]/30 to-transparent" />
          <div className="text-center">
            <div className="text-5xl font-extralight text-[#8b9d8a] mb-2">1</div>
            <div className="text-sm text-[#7a8a7d] tracking-widest uppercase font-light">Earth</div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
        >
          <Link href="/archive">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#5b7c6f] to-[#6b8c7f] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative px-8 py-4 bg-[#5b7c6f] border border-[#6b8c7f]/50 backdrop-blur-xl flex items-center gap-3">
                <Globe className="w-5 h-5 text-white" strokeWidth={1.5} />
                <span className="text-white font-light tracking-wide">Explore Archive</span>
                <ArrowRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
              </div>
            </motion.div>
          </Link>

          <Link href="/ancient-mysteries">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#8b9d8a]/20 to-[#5b7c6f]/20" />
              <div className="relative px-8 py-4 border border-[#8b9d8a]/50 backdrop-blur-xl flex items-center gap-3 hover:border-[#8b9d8a]/70 transition-colors">
                <Sparkles className="w-5 h-5 text-[#8b9d8a]" strokeWidth={1.5} />
                <span className="text-[#d4cfc0] font-light tracking-wide">Explore Ancient Mysteries</span>
                <ArrowRight className="w-4 h-4 text-[#8b9d8a]/70 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
              </div>
            </motion.div>
          </Link>

          <motion.button
            onClick={onSignInClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 py-4 border border-[#5b7c6f]/50 backdrop-blur-xl text-[#d4cfc0] font-light tracking-wide hover:bg-[#5b7c6f]/10 transition-colors flex items-center gap-3"
          >
            <Camera className="w-5 h-5" strokeWidth={1.5} />
            Start Contributing
          </motion.button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {[
            {
              icon: Globe,
              title: "Georeferenced",
              description: "Every photo mapped with precision coordinates"
            },
            {
              icon: Sparkles,
              title: "Timestamped",
              description: "Permanent record across generations"
            },
            {
              icon: Camera,
              title: "Community-Driven",
              description: "Built by people who care about Earth"
            }
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.6 + i * 0.1 }}
              whileHover={{ y: -5 }}
              className="group relative overflow-hidden bg-gradient-to-br from-[#1a2820]/40 to-[#0a0f0d]/40 border border-[#5b7c6f]/20 backdrop-blur-xl p-8 hover:border-[#5b7c6f]/40 transition-all"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#5b7c6f]/0 to-[#5b7c6f]/0 group-hover:from-[#5b7c6f]/5 group-hover:to-[#5b7c6f]/5 transition-all duration-500" />
              <div className="relative">
                <div className="w-12 h-12 mb-6 rounded-full bg-[#5b7c6f]/10 flex items-center justify-center border border-[#5b7c6f]/20 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-[#8b9d8a]" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-light text-white mb-3 tracking-wide">{feature.title}</h3>
                <p className="text-[#b5b0a0] font-light leading-relaxed">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-3"
          >
            <div className="text-xs text-[#7a8a7d] tracking-widest uppercase font-light">Scroll</div>
            <div className="w-[1px] h-16 bg-gradient-to-b from-[#5b7c6f]/50 via-[#5b7c6f]/20 to-transparent" />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
