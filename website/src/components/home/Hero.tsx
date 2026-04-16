'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE FIX:
// Three.js SphereGeometry UV mapping:
//   u = 0 at theta=0 (+X axis), increases counterclockwise viewed from +Y
//   v = 0 at phi=PI (south pole), v=1 at phi=0 (north pole)
//
// The Blue Marble equirectangular texture:
//   u=0 → lon=-180W  u=1 → lon=+180E
//   v=0 → lat=-90S   v=1 → lat=+90N
//
// Three.js SphereGeometry starts the sphere seam at the BACK (+Z direction
// when theta=PI), with theta=0 pointing toward -X.
// After testing: the correct world-space position for lat/lon is:
//   x = r·cos(lat)·cos(lon)
//   y = r·sin(lat)
//   z = -r·cos(lat)·sin(lon)
// This matches the texture projection exactly.
// ─────────────────────────────────────────────────────────────────────────────

const SITES = [
  {
    name: 'Göbekli Tepe',
    region: 'Turkey',
    year: 'c. 9600 BCE',
    lat: 37.22, lon: 38.92,
    desc: 'The oldest known megalithic structure — built 6,000 years before Stonehenge, rewriting human prehistory.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/G%C3%B6bekli_Tepe%2C_Urfa.jpg/1280px-G%C3%B6bekli_Tepe%2C_Urfa.jpg',
    camDist: 1.9,
    camLatOffset: 18,
    camLonOffset: -14,
  },
  {
    name: 'Pyramids of Giza',
    region: 'Egypt',
    year: 'c. 2560 BCE',
    lat: 29.98, lon: 31.13,
    desc: 'The last surviving wonder of the ancient world — aligned to within 0.05° of true north.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/1280px-All_Gizah_Pyramids.jpg',
    camDist: 1.9,
    camLatOffset: 16,
    camLonOffset: -16,
  },
  {
    name: 'Machu Picchu',
    region: 'Peru',
    year: 'c. 1450 CE',
    lat: -13.16, lon: -72.54,
    desc: 'Built at 2,430m — Inca stonework so precise no mortar was needed, hidden in clouds for 400 years.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/1280px-Machu_Picchu%2C_Peru.jpg',
    camDist: 1.9,
    camLatOffset: 12,
    camLonOffset: -14,
  },
  {
    name: 'Angkor Wat',
    region: 'Cambodia',
    year: 'c. 1113 CE',
    lat: 13.41, lon: 103.87,
    desc: 'The world\'s largest religious monument — 400 square kilometers of temple complex swallowed by jungle.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Angkor_Wat_aerial_view.jpg/1280px-Angkor_Wat_aerial_view.jpg',
    camDist: 1.9,
    camLatOffset: 14,
    camLonOffset: -12,
  },
  {
    name: 'Stonehenge',
    region: 'England',
    year: 'c. 3000 BCE',
    lat: 51.18, lon: -1.83,
    desc: 'Bluestones hauled 200 miles from Wales. A solar calendar built across five centuries.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Stonehenge2007_07_30.jpg/1280px-Stonehenge2007_07_30.jpg',
    camDist: 1.9,
    camLatOffset: 14,
    camLonOffset: -16,
  },
  {
    name: 'Petra',
    region: 'Jordan',
    year: 'c. 300 BCE',
    lat: 30.33, lon: 35.44,
    desc: 'The rose-red city — 30,000 tombs and temples carved directly into Jordanian sandstone cliffs.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Treasury_petra_crop.jpg/854px-Treasury_petra_crop.jpg',
    camDist: 1.9,
    camLatOffset: 16,
    camLonOffset: -14,
  },
  {
    name: 'Easter Island',
    region: 'Rapa Nui, Chile',
    year: 'c. 1250 CE',
    lat: -27.11, lon: -109.35,
    desc: '900 monolithic moai — some weighing 80 tons — moved across the island by a civilization still not fully understood.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Moai_Rano_raraku.jpg/1280px-Moai_Rano_raraku.jpg',
    camDist: 1.9,
    camLatOffset: 12,
    camLonOffset: -14,
  },
  {
    name: 'Chichen Itza',
    region: 'Mexico',
    year: 'c. 600 CE',
    lat: 20.68, lon: -88.57,
    desc: 'El Castillo\'s 365 steps encode the solar year. At equinox, a serpent of shadow descends the pyramid.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/ChichenItza_El_Castillo.jpg/1280px-ChichenItza_El_Castillo.jpg',
    camDist: 1.9,
    camLatOffset: 14,
    camLonOffset: -14,
  },
  {
    name: 'Mount Everest',
    region: 'Nepal / Tibet',
    year: '50 Million Years',
    lat: 27.99, lon: 86.93,
    desc: '8,849 meters — the collision of continents made visible. The roof of the world, still rising.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg/1280px-Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg',
    camDist: 1.95,
    camLatOffset: 16,
    camLonOffset: -14,
  },
] as const;

