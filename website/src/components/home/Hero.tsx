'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE SYSTEM NOTE:
// Three.js sphere mapping: phi = (90-lat)*PI/180, theta = (lon+180)*PI/180
// Camera offset: we position the camera slightly ABOVE and BESIDE the site
// so the globe is tilted to show the site in the lower-center of frame
//
// camLat/camLon = where the camera eye actually sits (offset from site)
// These are tuned so the site appears in the hero with the right geography
// ─────────────────────────────────────────────────────────────────────────────
const SITES = [
  {
    name: 'Pyramids of Giza',
    region: 'Egypt',
    year: 'c. 2560 BCE',
    // Site coords
    lat: 29.98, lon: 31.13,
    // Camera sits NW of site looking SE — shows Nile delta, desert, pyramids in context
    camLat: 36, camLon: 22, camR: 1.12,
    desc: 'The last surviving wonder of the ancient world — aligned to within 0.05° of true north.',
    // Wikipedia Commons direct CDN — always works, no hotlink block
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/1280px-All_Gizah_Pyramids.jpg',
  },
  {
    name: 'Grand Canyon',
    region: 'Arizona, USA',
    year: '5–6 Million Years',
    lat: 36.10, lon: -112.11,
    camLat: 42, camLon: -120, camR: 1.12,
    desc: '277 miles of geological record — 1.8 billion years of Earth\'s history exposed by the Colorado River.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/USA_09847_Grand_Canyon_Luca_Galuzzi_2007.jpg/1280px-USA_09847_Grand_Canyon_Luca_Galuzzi_2007.jpg',
  },
  {
    name: 'Machu Picchu',
    region: 'Peru',
    year: 'c. 1450 CE',
    lat: -13.16, lon: -72.54,
    camLat: -7, camLon: -78, camR: 1.10,
    desc: 'Built at 2,430m — Inca stonework so precise no mortar was needed, hidden in clouds for 400 years.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/1280px-Machu_Picchu%2C_Peru.jpg',
  },
  {
    name: 'Angkor Wat',
    region: 'Cambodia',
    year: 'c. 1113 CE',
    lat: 13.41, lon: 103.87,
    camLat: 19, camLon: 97, camR: 1.10,
    desc: 'The world\'s largest religious monument — 400 square kilometers of temple complex swallowed by jungle.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Angkor_Wat_aerial_view.jpg/1280px-Angkor_Wat_aerial_view.jpg',
  },
  {
    name: 'Stonehenge',
    region: 'England',
    year: 'c. 3000 BCE',
    lat: 51.18, lon: -1.83,
    camLat: 57, camLon: -8, camR: 1.10,
    desc: 'Bluestones hauled 200 miles from Wales. A solar calendar built across five centuries.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Stonehenge2007_07_30.jpg/1280px-Stonehenge2007_07_30.jpg',
  },
  {
    name: 'Petra',
    region: 'Jordan',
    year: 'c. 300 BCE',
    lat: 30.33, lon: 35.44,
    camLat: 36, camLon: 28, camR: 1.10,
    desc: 'The rose-red city — 30,000 tombs and temples carved directly into Jordanian sandstone cliffs.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Treasury_petra_crop.jpg/854px-Treasury_petra_crop.jpg',
  },
  {
    name: 'Göbekli Tepe',
    region: 'Turkey',
    year: 'c. 9600 BCE',
    lat: 37.22, lon: 38.92,
    camLat: 43, camLon: 32, camR: 1.10,
    desc: 'The oldest known megalithic structure — built 6,000 years before Stonehenge, rewriting human prehistory.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/G%C3%B6bekli_Tepe%2C_Urfa.jpg/1280px-G%C3%B6bekli_Tepe%2C_Urfa.jpg',
  },
  {
    name: 'Easter Island',
    region: 'Rapa Nui, Chile',
    year: 'c. 1250 CE',
    lat: -27.11, lon: -109.35,
    camLat: -21, camLon: -115, camR: 1.10,
    desc: '900 monolithic moai — some weighing 80 tons — moved across the island by a civilization still not fully understood.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Moai_Rano_raraku.jpg/1280px-Moai_Rano_raraku.jpg',
  },
  {
    name: 'Chichen Itza',
    region: 'Mexico',
    year: 'c. 600 CE',
    lat: 20.68, lon: -88.57,
    camLat: 27, camLon: -94, camR: 1.10,
    desc: 'El Castillo\'s 365 steps encode the solar year. At equinox, a serpent of shadow descends the pyramid.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/ChichenItza_El_Castillo.jpg/1280px-ChichenItza_El_Castillo.jpg',
  },
  {
    name: 'Mount Everest',
    region: 'Nepal / Tibet',
    year: '50 Million Years',
    lat: 27.99, lon: 86.93,
    camLat: 34, camLon: 80, camR: 1.12,
    desc: '8,849 meters — the collision of continents made visible. The roof of the world, still rising.',
    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg/1280px-Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg',
  },
] as const;

