'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick?: () => void;
}

const SITES = [
  { name: 'Göbekli Tepe', region: 'Turkey', year: 'c. 9600 BCE', lat: 37.22, lon: 38.92 },
  { name: 'Pyramids of Giza', region: 'Egypt', year: 'c. 2560 BCE', lat: 29.98, lon: 31.13 },
  { name: 'Machu Picchu', region: 'Peru', year: 'c. 1450 CE', lat: -13.16, lon: -72.54 },
  { name: 'Angkor Wat', region: 'Cambodia', year: 'c. 1113 CE', lat: 13.41, lon: 103.87 },
  { name: 'Stonehenge', region: 'England', year: 'c. 3000 BCE', lat: 51.18, lon: -1.83 },
  { name: 'Petra', region: 'Jordan', year: 'c. 300 BCE', lat: 30.33, lon: 35.44 },
  { name: 'Chichen Itza', region: 'Mexico', year: 'c. 600 CE', lat: 20.68, lon: -88.57 },
  { name: 'Easter Island', region: 'Rapa Nui', year: 'c. 1250 CE', lat: -27.11, lon: -109.35 },
  { name: 'Mount Everest', region: 'Nepal / Tibet', year: '50 Million Years', lat: 27.99, lon: 86.93 },
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

function camForSite(lat: number, lon: number, dist = 3.2): THREE.Vector3 {
  return latLonToVec3(Math.min(40, lat + 5), lon - 5, dist);
}

const ease = (t: number) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;

export function Hero({ onSignInClick }: HeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number>(0);
  const stRef    = useRef<any>(null);
  const idxRef   = useRef(0);

  const [booted,  setBooted]  = useState(false);
  const [siteIdx, setSiteIdx] = useState(0);
  const [labelOn, setLabelOn] = useState(false);

  const site = SITES[siteIdx];

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
      const N = 8000, p = new Float32Array(N*3);
      for (let i = 0; i < N; i++) {
        const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), r = 40+Math.random()*25;
        p[i*3]=r*Math.sin(ph)*Math.cos(th); p[i*3+1]=r*Math.sin(ph)*Math.sin(th); p[i*3+2]=r*Math.cos(ph);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({
        color:0xffffff, size:0.05, sizeAttenuation:true, transparent:true, opacity:0.55
      })));
    }

    // Globe
    const globeGeo = new THREE.SphereGeometry(1, 128, 64);
    const globeMat = new THREE.MeshPhongMaterial({ color:0x1a3d5c, specular:0x224466, shininess:18 });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    const loader = new THREE.TextureLoader();
    ['https://unpkg.com/three-globe@2.31.2/example/img/earth-blue-marble.jpg',
     'https://cdn.jsdelivr.net/npm/three-globe@2.31.2/example/img/earth-blue-marble.jpg'
    ].reduce((done, url) => {
      if (done) return true;
      loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        globeMat.map = t; globeMat.color.set(0xffffff);
        globeMat.needsUpdate = true;
      });
      return true;
    }, false);

    // Atmosphere
    const atmU = { u_time: { value: 0.0 } };
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 32), new THREE.ShaderMaterial({
      uniforms: atmU,
      vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float u_time; varying vec3 vN; void main(){ float p=0.9+0.1*sin(u_time*0.5); float i=pow(0.7-dot(vN,vec3(0,0,1)),4.0)*p; gl_FragColor=vec4(0.1,0.4,0.9,1.0)*i*0.6; }`,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    })));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const sun = new THREE.DirectionalLight(0xfff8f0, 3.0);
    sun.position.set(5, 2, 4); scene.add(sun);

    // Single active marker only
    const markerGroup = new THREE.Group();
    globe.add(markerGroup);
    const dots: THREE.Mesh[] = [], rings: THREE.Mesh[] = [];

    SITES.forEach((s, i) => {
      const p = latLonToVec3(s.lat, s.lon, 1.0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.009, 0.014, 32),
        new THREE.MeshBasicMaterial({
          color:0xD4AF37, transparent:true, opacity:i===0?0.5:0.0,
          side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending,
        }),
      );
      ring.position.copy(p.clone().multiplyScalar(1.003));
      ring.lookAt(p.clone().multiplyScalar(4));
      markerGroup.add(ring); rings.push(ring);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.004, 8, 8),
        new THREE.MeshBasicMaterial({
          color:0xD4AF37, transparent:true, opacity:i===0?0.85:0.0,
          depthWrite:false, blending:THREE.AdditiveBlending,
        }),
      );
      dot.position.copy(p.clone().multiplyScalar(1.005));
      markerGroup.add(dot); dots.push(dot);
    });

    const st = {
      camFrom: new THREE.Vector3(0,0,3.2),
      camTo:   new THREE.Vector3(0,0,3.2),
      camCur:  new THREE.Vector3(0,0,3.2),
      t:1.0, dur:14000, start:0, pulse:0,
      timer: null as ReturnType<typeof setTimeout>|null,
      dead: false,
    };
    stRef.current = st;
    camera.position.copy(st.camCur);
    camera.lookAt(0,0,0);

    const goTo = (idx: number, instant = false) => {
      if (st.dead) return;
      const s = SITES[idx];
      st.camFrom.copy(st.camCur);
      st.camTo.copy(camForSite(s.lat, s.lon));
      st.t=0; st.dur=instant?1500:14000; st.start=performance.now();

      // Only active marker visible
      dots.forEach((d,i)  => (d.material  as THREE.MeshBasicMaterial).opacity = i===idx?0.85:0.0);
      rings.forEach((r,i) => (r.material as THREE.MeshBasicMaterial).opacity = i===idx?0.5:0.0);

      idxRef.current=idx; setSiteIdx(idx); setLabelOn(false);
      if (st.timer) clearTimeout(st.timer);

      // Label fades in after camera settles
      st.timer = setTimeout(() => {
        if (st.dead) return;
        setLabelOn(true);
        // Next site after hold
        st.timer = setTimeout(() => {
          if (st.dead) return;
          setLabelOn(false);
          st.timer = setTimeout(() => {
            if (st.dead) return;
            goTo((idx+1) % SITES.length);
          }, 1000);
        }, 12000);
      }, instant ? 800 : 14000);
    };

    const tick = (now: number) => {
      if (st.dead) return;
      rafRef.current = requestAnimationFrame(tick);

      if (st.t < 1.0) {
        const raw = Math.min((now-st.start)/st.dur, 1.0);
        st.t = ease(raw);
        st.camCur.lerpVectors(st.camFrom, st.camTo, st.t);
        if (raw >= 1.0) st.t = 1.0;
      }

      const drift = Math.sin(now * 0.00008) * 0.012;
      camera.position.x = st.camCur.x + drift;
      camera.position.y = st.camCur.y + drift * 0.3;
      camera.position.z = st.camCur.z;
      camera.lookAt(0, 0, 0);

      globe.rotation.y += 0.00003;
      sun.position.set(Math.cos(now*0.000010)*5, 2, Math.sin(now*0.000010)*4);
      atmU.u_time.value = now * 0.001;

      st.pulse += 0.016;
      const pw = 0.5+0.5*Math.sin(st.pulse);
      const ar = rings[idxRef.current];
      if (ar) {
        (ar.material as THREE.MeshBasicMaterial).opacity = 0.2+pw*0.35;
        ar.scale.setScalar(1+pw*0.12);
      }

      renderer.render(scene, camera);
    };

    const s0 = SITES[0];
    const init = camForSite(s0.lat+8, s0.lon-15, 3.2);
    st.camCur.copy(init); st.camFrom.copy(init);
    camera.position.copy(init); camera.lookAt(0,0,0);
    rafRef.current = requestAnimationFrame(tick);

    const bootTimer = setTimeout(() => {
      setBooted(true);
      setTimeout(() => goTo(0), 400);
    }, 1000);

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
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background:'#020508' }}>

      <div ref={mountRef} className="absolute inset-0" />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        background:'radial-gradient(ellipse 78% 78% at 50% 50%, transparent 32%, rgba(2,5,8,0.75) 100%)',
      }} />
      <div className="absolute top-0 inset-x-0 pointer-events-none z-10"
        style={{ height:160, background:'linear-gradient(to bottom,rgba(2,5,8,0.92) 0%,transparent 100%)' }} />
      <div className="absolute bottom-0 inset-x-0 pointer-events-none z-10"
        style={{ height:280, background:'linear-gradient(to top,rgba(2,5,8,1) 0%,transparent 100%)' }} />

      {/* Loading */}
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center"
        style={{ background:'#020508', opacity:booted?0:1, pointerEvents:booted?'none':'auto', transition:'opacity 1.8s ease' }}>
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none" style={{ marginBottom:20 }}>
          <circle cx="24" cy="24" r="23" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.18" />
          <circle cx="24" cy="24" r="12" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.32" />
          <circle cx="24" cy="24" r="2.5" fill="#D4AF37" fillOpacity="0.85" />
          <polygon points="24,3 26,20 24,18 22,20" fill="#D4AF37" fillOpacity="0.6" />
        </svg>
        <p style={{ fontSize:7, color:'rgba(212,175,55,0.22)', letterSpacing:'0.8em', textTransform:'uppercase' }}>
          Loading
        </p>
      </div>

      {/* Main headline — always visible after boot, hides when label shows */}
      <div className="absolute inset-x-0 z-20 pointer-events-none flex flex-col items-center"
        style={{ top:'9vh', opacity: booted&&!labelOn?1:0,
          transition:'opacity 2.4s cubic-bezier(0.22,1,0.36,1)' }}>
        <p style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic',
          fontSize:'0.75rem', letterSpacing:'0.28em', color:'rgba(212,175,55,0.4)',
          textTransform:'uppercase', marginBottom:'0.7rem' }}>LithicEarth</p>
        <h1 style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic', fontWeight:300,
          fontSize:'clamp(1.8rem,3.2vw,2.8rem)', color:'rgba(255,255,255,0.86)',
          lineHeight:1.18, textAlign:'center', textShadow:'0 2px 48px rgba(0,0,0,0.95)',
          margin:0 }}>
          Map what is buried.<br />Before it is lost forever.
        </h1>
        <div style={{ width:32, height:'0.5px', marginTop:'1.6rem',
          background:'linear-gradient(to right,transparent,rgba(212,175,55,0.3),transparent)' }} />
        <button
          onClick={onSignInClick}
          style={{ pointerEvents:'auto', marginTop:'2rem',
            fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic',
            fontSize:'0.76rem', letterSpacing:'0.16em',
            color:'rgba(212,175,55,0.65)', border:'0.5px solid rgba(212,175,55,0.22)',
            padding:'10px 30px', background:'rgba(2,5,8,0.35)',
            cursor:'pointer', transition:'all 0.35s ease' }}
          onMouseEnter={e=>{ const b=e.currentTarget; b.style.color='rgba(212,175,55,0.95)'; b.style.borderColor='rgba(212,175,55,0.45)'; b.style.background='rgba(212,175,55,0.05)'; }}
          onMouseLeave={e=>{ const b=e.currentTarget; b.style.color='rgba(212,175,55,0.65)'; b.style.borderColor='rgba(212,175,55,0.22)'; b.style.background='rgba(2,5,8,0.35)'; }}>
          Explore the Archive →
        </button>
      </div>

      {/* Site label — centered, calm, minimal */}
      <div className="absolute inset-x-0 z-20 pointer-events-none flex flex-col items-center"
        style={{ top:'40vh',
          opacity: labelOn?1:0,
          transform: labelOn?'translateY(0)':'translateY(10px)',
          transition:'opacity 2.4s cubic-bezier(0.22,1,0.36,1), transform 2.4s cubic-bezier(0.22,1,0.36,1)' }}>
        <p style={{ fontSize:7, letterSpacing:'0.6em', textTransform:'uppercase',
          color:'rgba(212,175,55,0.35)', marginBottom:16, fontWeight:300 }}>Now Viewing</p>
        <h2 style={{ fontFamily:'"Cormorant Garamond",Georgia,serif', fontStyle:'italic', fontWeight:300,
          fontSize:'clamp(1.8rem,3vw,2.4rem)', color:'rgba(255,255,255,0.88)',
          lineHeight:1.1, textAlign:'center', margin:0,
          textShadow:'0 2px 48px rgba(0,0,0,0.98)' }}>
          {site.name}
        </h2>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:14 }}>
          <span style={{ fontSize:7.5, letterSpacing:'0.4em', textTransform:'uppercase',
            color:'rgba(255,255,255,0.22)' }}>{site.region}</span>
          <span style={{ width:1, height:7, background:'rgba(255,255,255,0.1)', display:'inline-block' }} />
          <span style={{ fontSize:7.5, letterSpacing:'0.2em', color:'rgba(255,255,255,0.16)' }}>{site.year}</span>
        </div>
      </div>

      {/* Progress — right edge, barely visible */}
      <div className="absolute z-20 pointer-events-none"
        style={{ bottom:72, right:24, opacity:booted?0.6:0, transition:'opacity 1.2s ease 1.5s' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
          {SITES.map((_,i) => (
            <div key={i} style={{ height:1, borderRadius:1,
              width: i===siteIdx?16:2.5,
              background: i===siteIdx?'rgba(212,175,55,0.5)':'rgba(255,255,255,0.06)',
              transition:'all 1.2s ease' }} />
          ))}
        </div>
      </div>

    </div>
  );
}