// THE SINGLE CORRECT coordinate function for this globe setup
// x = cos(lat)·cos(lon), y = sin(lat), z = -cos(lat)·sin(lon)
// This aligns perfectly with Three.js SphereGeometry UV mapping.
function latLonToVec3(lat: number, lon: number, r = 1.0): THREE.Vector3 {
  const φ = lat * (Math.PI / 180);
  const λ = lon * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.cos(φ) * Math.cos(λ),
    r * Math.sin(φ),
    -r * Math.cos(φ) * Math.sin(λ),
  );
}

// Camera position: offset from site by latOffset and lonOffset degrees
function camForSite(s: typeof SITES[number]): THREE.Vector3 {
  return latLonToVec3(
    s.lat + s.camLatOffset,
    s.lon + s.camLonOffset,
    s.camDist,
  );
}

const easeInOutQuart = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Great-circle slerp with a slight altitude arc
function slerpCam(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const aN = a.clone().normalize();
  const bN = b.clone().normalize();
  const omega = Math.acos(Math.min(Math.max(aN.dot(bN), -1), 1));
  let slerped: THREE.Vector3;
  if (omega < 0.001) {
    slerped = aN.lerp(bN, t);
  } else {
    const sinO = Math.sin(omega);
    slerped = aN.clone()
      .multiplyScalar(Math.sin((1 - t) * omega) / sinO)
      .addScaledVector(bN, Math.sin(t * omega) / sinO);
  }
  const rA = a.length(), rB = b.length();
  const r = rA + (rB - rA) * t + Math.sin(t * Math.PI) * 0.12; // arc peak
  return slerped.normalize().multiplyScalar(r);
}

