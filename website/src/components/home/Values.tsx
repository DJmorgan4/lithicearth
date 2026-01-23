'use client';

import { motion } from 'framer-motion';
import { Clock, Users, Archive } from 'lucide-react';

export function Values() {
  const values = [
    { icon: Clock, title: 'Long-term thinking', description: 'Building an archive meant to last generations, not quarters. Every decision considers decades ahead.' },
    { icon: Users, title: 'Human-centered', description: 'This record exists because people care. Contributors own their work, communities own their stories.' },
    { icon: Archive, title: 'Rigorous standards', description: 'Metadata integrity, geographic precision, and ethical stewardship from day one.' },
  ];
  
  return (
    <section className="relative py-24 px-6 bg-[#f5f3ed]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-px bg-[#5b7c6f]"></div>
            <span className="text-[#5b7c6f] text-xs tracking-widest font-light">PRINCIPLES</span>
          </div>
          <h2 className="text-4xl font-light text-[#2d3d34] tracking-wide">What guides this work</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {values.map((value) => {
            const Icon = value.icon;
            return (
              <motion.div key={value.title} whileHover={{ y: -4 }} className="bg-white border border-[#d4cfc0] p-8 transition-all">
                <div className="w-10 h-10 border border-[#d4cfc0] flex items-center justify-center mb-6">
                  <Icon className="w-5 h-5 text-[#5b7c6f]" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-light text-[#2d3d34] mb-3 tracking-wide">{value.title}</h3>
                <p className="text-[#7a8a7d] leading-relaxed font-light text-sm">{value.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
