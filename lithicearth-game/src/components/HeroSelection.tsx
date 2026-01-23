import React from 'react';
import { getAllHeroes } from '../data/heroes';
import { useGameStore } from '../hooks/useGameStore';
import { HeroType } from '../types';

export const HeroSelection: React.FC = () => {
  const { selectHero } = useGameStore();
  const heroes = getAllHeroes();

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f1e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      padding: '40px',
    }}>
      <h1 style={{
        fontSize: '4rem',
        marginBottom: '20px',
        background: 'linear-gradient(to bottom, #ffffff, #ffd700)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        LITHIC EARTH
      </h1>
      <p style={{ fontSize: '1.2rem', color: '#aaa', marginBottom: '60px' }}>
        CHOOSE YOUR LEGENDARY HERO
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '40px',
        maxWidth: '1200px',
      }}>
        {heroes.map((hero) => (
          <div
            key={hero.id}
            onClick={() => selectHero(hero.id)}
            style={{
              background: 'rgba(20, 20, 40, 0.9)',
              border: `3px solid ${hero.colors.primary}`,
              borderRadius: '16px',
              padding: '30px',
              cursor: 'pointer',
              transition: 'transform 0.3s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-10px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{
              width: '100%',
              aspectRatio: '1',
              background: `linear-gradient(135deg, ${hero.colors.primary}, ${hero.colors.secondary})`,
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '6rem',
              marginBottom: '20px',
            }}>
              {hero.name[0]}
            </div>

            <h3 style={{ fontSize: '2rem', marginBottom: '5px' }}>{hero.name}</h3>
            <p style={{ fontSize: '1rem', color: '#aaa', marginBottom: '20px' }}>{hero.title}</p>
            <p style={{ fontSize: '0.9rem', color: '#bbb', marginBottom: '20px' }}>{hero.description}</p>

            <button style={{
              width: '100%',
              padding: '15px',
              background: hero.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              cursor: 'pointer',
            }}>
              SELECT HERO
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
