'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick: () => void;
}

// ─── Sites ────────────────────────────────────────────────────────────────────
// lon/lat in degrees, camDist = camera distance from globe center (globe radius = 1)
// camLat/camLon = where the camera positions itself (offset from site for oblique drama)
const SITES = [
  {
    name: 'Pyramids of Giza',
    region: 'Egypt',
    year: 'c. 2560 BCE',
    lon: 31.134,  lat: 29.979,
    camDist: 1.28, camOffsetLat: 4, camOffsetLon: -3,
  },
  {
    name: 'Machu Picchu',
    region: 'Peru',
    year: 'c. 1450 CE',
    lon: -72.545, lat: -13.163,
    camDist: 1.22, camOffsetLat: 3, camOffsetLon: 2,
  },
  {
    name: 'Angkor Wat',
    region: 'Cambodia',
    year: 'c. 1113 CE',
    lon: 103.867, lat: 13.412,
    camDist: 1.20, camOffsetLat: 3, camOffsetLon: -2,
  },
  {
    name: 'Petra',
    region: 'Jordan',
    year: 'c. 300 BCE',
    lon: 35.444,  lat: 30.328,
    camDist: 1.24, camOffsetLat: 4, camOffsetLon: 3,
  },
  {
    name: 'Stonehenge',
    region: 'England',
    year: 'c. 3000 BCE',
    lon: -1.826,  lat: 51.179,
    camDist: 1.18, camOffsetLat: 3, camOffsetLon: -2,
  },
  {
    name: 'Göbekli Tepe',
    region: 'Turkey',
    year: 'c. 9600 BCE',
    lon: 38.922,  lat: 37.223,
    camDist: 1.20, camOffsetLat: 3, camOffsetLon: 2,
  },
  {
    name: 'Chichen Itza',
    region: 'Mexico',
    year: 'c. 600 CE',
    lon: -88.568, lat: 20.684,
    camDist: 1.22, camOffsetLat: 3, camOffsetLon: -3,
  },
  {
    name: 'Nazca Lines',
    region: 'Peru',
    year: 'c. 200 BCE',
    lon: -74.928, lat: -14.739,
    camDist: 1.30, camOffsetLat: 6, camOffsetLon: 0,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function latLonToVec3(lat: number, lon: number, r = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function slerp(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const angle = a.angleTo(b);
  if (angle < 0.0001) return a.clone().lerp(b, t);
  const sinAngle = Math.sin(angle);
  const wa = Math.sin((1 - t) * angle) / sinAngle;
  const wb = Math.sin(t * angle) / sinAngle;
  return a.clone().multiplyScalar(wa).addScaledVector(b, wb);
}

// ─── Component ────────────────────────────────────────────────────────────────
export function Hero({ onSignInClick }: HeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<any>({});

  const [phase, setPhase] = useState<'loading' | 'reveal' | 'live'>('loading');
  const [siteIdx, setSiteIdx] = useState(0);
  const [labelVisible, setLabelVisible] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  const site = SITES[siteIdx];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // ── Camera ────────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      42,
      mount.clientWidth / mount.clientHeight,
      0.01,
      100,
    );
    camera.position.set(0, 0, 2.8);

    // ── Stars ─────────────────────────────────────────────────────────────────
    const starGeo = new THREE.BufferGeometry();
    const starCount = 6000;
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 40 + Math.random() * 20;
      starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      starSizes[i] = Math.random() * 1.2 + 0.3;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.7,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    // ── Globe geometry ────────────────────────────────────────────────────────
    const globeGeo = new THREE.SphereGeometry(1, 128, 128);

    // ── Texture loading ───────────────────────────────────────────────────────
    // NASA Blue Marble — high res, no auth required, hosted on NASA servers
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const total = 3;
    const onLoad = () => {
      loaded++;
      setLoadProgress(Math.round((loaded / total) * 100));
    };

    // Day texture — NASA Blue Marble Next Generation
    const dayTex = loader.load(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
      onLoad,
    );
    dayTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Night lights texture
    const nightTex = loader.load(
      'https://unpkg.com/three-globe/example/img/earth-night.jpg',
      onLoad,
    );
    nightTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Bump/terrain
    const bumpTex = loader.load(
      'https://unpkg.com/three-globe/example/img/earth-topology.png',
      onLoad,
    );

    // ── Globe shader material ──────────────────────────────────────────────────
    // Custom shader: blends day/night based on sun angle, adds specular ocean sheen
    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture:   { value: dayTex },
        nightTexture: { value: nightTex },
        bumpTexture:  { value: bumpTex },
        sunDirection: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
        bumpScale:    { value: 0.06 },
        atmosphereColor: { value: new THREE.Color(0x4488ff) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        uniform sampler2D bumpTexture;
        uniform float bumpScale;

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 day   = texture2D(dayTexture,   vUv).rgb;
          vec3 night = texture2D(nightTexture, vUv).rgb;

          // Sun influence
          float sunDot = dot(vNormal, normalize(sunDirection));
          float dayMix = smoothstep(-0.25, 0.35, sunDot);

          // Blend day/night
          vec3 color = mix(night * 1.4, day, dayMix);

          // Specular highlight on ocean-facing surfaces (simple approximation)
          vec3 viewDir = normalize(cameraPosition - vPosition);
          vec3 halfVec = normalize(normalize(sunDirection) + viewDir);
          float spec = pow(max(dot(vNormal, halfVec), 0.0), 60.0) * 0.15 * dayMix;
          color += vec3(spec);

          // Subtle limb darkening
          float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
          color *= 1.0 - fresnel * 0.18;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // ── Atmosphere glow ───────────────────────────────────────────────────────
    const atmGeo = new THREE.SphereGeometry(1.025, 64, 64);
    const atmMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x3366cc) },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz);
          float intensity = pow(1.0 - abs(dot(vNormal, viewDir)), 3.5);
          gl_FragColor = vec4(glowColor * intensity * 0.6, intensity * 0.5);
        }
      `,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));

    // ── Site markers ──────────────────────────────────────────────────────────
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    const markerMeshes: THREE.Mesh[] = [];
    SITES.forEach((s, i) => {
      const pos = latLonToVec3(s.lat, s.lon, 1.008);
      const geo = new THREE.SphereGeometry(0.004, 8, 8);
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xD4AF37 : 0xffffff,
        transparent: true,
        opacity: i === 0 ? 1.0 : 0.35,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      markerGroup.add(mesh);
      markerMeshes.push(mesh);

      // Pulse ring for active marker
      if (i === 0) {
        const ringGeo = new THREE.RingGeometry(0.007, 0.010, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xD4AF37,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.lookAt(pos.clone().multiplyScalar(2));
        ring.name = 'activeRing';
        markerGroup.add(ring);
      }
    });

    // ── Lighting ──────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(ambient);
    const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.2);
    sunLight.position.set(5, 2, 3);
    scene.add(sunLight);

    // ── Animation state ───────────────────────────────────────────────────────
    stateRef.current = {
      renderer, scene, camera, globe, markerMeshes, markerGroup,
      globeMat,
      // Camera animation
      camPos: new THREE.Vector3(0, 0, 2.8),
      camTarget: new THREE.Vector3(0, 0, 0),
      camPosFrom: new THREE.Vector3(0, 0, 2.8),
      camPosTo: new THREE.Vector3(0, 0, 2.8),
      camTarFrom: new THREE.Vector3(0, 0, 0),
      camTarTo: new THREE.Vector3(0, 0, 0),
      // Globe rotation animation
      globeRotFrom: new THREE.Euler(),
      globeRotTo: new THREE.Euler(),
      animT: 1.0,
      animDuration: 3500,
      animStart: 0,
      currentSiteIdx: 0,
      dwellTimer: null as any,
      isDestroyed: false,
      phase: 'loading' as string,
      ringPulse: 0,
    };

    // ── Resize handler ────────────────────────────────────────────────────────
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ── Compute camera position for a site ────────────────────────────────────
    const getCamForSite = (s: typeof SITES[0]) => {
      const targetPos = latLonToVec3(s.lat, s.lon, 1.0);
      const camPos = latLonToVec3(
        s.lat + s.camOffsetLat,
        s.lon + s.camOffsetLon,
        s.camDist,
      );
      return { targetPos, camPos };
    };

    // ── Transition to site ────────────────────────────────────────────────────
    const goToSite = (idx: number, instant = false) => {
      const st = stateRef.current;
      if (st.isDestroyed) return;

      const s = SITES[idx];
      const { targetPos, camPos } = getCamForSite(s);

      st.camPosFrom = st.camPos.clone();
      st.camTarFrom = st.camTarget.clone();
      st.camPosTo = camPos;
      st.camTarTo = targetPos;
      st.animStart = performance.now();
      st.animDuration = instant ? 0 : 3800;
      st.animT = instant ? 1 : 0;
      st.currentSiteIdx = idx;

      // Update markers
      st.markerMeshes.forEach((m: THREE.Mesh, i: number) => {
        (m.material as THREE.MeshBasicMaterial).color.set(i === idx ? 0xD4AF37 : 0xffffff);
        (m.material as THREE.MeshBasicMaterial).opacity = i === idx ? 1.0 : 0.3;
      });

      // Move active ring
      const ring = st.markerGroup.getObjectByName('activeRing') as THREE.Mesh;
      if (ring) {
        const pos = latLonToVec3(s.lat, s.lon, 1.008);
        ring.position.copy(pos);
        ring.lookAt(pos.clone().multiplyScalar(2));
      }

      setSiteIdx(idx);
      setLabelVisible(false);

      if (st.dwellTimer) clearTimeout(st.dwellTimer);
      st.dwellTimer = setTimeout(() => {
        setLabelVisible(true);
        st.dwellTimer = setTimeout(() => {
          if (!st.isDestroyed) {
            const next = (idx + 1) % SITES.length;
            goToSite(next);
          }
        }, 12000);
      }, instant ? 800 : 4200);
    };

    // ── Render loop ───────────────────────────────────────────────────────────
    let rafId: number;
    const animate = (now: number) => {
      if (stateRef.current.isDestroyed) return;
      rafId = requestAnimationFrame(animate);

      const st = stateRef.current;

      // Camera animation
      if (st.animT < 1.0) {
        const elapsed = now - st.animStart;
        const raw = Math.min(elapsed / st.animDuration, 1.0);
        st.animT = easeInOutCubic(raw);

        // Slerp camera position (arc over globe)
        const fromN = st.camPosFrom.clone().normalize();
        const toN   = st.camTarTo.clone().normalize();  // slight arc toward target
        const fromDist = st.camPosFrom.length();
        const toDist   = st.camPosTo.length();
        const dist = fromDist + (toDist - fromDist) * st.animT;

        // Arc slightly high mid-flight
        const arcMid = slerp(fromN, st.camPosTo.clone().normalize(), 0.5)
          .multiplyScalar(Math.max(fromDist, toDist) * 1.12);
        const p1 = slerp(fromN.multiplyScalar(fromDist), arcMid, st.animT);
        const p2 = slerp(arcMid, st.camPosTo, st.animT);
        st.camPos = p1.lerp(p2, st.animT);

        st.camTarget = new THREE.Vector3().lerpVectors(
          st.camTarFrom, st.camTarTo, st.animT,
        );
      }

      camera.position.copy(st.camPos);
      camera.lookAt(st.camTarget);

      // Pulse ring
      st.ringPulse = (st.ringPulse + 0.025) % (Math.PI * 2);
      const ring = st.markerGroup.getObjectByName('activeRing') as THREE.Mesh;
      if (ring) {
        const pulse = 0.5 + 0.5 * Math.sin(st.ringPulse);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.3 + pulse * 0.5;
        const scale = 1.0 + pulse * 0.3;
        ring.scale.setScalar(scale);
      }

      // Very slow ambient globe rotation when dwelling
      if (st.animT >= 1.0) {
        globe.rotation.y += 0.00015;
        markerGroup.rotation.y += 0.00015;
      }

      // Subtle sun movement
      const sunAngle = now * 0.00003;
      (globeMat.uniforms.sunDirection.value as THREE.Vector3).set(
        Math.cos(sunAngle), 0.25, Math.sin(sunAngle),
      ).normalize();

      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(animate);

    // ── Boot sequence ─────────────────────────────────────────────────────────
    // Wait for textures then reveal
    const bootTimer = setTimeout(() => {
      setPhase('reveal');
      stateRef.current.phase = 'reveal';
      const { camPos: cp } = getCamForSite(SITES[0]);
      stateRef.current.camPos = cp.clone();
      stateRef.current.camTarget = latLonToVec3(SITES[0].lat, SITES[0].lon, 1.0);
      camera.position.copy(cp);
      camera.lookAt(stateRef.current.camTarget);

      setTimeout(() => {
        setPhase('live');
        stateRef.current.phase = 'live';
        goToSite(0, true);
      }, 1200);
    }, 1800);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      stateRef.current.isDestroyed = true;
      clearTimeout(bootTimer);
      if (stateRef.current.dwellTimer) clearTimeout(stateRef.current.dwellTimer);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">

      {/* Three.js mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Loading screen */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-1000"
        style={{ opacity: phase === 'loading' ? 1 : 0, pointerEvents: phase === 'loading' ? 'auto' : 'none' }}
      >
        <div className="flex flex-col items-center gap-6">
          {/* Logo mark */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" stroke="#D4AF37" strokeWidth="0.75" strokeOpacity="0.4"/>
            <circle cx="14" cy="14" r="8" stroke="#D4AF37" strokeWidth="0.75" strokeOpacity="0.6"/>
            <circle cx="14" cy="14" r="1.5" fill="#D4AF37" fillOpacity="0.8"/>
            <line x1="14" y1="1" x2="14" y2="27" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.3"/>
            <line x1="1" y1="14" x2="27" y2="14" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.3"/>
          </svg>

          {/* Progress bar */}
          <div className="w-32 h-px bg-white/10 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#D4AF37]/60 transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>

          <p className="text-[9px] text-[#D4AF37]/40 tracking-[0.6em] uppercase font-light">
            Preparing the archive
          </p>
        </div>
      </div>

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)',
          transition: 'opacity 1.5s ease',
          opacity: phase === 'loading' ? 0 : 1,
        }}
      />

      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{
          height: '220px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
        }}
      />

      {/* Top gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
      />

      {/* ── Site information panel ── */}
      <div
        className="absolute bottom-24 left-10 z-20 pointer-events-none"
        style={{
          transition: 'opacity 1.2s ease, transform 1.2s ease',
          opacity: labelVisible ? 1 : 0,
          transform: labelVisible ? 'translateY(0)' : 'translateY(10px)',
        }}
      >
        {/* Thin gold rule */}
        <div
          className="mb-3"
          style={{
            width: labelVisible ? '40px' : '0px',
            height: '1px',
            background: 'linear-gradient(to right, #D4AF37, transparent)',
            transition: 'width 1.5s ease 0.3s',
          }}
        />
        <p className="text-[8px] text-[#D4AF37]/55 tracking-[0.55em] uppercase font-light mb-1.5">
          Now Viewing
        </p>
        <p
          className="text-white/90 font-light tracking-[0.06em] mb-1"
          style={{ fontSize: '1.05rem', fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic' }}
        >
          {site.name}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-[9px] text-white/30 tracking-[0.3em] uppercase font-light">
            {site.region}
          </p>
          <div className="w-px h-2.5 bg-white/15" />
          <p className="text-[9px] text-white/25 tracking-[0.2em] font-light">
            {site.year}
          </p>
        </div>
      </div>

      {/* ── Progress indicators ── */}
      <div
        className="absolute bottom-[98px] right-10 z-20 pointer-events-none flex flex-col gap-1.5 items-end"
        style={{ opacity: phase === 'live' ? 1 : 0, transition: 'opacity 1s ease' }}
      >
        {SITES.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2">
            {i === siteIdx && (
              <p className="text-[7px] text-[#D4AF37]/50 tracking-[0.3em] uppercase font-light">
                {String(i + 1).padStart(2, '0')}
              </p>
            )}
            <div
              style={{
                width: i === siteIdx ? '24px' : '6px',
                height: '1.5px',
                background: i === siteIdx ? '#D4AF37' : 'rgba(255,255,255,0.18)',
                borderRadius: '1px',
                transition: 'all 0.6s ease',
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Scroll hint ── */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none"
        style={{
          opacity: labelVisible ? 1 : 0,
          transition: 'opacity 2s ease 2s',
        }}
      >
        <p className="text-[8px] text-white/20 tracking-[0.4em] uppercase font-light">
          Scroll to explore
        </p>
        <div
          className="w-px h-8"
          style={{ background: 'linear-gradient(to bottom, rgba(212,175,55,0.3), transparent)' }}
        />
      </div>

      {/* ── Manifesto line — center top ── */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none text-center"
        style={{
          opacity: phase === 'loading' ? 0 : labelVisible ? 0 : 0.65,
          transition: 'opacity 2s ease',
        }}
      >
        <p
          className="text-white/50 font-light tracking-[0.04em]"
          style={{ fontSize: '0.95rem', fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic' }}
        >
          Map what is buried before it is lost forever.
        </p>
      </div>

    </div>
  );
}
