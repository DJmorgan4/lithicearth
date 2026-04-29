'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick?: () => void;
}

const wrap = (url: string) =>
  `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=800&q=80`;

const SITES = [
  { name: 'Göbekli Tepe', region: 'Turkey', year: 'c. 9600 BCE', lat: 37.22, lon: 38.92,
    desc: 'The oldest known megalithic structure — built 6,000 years before Stonehenge, rewriting human prehistory.',
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/G%C3%B6bekli_Tepe%2C_Urfa.jpg/1280px-G%C3%B6bekli_Tepe%2C_Urfa.jpg') },
  { name: 'Pyramids of Giza', region: 'Egypt', year: 'c. 2560 BCE', lat: 29.98, lon: 31.13,
    desc: 'The last surviving wonder of the ancient world — aligned to within 0.05° of true north.',
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/1280px-All_Gizah_Pyramids.jpg') },
  { name: 'Machu Picchu', region: 'Peru', year: 'c. 1450 CE', lat: -13.16, lon: -72.54,
    desc: 'Built at 2,430m — Inca stonework so precise no mortar was needed, hidden in clouds for 400 years.',
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/1280px-Machu_Picchu%2C_Peru.jpg') },
  { name: 'Angkor Wat', region: 'Cambodia', year: 'c. 1113 CE', lat: 13.41, lon: 103.87,
    desc: "The world's largest religious monument — 400 square kilometers of temple complex swallowed by jungle.",
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Angkor_Wat_aerial_view.jpg/1280px-Angkor_Wat_aerial_view.jpg') },
  { name: 'Stonehenge', region: 'England', year: 'c. 3000 BCE', lat: 51.18, lon: -1.83,
    desc: 'Bluestones hauled 200 miles from Wales. A solar calendar built across five centuries.',
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Stonehenge2007_07_30.jpg/1280px-Stonehenge2007_07_30.jpg') },
  { name: 'Petra', region: 'Jordan', year: 'c. 300 BCE', lat: 30.33, lon: 35.44,
    desc: 'The rose-red city — 30,000 tombs and temples carved directly into Jordanian sandstone cliffs.',
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Treasury_petra_crop.jpg/854px-Treasury_petra_crop.jpg') },
  { name: 'Chichen Itza', region: 'Mexico', year: 'c. 600 CE', lat: 20.68, lon: -88.57,
    desc: "El Castillo's 365 steps encode the solar year. At equinox, a serpent of shadow descends the pyramid.",
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/ChichenItza_El_Castillo.jpg/1280px-ChichenItza_El_Castillo.jpg') },
  { name: 'Easter Island', region: 'Rapa Nui, Chile', year: 'c. 1250 CE', lat: -27.11, lon: -109.35,
    desc: '900 monolithic moai — some weighing 80 tons — moved by a civilization still not fully understood.',
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Moai_Rano_raraku.jpg/1280px-Moai_Rano_raraku.jpg') },
  { name: 'Mount Everest', region: 'Nepal / Tibet', year: '50 Million Years', lat: 27.99, lon: 86.93,
    desc: '8,849 meters — the collision of continents made visible. The roof of the world, still rising.',
    img: wrap('https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg/1280px-Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg') },
] as const;

function latLonToVec3(lat: number, lon: number, r = 1.0): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
    -r * Math.sin(phi) * Math.sin(theta),
  );
}

function camForSite(lat: number, lon: number, dist = 2.4): THREE.Vector3 {
  return latLonToVec3(Math.min(60, lat + 12), lon - 10, dist);
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;

const EASE = 'opacity 2.2s cubic-bezier(0.22,1,0.36,1)';

export function Hero({ onSignInClick }: HeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number>(0);
  const stRef    = useRef<any>(null);
  const idxRef   = useRef(0);

  const [booted,  setBooted]  = useState(false);
  const [siteIdx, setSiteIdx] = useState(0);
  const [labelOn, setLabelOn] = useState(false);
  const [descOn,  setDescOn]  = useState(false);
  const [imgOk,   setImgOk]   = useState(true);
  const [cardOn,  setCardOn]  = useState(false);

  const site = SITES[siteIdx];

  // Preload all images
  useEffect(() => {
    SITES.forEach((s) => { const i = new Image(); i.src = s.img; });
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x020508);
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth/mount.clientHeight, 0.1, 100);

    // Stars
    {
      const N = 9000, p = new Float32Array(N*3);
      for (let i = 0; i < N; i++) {
        const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), r = 40+Math.random()*25;
        p[i*3]=r*Math.sin(ph)*Math.cos(th); p[i*3+1]=r*Math.sin(ph)*Math.sin(th); p[i*3+2]=r*Math.cos(ph);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color:0xffffff, size:0.055, sizeAttenuation:true, transparent:true, opacity:0.65 })));
    }

    // Globe
    const globeGeo = new THREE.SphereGeometry(1, 128, 64);
    const globeMat = new THREE.MeshPhongMaterial({ color:0x1a3d5c, specular:0x224466, shininess:18 });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    const loader = new THREE.TextureLoader();
    const TEXTURES = [
      'https://unpkg.com/three-globe@2.31.2/example/img/earth-blue-marble.jpg',
      'https://cdn.jsdelivr.net/npm/three-globe@2.31.2/example/img/earth-blue-marble.jpg',
    ];
    let texDone = false;
    const tryTex = (i: number) => {
      if (texDone || i >= TEXTURES.length) return;
      loader.load(TEXTURES[i], (t) => {
        if (texDone) return; texDone = true;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        t.minFilter  = THREE.LinearMipmapLinearFilter;
        globeMat.map = t; globeMat.color.set(0xffffff);
        globeMat.specular.set(0x334466); globeMat.shininess = 14;
        globeMat.needsUpdate = true;
      }, undefined, () => tryTex(i+1));
    };
    tryTex(0);

    // Atmosphere with time uniform for breathing
    const atmUniforms = { u_time: { value: 0.0 } };
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 32), new THREE.ShaderMaterial({
      uniforms: atmUniforms,
      vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform float u_time;
        varying vec3 vN;
        void main(){
          float pulse = 0.9 + 0.1 * sin(u_time * 0.5);
          float i = pow(0.7 - dot(vN, vec3(0,0,1)), 4.0) * pulse;
          gl_FragColor = vec4(0.1,0.4,0.9,1.0) * i * 0.65;
        }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    })));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const sun = new THREE.DirectionalLight(0xfff8f0, 3.0);
    sun.position.set(5, 2, 4); scene.add(sun);

    // Markers with additive blending glow
    const markerGroup = new THREE.Group();
    globe.add(markerGroup);
    const dots: THREE.Mesh[] = [], rings: THREE.Mesh[] = [];

    SITES.forEach((s, i) => {
      const p = latLonToVec3(s.lat, s.lon, 1.0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.009, 0.014, 32),
        new THREE.MeshBasicMaterial({
          color: i===0?0xD4AF37:0xffffff,
          transparent: true,
          opacity: i===0?0.7:0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.position.copy(p.clone().multiplyScalar(1.003));
      ring.lookAt(p.clone().multiplyScalar(4));
      markerGroup.add(ring); rings.push(ring);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.005, 8, 8),
        new THREE.MeshBasicMaterial({
          color: i===0?0xD4AF37:0xffffff,
          transparent: true,
          opacity: i===0?1.0:0.28,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      dot.position.copy(p.clone().multiplyScalar(1.005));
      markerGroup.add(dot); dots.push(dot);
    });

    const st = {
      camFrom: new THREE.Vector3(0,0,2.8), camTo: new THREE.Vector3(0,0,2.8),
      camCur:  new THREE.Vector3(0,0,2.8), tarFrom: new THREE.Vector3(),
      tarTo: new THREE.Vector3(), tarCur: new THREE.Vector3(),
      t: 1.0, dur: 9000, start: 0, pulse: 0,
      timer: null as ReturnType<typeof setTimeout>|null, dead: false,
    };
    stRef.current = st;
    camera.position.copy(st.camCur);
    camera.lookAt(0,0,0);

    const goTo = (idx: number, instant = false) => {
      if (st.dead) return;
      const s = SITES[idx];
      st.camFrom.copy(st.camCur); st.tarFrom.copy(st.tarCur);
      st.camTo.copy(camForSite(s.lat, s.lon));
      st.tarTo.set(0,0,0); st.t=0;
      st.dur = instant ? 1200 : 9000;
      st.start = performance.now();

      dots.forEach((d,i) => {
        (d.material as THREE.MeshBasicMaterial).color.set(i===idx?0xD4AF37:0xffffff);
        (d.material as THREE.MeshBasicMaterial).opacity = i===idx?1.0:0.25;
        (rings[i].material as THREE.MeshBasicMaterial).color.set(i===idx?0xD4AF37:0xffffff);
        (rings[i].material as THREE.MeshBasicMaterial).opacity = i===idx?0.7:0.15;
      });

      idxRef.current=idx; setSiteIdx(idx);
      setLabelOn(false); setDescOn(false); setCardOn(false); setImgOk(true);
      if (st.timer) clearTimeout(st.timer);

      const fly = instant ? 0 : 9000;

      // Simplified timing — feels natural not scripted
      st.timer = setTimeout(() => {
        if (st.dead) return;
        setLabelOn(true);
        setCardOn(true);
        st.timer = setTimeout(() => {
          if (st.dead) return;
          setDescOn(true);
          st.timer = setTimeout(() => {
            if (st.dead) return;
            setDescOn(false); setLabelOn(false); setCardOn(false);
            st.timer = setTimeout(() => {
              if (st.dead) return;
              goTo((idx+1) % SITES.length);
            }, 1200);
          }, 10000);
        }, 1200);
      }, fly);
    };

    const tick = (now: number) => {
      if (st.dead) return;
      rafRef.current = requestAnimationFrame(tick);

      if (st.t < 1.0) {
        const raw = Math.min((now-st.start)/st.dur, 1.0);
        st.t = easeInOut(raw);
        st.camCur.lerpVectors(st.camFrom, st.camTo, st.t);
        st.tarCur.lerpVectors(st.tarFrom, st.tarTo, st.t);
        if (raw >= 1.0) st.t = 1.0;
      }

      // Idle drift — camera breathes
      const drift = Math.sin(now * 0.0001) * 0.02;
      camera.position.x = st.camCur.x + drift;
      camera.position.y = st.camCur.y + drift * 0.5;
      camera.position.z = st.camCur.z;
      camera.lookAt(st.tarCur);

      // Slow rotation — planet not ball
      globe.rotation.y += 0.00004;

      const sa = now*0.000012;
      sun.position.set(Math.cos(sa)*5, 2, Math.sin(sa)*4);

      // Atmosphere time
      atmUniforms.u_time.value = now * 0.001;

      // Marker pulse
      st.pulse += 0.024;
      const pw = 0.5+0.5*Math.sin(st.pulse);
      const ar = rings[idxRef.current];
      if (ar) {
        (ar.material as THREE.MeshBasicMaterial).opacity = 0.3+pw*0.5;
        ar.scale.setScalar(1+pw*0.2);
      }

      renderer.render(scene, camera);
    };

    const s0 = SITES[0];
    const init = camForSite(s0.lat+20, s0.lon-30, 2.8);
    st.camCur.copy(init); st.camFrom.copy(init);
    camera.position.copy(init); camera.lookAt(0,0,0);
    rafRef.current = requestAnimationFrame(tick);

    const bootTimer = setTimeout(() => { setBooted(true); setTimeout(()=>goTo(0),300); }, 1000);

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth/mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      st.dead=true; clearTimeout(bootTimer);
      if (st.timer) clearTimeout(st.timer);
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => { idxRef.current = siteIdx; }, [siteIdx]);

  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background:'#020508' }}>

      {/* Globe — always visible */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        background:'radial-gradient(ellipse 82% 82% at 50% 50%, transparent 28%, rgba(2,5,8,0.78) 100%)',
      }} />
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-10"
        style={{ height:120, background:'linear-gradient(to bottom,rgba(2,5,8,0.85) 0%,transparent 100%)' }} />
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{ height:240, background:'linear-gradient(to top,rgba(2,5,8,1) 0%,transparent 100%)' }} />

      {/* Loading */}
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center"
        style={{ background:'#020508', opacity:booted?0:1, pointerEvents:booted?'none':'auto', transition:'opacity 1.6s ease' }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom:24 }}>
          <circle cx="24" cy="24" r="23" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.2" />
          <circle cx="24" cy="24" r="12" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.38" />
          <circle cx="24" cy="24" r="2.5" fill="#D4AF37" fillOpacity="0.9" />
          <line x1="24" y1="1" x2="24" y2="47" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.12" />
          <line x1="1" y1="24" x2="47" y2="24" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.12" />
          <polygon points="24,3 26,20 24,18 22,20" fill="#D4AF37" fillOpacity="0.7" />
        </svg>
        <p style={{ fontSize:8, color:'rgba(212,175,55,0.28)', letterSpacing:'0.75em', textTransform:'uppercase' }}>Loading the archive</p>
      </div>

      {/* Headline */}
      <div className="absolute z-20 pointer-events-none"
        style={{ top:'8vh', left:0, right:0, display:'flex', flexDirection:'column', alignItems:'center',
          opacity: booted&&!labelOn?1:0, transition:EASE }}>
        <p style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic', fontWeight:300,
          fontSize:'0.82rem', letterSpacing:'0.2em', color:'rgba(212,175,55,0.55)',
          textTransform:'uppercase', marginBottom:'0.5rem' }}>LithicEarth</p>
        <p style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic', fontWeight:300,
          fontSize:'clamp(1.5rem,3vw,2.4rem)', color:'rgba(255,255,255,0.88)',
          lineHeight:1.2, textAlign:'center', textShadow:'0 2px 40px rgba(0,0,0,0.9)' }}>
          Map what is buried.<br />Before it is lost forever.
        </p>
        <div style={{ width:38, height:1, marginTop:'1.2rem',
          background:'linear-gradient(to right,transparent,rgba(212,175,55,0.4),transparent)' }} />
      </div>

      {/* Site label */}
      <div className="absolute z-20 pointer-events-none"
        style={{ bottom:108, left:40, maxWidth:420, opacity:labelOn?1:0,
          transform:labelOn?'translateY(0)':'translateY(14px)',
          transition:EASE }}>
        <div style={{ width:labelOn?38:0, height:1, marginBottom:12,
          background:'linear-gradient(to right,#D4AF37,transparent)', transition:'width 2s ease 0.3s' }} />
        <p style={{ fontSize:7.5, letterSpacing:'0.6em', textTransform:'uppercase',
          color:'rgba(212,175,55,0.5)', marginBottom:10, fontWeight:300 }}>Now Viewing</p>
        <h2 style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic', fontWeight:300,
          fontSize:'clamp(1.4rem,2.2vw,1.9rem)', color:'rgba(255,255,255,0.95)', lineHeight:1.1, marginBottom:10 }}>
          {site.name}
        </h2>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:descOn?16:0, transition:'margin 0.5s ease' }}>
          <span style={{ fontSize:8, letterSpacing:'0.4em', textTransform:'uppercase', color:'rgba(255,255,255,0.3)' }}>{site.region}</span>
          <span style={{ width:1, height:8, background:'rgba(255,255,255,0.15)', display:'inline-block' }} />
          <span style={{ fontSize:8, letterSpacing:'0.18em', color:'rgba(255,255,255,0.2)' }}>{site.year}</span>
        </div>
        <p style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontWeight:300, fontSize:'0.92rem',
          lineHeight:1.72, color:'rgba(255,255,255,0.5)', maxWidth:350,
          opacity:descOn?1:0, transform:descOn?'translateY(0)':'translateY(5px)',
          transition:EASE }}>{site.desc}</p>
      </div>

      {/* Image card */}
      <div className="absolute z-20"
        style={{ right:40, bottom:108, width:260,
          opacity: cardOn&&imgOk ? 1 : 0,
          transform: cardOn ? 'translateY(0)' : 'translateY(12px)',
          transition: EASE,
          border:'0.5px solid rgba(212,175,55,0.2)',
          background:'rgba(2,5,8,0.6)',
          backdropFilter:'blur(6px)',
          pointerEvents:'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={site.img}
          src={site.img}
          alt={site.name}
          className="w-full object-cover"
          style={{ height:148, filter:'brightness(0.75) contrast(1.05) saturate(1.05)', display:'block' }}
          onError={() => setImgOk(false)}
        />
        <div style={{ padding:'10px 14px 12px' }}>
          <p style={{ fontSize:7, letterSpacing:'0.3em', textTransform:'uppercase',
            color:'rgba(212,175,55,0.4)', marginBottom:4 }}>Field Image</p>
          <p style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.6)',
            fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic' }}>{site.name}</p>
        </div>
      </div>

      {/* CTA */}
      <div className="absolute z-20"
        style={{ bottom:34, left:40, opacity:descOn?1:0,
          transform:descOn?'translateY(0)':'translateY(8px)',
          transition:'opacity 2.2s cubic-bezier(0.22,1,0.36,1) 0.8s, transform 2.2s cubic-bezier(0.22,1,0.36,1) 0.8s' }}>
        <button onClick={onSignInClick}
          style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic', fontSize:'0.8rem',
            letterSpacing:'0.14em', color:'rgba(212,175,55,0.8)',
            border:'0.5px solid rgba(212,175,55,0.3)', padding:'9px 24px',
            background:'rgba(2,5,8,0.5)', cursor:'pointer', transition:'all 0.25s ease' }}
          onMouseEnter={e=>{ const b=e.currentTarget; b.style.color='rgba(212,175,55,1)'; b.style.borderColor='rgba(212,175,55,0.55)'; b.style.background='rgba(212,175,55,0.06)'; }}
          onMouseLeave={e=>{ const b=e.currentTarget; b.style.color='rgba(212,175,55,0.8)'; b.style.borderColor='rgba(212,175,55,0.3)'; b.style.background='rgba(2,5,8,0.5)'; }}>
          Explore the Archive →
        </button>
      </div>

      {/* Progress */}
      <div className="absolute z-20 pointer-events-none"
        style={{ bottom:80, right:32, opacity:booted?1:0, transition:'opacity 1s ease 1s' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
          {SITES.map((_,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              {i===siteIdx && <span style={{ fontSize:7, color:'rgba(212,175,55,0.38)', letterSpacing:'0.1em' }}>{String(i+1).padStart(2,'0')}</span>}
              <div style={{ height:1.5, borderRadius:1,
                width:i===siteIdx?22:4,
                background:i===siteIdx?'#D4AF37':'rgba(255,255,255,0.15)',
                transition:'all 0.8s ease' }} />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
