'use client';

import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick: () => void;
}

// Unsplash sourced — free, CORS-open, stunning quality
// Each has a globe fly-in position + a full-bleed photograph
const SITES = [
  {
    name: 'Pyramids of Giza',
    region: 'Egypt',
    year: 'c. 2560 BCE',
    lat: 29.979, lon: 31.134,
    camDist: 1.09, tiltLat: 5, tiltLon: -4,
    img: 'https://images.unsplash.com/photo-1539768942893-daf0b12da7c5?w=1920&q=90&fit=crop',
    desc: 'The last surviving wonder of the ancient world — aligned to within 0.05° of true north.',
  },
  {
    name: 'Grand Canyon',
    region: 'Arizona, USA',
    year: '5–6 Million Years',
    lat: 36.107, lon: -112.113,
    camDist: 1.10, tiltLat: 5, tiltLon: 3,
    img: 'https://images.unsplash.com/photo-1615551043360-33de8b5f410c?w=1920&q=90&fit=crop',
    desc: '277 miles of geological record — 1.8 billion years of Earth\'s history carved by the Colorado River.',
  },
  {
    name: 'Machu Picchu',
    region: 'Peru',
    year: 'c. 1450 CE',
    lat: -13.163, lon: -72.545,
    camDist: 1.08, tiltLat: 4, tiltLon: 3,
    img: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?w=1920&q=90&fit=crop',
    desc: 'Built at 2,430m — Inca stonework so precise no mortar was needed, hidden in clouds for 400 years.',
  },
  {
    name: 'Angkor Wat',
    region: 'Cambodia',
    year: 'c. 1113 CE',
    lat: 13.412, lon: 103.867,
    camDist: 1.08, tiltLat: 3, tiltLon: -3,
    img: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=90&fit=crop',
    desc: 'The world\'s largest religious monument — 400 square kilometers of temple swallowed by jungle.',
  },
  {
    name: 'Stonehenge',
    region: 'England',
    year: 'c. 3000 BCE',
    lat: 51.179, lon: -1.826,
    camDist: 1.07, tiltLat: 3, tiltLon: -2,
    img: 'https://images.unsplash.com/photo-1599833975787-5c143f373c30?w=1920&q=90&fit=crop',
    desc: 'Bluestones hauled 200 miles from Wales. A solar calendar built across five centuries of human effort.',
  },
  {
    name: 'Petra',
    region: 'Jordan',
    year: 'c. 300 BCE',
    lat: 30.328, lon: 35.444,
    camDist: 1.08, tiltLat: 4, tiltLon: 3,
    img: 'https://images.unsplash.com/photo-1563177972-2a7f0d7d1b5b?w=1920&q=90&fit=crop',
    desc: 'The rose-red city — 30,000 tombs and temples carved directly into Jordanian sandstone cliffs.',
  },
  {
    name: 'Easter Island',
    region: 'Rapa Nui, Chile',
    year: 'c. 1250–1500 CE',
    lat: -27.112, lon: -109.349,
    camDist: 1.09, tiltLat: 4, tiltLon: -3,
    img: 'https://images.unsplash.com/photo-1616431588209-5aee4e9a4cb1?w=1920&q=90&fit=crop',
    desc: '900 monolithic moai — some weighing 80 tons — moved miles across the island by a civilization still not fully understood.',
  },
  {
    name: 'Göbekli Tepe',
    region: 'Turkey',
    year: 'c. 9600 BCE',
    lat: 37.223, lon: 38.922,
    camDist: 1.08, tiltLat: 4, tiltLon: 3,
    img: 'https://images.unsplash.com/photo-1569383746724-6f1b882b8f46?w=1920&q=90&fit=crop',
    desc: 'Built 6,000 years before Stonehenge — a temple complex that rewrote everything we thought we knew about human civilization.',
  },
  {
    name: 'Chichen Itza',
    region: 'Mexico',
    year: 'c. 600 CE',
    lat: 20.684, lon: -88.568,
    camDist: 1.08, tiltLat: 3.5, tiltLon: -2.5,
    img: 'https://images.unsplash.com/photo-1518638150340-f706e86654de?w=1920&q=90&fit=crop',
    desc: 'El Castillo\'s 365 steps encode the solar year. At equinox, a serpent of shadow descends the pyramid face.',
  },
  {
    name: 'Mount Everest',
    region: 'Nepal / Tibet',
    year: '50–60 Million Years',
    lat: 27.988, lon: 86.925,
    camDist: 1.09, tiltLat: 5, tiltLon: 3,
    img: 'https://images.unsplash.com/photo-1516638022313-53fc529f2d45?w=1920&q=90&fit=crop',
    desc: '8,849 meters — the collision of continents made visible. Still rising 5mm every year.',
  },
] as const;

