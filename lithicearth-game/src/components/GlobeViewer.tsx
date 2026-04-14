import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import type { HeroType } from '../types';
import { ANCIENT_SITES } from '../data/sites';
import { makeGhosts, stepGhosts } from '../game/worldSim';

type Vec = { x: number; y: number };

const SITE_POS: Record<string, Vec> = {
  'gobekli-tepe': { x: -260, y: -80 },
  giza: { x: 220, y: 40 },
  stonehenge: { x: -40, y: 180 },
};

export const GlobeViewer: React.FC = () => {
  const { selectedHero, currentSite, setCurrentSite } = useGameStore();
  const hero = selectedHero as HeroType;

  const [pos, setPos] = useState<Vec>({ x: 0, y: 0 });
  const [vel, setVel] = useState<Vec>({ x: 0, y: 0 });
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [shards, setShards] = useState<Record<string, boolean>>({});
  const [shardPop, setShardPop] = useState<string | null>(null);

  const [truthSite, setTruthSite] = useState<{ id: string; name: string } | null>(null);

  // “They Knew” mode (type lithic or Konami)
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const konamiRef = useRef<string[]>([]);
  const typeRef = useRef<string[]>([]);
  const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright'];

  const ghostsRef = useRef(makeGhosts(12));
  const [ghostTick, setGhostTick] = useState(0);

  const sites = useMemo(() => ANCIENT_SITES.map(s => ({...s, pos: SITE_POS[s.id] ?? {x:0,y:0} })), []);

  const portalOpen = Object.keys(shards).length >= 3;

  useEffect(() => {
    const down = (e: KeyboardEvent) => setKeys(k => ({ ...k, [e.key.toLowerCase()]: true }));
    const up = (e: KeyboardEvent) => setKeys(k => ({ ...k, [e.key.toLowerCase()]: false }));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();

      // Konami
      konamiRef.current = [...konamiRef.current, k].slice(-KONAMI.length);
      const isKonami = KONAMI.every((kk, i) => konamiRef.current[i] === kk);

      // type "lithic"
      typeRef.current = [...typeRef.current, k].slice(-5);
      const typed = typeRef.current.join('');

      if (isKonami || typed === 'lithic') setSecretUnlocked(true);
      if (k === 'escape') {
        setTruthSite(null);
        setSecretUnlocked(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(40, t - last);
      last = t;

      // move with acceleration + friction (Fortnite-ish feel)
      const accel = 0.022 * (dt/16);
      const max = 1.45;
      const friction = 0.88 ** (dt/16);

      let ax = 0, ay = 0;
      if (keys['w'] || keys['arrowup']) ay -= accel;
      if (keys['s'] || keys['arrowdown']) ay += accel;
      if (keys['a'] || keys['arrowleft']) ax -= accel;
      if (keys['d'] || keys['arrowright']) ax += accel;

      setVel(v => {
        let nx = (v.x + ax);
        let ny = (v.y + ay);
        nx *= friction;
        ny *= friction;

        const sp = Math.hypot(nx, ny);
        if (sp > max) {
          nx = (nx / sp) * max;
          ny = (ny / sp) * max;
        }
        return { x: nx, y: ny };
      });

      setPos(p => {
        const vx = vel.x;
        const vy = vel.y;
        const nx = p.x + vx * (dt/10);
        const ny = p.y + vy * (dt/10);

        // bounds
        const bx = 420, by = 260;
        return { x: Math.max(-bx, Math.min(bx, nx)), y: Math.max(-by, Math.min(by, ny)) };
      });

      // ghosts
      stepGhosts(ghostsRef.current, dt, t);
      if (Math.random() < 0.25) setGhostTick(x => x + 1);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, vel.x, vel.y]);

  // shard collection if near monuments
  useEffect(() => {
    for (const s of sites) {
      const dx = pos.x - s.pos.x;
      const dy = pos.y - s.pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 64 && !shards[s.id]) {
        setShards(prev => ({ ...prev, [s.id]: true }));
        setShardPop(s.id);
        window.setTimeout(() => setShardPop(null), 450);
      }
    }
  }, [pos.x, pos.y, shards, sites]);

  const current = currentSite ? sites.find(s => s.id === currentSite) : null;

  const onMonumentClick = (id: string) => {
    setCurrentSite(id);
  };

  const onTruth = (siteId: string, siteName: string) => {
    setTruthSite({ id: siteId, name: siteName });
  };

  return (
    <div className={`hub ${secretUnlocked ? 'they-knew-gold' : ''}`}>
      <div className="hub-grid" />
      <div className="hub-fog" />

      {/* HUD */}
      <div className="hud-top">
        <div style={{display:'flex', gap:10}}>
          <div className="hud-chip">LIVE • {ghostsRef.current.length + 1} Explorers</div>
          <div className="hud-chip">Relics: {Object.keys(shards).length}/3</div>
        </div>
        <div className="hud-chip">Explore Mode: ON (WASD)</div>
      </div>

      {/* Ghost explorers */}
      {ghostsRef.current.map(g => (
        <div key={g.id} className="ghost" style={{ left: `calc(50% + ${g.x}px)`, top: `calc(50% + ${g.y}px)` }}>
          <div className="ghost-name">{g.name}</div>
          {g.chat && g.chatUntil && performance.now() < g.chatUntil && (
            <div className="ghost-chat">{g.chat}</div>
          )}
        </div>
      ))}

      {/* Monuments */}
      {sites.map(s => (
        <div
          key={s.id}
          className="monument"
          onClick={() => onMonumentClick(s.id)}
          style={{
            left: `calc(50% + ${s.pos.x}px)`,
            top: `calc(50% + ${s.pos.y}px)`,
            width: 180,
          }}
          title="Click to travel"
        >
          <div className="monument-title">{s.name}</div>
          <div className="monument-sub">{s.era} • {s.culture}</div>

          {/* shard marker */}
          {!shards[s.id] && (
            <div className={`shard ${shardPop === s.id ? 'shard-pop' : ''}`} style={{ left: '50%', top: 86 }} />
          )}
          {shards[s.id] && (
            <div style={{ padding: '0 12px 12px', color:'rgba(255,255,255,0.7)', fontSize: 12 }}>
              ✔ Relic shard recovered
            </div>
          )}
        </div>
      ))}

      {/* Portal */}
      {portalOpen && (
        <div
          className="portal"
          style={{ left: 'calc(50% + 280px)', top: 'calc(50% + -190px)' }}
          title="CLASSIFIED: ANTARCTICA (Invite Only)"
          onClick={() => alert("ACCESS DENIED — INVITE ONLY\n\nA signal is present beneath the ice.")}
        />
      )}

      {/* Player */}
      <div className="player" style={{ left: `calc(50% + ${pos.x}px)`, top: `calc(50% + ${pos.y}px)` }}>
        <div className="player-body" />
        <div className="player-shadow" />
      </div>

      {/* Site info panel */}
      <div style={{
        position:'absolute', right: 16, top: 78,
        width: 320,
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.16)',
        background: 'rgba(10,10,24,0.55)',
        backdropFilter: 'blur(10px)',
        color: 'white',
        padding: 14,
        boxShadow: '0 18px 60px rgba(0,0,0,0.5)'
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
          <div style={{fontWeight: 1000, letterSpacing: 0.2}}>{current?.name ?? 'Choose a Site'}</div>
          <div style={{opacity:0.7, fontWeight:900}}>{current?.era ?? ''}</div>
        </div>
        <div style={{opacity:0.7, marginTop:6}}>{current?.description ?? 'Run to a monument and click it to travel.'}</div>
        <div style={{marginTop:10, display:'flex', gap:8, flexWrap:'wrap'}}>
          <button
            type="button"
            onClick={() => current && onTruth(current.id, current.name)}
            style={{
              padding: '10px 12px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.08)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 900,
            }}
            title="SHIFT + click on dots also works in the old mode. Here it's your scan."
          >
            Decode Hidden Truth
          </button>
          <button
            type="button"
            onClick={() => setSecretUnlocked(true)}
            style={{
              padding: '10px 12px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 900,
            }}
            title="Or type lithic"
          >
            They Knew…
          </button>
        </div>
        <div style={{opacity:0.65, marginTop:10, fontSize: 12}}>
          Tip: type <b>lithic</b>. Collect 3 shards to reveal a portal.
        </div>
      </div>

      {/* Truth overlay */}
      {truthSite && (
        <TruthOverlay hero={hero} siteName={truthSite.name} onClose={() => setTruthSite(null)} />
      )}

      {/* They Knew overlay (reuse your CSS class) */}
      {secretUnlocked && (
        <div className="they-knew" role="dialog" aria-modal="true">
          <div className="lore-panel">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontWeight: 1000, fontSize: 18}}>They Knew</div>
              <button
                type="button"
                onClick={() => setSecretUnlocked(false)}
                style={{
                  padding:'8px 10px',
                  borderRadius: 12,
                  border:'1px solid rgba(255,255,255,0.18)',
                  background:'rgba(0,0,0,0.25)',
                  color:'white',
                  cursor:'pointer',
                  fontWeight: 900
                }}
              >
                ESC
              </button>
            </div>
            <div style={{marginTop:10, opacity:0.9, lineHeight:1.5}}>
              <div style={{fontSize: 14, opacity:0.9}}>
                This is not mythology. This is memory.
              </div>
              <div style={{marginTop:10, fontSize: 13, opacity:0.75}}>
                • Timelines: redacted<br/>
                • Connections: disputed<br/>
                • Signal source: <b>beneath the ice</b><br/>
                • Access: invite-only
              </div>
              <div style={{marginTop:14, fontSize: 12, opacity:0.65}}>
                (Press ESC to close)
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{position:'absolute', left: 16, bottom: 16, opacity: 0.75, fontSize: 12}}>
        <b>{hero.toUpperCase()}</b> • Run to monuments • Collect shards • Portal unlock
      </div>

      {/* force ghost rerender */}
      <span style={{display:'none'}}>{ghostTick}</span>
    </div>
  );
};

function TruthOverlay({ hero, siteName, onClose }: { hero: HeroType; siteName: string; onClose: () => void }) {
  const heroLine =
    hero === 'zeus'
      ? 'Astronomical alignments detected.'
      : hero === 'hercules'
      ? 'Construction paths and force lines revealed.'
      : 'Calendar glyphs + time codes exposed.';

  return (
    <div className="truth-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="truth-overlay-ui" onClick={(e) => e.stopPropagation()}>
        <div style={{fontWeight: 1000}}>Hidden Knowledge — {siteName}</div>
        <div style={{marginTop: 6, opacity: 0.85}}>
          <b>{hero[0].toUpperCase() + hero.slice(1)}:</b> {heroLine}
        </div>
        <div style={{marginTop: 10, opacity: 0.7, fontSize: 12}}>Press ESC to close.</div>
      </div>
    </div>
  );
}