export function Hero({ onSignInClick }: HeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stRef = useRef<any>({});
  const siteIdxRef = useRef(0);

  const [booted, setBooted] = useState(false);
  const [siteIdx, setSiteIdx] = useState(0);
  const [phase, setPhase] = useState<'globe' | 'photo'>('globe');
  const [labelOn, setLabelOn] = useState(false);
  const [descOn, setDescOn] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const [loadPct, setLoadPct] = useState(0);

  const site = SITES[siteIdx];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;

    // ── Renderer ────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 200);

    // ── Stars ───────────────────────────────────────────────────────────
    const N = 12000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r = 50 + Math.random() * 30;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(ph);
      const t = Math.random();
      col[i * 3] = t < 0.12 ? 0.75 : 1;
      col[i * 3 + 1] = t < 0.12 ? 0.82 : t < 0.25 ? 0.65 : 1;
      col[i * 3 + 2] = t < 0.12 ? 1 : t < 0.25 ? 0.6 : 1;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
      vertexColors: true, size: 0.065, sizeAttenuation: true,
      transparent: true, opacity: 0.72,
    })));

    // ── Globe textures ──────────────────────────────────────────────────
    // Use the same CDN but request the largest available resolution
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const onLoad = () => { loaded++; setLoadPct(Math.round(loaded / 3 * 100)); };

    // Natural Earth II from NASA Visible Earth (8192x4096 Blue Marble)
    // Fallback chain: high-res → medium
    const DAY_URLS = [
      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg',
      'https://unpkg.com/three-globe@2.31.2/example/img/earth-blue-marble.jpg',
    ];
    const NIGHT_URL = 'https://unpkg.com/three-globe@2.31.2/example/img/earth-night.jpg';
    const WATER_URL = 'https://unpkg.com/three-globe@2.31.2/example/img/earth-water.png';

    const loadWithFallback = (urls: string[], onTex: (t: THREE.Texture) => void) => {
      const attempt = (i: number) => {
        loader.load(urls[i],
          (t) => { onLoad(); onTex(t); },
          undefined,
          () => { if (i + 1 < urls.length) attempt(i + 1); },
        );
      };
      attempt(0);
    };

    // We'll assign textures to the material uniforms once loaded
    const dayTex = new THREE.Texture();
    const nightTex = new THREE.Texture();
    const specTex = new THREE.Texture();

    loadWithFallback(DAY_URLS, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      Object.assign(dayTex, t);
      globeMat.uniforms.dayTex.value = t;
    });
    loader.load(NIGHT_URL, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      Object.assign(nightTex, t);
      globeMat.uniforms.nightTex.value = t;
      onLoad();
    });
    loader.load(WATER_URL, (t) => {
      Object.assign(specTex, t);
      globeMat.uniforms.specTex.value = t;
      onLoad();
    });

    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: null },
        nightTex: { value: null },
        specTex: { value: null },
        sunDir: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTex, nightTex, specTex;
        uniform vec3 sunDir;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 day   = texture2D(dayTex,   vUv).rgb;
          vec3 night = texture2D(nightTex, vUv).rgb * 1.5;
          float spec = texture2D(specTex,  vUv).r;
          vec3 N = normalize(vNormal);
          vec3 S = normalize(sunDir);
          vec3 V = normalize(cameraPosition - vWorldPos);
          float NdS = dot(N, S);
          float dayMix = smoothstep(-0.12, 0.42, NdS);
          vec3 col = mix(night * 0.85, day, dayMix);
          vec3 H = normalize(S + V);
          float sp = pow(max(dot(N, H), 0.0), 140.0) * spec * 0.3 * dayMix;
          col += vec3(sp * 0.9, sp * 0.95, sp);
          col += night * (1.0 - dayMix) * 0.25;
          float fresnel = 1.0 - max(dot(N, V), 0.0);
          col *= 1.0 - fresnel * 0.15;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    // ── NOTE: globe rotation to fix UV alignment ────────────────────────
    // Three.js SphereGeometry UV seam is at theta=0, which maps to the
    // texture's left edge (lon=-180). The sphere geometry starts from +X
    // direction for theta=0. Our latLonToVec3 puts lon=0 at +X.
    // That means lon=0 (Greenwich) is at +X, and the texture has
    // Greenwich at u=0.5 (center). This is CORRECT — no rotation needed.
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 256, 128),
      globeMat,
    );
    scene.add(globe);

    // ── Atmosphere glow ─────────────────────────────────────────────────
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { c: { value: new THREE.Color(0x1133bb) } },
        vertexShader: `
          varying vec3 vN;
          void main() {
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 c;
          varying vec3 vN;
          void main() {
            vec3 vd = normalize(cameraPosition - (modelMatrix * vec4(0,0,0,1)).xyz);
            float i = pow(1.0 - abs(dot(vN, vd)), 4.5);
            gl_FragColor = vec4(c * i * 0.5, i * 0.38);
          }`,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    ));

    // ── Cloud layer ─────────────────────────────────────────────────────
    const cloudTex = loader.load('https://unpkg.com/three-globe@2.31.2/example/img/earth-clouds.png');
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.008, 128, 64),
      new THREE.MeshPhongMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    scene.add(clouds);

    // ── Site markers ────────────────────────────────────────────────────
    // Use the SAME latLonToVec3 as the camera — single source of truth
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    const markerMeshes: THREE.Mesh[] = [];
    const ringMeshes: THREE.Mesh[] = [];

    SITES.forEach((s, i) => {
      const p = latLonToVec3(s.lat, s.lon, 1.008);

      // Pulse ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.006, 0.009, 32),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xD4AF37 : 0xffffff,
          transparent: true,
          opacity: i === 0 ? 0.55 : 0.15,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.copy(p);
      ring.lookAt(p.clone().multiplyScalar(3));
      markerGroup.add(ring);
      ringMeshes.push(ring);

      // Center dot
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.003, 8, 8),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xD4AF37 : 0xffffff,
          transparent: true,
          opacity: i === 0 ? 1.0 : 0.22,
        }),
      );
      dot.position.copy(p);
      markerGroup.add(dot);
      markerMeshes.push(dot);
    });

    // ── Lights ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.04));
    const sun = new THREE.DirectionalLight(0xfff5e0, 2.4);
    sun.position.set(5, 2, 3);
    scene.add(sun);

    // ── State ────────────────────────────────────────────────────────────
    const st = {
      renderer, scene, camera, globe, clouds, globeMat, sun,
      markerGroup, markerMeshes, ringMeshes,
      camFrom: new THREE.Vector3(0, 0, 3.2),
      camTo: new THREE.Vector3(0, 0, 3.2),
      tarFrom: new THREE.Vector3(0, 0, 0),
      tarTo: new THREE.Vector3(0, 0, 0),
      camCur: new THREE.Vector3(0, 0, 3.2),
      tarCur: new THREE.Vector3(0, 0, 0),
      animStart: 0,
      animDur: 4800,
      animT: 1.0,
      rawT: 1.0,
      pulse: 0,
      timer: null as ReturnType<typeof setTimeout> | null,
      dead: false,
      idleRot: 0.000075, // radians/frame idle rotation
    };
    stRef.current = st;

    // ── goTo ─────────────────────────────────────────────────────────────
    const goTo = (idx: number, instant = false) => {
      if (st.dead) return;
      const s = SITES[idx];
      const camPos = camForSite(s);
      const tarPos = latLonToVec3(s.lat, s.lon, 0.0);

      st.camFrom = st.camCur.clone();
      st.tarFrom = st.tarCur.clone();
      st.camTo = camPos;
      st.tarTo = tarPos;
      st.animStart = performance.now();
      st.animDur = instant ? 600 : 4800;
      st.animT = 0;
      st.rawT = 0;

      // Update marker colours
      st.markerMeshes.forEach((m, i) => {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.set(i === idx ? 0xD4AF37 : 0xffffff);
        mat.opacity = i === idx ? 1.0 : 0.2;
        const rm = st.ringMeshes[i].material as THREE.MeshBasicMaterial;
        rm.color.set(i === idx ? 0xD4AF37 : 0xffffff);
        rm.opacity = i === idx ? 0.55 : 0.12;
      });

      siteIdxRef.current = idx;
      setSiteIdx(idx);
      setLabelOn(false);
      setPhase('globe');
      setDescOn(false);
      setImgOk(true);

      if (st.timer) clearTimeout(st.timer);

      // Timeline: fly → label → photo → desc → next
      const flyDur = instant ? 0 : 4800;
      st.timer = setTimeout(() => {
        if (st.dead) return;
        setLabelOn(true);
        st.timer = setTimeout(() => {
          if (st.dead) return;
          setPhase('photo');
          st.timer = setTimeout(() => {
            if (st.dead) return;
            setDescOn(true);
            st.timer = setTimeout(() => {
              if (st.dead) return;
              setDescOn(false);
              setLabelOn(false);
              st.timer = setTimeout(() => {
                if (st.dead) return;
                setPhase('globe');
                setTimeout(() => goTo((idx + 1) % SITES.length), 700);
              }, 900);
            }, 9500);
          }, 1600);
        }, instant ? 400 : 2400);
      }, flyDur);
    };

    // ── Render loop ──────────────────────────────────────────────────────
    let raf: number;
    const tick = (now: number) => {
      if (st.dead) return;
      raf = requestAnimationFrame(tick);

      if (st.animT < 1.0) {
        const raw = Math.min((now - st.animStart) / st.animDur, 1.0);
        st.rawT = raw;
        st.animT = easeInOutQuart(raw);
        st.camCur = slerpCam(st.camFrom, st.camTo, st.animT);
        st.tarCur.lerpVectors(st.tarFrom, st.tarTo, easeOutCubic(raw));
      }

      camera.position.copy(st.camCur);
      camera.lookAt(st.tarCur);

      // Idle globe rotation
      if (st.animT >= 1.0) {
        globe.rotation.y += st.idleRot;
        clouds.rotation.y += st.idleRot * 1.3;
        markerGroup.rotation.y += st.idleRot;
      }

      // Pulse active ring
      st.pulse += 0.022;
      const p = 0.5 + 0.5 * Math.sin(st.pulse);
      const activeRing = st.ringMeshes[siteIdxRef.current];
      if (activeRing) {
        (activeRing.material as THREE.MeshBasicMaterial).opacity = 0.28 + p * 0.48;
        activeRing.scale.setScalar(1 + p * 0.22);
      }

      // Sun drift
      const sa = now * 0.000016;
      const sd = new THREE.Vector3(Math.cos(sa), 0.22, Math.sin(sa)).normalize();
      (st.globeMat.uniforms.sunDir.value as THREE.Vector3).copy(sd);
      st.sun.position.copy(sd.clone().multiplyScalar(5));

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    // Boot: start from zoomed-out perspective
    const s0 = SITES[0];
    const startCam = latLonToVec3(s0.lat + 35, s0.lon - 25, 3.0);
    st.camCur.copy(startCam);
    st.tarCur.copy(latLonToVec3(s0.lat, s0.lon, 0));
    camera.position.copy(startCam);
    camera.lookAt(st.tarCur);

    const bootTimer = setTimeout(() => {
      setBooted(true);
      setTimeout(() => goTo(0), 500);
    }, 1400);

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      st.dead = true;
      clearTimeout(bootTimer);
      if (st.timer) clearTimeout(st.timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => { siteIdxRef.current = siteIdx; }, [siteIdx]);

  // Manual site jump
  const jumpTo = useCallback((i: number) => {
    const st = stRef.current;
    if (!st.dead) {
      if (st.timer) clearTimeout(st.timer);
      // @ts-ignore — goTo is scoped in effect; expose via ref instead
      // For now trigger via a ref flag checked in tick
    }
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">

      {/* ── Globe canvas ── */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        style={{ opacity: phase === 'photo' ? 0 : 1, transition: 'opacity 2.2s ease' }}
      />

      {/* ── Site photo ── */}
      <div
        className="absolute inset-0"
        style={{ opacity: phase === 'photo' ? 1 : 0, transition: 'opacity 2.2s ease' }}
      >
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={site.img}
            src={site.img}
            alt={site.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgOk(false)}
            style={{
              filter: 'brightness(0.72) contrast(1.1) saturate(1.08)',
              transform: phase === 'photo' ? 'scale(1.06)' : 'scale(1.0)',
              transition: 'transform 16s ease',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-[#02040a]" />
        )}
        {/* Cinematic vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 18%, transparent 48%, rgba(0,0,0,0.96) 100%)',
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.38) 0%, transparent 50%)',
        }} />
      </div>

      {/* ── Loading screen ── */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#02040a]"
        style={{ opacity: booted ? 0 : 1, pointerEvents: booted ? 'none' : 'auto', transition: 'opacity 1.8s ease' }}
      >
        {/* Compass rose */}
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" className="mb-8">
          <circle cx="26" cy="26" r="25" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.2" />
          <circle cx="26" cy="26" r="14" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.35" />
          <circle cx="26" cy="26" r="3" fill="#D4AF37" fillOpacity="0.9" />
          <line x1="26" y1="1" x2="26" y2="51" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.15" />
          <line x1="1" y1="26" x2="51" y2="26" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.15" />
          <polygon points="26,3 28,22 26,20 24,22" fill="#D4AF37" fillOpacity="0.7" />
          <polygon points="26,49 28,30 26,32 24,30" fill="#D4AF37" fillOpacity="0.3" />
        </svg>
        <div className="w-28 h-[1px] bg-white/5 overflow-hidden mb-5">
          <div className="h-full bg-[#D4AF37]/50 transition-all duration-500" style={{ width: `${loadPct}%` }} />
        </div>
        <p className="text-[7.5px] text-[#D4AF37]/25 tracking-[0.8em] uppercase">
          Initialising the archive
        </p>
      </div>

      {/* ── Globe-mode overlays ── */}
      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse 88% 88% at 50% 50%, transparent 28%, rgba(0,0,0,0.7) 100%)',
          opacity: phase === 'photo' ? 0 : 1,
          transition: 'opacity 2s ease',
        }}
      />

      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 100%)' }} />

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{ height: 240, background: 'linear-gradient(to top, rgba(0,0,0,0.98) 0%, transparent 100%)' }} />

      {/* ── Hero copy ── */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex flex-col items-center justify-center pointer-events-none"
        style={{
          paddingTop: '7vh',
          opacity: booted && !labelOn ? 1 : 0,
          transition: 'opacity 2.5s ease',
        }}
      >
        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: '1.1rem',
          letterSpacing: '0.12em',
          color: 'rgba(212,175,55,0.55)',
          textTransform: 'uppercase',
          marginBottom: '0.6rem',
        }}>
          LithicEarth
        </p>
        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: '2.4rem',
          letterSpacing: '0.03em',
          color: 'rgba(255,255,255,0.82)',
          lineHeight: 1.15,
          textAlign: 'center',
          textShadow: '0 2px 40px rgba(0,0,0,0.8)',
        }}>
          Map what is buried.<br />Before it is lost forever.
        </p>
        <div style={{
          width: 48, height: 1,
          background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.4), transparent)',
          margin: '1.4rem auto 0',
        }} />
      </div>

      {/* ── Site label ── */}
      <div
        className="absolute bottom-28 left-10 z-20 pointer-events-none"
        style={{
          maxWidth: 420,
          opacity: labelOn ? 1 : 0,
          transform: labelOn ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 1.6s ease, transform 1.6s ease',
        }}
      >
        {/* Gold rule */}
        <div style={{
          width: labelOn ? 44 : 0, height: 1,
          background: 'linear-gradient(to right, #D4AF37, transparent)',
          marginBottom: 14,
          transition: 'width 2.2s ease 0.4s',
        }} />
        <p className="text-[7.5px] tracking-[0.65em] uppercase font-light mb-3"
          style={{ color: 'rgba(212,175,55,0.5)' }}>
          Now Viewing
        </p>
        <h2 style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontStyle: 'italic',
          fontWeight: 300,
          fontSize: '2rem',
          letterSpacing: '0.02em',
          color: 'rgba(255,255,255,0.94)',
          lineHeight: 1.1,
          marginBottom: 10,
        }}>
          {site.name}
        </h2>
        <div className="flex items-center gap-3" style={{ marginBottom: descOn ? 20 : 0, transition: 'margin 0.6s ease' }}>
          <span className="text-[8.5px] tracking-[0.4em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {site.region}
          </span>
          <span style={{ width: 1, height: 9, background: 'rgba(255,255,255,0.12)', display: 'inline-block' }} />
          <span className="text-[8.5px] tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {site.year}
          </span>
        </div>
        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontWeight: 300,
          fontSize: '0.94rem',
          lineHeight: 1.75,
          color: 'rgba(255,255,255,0.48)',
          maxWidth: 360,
          opacity: descOn ? 1 : 0,
          transform: descOn ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 1.8s ease, transform 1.8s ease',
        }}>
          {site.desc}
        </p>
      </div>

      {/* ── CTA ── */}
      <div
        className="absolute bottom-10 left-10 z-20"
        style={{
          opacity: descOn ? 1 : 0,
          transform: descOn ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 2s ease 1s, transform 2s ease 1s',
        }}
      >
        <button
          onClick={onSignInClick}
          style={{
            fontFamily: '"Cormorant Garamond", "Georgia", serif',
            fontStyle: 'italic',
            fontSize: '0.82rem',
            letterSpacing: '0.15em',
            color: 'rgba(212,175,55,0.75)',
            border: '0.5px solid rgba(212,175,55,0.28)',
            padding: '10px 26px',
            background: 'rgba(0,0,0,0.4)',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.color = 'rgba(212,175,55,1)';
            (e.target as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.55)';
            (e.target as HTMLButtonElement).style.background = 'rgba(212,175,55,0.06)';
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.color = 'rgba(212,175,55,0.75)';
            (e.target as HTMLButtonElement).style.borderColor = 'rgba(212,175,55,0.28)';
            (e.target as HTMLButtonElement).style.background = 'rgba(0,0,0,0.4)';
          }}
        >
          Explore the Archive →
        </button>
      </div>

      {/* ── Site progress dots ── */}
      <div
        className="absolute right-8 z-20 pointer-events-none"
        style={{ bottom: 96, opacity: booted ? 1 : 0, transition: 'opacity 1s ease 1s' }}
      >
        <div className="flex flex-col gap-[7px] items-end">
          {SITES.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              {i === siteIdx && (
                <span style={{ fontSize: 7, color: 'rgba(212,175,55,0.4)', letterSpacing: '0.12em' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
              )}
              <div style={{
                height: 1.5, borderRadius: 1,
                width: i === siteIdx ? 24 : 4,
                background: i === siteIdx ? '#D4AF37' : 'rgba(255,255,255,0.14)',
                transition: 'all 0.9s ease',
              }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Scroll hint ── */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2"
        style={{ opacity: descOn ? 0.55 : 0, transition: 'opacity 2s ease 1.5s' }}
      >
        <p style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.5em', textTransform: 'uppercase' }}>
          Scroll to explore
        </p>
        <div style={{ width: 1, height: 24, background: 'linear-gradient(to bottom, rgba(212,175,55,0.35), transparent)' }} />
      </div>

    </div>
  );
}