function latLonToVec3(lat: number, lon: number, r = 1.0): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}
const easeInOutQuart = (t: number) => t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2,4)/2;
const easeOutCubic   = (t: number) => 1 - Math.pow(1-t, 3);

export function Hero({ onSignInClick }: HeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const S        = useRef<any>({});

  const [booted,       setBooted]       = useState(false);
  const [siteIdx,      setSiteIdx]      = useState(0);
  const [labelVisible, setLabelVisible] = useState(false);
  const [photoVisible, setPhotoVisible] = useState(false);
  const [descVisible,  setDescVisible]  = useState(false);
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
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(40, W/H, 0.001, 200);

    // Stars
    const starPos = new Float32Array(8000*3);
    for (let i=0;i<8000;i++) {
      const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1), r=50+Math.random()*30;
      starPos[i*3]=r*Math.sin(ph)*Math.cos(th); starPos[i*3+1]=r*Math.sin(ph)*Math.sin(th); starPos[i*3+2]=r*Math.cos(ph);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color:0xffffff, size:0.065, sizeAttenuation:true, transparent:true, opacity:0.6 })));

    // Globe textures
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const onLoad = () => { loaded++; setProgress(Math.round(loaded/3*100)); };
    const dayTex   = loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg', onLoad);
    dayTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const nightTex = loader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg', onLoad);
    nightTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bumpTex  = loader.load('https://unpkg.com/three-globe/example/img/earth-topology.png', onLoad);
    bumpTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const globeMat = new THREE.ShaderMaterial({
      uniforms: { dayTex:{value:dayTex}, nightTex:{value:nightTex}, sunDir:{value:new THREE.Vector3(1,0.3,0.5).normalize()} },
      vertexShader:`
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
        void main(){
          vUv=uv;
          vNormal=normalize((modelMatrix*vec4(normal,0.0)).xyz);
          vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader:`
        uniform sampler2D dayTex,nightTex; uniform vec3 sunDir;
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
        void main(){
          vec3 day=texture2D(dayTex,vUv).rgb;
          vec3 night=texture2D(nightTex,vUv).rgb*1.6;
          float sun=dot(normalize(vNormal),normalize(sunDir));
          float mix_=smoothstep(-0.12,0.42,sun);
          vec3 col=mix(night,day,mix_);
          vec3 vd=normalize(cameraPosition-vWorldPos);
          vec3 hv=normalize(normalize(sunDir)+vd);
          col+=pow(max(dot(vNormal,hv),0.0),90.0)*0.12*mix_;
          float rim=1.0-max(dot(normalize(vNormal),vd),0.0);
          col*=1.0-rim*0.15;
          gl_FragColor=vec4(col,1.0);
        }`,
    });

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1,128,128), globeMat);
    scene.add(globe);

    // Atmosphere glow
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.021,64,64), new THREE.ShaderMaterial({
      uniforms:{c:{value:new THREE.Color(0x1133aa)}},
      vertexShader:`varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform vec3 c; varying vec3 vN;
        void main(){float i=pow(1.0-abs(dot(vN,normalize(cameraPosition-(modelMatrix*vec4(0,0,0,1)).xyz))),4.2);gl_FragColor=vec4(c*i*0.5,i*0.38);}`,
      side:THREE.FrontSide, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false,
    })));

    // Markers
    const markerGroup = new THREE.Group(); scene.add(markerGroup);
    const dots: THREE.Mesh[] = [];
    SITES.forEach((s,i)=>{
      const d = new THREE.Mesh(
        new THREE.SphereGeometry(0.0016,8,8),
        new THREE.MeshBasicMaterial({color:i===0?0xD4AF37:0xffffff,transparent:true,opacity:i===0?0.9:0.18}),
      );
      d.position.copy(latLonToVec3(s.lat,s.lon,1.003));
      markerGroup.add(d); dots.push(d);
    });

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.0028,0.0038,32),
      new THREE.MeshBasicMaterial({color:0xD4AF37,transparent:true,opacity:0.7,side:THREE.DoubleSide}),
    );
    const r0 = latLonToVec3(SITES[0].lat,SITES[0].lon,1.004);
    ring.position.copy(r0); ring.lookAt(r0.clone().multiplyScalar(2));
    markerGroup.add(ring);

    scene.add(new THREE.AmbientLight(0xffffff,0.04));
    const sun = new THREE.DirectionalLight(0xfff6e0,2.4); sun.position.set(5,2,3); scene.add(sun);

    const st = {
      renderer,scene,camera,globe,globeMat,sun,dots,markerGroup,ring,
      camFrom:new THREE.Vector3(0,0,3), camTo:new THREE.Vector3(0,0,3),
      tarFrom:new THREE.Vector3(0,0,0), tarTo:new THREE.Vector3(0,0,0),
      camCur:new THREE.Vector3(0,0,3), tarCur:new THREE.Vector3(0,0,0),
      animStart:0, animDur:4200, animT:1.0,
      ringPulse:0, timer:null as any, dead:false,
    };
    S.current = st;

    const goTo = (idx: number, instant=false) => {
      if (st.dead) return;
      const s = SITES[idx];
      const camPos = latLonToVec3(s.lat+s.tiltLat, s.lon+s.tiltLon, s.camDist);
      const tarPos = latLonToVec3(s.lat, s.lon, 1.0);

      st.camFrom=st.camCur.clone(); st.tarFrom=st.tarCur.clone();
      st.camTo=camPos; st.tarTo=tarPos;
      st.animStart=performance.now(); st.animDur=instant?500:4200; st.animT=0;

      st.dots.forEach((d:THREE.Mesh,i:number)=>{
        (d.material as THREE.MeshBasicMaterial).color.set(i===idx?0xD4AF37:0xffffff);
        (d.material as THREE.MeshBasicMaterial).opacity=i===idx?0.9:0.15;
      });
      const rp = latLonToVec3(s.lat,s.lon,1.004);
      st.ring.position.copy(rp); st.ring.lookAt(rp.clone().multiplyScalar(2));

      setSiteIdx(idx);
      setLabelVisible(false);
      setPhotoVisible(false);
      setDescVisible(false);

      if (st.timer) clearTimeout(st.timer);

      // Sequence: fly arrives (~4.2s) → label in → 2s → photo crossfade → 2s → desc → 8s → next
      st.timer = setTimeout(()=>{
        if(st.dead) return;
        setLabelVisible(true);
        st.timer = setTimeout(()=>{
          if(st.dead) return;
          setPhotoVisible(true);
          st.timer = setTimeout(()=>{
            if(st.dead) return;
            setDescVisible(true);
            st.timer = setTimeout(()=>{
              if(st.dead) return;
              setDescVisible(false); setPhotoVisible(false); setLabelVisible(false);
              st.timer = setTimeout(()=>{ if(!st.dead) goTo((idx+1)%SITES.length); }, 900);
            }, 9000);
          }, 1200);
        }, instant?400:2000);
      }, instant?700:4400);
    };

    let raf: number;
    const tick = (now: number) => {
      if (st.dead) return;
      raf = requestAnimationFrame(tick);

      if (st.animT < 1.0) {
        const raw = Math.min((now-st.animStart)/st.animDur, 1.0);
        st.animT = raw >= 1.0 ? 1.0 : easeInOutQuart(raw);
        const fN=st.camFrom.clone().normalize(), tN=st.camTo.clone().normalize();
        const ang=fN.angleTo(tN);
        if (ang<0.0001) {
          st.camCur.lerpVectors(st.camFrom,st.camTo,st.animT);
        } else {
          const s=Math.sin(ang), wa=Math.sin((1-st.animT)*ang)/s, wb=Math.sin(st.animT*ang)/s;
          const slp=fN.clone().multiplyScalar(wa).addScaledVector(tN,wb);
          const d=st.camFrom.length()+(st.camTo.length()-st.camFrom.length())*st.animT+Math.sin(st.animT*Math.PI)*0.14;
          st.camCur=slp.normalize().multiplyScalar(d);
        }
        st.tarCur.lerpVectors(st.tarFrom,st.tarTo,easeOutCubic(Math.min((now-st.animStart)/st.animDur,1.0)));
      }

      camera.position.copy(st.camCur);
      camera.lookAt(st.tarCur);

      st.ringPulse+=0.022;
      const p=0.5+0.5*Math.sin(st.ringPulse);
      (st.ring.material as THREE.MeshBasicMaterial).opacity=0.28+p*0.62;
      st.ring.scale.setScalar(1+p*0.28);

      if (st.animT>=1.0) { globe.rotation.y+=0.00009; markerGroup.rotation.y+=0.00009; }

      const sa=now*0.000020;
      (st.globeMat.uniforms.sunDir.value as THREE.Vector3).set(Math.cos(sa),0.22,Math.sin(sa)).normalize();
      st.sun.position.set(Math.cos(sa)*5,2,Math.sin(sa)*5);

      renderer.render(scene,camera);
    };
    raf = requestAnimationFrame(tick);

    // Boot: wide orbital view, then dive
    const s0 = SITES[0];
    const startCam = latLonToVec3(s0.lat+22, s0.lon-18, 2.5);
    st.camCur.copy(startCam); st.tarCur.copy(latLonToVec3(s0.lat,s0.lon,1.0));
    camera.position.copy(startCam); camera.lookAt(st.tarCur);

    const boot = setTimeout(()=>{ setBooted(true); setTimeout(()=>goTo(0), 600); }, 1700);

    const onResize = () => {
      if(!mount) return;
      camera.aspect=mount.clientWidth/mount.clientHeight;
      camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth,mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return ()=>{
      st.dead=true; clearTimeout(boot);
      if(st.timer) clearTimeout(st.timer);
      cancelAnimationFrame(raf); window.removeEventListener('resize',onResize);
      renderer.dispose();
      if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">

      {/* Globe */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        style={{ opacity: photoVisible ? 0 : 1, transition: 'opacity 1.8s ease' }}
      />

      {/* Site photograph */}
      <div
        className="absolute inset-0"
        style={{ opacity: photoVisible ? 1 : 0, transition: 'opacity 1.8s ease' }}
      >
        {/* Preload next image silently */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={site.img}
          src={site.img}
          alt={site.name}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: 'brightness(0.78) contrast(1.1) saturate(1.08)',
            transform: photoVisible ? 'scale(1.06)' : 'scale(1.0)',
            transition: 'transform 14s ease',
          }}
        />
        {/* Cinematic overlays */}
        <div className="absolute inset-0" style={{background:'linear-gradient(to bottom,rgba(0,0,0,0.42) 0%,transparent 25%,transparent 55%,rgba(0,0,0,0.88) 100%)'}}/>
        <div className="absolute inset-0" style={{background:'linear-gradient(to right,rgba(0,0,0,0.28) 0%,transparent 50%)'}}/>
        {/* Film grain overlay */}
        <div className="absolute inset-0 opacity-[0.035]" style={{
          backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize:'256px 256px',
        }}/>
      </div>

      {/* Loading */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
        style={{ opacity:booted?0:1, pointerEvents:booted?'none':'auto', transition:'opacity 1.6s ease' }}
      >
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" className="mb-7">
          <circle cx="17" cy="17" r="16" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.25"/>
          <circle cx="17" cy="17" r="9.5" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.45"/>
          <circle cx="17" cy="17" r="2" fill="#D4AF37" fillOpacity="0.8"/>
          <line x1="17" y1="1" x2="17" y2="33" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.18"/>
          <line x1="1" y1="17" x2="33" y2="17" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.18"/>
          <circle cx="17" cy="1" r="1" fill="#D4AF37" fillOpacity="0.4"/>
          <circle cx="17" cy="33" r="1" fill="#D4AF37" fillOpacity="0.4"/>
          <circle cx="1" cy="17" r="1" fill="#D4AF37" fillOpacity="0.4"/>
          <circle cx="33" cy="17" r="1" fill="#D4AF37" fillOpacity="0.4"/>
        </svg>
        <div className="w-20 h-px bg-white/6 relative overflow-hidden mb-5">
          <div className="absolute inset-y-0 left-0 bg-[#D4AF37]/45 transition-all duration-500" style={{width:`${progress}%`}}/>
        </div>
        <p className="text-[8px] text-[#D4AF37]/30 tracking-[0.7em] uppercase font-light">
          Preparing the archive
        </p>
      </div>

      {/* Globe vignette */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{
          background:'radial-gradient(ellipse 88% 88% at 50% 50%, transparent 32%, rgba(0,0,0,0.62) 100%)',
          opacity: photoVisible ? 0 : 1, transition: 'opacity 1.8s ease',
        }}
      />

      {/* Top bar gradient */}
      <div className="absolute top-0 left-0 right-0 h-28 pointer-events-none z-10"
        style={{background:'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 100%)'}}/>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{height:220,background:'linear-gradient(to top,rgba(0,0,0,0.92) 0%,transparent 100%)'}}/>

      {/* ──── Site label ──── */}
      <div
        className="absolute bottom-24 left-10 z-20 pointer-events-none"
        style={{
          maxWidth: 380,
          opacity: labelVisible ? 1 : 0,
          transform: labelVisible ? 'translateY(0px)' : 'translateY(16px)',
          transition: 'opacity 1.4s ease, transform 1.4s ease',
        }}
      >
        {/* Gold rule */}
        <div style={{
          height: 1, marginBottom: 11,
          background: 'linear-gradient(to right, #D4AF37, transparent)',
          width: labelVisible ? 34 : 0,
          transition: 'width 2s ease 0.4s',
        }}/>

        <p className="text-[8px] text-[#D4AF37]/48 tracking-[0.6em] uppercase font-light mb-2.5">
          Now Viewing
        </p>

        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontStyle: 'italic', fontWeight: 300,
          fontSize: '1.55rem', letterSpacing: '0.025em',
          color: 'rgba(255,255,255,0.94)', lineHeight: 1.1,
          marginBottom: 8,
        }}>
          {site.name}
        </p>

        <div className="flex items-center gap-2.5" style={{marginBottom: descVisible ? 16 : 0, transition:'margin 0.6s ease'}}>
          <span className="text-[8.5px] text-white/28 tracking-[0.38em] uppercase font-light">{site.region}</span>
          <span style={{width:1,height:9,background:'rgba(255,255,255,0.11)',display:'inline-block'}}/>
          <span className="text-[8.5px] text-white/20 tracking-[0.2em] font-light">{site.year}</span>
        </div>

        {/* Description — fades in after photo appears */}
        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontWeight: 300, fontSize: '0.9rem',
          lineHeight: 1.7, letterSpacing: '0.01em',
          color: 'rgba(255,255,255,0.48)',
          maxWidth: 340,
          opacity: descVisible ? 1 : 0,
          transform: descVisible ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 1.6s ease, transform 1.6s ease',
        }}>
          {site.desc}
        </p>
      </div>

      {/* ──── Progress bar — right side vertical ──── */}
      <div
        className="absolute right-10 z-20 pointer-events-none flex flex-col gap-[6px] items-end"
        style={{ bottom: 96, opacity: booted ? 1 : 0, transition: 'opacity 1s ease' }}
      >
        {SITES.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {i === siteIdx && (
              <span className="text-[7px] text-[#D4AF37]/38 tracking-widest font-light">
                {String(i+1).padStart(2,'0')}
              </span>
            )}
            <div style={{
              height: '1.5px', borderRadius: 1,
              width: i === siteIdx ? 20 : 4,
              background: i === siteIdx ? '#D4AF37' : 'rgba(255,255,255,0.13)',
              transition: 'all 0.8s ease',
            }}/>
          </div>
        ))}
      </div>

      {/* ──── Manifesto — visible during globe flyover ──── */}
      <div
        className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        style={{
          opacity: booted && !labelVisible ? 0.48 : 0,
          transition: 'opacity 2.5s ease',
        }}
      >
        <p style={{
          fontFamily: '"Cormorant Garamond", "Georgia", serif',
          fontStyle: 'italic', fontWeight: 300,
          fontSize: '1.05rem', letterSpacing: '0.06em',
          color: 'rgba(255,255,255,0.65)',
          textAlign: 'center', lineHeight: 1.8,
          textShadow: '0 1px 20px rgba(0,0,0,0.5)',
        }}>
          Map what is buried<br/>before it is lost forever.
        </p>
      </div>

      {/* ──── Scroll hint ──── */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2"
        style={{ opacity: descVisible ? 0.6 : 0, transition: 'opacity 2s ease 0.8s' }}
      >
        <p className="text-[7.5px] text-white/18 tracking-[0.5em] uppercase font-light">
          Scroll to explore
        </p>
        <div style={{
          width: 1, height: 24,
          background: 'linear-gradient(to bottom, rgba(212,175,55,0.35), transparent)',
        }}/>
      </div>

    </div>
  );
}
