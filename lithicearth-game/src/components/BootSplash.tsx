import React, { useEffect, useMemo, useState } from 'react';

type Props = {
  onDone: () => void;
};

const LINES = [
  'Establishing uplink to LithicNet…',
  'Syncing world seed…',
  'Loading hero glyph atlas…',
  'Compiling site anomaly index…',
  'Initializing discovery protocol…',
  'Warming render pipeline…',
];

export const BootSplash: React.FC<Props> = ({ onDone }) => {
  const [p, setP] = useState(0);
  const [ready, setReady] = useState(false);

  const line = useMemo(() => LINES[Math.min(LINES.length - 1, Math.floor(p / 16))], [p]);

  useEffect(() => {
    let t: number | undefined;
    const tick = () => {
      setP((v) => {
        const next = Math.min(100, v + (v < 70 ? 3 : v < 92 ? 2 : 1));
        return next;
      });
      t = window.setTimeout(tick, 70);
    };
    tick();
    return () => t && window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (p >= 100) {
      const id = window.setTimeout(() => setReady(true), 250);
      return () => window.clearTimeout(id);
    }
  }, [p]);

  useEffect(() => {
    if (!ready) return;
    const go = () => onDone();
    const onKey = () => go();
    const onClick = () => go();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [ready, onDone]);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(circle at 30% 20%, rgba(255,215,0,0.12), transparent 55%), radial-gradient(circle at 70% 60%, rgba(120,200,255,0.10), transparent 55%), #05050d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        width: 'min(900px, calc(100vw - 36px))',
        borderRadius: 22,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(10,10,24,0.62)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 30px 120px rgba(0,0,0,0.75)',
        padding: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontWeight: 1000, fontSize: '1.25rem', letterSpacing: '0.9px' }}>
            LITHIC EARTH
          </div>
          <div style={{ opacity: 0.75, fontWeight: 900, fontSize: '0.9rem' }}>
            build: investor-demo • v0.1
          </div>
        </div>

        <div style={{
          marginTop: 14,
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(0,0,0,0.35)',
          padding: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          color: 'rgba(255,255,255,0.82)',
          lineHeight: 1.5,
        }}>
          <div>status: <span style={{ color: 'white', fontWeight: 1000 }}>{line}</span></div>
          <div>region: <span style={{ color: 'white', fontWeight: 1000 }}>global</span> • latency: <span style={{ color: 'white', fontWeight: 1000 }}>14ms</span></div>
          <div>integrity: <span style={{ color: 'white', fontWeight: 1000 }}>OK</span> • checksum: <span style={{ color: 'white', fontWeight: 1000 }}>A7C9</span></div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.85, fontWeight: 900 }}>
            <div>Loading world…</div>
            <div>{p}%</div>
          </div>
          <div style={{
            marginTop: 8,
            height: 12,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${p}%`,
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,215,0,0.35), rgba(120,200,255,0.28))',
              boxShadow: '0 12px 40px rgba(255,215,0,0.18)',
              transition: 'width 120ms linear',
            }} />
          </div>
        </div>

        <div style={{
          marginTop: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          opacity: ready ? 1 : 0.7,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 900 }}>
            {ready ? 'Press any key to begin' : 'Tip: SHIFT+Click a site to decode hidden truth'}
          </div>
          <div style={{
            padding: '8px 10px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            fontWeight: 1000,
            letterSpacing: '0.4px',
          }}>
            {ready ? 'READY' : 'BOOTING'}
          </div>
        </div>
      </div>
    </div>
  );
};