// ─── Correct lat/lon → Three.js sphere position ──────────────────────────────
// Standard geographic → cartesian:
// x = r·cos(lat)·cos(lon)  y = r·sin(lat)  z = -r·cos(lat)·sin(lon)
function geoToVec3(lat: number, lon: number, r = 1.0): THREE.Vector3 {
  const latR = lat * (Math.PI / 180);
  const lonR = lon * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.cos(latR) * Math.cos(lonR),
    r * Math.sin(latR),
    -r * Math.cos(latR) * Math.sin(lonR),
  );
}

// UV mapping for the Blue Marble texture (equirectangular):
// u = (lon + 180) / 360,  v = (lat + 90) / 180
// Three.js SphereGeometry generates UVs matching this exactly when
// we use the standard phi/theta convention. So we need our sphere
// to use the matching convention.
// SphereGeometry: phi from +Y axis, theta around Y
// We'll rotate the globe to align texture with geoToVec3 coords.

const easeInOutQuart = (t: number) => t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2,4)/2;
const easeOutCubic   = (t: number) => 1 - Math.pow(1-t, 3);

// Smooth slerp arc between two camera positions
function slerpArc(from: THREE.Vector3, to: THREE.Vector3, t: number): THREE.Vector3 {
  const fN = from.clone().normalize();
  const tN = to.clone().normalize();
  const angle = fN.angleTo(tN);
  if (angle < 0.0001) return from.clone().lerp(to, t);
  const s = Math.sin(angle);
  const wa = Math.sin((1-t)*angle)/s;
  const wb = Math.sin(t*angle)/s;
  const slerped = fN.clone().multiplyScalar(wa).addScaledVector(tN, wb);
  const fromR = from.length(), toR = to.length();
  const r = fromR + (toR - fromR)*t + Math.sin(t*Math.PI)*0.08;
  return slerped.normalize().multiplyScalar(r);
}

