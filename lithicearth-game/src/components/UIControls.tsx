import React from 'react';
import { useGameStore } from '../hooks/useGameStore';

export const UIControls: React.FC = () => {
  const { currentSite, backToSites, clearHero, globeMode, toggleGlobeMode, selectedHero } = useGameStore();

  const objectives = [
    { label: 'Choose a Hero', done: !!selectedHero },
    { label: 'Travel to a Site', done: !!currentSite },
    { label: 'Decode Hidden Truth (SHIFT+Click)', done: false }, // intentionally “aspirational”
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        right: 16,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      {/* left controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {currentSite && (
            <button type="button" onClick={backToSites} style={btnStyle()} title="Back to globe">
              ← Sites
            </button>
          )}
          <button type="button" onClick={clearHero} style={btnStyle()} title="Back to hero selection">
            ← Heroes
          </button>
        </div>

        {/* mission hud */}
        <div
          style={{
            width: 320,
            maxWidth: 'calc(100vw - 32px)',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(10,10,24,0.55)',
            backdropFilter: 'blur(10px)',
            padding: 12,
            boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontWeight: 1000, letterSpacing: '0.6px' }}>MISSION</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: 99,
                background: 'rgba(255,80,80,0.95)',
                boxShadow: '0 0 18px rgba(255,80,80,0.35)',
              }} />
              <span style={{ fontWeight: 1000, opacity: 0.9 }}>LIVE</span>
            </div>
          </div>

          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {objectives.map((o) => (
              <div key={o.label} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                padding: '10px 10px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.05)',
              }}>
                <div style={{ fontWeight: 950, opacity: 0.92 }}>{o.label}</div>
                <div style={{
                  fontWeight: 1000,
                  color: o.done ? 'rgba(160,255,200,0.95)' : 'rgba(255,255,255,0.55)'
                }}>
                  {o.done ? '✓' : '—'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, opacity: 0.75, fontWeight: 900, fontSize: '0.92rem' }}>
            Tip: Type <strong>lithic</strong> while exploring.
          </div>
        </div>
      </div>

      {/* right controls */}
      <div style={{ display: 'flex', gap: 12, pointerEvents: 'auto' }}>
        <button type="button" onClick={toggleGlobeMode} style={btnStyle()} title="Toggle globe style">
          Globe: {globeMode === 'stylized' ? 'Stylized' : 'Realistic'}
        </button>
      </div>
    </div>
  );
};

function btnStyle(): React.CSSProperties {
  return {
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(10,10,24,0.55)',
    backdropFilter: 'blur(10px)',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 900,
    letterSpacing: '0.2px',
    boxShadow: '0 12px 35px rgba(0,0,0,0.35)',
  };
}
