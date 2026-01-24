import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { ANCIENT_SITES } from '../data/sites';
import type { HeroType } from '../types';

type Vec2 = { x: number; y: number };

const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright'];
const LITHIC = ['l','i','t','h','i','c'];

export const GlobeViewer: React.FC = () => {
  const {
    globeMode,
    currentSite,
    setCurrentSite,
    unlockedSites,
    selectedHero,
  } = useGameStore();

  const [explore, setExplore] = useState(true);
  const [pos, setPos] = useState<Vec2>({ x: 0, y: 0 }); // world coords
  const velRef = useRef<Vec2>({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});

  // Hero Truth overlay state
  const [truthSiteId, setTruthSiteId] = useState<string | null>(null);

  // They Knew mode
  const [secretUnlocked, setSecretUnlocked] = useState(false);
  const [theyKnewShake, setTheyKnewShake] = useState(false);
  const konamiRef = useRef<string[]>([]);
  const lithicRef = useRef<string[]>([]);

  const unlocked = useMemo(() => {
    const allowed = new Set(unlockedSites);
    return ANCIENT_SITES.filter((s) => allowed.has(s.id));
  }, [unlockedSites]);

  const active = useMemo(() => {
    if (!currentSite) return null;
    return ANCIENT_SITES.find((s) => s.id === currentSite) ?? null;
  }, [currentSite]);

  // Map sites into world positions (fake but consistent)
  const pois = useMemo(() => {
    const base: Record<string, Vec2> = {
      'gobekli-tepe': { x: -420, y: 120 },
      'giza': { x: 140, y: 220 },
      'stonehenge': { x: 260, y: -220 },
    };
    return unlocked.map((s, i) => ({
      ...s,
      p: base[s.id] ?? { x: -200 + i * 220, y: -120 + i * 80 },
    }));
  }, [unlocked]);

  // Keyboard controls + secret triggers
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // ignore typing into inputs
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable) return;

      const k = e.key.toLowerCase();
      keysRef.current[k] = true;

      // Record sequences
      konamiRef.current = [...konamiRef.current, k].slice(-KONAMI.length);
      lithicRef.current = [...lithicRef.current, k].slice(-LITHIC.length);

      const isKonami = KONAMI.every((kk, i) => konamiRef.current[i] === kk);
      const isLithic = LITHIC.every((kk, i) => lithicRef.current[i] === kk);

      if (!secretUnlocked && (isKonami || isLithic)) {
        setSecretUnlocked(true);
        setTheyKnewShake(true);
        window.setTimeout(() => setTheyKnewShake(false), 360);
        setExplore(false);
        setTruthSiteId(null);
      }

      // Escape closes overlays
      if (k === 'escape') {
        setTruthSiteId(null);
        setSecretUnlocked(false);
        setExplore(true);
      }
    };

    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = false;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [secretUnlocked]);

  // Game loop
  useEffect(() => {
    if (!explore || secretUnlocked) return;

    let raf = 0;
    const tick = () => {
      const k = keysRef.current;
      const speed = k['shift'] ? 6.2 : 4.0;

      const ax =
        (k['d'] || k['arrowright'] ? 1 : 0) + (k['a'] || k['arrowleft'] ? -1 : 0);
      const ay =
        (k['s'] || k['arrowdown'] ? 1 : 0) + (k['w'] || k['arrowup'] ? -1 : 0);

      velRef.current.x = velRef.current.x * 0.82 + ax * speed * 0.18;
      velRef.current.y = velRef.current.y * 0.82 + ay * speed * 0.18;

      setPos((p) => ({
        x: p.x + velRef.current.x,
        y: p.y + velRef.current.y,
      }));

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [explore, secretUnlocked]);

  // Collision: walk into POI to enter site
  useEffect(() => {
    if (!explore || currentSite || secretUnlocked) return;

    for (const s of pois) {
      const dx = pos.x - s.p.x;
      const dy = pos.y - s.p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 44) {
        setCurrentSite(s.id);
        break;
      }
    }
  }, [explore, pos.x, pos.y, pois, currentSite, setCurrentSite, secretUnlocked]);

  const cam = explore ? { x: -pos.x, y: -pos.y } : { x: 0, y: 0 };

  const hero = (selectedHero ?? 'zeus') as HeroType;

  const truthSite = useMemo(() => {
    if (!truthSiteId) return null;
    return ANCIENT_SITES.find((s) => s.id === truthSiteId) ?? null;
  }, [truthSiteId]);

  const onPoiClick = (e: React.MouseEvent, siteId: string) => {
    if (secretUnlocked) return;
    if (e.shiftKey) {
      // HERO TRUTH: SHIFT + click reveals hidden knowledge instead of travelling
      setTruthSiteId(siteId);
      return;
    }
    setTruthSiteId(null);
    setCurrentSite(siteId);
  };

  return (
    <div
      className={secretUnlocked ? 'they-knew-gold' : undefined}
      style={{
        width: '100vw',
        height: '100vh',
        background:
          globeMode === 'stylized'
            ? 'radial-gradient(circle at 30% 20%, rgba(120,240,200,0.20), transparent 55%), radial-gradient(circle at 70% 60%, rgba(90,160,255,0.18), transparent 55%), #05050d'
            : 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10), transparent 55%), #05050d',
        position: 'relative',
        overflow: 'hidden',
        color: 'white',
      }}
    >
      {/* top center toggle */}
      <div style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 55,
        pointerEvents: 'auto',
      }}>
        <button
          type="button"
          onClick={() => setExplore((v) => !v)}
          style={{
            padding: '10px 12px',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(10,10,24,0.55)',
            backdropFilter: 'blur(10px)',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 900,
          }}
          title="Toggle Explore Mode"
          disabled={secretUnlocked}
        >
          {explore ? 'Explore Mode: ON (WASD)' : 'Explore Mode: OFF'}
        </button>
      </div>

      {/* world */}
      <div className="world">
        <div
          className="world-grid"
          style={{
            transform: `translate3d(${cam.x}px, ${cam.y}px, 0)`,
          }}
        />

        {/* POIs */}
        {pois.map((s) => (
          <div
            key={s.id}
            className="poi"
            onClick={(e) => onPoiClick(e, s.id)}
            title={`Click: travel • SHIFT+Click: hidden truth\n${s.name} (${s.era})`}
            style={{
              left: `calc(50% + ${s.p.x + cam.x}px)`,
              top: `calc(50% + ${s.p.y + cam.y}px)`,
              background:
                s.id === currentSite
                  ? 'rgba(255,255,255,0.20)'
                  : 'rgba(255,255,255,0.10)',
            }}
          />
        ))}

        {/* player */}
      {/* player ring (truth pulse) */}
      {truthSite && !secretUnlocked && (
        <div
          className="player-ring"
          style={{
            left: `calc(50% + ${cam.x + pos.x}px)`,
            top: `calc(50% + ${cam.y + pos.y}px)`,
          }}
        />
      )}


        <div
          className="player"
          style={{
            left: `calc(50% + ${cam.x + pos.x}px)`,
            top: `calc(50% + ${cam.y + pos.y}px)`,
            background:
              globeMode === 'stylized'
                ? 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.9), rgba(90,160,255,0.75))'
                : 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.85), rgba(255,215,0,0.65))',
          }}
        />
      </div>

      {/* site overlay */}
      {active && (
        <div
          style={{
            position: 'fixed',
            top: 78,
            right: 18,
            width: 360,
            maxWidth: 'calc(100vw - 36px)',
            background: 'rgba(10,10,24,0.70)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 18,
            padding: 14,
            boxShadow: '0 18px 70px rgba(0,0,0,0.60)',
            zIndex: 55,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontWeight: 1000, letterSpacing: '0.5px' }}>{active.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem' }}>{active.era}</div>
          </div>

          <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.80)', lineHeight: 1.35 }}>
            {active.description}
          </div>

          <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.70)', fontSize: '0.92rem' }}>
            <strong style={{ color: 'white' }}>Mysteries:</strong> {active.mysteries.join(' • ')}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setCurrentSite(null)}
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.06)',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 900,
              }}
              title="Back to globe (choose another site)"
            >
              ← Back to Sites
            </button>
          </div>
        </div>
      )}

      {/* HERO TRUTH overlay */}
      {truthSite && !secretUnlocked && (
        <>
          <TruthOverlay hero={hero} siteName={truthSite.name} />
          <div className="truth-overlay-ui">
            <div style={{ fontWeight: 1000, letterSpacing: '0.4px' }}>
              Hidden Knowledge — <span style={{ color: 'white' }}>{truthSite.name}</span>
            </div>
            <div style={{ opacity: 0.8, fontWeight: 900, marginTop: 4 }}>
              {hero === 'zeus' && 'Zeus: Astronomical alignments detected.'}
              {hero === 'hercules' && 'Hercules: Load paths + stone logistics revealed.'}
              {hero === 'quetzalcoatl' && 'Quetzalcoatl: Calendar glyphs + time codes exposed.'}
            </div>
            <div style={{ opacity: 0.75, fontWeight: 800, marginTop: 6 }}>
              Press <strong>ESC</strong> to close.
            </div>
          </div>
        </>
      )}

      {/* THEY KNEW mode */}
      {secretUnlocked && (
        <div className={`they-knew ${theyKnewShake ? "they-knew-shake" : ""}`} role="dialog" aria-modal="true">
          <div className="lore-panel">
            <div className="lore-title">They Knew.</div>
            <div className="lore-quote">This is not mythology. This is memory.</div>

            <div className="redacted">
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>INTERNAL FIELD NOTES — DO NOT DISTRIBUTE</div>
              <div>
                Sequence coherence exceeds <span className="redact">██████</span>%. Sites exhibit shared orientation
                markers at non-random intervals. Correlations persist after controlling for <span className="redact">████</span>.
              </div>
              <div style={{ marginTop: 10 }}>
                Hypothesis: an “ancient network” of knowledge transfer—encoded as ritual geometry—may have functioned as
                a distributed memory system. Evidence remains <span className="redact">██████</span> and disputed.
              </div>
              <div style={{ marginTop: 10 }}>
                If confirmed, timeline requires revision by at least <span className="redact">████</span> years.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 14, justifyContent: 'space-between' }}>
              <div style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 900 }}>
                Hint: Konami code or type <strong>lithic</strong> while exploring.
              </div>
              <button
                type="button"
                onClick={() => {
                  setSecretUnlocked(false);
                  setExplore(true);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 1000,
                }}
                title="Close"
              >
                Close (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      <div className="hud">
        <div>Player: {Math.round(pos.x)}, {Math.round(pos.y)}</div>
        <div>Site: {currentSite ?? 'none'}</div>
        <div style={{ opacity: 0.7, fontWeight: 900 }}>
          Tip: SHIFT+Click a dot for hidden truth.
        </div>
      </div>
    </div>
  );
};