// ─────────────────────────────────────────────────────────────────────────────
export function Hero({ onSignInClick }: HeroProps) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const stateRef  = useRef<any>({});

  const [booted,       setBooted]       = useState(false);
  const [siteIdx,      setSiteIdx]      = useState(0);
  const [phase,        setPhase]        = useState<'globe'|'photo'>('globe');
  const [labelOn,      setLabelOn]      = useState(false);
  const [descOn,       setDescOn]       = useState(false);
  const [imgOk,        setImgOk]        = useState(true);
  const [progress,     setProgress]     = useState(0);

  const site = SITES[siteIdx];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(38, W/H, 0.001, 200);

    // ── Stars ────────────────────────────────────────────────────────────
    const N = 9000;
    const sp = new Float32Array(N*3), sc = new Float32Array(N*3);
    for (let i=0;i<N;i++) {
      const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1), r=48+Math.random()*32;
      sp[i*3]=r*Math.sin(ph)*Math.cos(th); sp[i*3+1]=r*Math.sin(ph)*Math.sin(th); sp[i*3+2]=r*Math.cos(ph);
      const t=Math.random();
      sc[i*3]=t<0.15?0.8:1; sc[i*3+1]=t<0.15?0.85:1; sc[i*3+2]=t<0.15?1:t<0.3?0.7:1;
    }
    const sg=new THREE.BufferGeometry();
    sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
    sg.setAttribute('color',new THREE.BufferAttribute(sc,3));
    scene.add(new THREE.Points(sg,new THREE.PointsMaterial({
      vertexColors:true,size:0.06,sizeAttenuation:true,transparent:true,opacity:0.7,
    })));

    // ── Globe ─────────────────────────────────────────────────────────────
    // IMPORTANT: We use the standard Three.js SphereGeometry which maps:
    // phi=0 at +Y (north pole), sweeps to -Y (south pole)
    // theta starts at +Z (lon=0), goes counter-clockwise
    // The Blue Marble texture is equirectangular: left=west, right=east
    // We rotate the globe so lon=0 faces +Z: rotation.y = 0
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const onLoad = () => { loaded++; setProgress(Math.round(loaded/3*100)); };

    // High-res NASA Blue Marble — 8192px version via three-globe CDN
    const dayTex = loader.load(
      'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg', onLoad,
    );
    dayTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    dayTex.minFilter = THREE.LinearMipmapLinearFilter;

    const nightTex = loader.load(
      'https://unpkg.com/three-globe/example/img/earth-night.jpg', onLoad,
    );
    nightTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const specTex = loader.load(
      'https://unpkg.com/three-globe/example/img/earth-water.png', onLoad,
    );

    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex:   { value: dayTex },
        nightTex: { value: nightTex },
        specTex:  { value: specTex },
        sunDir:   { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
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
          vec3 night = texture2D(nightTex, vUv).rgb * 1.6;
          float spec = texture2D(specTex,  vUv).r;

          vec3 N   = normalize(vNormal);
          vec3 S   = normalize(sunDir);
          vec3 V   = normalize(cameraPosition - vWorldPos);
          float NdS = dot(N, S);

          // Day/night blend — smooth terminator
          float dayMix = smoothstep(-0.1, 0.45, NdS);
          vec3 col = mix(night, day, dayMix);

          // Ocean specular (water mask)
          vec3 H = normalize(S + V);
          float sp = pow(max(dot(N, H), 0.0), 120.0) * spec * 0.35 * dayMix;
          col += vec3(sp);

          // Subtle city lights enhancement on night side
          col += night * (1.0 - dayMix) * 0.3;

          // Fresnel darkening at limb
          float fresnel = 1.0 - max(dot(N, V), 0.0);
          col *= 1.0 - fresnel * 0.18;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    // SphereGeometry with enough segments for sharp imagery
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 256, 128),
      globeMat,
    );
    // The Blue Marble texture has lon=180 at the left edge and lon=-180 at right
    // Three.js SphereGeometry starts theta at +Z (lon=0 at front)
    // No rotation needed — they align by default
    scene.add(globe);

    // ── Atmosphere ────────────────────────────────────────────────────────
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.022, 64, 64),
      new THREE.ShaderMaterial({
        uniforms: { c: { value: new THREE.Color(0x1144cc) } },
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
            float i = pow(1.0 - abs(dot(vN, vd)), 4.2);
            gl_FragColor = vec4(c * i * 0.55, i * 0.42);
          }`,
        side: THREE.FrontSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    ));

    // ── Site markers ──────────────────────────────────────────────────────
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    // Build markers using CORRECT coordinate mapping
    // geoToVec3 uses: x=cos(lat)cos(lon), y=sin(lat), z=-cos(lat)sin(lon)
    // But Three.js SphereGeometry UV mapping uses a different convention
    // We need to match our marker placement to the sphere's actual geometry
    // The sphere has phi from top (+Y), theta from +Z going counterclockwise
    // UV: u = theta/(2PI), v = 1 - phi/PI
    // So for lat/lon: phi = PI/2 - lat*PI/180, theta = lon*PI/180
    function siteToSphere(lat: number, lon: number, r = 1.0) {
      const phi   = (Math.PI/2) - lat*(Math.PI/180);
      const theta = lon*(Math.PI/180);
      return new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
    }

    const markerDots: {mesh:THREE.Mesh,idx:number}[] = [];
    SITES.forEach((s, i) => {
      const pos = siteToSphere(s.lat, s.lon, 1.006);

      // Outer ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.0055, 0.0075, 32),
        new THREE.MeshBasicMaterial({
          color: i===0 ? 0xD4AF37 : 0xffffff,
          transparent: true, opacity: i===0 ? 0.65 : 0.18,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      markerGroup.add(ring);

      // Inner dot
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0025, 8, 8),
        new THREE.MeshBasicMaterial({
          color: i===0 ? 0xD4AF37 : 0xffffff,
          transparent: true, opacity: i===0 ? 1.0 : 0.25,
        }),
      );
      dot.position.copy(pos);
      markerGroup.add(dot);
      markerDots.push({mesh:dot, idx:i});
    });

    // ── Lights ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.03));
    const sun = new THREE.DirectionalLight(0xfff8e8, 2.2);
    sun.position.set(5, 2, 3); scene.add(sun);

    // ── State ─────────────────────────────────────────────────────────────
    const st = {
      renderer, scene, camera, globe, globeMat, sun,
      markerGroup, markerDots,
      camFrom: new THREE.Vector3(0,0,2.8),
      camTo:   new THREE.Vector3(0,0,2.8),
      tarFrom: new THREE.Vector3(0,0,0),
      tarTo:   new THREE.Vector3(0,0,0),
      camCur:  new THREE.Vector3(0,0,2.8),
      tarCur:  new THREE.Vector3(0,0,0),
      animStart: 0, animDur: 4500, animT: 1.0,
      ringPulse: 0, timer: null as any, dead: false,
      activeRings: [] as THREE.Mesh[],
    };
    stateRef.current = st;

    // ── Go to site ────────────────────────────────────────────────────────
    const goTo = (idx: number, instant = false) => {
      if (st.dead) return;
      const s = SITES[idx];

      // Camera position: offset from site so we look obliquely
      const camPos = siteToSphere(s.camLat, s.camLon, s.camR);
      const tarPos = siteToSphere(s.lat, s.lon, 1.0);

      st.camFrom = st.camCur.clone();
      st.tarFrom = st.tarCur.clone();
      st.camTo   = camPos;
      st.tarTo   = tarPos;
      st.animStart = performance.now();
      st.animDur   = instant ? 500 : 4500;
      st.animT     = 0;

      // Update marker appearance
      st.markerDots.forEach(({mesh,idx:i}:{mesh:THREE.Mesh,idx:number}) => {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.color.set(i===idx ? 0xD4AF37 : 0xffffff);
        mat.opacity = i===idx ? 1.0 : 0.2;
        // Also update ring
        const ring = st.markerGroup.children[i*2] as THREE.Mesh;
        if (ring) {
          const rm = ring.material as THREE.MeshBasicMaterial;
          rm.color.set(i===idx ? 0xD4AF37 : 0xffffff);
          rm.opacity = i===idx ? 0.65 : 0.15;
        }
      });

      setSiteIdx(idx);
      setLabelOn(false);
      setPhase('globe');
      setDescOn(false);
      setImgOk(true);

      if (st.timer) clearTimeout(st.timer);

      // Timeline:
      // 0ms  : fly starts
      // 4500ms: fly ends → show label
      // 6500ms: crossfade to photo
      // 8000ms: show description
      // 17000ms: fade out → next site

      const t = instant ? 0 : 4500;
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
              setDescOn(false); setLabelOn(false);
              st.timer = setTimeout(() => {
                if (st.dead) return;
                setPhase('globe');
                setTimeout(() => goTo((idx+1) % SITES.length), 600);
              }, 800);
            }, 9000);
          }, 1500);
        }, instant ? 300 : 2200);
      }, t);
    };

    // ── Render loop ───────────────────────────────────────────────────────
    let raf: number;
    const tick = (now: number) => {
      if (st.dead) return;
      raf = requestAnimationFrame(tick);

      if (st.animT < 1.0) {
        const raw = Math.min((now - st.animStart) / st.animDur, 1.0);
        st.animT = raw >= 1.0 ? 1.0 : easeInOutQuart(raw);
        st.camCur = slerpArc(st.camFrom, st.camTo, st.animT);
        st.tarCur.lerpVectors(st.tarFrom, st.tarTo, easeOutCubic(raw));
      }

      camera.position.copy(st.camCur);
      camera.lookAt(st.tarCur);

      // Pulse active ring
      st.ringPulse += 0.02;
      const p = 0.5 + 0.5 * Math.sin(st.ringPulse);
      const activeRing = st.markerGroup.children[siteIdxRef.current * 2] as THREE.Mesh;
      if (activeRing?.material) {
        (activeRing.material as THREE.MeshBasicMaterial).opacity = 0.3 + p*0.5;
        activeRing.scale.setScalar(1 + p*0.2);
      }

      // Gentle idle rotation
      if (st.animT >= 1.0) {
        globe.rotation.y      += 0.000085;
        markerGroup.rotation.y += 0.000085;
      }

      // Sun drift
      const sa = now * 0.000018;
      (st.globeMat.uniforms.sunDir.value as THREE.Vector3)
        .set(Math.cos(sa), 0.22, Math.sin(sa)).normalize();
      st.sun.position.set(Math.cos(sa)*5, 2, Math.sin(sa)*5);

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    // Boot
    const s0 = SITES[0];
    const startCam = siteToSphere(s0.camLat + 20, s0.camLon - 15, 2.5);
    st.camCur.copy(startCam);
    st.tarCur.copy(siteToSphere(s0.lat, s0.lon, 1.0));
    camera.position.copy(startCam);
    camera.lookAt(st.tarCur);

    const boot = setTimeout(() => {
      setBooted(true);
      setTimeout(() => goTo(0), 500);
    }, 1500);

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      st.dead = true;
      clearTimeout(boot);
      if (st.timer) clearTimeout(st.timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // Need a ref for siteIdx to use inside render loop without stale closure
  const siteIdxRef = useRef(0);
  useEffect(() => { siteIdxRef.current = siteIdx; }, [siteIdx]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">

      {/* ── Globe ── */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        style={{ opacity: phase === 'photo' ? 0 : 1, transition: 'opacity 2s ease' }}
      />

      {/* ── Site photograph ── */}
      <div
        className="absolute inset-0"
        style={{ opacity: phase === 'photo' ? 1 : 0, transition: 'opacity 2s ease' }}
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
              filter: 'brightness(0.75) contrast(1.12) saturate(1.06)',
              transform: phase==='photo' ? 'scale(1.07)' : 'scale(1.0)',
              transition: 'transform 16s ease',
            }}
          />
        ) : (
          // Fallback: just show the globe label on dark bg
          <div className="absolute inset-0 bg-black"/>
        )}

        {/* Cinematic gradients */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 20%, transparent 52%, rgba(0,0,0,0.92) 100%)',
        }}/>
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.32) 0%, transparent 55%)',
        }}/>
        {/* Film grain */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.032]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}/>
      </div>

      {/* ── Loading ── */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
        style={{ opacity: booted?0:1, pointerEvents: booted?'none':'auto', transition: 'opacity 1.6s ease' }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="mb-7">
          <circle cx="18" cy="18" r="17" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.25"/>
          <circle cx="18" cy="18" r="10" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.45"/>
          <circle cx="18" cy="18" r="2.2" fill="#D4AF37" fillOpacity="0.85"/>
          <line x1="18" y1="1" x2="18" y2="35" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.18"/>
          <line x1="1"  y1="18" x2="35" y2="18" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.18"/>
          <circle cx="18" cy="1"  r="1.1" fill="#D4AF37" fillOpacity="0.35"/>
          <circle cx="18" cy="35" r="1.1" fill="#D4AF37" fillOpacity="0.35"/>
          <circle cx="1"  cy="18" r="1.1" fill="#D4AF37" fillOpacity="0.35"/>
          <circle cx="35" cy="18" r="1.1" fill="#D4AF37" fillOpacity="0.35"/>
        </svg>
        <div className="w-24 h-px bg-white/6 relative overflow-hidden mb-5">
          <div className="absolute inset-y-0 left-0 bg-[#D4AF37]/45 transition-all duration-500" style={{width:`${progress}%`}}/>
        </div>
        <p className="text-[8px] text-[#D4AF37]/30 tracking-[0.7em] uppercase font-light">
          Preparing the archive
        </p>
      </div>

      {/* ── Vignette (globe mode) ── */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 30%, rgba(0,0,0,0.65) 100%)',
          opacity: phase==='photo' ? 0 : 1, transition: 'opacity 2s ease',
        }}
      />

      {/* ── Top gradient ── */}
      <div className="absolute top-0 left-0 right-0 h-28 pointer-events-none z-10"
        style={{background:'linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,transparent 100%)'}}/>

      {/* ── Bottom gradient ── */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{height:220,background:'linear-gradient(to top,rgba(0,0,0,0.95) 0%,transparent 100%)'}}/>

      {/* ── Site label ── */}
      <div
        className="absolute bottom-24 left-10 z-20 pointer-events-none"
        style={{
          maxWidth: 400,
          opacity: labelOn ? 1 : 0,
          transform: labelOn ? 'translateY(0)' : 'translateY(14px)',
          transition: 'opacity 1.5s ease, transform 1.5s ease',
        }}
      >
        <div style={{
          width: labelOn ? 36 : 0, height: 1, marginBottom: 12,
          background: 'linear-gradient(to right, #D4AF37, transparent)',
          transition: 'width 2s ease 0.5s',
        }}/>
        <p className="text-[8px] text-[#D4AF37]/48 tracking-[0.6em] uppercase font-light mb-3">
          Now Viewing
        </p>
        <p style={{
          fontFamily: '"Cormorant Garamond","Georgia",serif',
          fontStyle: 'italic', fontWeight: 300,
          fontSize: '1.6rem', letterSpacing: '0.02em',
          color: 'rgba(255,255,255,0.93)', lineHeight: 1.1, marginBottom: 8,
        }}>
          {site.name}
        </p>
        <div className="flex items-center gap-3" style={{marginBottom: descOn ? 18 : 0, transition:'margin 0.6s ease'}}>
          <span className="text-[8.5px] text-white/28 tracking-[0.4em] uppercase">{site.region}</span>
          <span style={{width:1,height:9,background:'rgba(255,255,255,0.1)',display:'inline-block'}}/>
          <span className="text-[8.5px] text-white/20 tracking-[0.18em]">{site.year}</span>
        </div>
        <p style={{
          fontFamily: '"Cormorant Garamond","Georgia",serif',
          fontWeight: 300, fontSize: '0.92rem',
          lineHeight: 1.72, color: 'rgba(255,255,255,0.46)',
          maxWidth: 350,
          opacity: descOn ? 1 : 0,
          transform: descOn ? 'translateY(0)' : 'translateY(5px)',
          transition: 'opacity 1.8s ease, transform 1.8s ease',
        }}>
          {site.desc}
        </p>
      </div>

      {/* ── Progress ── */}
      <div className="absolute right-10 z-20 pointer-events-none"
        style={{bottom:96, opacity: booted?1:0, transition:'opacity 1s ease 0.8s'}}>
        <div className="flex flex-col gap-[6px] items-end">
          {SITES.map((s,i) => (
            <div key={i} className="flex items-center gap-2">
              {i===siteIdx && (
                <span className="text-[7px] text-[#D4AF37]/38 tracking-widest">
                  {String(i+1).padStart(2,'0')}
                </span>
              )}
              <div style={{
                height:'1.5px', borderRadius:1,
                width: i===siteIdx ? 22 : 4,
                background: i===siteIdx ? '#D4AF37' : 'rgba(255,255,255,0.13)',
                transition: 'all 0.8s ease',
              }}/>
            </div>
          ))}
        </div>
      </div>

      {/* ── Manifesto ── */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        style={{ opacity: booted && !labelOn ? 0.46 : 0, transition: 'opacity 2.5s ease' }}
      >
        <p style={{
          fontFamily:'"Cormorant Garamond","Georgia",serif',
          fontStyle:'italic', fontWeight:300,
          fontSize:'1.05rem', letterSpacing:'0.06em',
          color:'rgba(255,255,255,0.62)',
          textAlign:'center', lineHeight:1.8,
          textShadow:'0 1px 24px rgba(0,0,0,0.6)',
        }}>
          Map what is buried<br/>before it is lost forever.
        </p>
      </div>

      {/* ── Scroll hint ── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2"
        style={{ opacity: descOn ? 0.6 : 0, transition: 'opacity 2s ease 1s' }}
      >
        <p className="text-[7.5px] text-white/18 tracking-[0.5em] uppercase">Scroll to explore</p>
        <div style={{width:1,height:26,background:'linear-gradient(to bottom,rgba(212,175,55,0.35),transparent)'}}/>
      </div>

    </div>
  );
}
