import React, { useState } from 'react';
import { getAllHeroes } from '../data/heroes';
import { useGameStore } from '../hooks/useGameStore';
import type { HeroType } from '../types';

type HeroWithAvatar = ReturnType<typeof getAllHeroes>[number] & {
  Avatar?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: string;
};

export const HeroSelection: React.FC = () => {
  const { selectHero } = useGameStore();
  const heroes = getAllHeroes() as readonly HeroWithAvatar[];
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f1e 55%, #070710 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      padding: '40px',
      overflow: 'hidden',
    }}>
      {/* subtle stars */}
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0 1px, transparent 2px), radial-gradient(circle at 60% 30%, rgba(255,255,255,0.10) 0 1px, transparent 2px), radial-gradient(circle at 40% 70%, rgba(255,255,255,0.08) 0 1px, transparent 2px)',
        opacity: 0.35,
        pointerEvents: 'none',
      }} />

      <h1 style={{
        fontSize: '4rem',
        marginBottom: '14px',
        background: 'linear-gradient(to bottom, #ffffff, #ffd700)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        letterSpacing: '1px',
        zIndex: 1,
      }}>
        LITHIC EARTH
      </h1>

      <p style={{
        fontSize: '1.2rem',
        color: '#b8b8c8',
        marginBottom: '44px',
        zIndex: 1,
      }}>
        CHOOSE YOUR LEGENDARY HERO
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))',
        gap: '28px',
        maxWidth: '1100px',
        width: '100%',
        zIndex: 1,
      }}>
        {heroes.map((hero) => {
          const isHover = hoverId === hero.id;
          const accent = hero.accent ?? '#6ee7ff';
          const Avatar = hero.Avatar;

          return (
            <div
              className={`hero-card ${selectedId ? (hero.id === selectedId ? "hero-selected" : "hero-dimmed") : ""}`}
              key={hero.id}
              onClick={() => {
                if (selectedId) return;
                setSelectedId(hero.id);
                window.setTimeout(() => selectHero(hero.id as HeroType), 700);
              }}
              onMouseEnter={() => setHoverId(hero.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                background: 'linear-gradient(180deg, rgba(20,20,40,0.92), rgba(10,10,24,0.92))',
                border: '2px solid rgba(255,255,255,0.10)',
                borderRadius: '22px',
                padding: '18px',
                cursor: 'pointer',
                transition: 'transform 160ms ease, box-shadow 160ms ease',
                transform: isHover ? 'translateY(-8px) rotate(-0.25deg)' : 'translateY(0)',
                boxShadow: isHover
                  ? '0 28px 80px rgba(0,0,0,0.65)'
                  : '0 18px 55px rgba(0,0,0,0.55)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* glow */}
              <div aria-hidden style={{
                position: 'absolute',
                inset: '-40%',
                background: `radial-gradient(circle at 30% 20%, ${accent}66, transparent 55%)`,
                opacity: isHover ? 0.95 : 0.65,
                transition: 'opacity 160ms ease',
                pointerEvents: 'none',
              }} />

              {/* avatar */}
              <div style={{
                width: '100%',
                aspectRatio: '1',
                borderRadius: '18px',
                marginBottom: '14px',
                overflow: 'hidden',
                boxShadow: '0 18px 55px rgba(0,0,0,0.6)',
                border: `3px solid ${accent}`,
                background: 'rgba(255,255,255,0.05)',
                position: 'relative',
              }}>
                {Avatar ? (
                  <Avatar size={280} />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '4.5rem',
                    fontWeight: 900,
                    color: 'white',
                    background: `radial-gradient(circle at 30% 20%, ${accent}AA, rgba(255,255,255,0.06) 55%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))`,
                  }}>
                    {hero.name?.[0] ?? '?'}
                  </div>
                )}
              </div>

              <h3 style={{ fontSize: '2rem', marginBottom: '4px' }}>{hero.name}</h3>
              <p style={{ fontSize: '1rem', color: '#aaa', marginBottom: '14px' }}>{hero.title}</p>
              <p style={{ fontSize: '0.95rem', color: '#c7c7d6', marginBottom: '16px', lineHeight: 1.35 }}>
                {hero.description}
              </p>

              <button
                type="button"
                style={{
                  width: '100%',
                  padding: '14px',
                  background: accent,
                  color: '#0b0b18',
                  border: 'none',
                  borderRadius: '14px',
                  fontSize: '1.05rem',
                  fontWeight: 900,
                  letterSpacing: '0.6px',
                  cursor: 'pointer',
                  boxShadow: '0 14px 35px rgba(0,0,0,0.35)',
                }}
              >
                SELECT HERO
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