function TruthOverlay({ hero, siteName }: { hero: HeroType; siteName: string }) {
  // Pure “wow” visuals: no assets, just SVG layers.
  // Different per hero so it feels like character choice changes reality.
  const label = hero === 'zeus' ? 'CELESTIAL ALIGNMENT' : hero === 'hercules' ? 'STRUCTURAL VECTORS' : 'TIME GLYPHS';

  return (
    <svg className="truth-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
      {/* Base haze */}
      <defs>
        <radialGradient id="haze" cx="30%" cy="20%" r="80%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.0)" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#haze)" />

      {/* Title */}
      <text x="4" y="10" fontSize="3.2" fill="rgba(255,255,255,0.75)" fontWeight="900">
        {label} — {siteName.toUpperCase()}
      </text>

      {/* Zeus: star lattice + arcs */}
      {hero === 'zeus' && (
        <>
          {Array.from({ length: 28 }).map((_, i) => (
            <circle
              key={i}
              cx={(i * 17) % 100}
              cy={(i * 29) % 100}
              r="0.35"
              fill="rgba(255,255,255,0.75)"
            />
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <path
              key={i}
              d={`M ${10 + i * 8} ${18 + (i % 2) * 6} Q 50 ${8 + i * 3} ${92 - i * 6} ${26 + (i % 3) * 8}`}
              fill="none"
              stroke="rgba(120,200,255,0.45)"
              strokeWidth="0.35"
            />
          ))}
          <path
            d="M 12 80 Q 50 54 88 78"
            fill="none"
            stroke="rgba(255,215,0,0.38)"
            strokeWidth="0.55"
          />
          <path
            d="M 18 72 Q 50 46 82 70"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="0.35"
          />
        </>
      )}

      {/* Hercules: load vectors + ghost paths */}
      {hero === 'hercules' && (
        <>
          {Array.from({ length: 18 }).map((_, i) => (
            <line
              key={i}
              x1={(i * 11) % 100}
              y1={(i * 23) % 100}
              x2={((i * 11) % 100) + 12}
              y2={((i * 23) % 100) + 8}
              stroke="rgba(255,180,32,0.40)"
              strokeWidth="0.45"
            />
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <rect
              key={i}
              x={10 + i * 10}
              y={28 + (i % 2) * 10}
              width="8"
              height="6"
              fill="rgba(255,255,255,0.06)"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="0.35"
            />
          ))}
          <path
            d="M 8 86 C 22 70, 38 74, 52 62 S 82 48, 94 34"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="0.55"
            strokeDasharray="1.2 1.2"
          />
        </>
      )}

      {/* Quetzalcoatl: glyph grid + rings */}
      {hero === 'quetzalcoatl' && (
        <>
          {Array.from({ length: 12 }).map((_, i) => (
            <circle
              key={i}
              cx={10 + i * 7}
              cy={22 + (i % 3) * 8}
              r="1.1"
              fill="none"
              stroke="rgba(32,227,162,0.45)"
              strokeWidth="0.35"
            />
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <path
              key={i}
              d={`M ${8 + i * 9} ${72} q 4 -6 8 0 t 8 0`}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="0.4"
            />
          ))}
          <circle cx="72" cy="44" r="12" fill="none" stroke="rgba(32,227,162,0.40)" strokeWidth="0.55" />
          <circle cx="72" cy="44" r="6" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.35" />
        </>
      )}
    </svg>
  );
}
