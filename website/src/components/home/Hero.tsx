'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SITES — camDist is distance from globe center (radius = 1.0)
// 1.02 = basically skimming the surface, 1.05 = very close, 1.15 = regional view
// tiltLat/tiltLon = oblique offset so we look ACROSS the landscape, not straight down
// ─────────────────────────────────────────────────────────────────────────────
const SITES = [
  {
    name: 'Pyramids of Giza',   region: 'Egypt',       year: 'c. 2560 BCE',
    lat: 29.979,  lon: 31.134,  camDist: 1.06, tiltLat: 3.5,  tiltLon: -2.5,
  },
  {
    name: 'Grand Canyon',       region: 'Arizona, USA', year: '5–6 Million Years',
    lat: 36.107,  lon: -112.113, camDist: 1.07, tiltLat: 4,    tiltLon: 2,
  },
  {
    name: 'Machu Picchu',       region: 'Peru',        year: 'c. 1450 CE',
    lat: -13.163, lon: -72.545, camDist: 1.05, tiltLat: 3,    tiltLon: 2.5,
  },
  {
    name: 'Angkor Wat',         region: 'Cambodia',    year: 'c. 1113 CE',
    lat: 13.412,  lon: 103.867, camDist: 1.05, tiltLat: 2.5,  tiltLon: -2,
  },
  {
    name: 'Göbekli Tepe',       region: 'Turkey',      year: 'c. 9600 BCE',
    lat: 37.223,  lon: 38.922,  camDist: 1.05, tiltLat: 3,    tiltLon: 2,
  },
  {
    name: 'Petra',              region: 'Jordan',      year: 'c. 300 BCE',
    lat: 30.328,  lon: 35.444,  camDist: 1.055, tiltLat: 3.5, tiltLon: 2.5,
  },
  {
    name: 'Stonehenge',         region: 'England',     year: 'c. 3000 BCE',
    lat: 51.179,  lon: -1.826,  camDist: 1.04, tiltLat: 2.5,  tiltLon: -2,
  },
  {
    name: 'Easter Island',      region: 'Chile',       year: 'c. 1250 CE',
    lat: -27.112, lon: -109.349, camDist: 1.06, tiltLat: 3,   tiltLon: -2,
  },
  {
    name: 'Chichen Itza',       region: 'Mexico',      year: 'c. 600 CE',
    lat: 20.684,  lon: -88.568, camDist: 1.05, tiltLat: 3,    tiltLon: -2.5,
  },
  {
    name: 'Great Barrier Reef', region: 'Australia',   year: '500,000 Years',
    lat: -18.286, lon: 147.700, camDist: 1.09, tiltLat: 4,    tiltLon: 2,
  },
  {
    name: 'Nazca Lines',        region: 'Peru',        year: 'c. 200 BCE',
    lat: -14.739, lon: -74.928, camDist: 1.08, tiltLat: 5,    tiltLon: 0,
  },
  {
    name: 'Mount Everest',      region: 'Nepal/Tibet', year: '50–60 Million Years',
    lat: 27.988,  lon: 86.925,  camDist: 1.06, tiltLat: 4,    tiltLon: 2,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function latLonToVec3(lat: number, lon: number, r = 1.0): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Smooth arc between two positions on a sphere
function sphereArc(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number,
  arcHeight = 1.0,
): THREE.Vector3 {
  const fromN = from.clone().normalize();
  const toN   = to.clone().normalize();
  const angle = fromN.angleTo(toN);
  if (angle < 0.0001) return from.clone().lerp(to, t);
  const sinAngle = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / sinAngle;
  const wb = Math.sin(t * angle) / sinAngle;
  const slerpd = fromN.clone().multiplyScalar(wa).addScaledVector(toN, wb);
  // Arc: lift at midpoint
  const fromDist = from.length();
  const toDist   = to.length();
  const baseDist = fromDist + (toDist - fromDist) * t;
  const arc = Math.sin(t * Math.PI) * arcHeight * 0.18;
  return slerpd.normalize().multiplyScalar(baseDist + arc);
}

// ─────────────────────────────────────────────────────────────────────────────
export function Hero({ onSignInClick }: HeroProps) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const stateRef   = useRef<any>({});

  const [phase,        setPhase]        = useState<'loading'|'live'>('loading');
  const [siteIdx,      setSiteIdx]      = useState(0);
  const [labelVisible, setLabelVisible] = useState(false);
  const [progress,     setProgress]     = useState(0);

  const site = SITES[siteIdx];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const W = mount.clientWidth, H = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    // ── Scene / Camera ────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.001, 200);

    // ── Stars ─────────────────────────────────────────────────────────────────
    (() => {
      const N = 8000;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const r  = 50 + Math.random() * 30;
        pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
        pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
        pos[i*3+2] = r * Math.cos(ph);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffffff, size: 0.07, sizeAttenuation: true,
        transparent: true, opacity: 0.65,
      })));
    })();

    // ── Globe ─────────────────────────────────────────────────────────────────
    const GLOBE_R = 1.0;
    const globeGeo = new THREE.SphereGeometry(GLOBE_R, 128, 128);

    const loader   = new THREE.TextureLoader();
    let   loaded   = 0;
    const onLoad   = () => { loaded++; setProgress(Math.round(loaded / 3 * 100)); };

    const dayTex   = loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg', onLoad);
    dayTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const nightTex = loader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg', onLoad);
    nightTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const bumpTex  = loader.load('https://unpkg.com/three-globe/example/img/earth-topology.png', onLoad);
    bumpTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex:   { value: dayTex   },
        nightTex: { value: nightTex },
        bumpTex:  { value: bumpTex  },
        sunDir:   { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vUv       = uv;
          vNormal   = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTex;
        uniform sampler2D nightTex;
        uniform sampler2D bumpTex;
        uniform vec3      sunDir;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 day   = texture2D(dayTex,   vUv).rgb;
          vec3 night = texture2D(nightTex, vUv).rgb * 1.6;
          float sun  = dot(normalize(vNormal), normalize(sunDir));
          float mix_ = smoothstep(-0.15, 0.4, sun);
          vec3 col   = mix(night, day, mix_);

          // specular shimmer on lit side
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfV   = normalize(normalize(sunDir) + viewDir);
          float spec   = pow(max(dot(vNormal, halfV), 0.0), 80.0) * 0.12 * mix_;
          col += spec;

          // limb darkening
          float rim = 1.0 - max(dot(normalize(vNormal), viewDir), 0.0);
          col *= 1.0 - rim * 0.2;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // ── Atmosphere ────────────────────────────────────────────────────────────
    const atmMat = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0x2255bb) } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          vec3 vd = normalize(cameraPosition - (modelMatrix * vec4(0,0,0,1)).xyz);
          float i = pow(1.0 - abs(dot(vNormal, vd)), 4.0);
          gl_FragColor = vec4(glowColor * i * 0.55, i * 0.45);
        }
      `,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.022, 64, 64), atmMat));

    // ── Markers ───────────────────────────────────────────────────────────────
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    const markerDots: THREE.Mesh[] = [];

    SITES.forEach((s, i) => {
      const p = latLonToVec3(s.lat, s.lon, 1.005);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.003, 8, 8),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xD4AF37 : 0xffffff,
          transparent: true,
          opacity: i === 0 ? 1 : 0.3,
        }),
      );
      dot.position.copy(p);
      markerGroup.add(dot);
      markerDots.push(dot);
    });

    // Single active ring (moved to active site)
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.006, 0.009, 32),
      new THREE.MeshBasicMaterial({
        color: 0xD4AF37, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    ringMesh.position.copy(latLonToVec3(SITES[0].lat, SITES[0].lon, 1.006));
    ringMesh.lookAt(latLonToVec3(SITES[0].lat, SITES[0].lon, 2));
    markerGroup.add(ringMesh);

    // ── Light ─────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.04));
    const sun = new THREE.DirectionalLight(0xfff8e0, 2.4);
    sun.position.set(5, 2, 3);
    scene.add(sun);

    // ── State ─────────────────────────────────────────────────────────────────
    const S = {
      renderer, scene, camera, globe, globeMat, sun,
      markerDots, markerGroup, ringMesh,
      // camera anim
      camFrom:   new THREE.Vector3(0, 0, 3.5),
      camTo:     new THREE.Vector3(0, 0, 3.5),
      tarFrom:   new THREE.Vector3(0, 0, 0),
      tarTo:     new THREE.Vector3(0, 0, 0),
      camCur:    new THREE.Vector3(0, 0, 3.5),
      tarCur:    new THREE.Vector3(0, 0, 0),
      animStart: 0,
      animDur:   4200,
      animT:     1.0,
      ringPulse: 0,
      dwellTimer: null as any,
      isDestroyed: false,
      currentIdx: 0,
    };
    stateRef.current = S;

    // ── Site transition ───────────────────────────────────────────────────────
    const goTo = (idx: number, instant = false) => {
      if (S.isDestroyed) return;
      const site = SITES[idx];

      // Camera sits off the surface looking obliquely across the site
      const camPos = latLonToVec3(
        site.lat + site.tiltLat,
        site.lon + site.tiltLon,
        site.camDist,
      );
      const tarPos = latLonToVec3(site.lat, site.lon, GLOBE_R);

      S.camFrom   = S.camCur.clone();
      S.tarFrom   = S.tarCur.clone();
      S.camTo     = camPos;
      S.tarTo     = tarPos;
      S.animStart = performance.now();
      S.animDur   = instant ? 400 : 4200;
      S.animT     = 0;
      S.currentIdx = idx;

      // Update markers
      S.markerDots.forEach((d: THREE.Mesh, i: number) => {
        const mat = d.material as THREE.MeshBasicMaterial;
        mat.color.set(i === idx ? 0xD4AF37 : 0xffffff);
        mat.opacity = i === idx ? 1.0 : 0.25;
      });
      S.ringMesh.position.copy(latLonToVec3(site.lat, site.lon, 1.006));
      S.ringMesh.lookAt(latLonToVec3(site.lat, site.lon, 2));

      setSiteIdx(idx);
      setLabelVisible(false);

      if (S.dwellTimer) clearTimeout(S.dwellTimer);

      // Show label after camera arrives (~4s), dwell 11s, then advance
      S.dwellTimer = setTimeout(() => {
        if (!S.isDestroyed) setLabelVisible(true);
        S.dwellTimer = setTimeout(() => {
          if (!S.isDestroyed) goTo((idx + 1) % SITES.length);
        }, 11000);
      }, instant ? 600 : 4500);
    };

    // ── Render loop ───────────────────────────────────────────────────────────
    let raf: number;
    const tick = (now: number) => {
      if (S.isDestroyed) return;
      raf = requestAnimationFrame(tick);

      // Camera animation
      if (S.animT < 1.0) {
        const raw = Math.min((now - S.animStart) / S.animDur, 1.0);
        S.animT = raw >= 1.0 ? 1.0 : easeInOutQuart(raw);
        S.camCur = sphereArc(S.camFrom, S.camTo, S.animT, 1.0);
        S.tarCur.lerpVectors(S.tarFrom, S.tarTo, easeOutCubic(raw));
      }

      camera.position.copy(S.camCur);
      camera.lookAt(S.tarCur);

      // Ring pulse
      S.ringPulse += 0.022;
      const p = 0.5 + 0.5 * Math.sin(S.ringPulse);
      (S.ringMesh.material as THREE.MeshBasicMaterial).opacity = 0.25 + p * 0.6;
      S.ringMesh.scale.setScalar(1 + p * 0.35);

      // Very slow passive rotation when idle
      if (S.animT >= 1.0) {
        globe.rotation.y        += 0.00012;
        markerGroup.rotation.y  += 0.00012;
      }

      // Sun drift
      const sa = now * 0.000025;
      (S.globeMat.uniforms.sunDir.value as THREE.Vector3)
        .set(Math.cos(sa), 0.22, Math.sin(sa)).normalize();
      S.sun.position.set(Math.cos(sa) * 5, 2, Math.sin(sa) * 5);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    // ── Boot ──────────────────────────────────────────────────────────────────
    // Position camera at a nice wide overview first, then dive in
    const first = SITES[0];
    const overviewCam = latLonToVec3(first.lat + 18, first.lon - 15, 2.2);
    S.camCur.copy(overviewCam);
    S.tarCur.copy(latLonToVec3(first.lat, first.lon, 1.0));
    camera.position.copy(overviewCam);
    camera.lookAt(S.tarCur);

    const boot = setTimeout(() => {
      setPhase('live');
      // Brief wide shot, then dive to first site
      setTimeout(() => goTo(0), 1000);
    }, 1600);

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      S.isDestroyed = true;
      clearTimeout(boot);
      if (S.dwellTimer) clearTimeout(S.dwellTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">

      {/* WebGL canvas */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Loading overlay */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
        style={{
          opacity:        phase === 'loading' ? 1 : 0,
          pointerEvents:  phase === 'loading' ? 'auto' : 'none',
          transition:     'opacity 1.4s ease',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-6">
          <circle cx="16" cy="16" r="15" stroke="#D4AF37" strokeWidth="0.6" strokeOpacity="0.35"/>
          <circle cx="16" cy="16" r="9"  stroke="#D4AF37" strokeWidth="0.6" strokeOpacity="0.55"/>
          <circle cx="16" cy="16" r="1.8" fill="#D4AF37" fillOpacity="0.9"/>
          <line x1="16" y1="1"  x2="16" y2="31" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.25"/>
          <line x1="1"  y1="16" x2="31" y2="16" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.25"/>
        </svg>
        <div className="w-28 h-px bg-white/8 mb-5 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#D4AF37]/50 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[9px] text-[#D4AF37]/35 tracking-[0.65em] uppercase font-light">
          Preparing the archive
        </p>
      </div>

      {/* Radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 38%, rgba(0,0,0,0.6) 100%)',
          opacity: phase === 'live' ? 1 : 0,
          transition: 'opacity 2s ease',
        }}
      />

      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
        style={{ height: 200, background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)' }}
      />

      {/* Top gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-20 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
      />

      {/* ── Site label — bottom left ── */}
      <div
        className="absolute bottom-24 left-10 z-20 pointer-events-none"
        style={{
          transition: 'opacity 1.4s ease, transform 1.4s ease',
          opacity:    labelVisible ? 1 : 0,
          transform:  labelVisible ? 'translateY(0)' : 'translateY(12px)',
        }}
      >
        {/* Gold rule */}
        <div style={{
          width: labelVisible ? '36px' : '0px', height: '1px',
          background: 'linear-gradient(to right, #D4AF37, transparent)',
          transition: 'width 1.8s ease 0.4s',
          marginBottom: '10px',
        }} />
        <p className="text-[8px] text-[#D4AF37]/50 tracking-[0.55em] uppercase font-light mb-2">
          Now Viewing
        </p>
        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontStyle: 'italic', fontWeight: 300,
          fontSize: '1.45rem', letterSpacing: '0.04em',
          color: 'rgba(255,255,255,0.92)',
          lineHeight: 1.2,
        }}>
          {site.name}
        </p>
        <div className="flex items-center gap-2.5 mt-1.5">
          <p className="text-[9px] text-white/28 tracking-[0.35em] uppercase font-light">
            {site.region}
          </p>
          <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.12)' }} />
          <p className="text-[9px] text-white/22 tracking-[0.2em] font-light">
            {site.year}
          </p>
        </div>
      </div>

      {/* ── Progress — bottom right ── */}
      <div
        className="absolute bottom-[98px] right-10 z-20 pointer-events-none"
        style={{ opacity: phase === 'live' ? 1 : 0, transition: 'opacity 1s ease' }}
      >
        <div className="flex flex-col gap-[5px] items-end">
          {SITES.map((s, i) => (
            <div key={s.name} className="flex items-center gap-2">
              {i === siteIdx && (
                <span className="text-[7px] text-[#D4AF37]/45 tracking-widest font-light">
                  {String(i + 1).padStart(2, '0')}
                </span>
              )}
              <div style={{
                width:      i === siteIdx ? '22px' : '5px',
                height:     '1.5px',
                background: i === siteIdx ? '#D4AF37' : 'rgba(255,255,255,0.16)',
                borderRadius: '1px',
                transition: 'all 0.7s ease',
              }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Manifesto — appears between sites ── */}
      <div
        className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        style={{
          opacity: phase === 'live' && !labelVisible ? 0.55 : 0,
          transition: 'opacity 2s ease',
        }}
      >
        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontStyle: 'italic', fontWeight: 300,
          fontSize: '1.05rem', letterSpacing: '0.05em',
          color: 'rgba(255,255,255,0.6)',
          textAlign: 'center',
          maxWidth: '380px',
          lineHeight: 1.7,
        }}>
          Map what is buried<br />before it is lost forever.
        </p>
      </div>

      {/* ── Scroll hint ── */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2"
        style={{ opacity: labelVisible ? 0.7 : 0, transition: 'opacity 2s ease 1s' }}
      >
        <p className="text-[8px] text-white/18 tracking-[0.45em] uppercase font-light">
          Scroll to explore
        </p>
        <div style={{
          width: 1, height: 28,
          background: 'linear-gradient(to bottom, rgba(212,175,55,0.35), transparent)',
        }} />
      </div>

    </div>
  );
}
