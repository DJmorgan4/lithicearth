 
 
'use client';

const VALUES = [
  {
    glyph: '⊕',
    title: 'Long-term thinking',
    body: 'Building an archive meant to last generations, not quarters. Every decision considers decades ahead.',
  },
  {
    glyph: '⊘',
    title: 'Human-centered',
    body: 'This record exists because people care. Contributors own their work, communities own their stories.',
  },
  {
    glyph: '⊞',
    title: 'Rigorous standards',
    body: 'Metadata integrity, geographic precision, and ethical stewardship from day one.',
  },
];

export function Values() {
  return (
    <section className="relative bg-black px-10 py-28 border-t border-white/6">

      {/* Section label */}
      <div className="flex items-center gap-4 mb-20 max-w-6xl mx-auto">
        <div className="h-px w-8 bg-[#D4AF37]/40" />
        <span className="text-[10px] text-[#D4AF37]/50 tracking-[0.45em] uppercase font-light">
          Principles
        </span>
      </div>

      {/* Headline */}
      <div className="max-w-6xl mx-auto mb-20">
        <h2
          className="text-4xl md:text-3xl md:text-5xl font-light text-white/90 leading-[1.15]"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          What guides
          <br />
          <span className="text-[#D4AF37]/70 italic">this work.</span>
        </h2>
      </div>

      {/* Cards */}
      <div className="max-w-6xl mx-auto grid md:grid-cols-1 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0">
        {VALUES.map((v, i) => (
          <div
            key={v.title}
            className={[
              'py-10 pr-10 group',
              i > 0 ? 'md:pl-10 md:border-l border-white/7' : '',
            ].join(' ')}
          >
            {/* Glyph */}
            <div
              className="text-2xl text-[#D4AF37]/30 group-hover:text-[#D4AF37]/60 transition-colors duration-500 mb-8 font-light select-none"
              aria-hidden="true"
            >
              {v.glyph}
            </div>

            {/* Number */}
            <p
              className="text-[48px] font-light text-[#D4AF37]/8 leading-none mb-4 select-none"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
              aria-hidden="true"
            >
              0{i + 1}
            </p>

            <h3 className="text-[15px] font-light text-white/85 tracking-wide mb-4 group-hover:text-white transition-colors duration-300">
              {v.title}
            </h3>
            <p className="text-[13px] text-white/30 font-light leading-relaxed">
              {v.body}
            </p>

            {/* Hover line */}
            <div className="mt-8 h-px w-0 group-hover:w-12 bg-[#D4AF37]/40 transition-all duration-500" />
          </div>
        ))}
      </div>

      {/* Bottom CTA strip */}
      <div className="max-w-6xl mx-auto mt-24 pt-16 border-t border-white/6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:p-6">
        <p
          className="text-2xl font-light text-white/60 leading-snug max-w-lg"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          The archive grows only because people show up.
        </p>
        <a
          href="/contribute"
          className="shrink-0 px-8 py-3.5 text-[11px] font-light text-[#D4AF37]/80 hover:text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 transition-all duration-200 tracking-[0.18em] uppercase"
        >
          Start contributing
        </a>
      </div>
    </section>
  );
}
