'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

interface HeroProps {
  onSignInClick: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Each site has:
//   - Globe camera position (regional overview on the 3D sphere)
//   - A high-res satellite/photo URL for the close-up reveal
//   - Wikimedia Commons public domain aerials & NASA imagery
// ─────────────────────────────────────────────────────────────────────────────
const SITES = [
  {
    name: 'Pyramids of Giza',
    region: 'Egypt',
    year: 'c. 2560 BCE',
    lat: 29.979, lon: 31.134,
    camDist: 1.09, tiltLat: 5, tiltLon: -4,
    // NASA/USGS Landsat — public domain
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Giza-pyramids.JPG/1280px-Giza-pyramids.JPG',
    imageCredit: 'NASA / Wikimedia Commons',
    description: 'The last surviving wonder of the ancient world — aligned to within 0.05° of true north.',
  },
  {
    name: 'Grand Canyon',
    region: 'Arizona, USA',
    year: '5–6 Million Years',
    lat: 36.107, lon: -112.113,
    camDist: 1.10, tiltLat: 5, tiltLon: 3,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Dawn_on_the_S_rim_of_the_Grand_Canyon_%288645178272%29.jpg/1280px-Dawn_on_the_S_rim_of_the_Grand_Canyon_%288645178272%29.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: '277 miles of geological record — 1.8 billion years of Earth\'s history carved by the Colorado River.',
  },
  {
    name: 'Machu Picchu',
    region: 'Peru',
    year: 'c. 1450 CE',
    lat: -13.163, lon: -72.545,
    camDist: 1.08, tiltLat: 4, tiltLon: 3,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Machu_Picchu%2C_Peru.jpg/1280px-Machu_Picchu%2C_Peru.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'Built at 2,430m — the Inca citadel whose stones fit so precisely no mortar was needed.',
  },
  {
    name: 'Göbekli Tepe',
    region: 'Turkey',
    year: 'c. 9600 BCE',
    lat: 37.223, lon: 38.922,
    camDist: 1.08, tiltLat: 4, tiltLon: 3,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/G%C3%B6bekli_Tepe%2C_Urfa.jpg/1280px-G%C3%B6bekli_Tepe%2C_Urfa.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'The oldest known megalithic structure — built 6,000 years before Stonehenge, rewriting human prehistory.',
  },
  {
    name: 'Angkor Wat',
    region: 'Cambodia',
    year: 'c. 1113 CE',
    lat: 13.412, lon: 103.867,
    camDist: 1.08, tiltLat: 3, tiltLon: -3,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Angkor_Wat_aerial_view.jpg/1280px-Angkor_Wat_aerial_view.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'The world\'s largest religious monument — 400 square kilometers of temple complex in the Cambodian jungle.',
  },
  {
    name: 'Stonehenge',
    region: 'England',
    year: 'c. 3000 BCE',
    lat: 51.179, lon: -1.826,
    camDist: 1.07, tiltLat: 3, tiltLon: -2,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Stonehenge2007_07_30.jpg/1280px-Stonehenge2007_07_30.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'Bluestones hauled 200 miles from Wales — a solar and lunar calendar built across centuries.',
  },
  {
    name: 'Petra',
    region: 'Jordan',
    year: 'c. 300 BCE',
    lat: 30.328, lon: 35.444,
    camDist: 1.08, tiltLat: 4, tiltLon: 3,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Treasury_petra_crop.jpg/854px-Treasury_petra_crop.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'The rose-red city — 30,000 tombs and temples carved directly into Jordanian sandstone cliffs.',
  },
  {
    name: 'Easter Island',
    region: 'Rapa Nui, Chile',
    year: 'c. 1250–1500 CE',
    lat: -27.112, lon: -109.349,
    camDist: 1.09, tiltLat: 4, tiltLon: -3,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Moai_Rano_raraku.jpg/1280px-Moai_Rano_raraku.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: '900 monolithic moai — some weighing 80 tons — moved miles across the island by a civilization still not fully understood.',
  },
  {
    name: 'Chichen Itza',
    region: 'Mexico',
    year: 'c. 600 CE',
    lat: 20.684, lon: -88.568,
    camDist: 1.08, tiltLat: 3.5, tiltLon: -2.5,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/ChichenItza_El_Castillo.jpg/1280px-ChichenItza_El_Castillo.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'El Castillo\'s 365 steps encode the solar calendar — at equinox, a serpent of shadow descends the pyramid.',
  },
  {
    name: 'Mount Everest',
    region: 'Nepal / Tibet',
    year: '50–60 Million Years',
    lat: 27.988, lon: 86.925,
    camDist: 1.09, tiltLat: 5, tiltLon: 3,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg/1280px-Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg',
    imageCredit: 'Luca Galuzzi / Wikimedia Commons / CC',
    description: '8,849 meters — the collision of India and Asia still lifting the Himalayas 5mm per year.',
  },
  {
    name: 'Sacsayhuamán',
    region: 'Peru',
    year: 'c. 1100 CE',
    lat: -13.509, lon: -71.982,
    camDist: 1.08, tiltLat: 4, tiltLon: 2,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Saqsaywaman_from_above.jpg/1280px-Saqsaywaman_from_above.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'Inca walls of 100-ton limestone blocks — fitted with such precision a knife blade cannot pass between them.',
  },
  {
    name: 'Karahan Tepe',
    region: 'Turkey',
    year: 'c. 9400 BCE',
    lat: 37.253, lon: 39.616,
    camDist: 1.08, tiltLat: 4, tiltLon: 2,
    siteImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Karahan_Tepe_2022.jpg/1280px-Karahan_Tepe_2022.jpg',
    imageCredit: 'Wikimedia Commons / CC',
    description: 'Göbekli Tepe\'s sister site — only excavated since 2019, already rewriting the timeline of civilization.',
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function latLonToVec3(lat: number, lon: number, r = 1.0): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}
function easeInOutQuart(t: number) {
  return t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2, 4)/2;
}
function easeOutCubic(t: number) { return 1 - Math.pow(1-t, 3); }

// ─────────────────────────────────────────────────────────────────────────────
export function Hero({ onSignInClick }: HeroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<any>({});

  const [phase,        setPhase]        = useState<'loading'|'globe'|'site'>('loading');
  const [siteIdx,      setSiteIdx]      = useState(0);
  const [labelVisible, setLabelVisible] = useState(false);
  const [siteVisible,  setSiteVisible]  = useState(false); // photo reveal
  const [progress,     setProgress]     = useState(0);
  const [imgLoaded,    setImgLoaded]    = useState(false);

  const site = SITES[siteIdx];

  // ── Three.js setup ─────────────────────────────────────────────────────────
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
    const camera = new THREE.PerspectiveCamera(40, W/H, 0.001, 200);

    // Stars
    (() => {
      const N = 7000, pos = new Float32Array(N*3);
      for (let i=0;i<N;i++) {
        const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), r = 50+Math.random()*30;
        pos[i*3]=r*Math.sin(ph)*Math.cos(th); pos[i*3+1]=r*Math.sin(ph)*Math.sin(th); pos[i*3+2]=r*Math.cos(ph);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({color:0xffffff,size:0.065,sizeAttenuation:true,transparent:true,opacity:0.6})));
    })();

    // Globe textures
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const onLoad = () => { loaded++; setProgress(Math.round(loaded/3*100)); };
    const dayTex   = loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg', onLoad);
    dayTex.colorSpace = THREE.SRGBColorSpace; dayTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const nightTex = loader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg', onLoad);
    nightTex.colorSpace = THREE.SRGBColorSpace; nightTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const bumpTex  = loader.load('https://unpkg.com/three-globe/example/img/earth-topology.png', onLoad);
    bumpTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex:{value:dayTex}, nightTex:{value:nightTex}, bumpTex:{value:bumpTex},
        sunDir:{value:new THREE.Vector3(1,0.3,0.5).normalize()},
      },
      vertexShader:`
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
        void main(){
          vUv=uv; vNormal=normalize((modelMatrix*vec4(normal,0.0)).xyz);
          vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader:`
        uniform sampler2D dayTex,nightTex,bumpTex; uniform vec3 sunDir;
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
        void main(){
          vec3 day=texture2D(dayTex,vUv).rgb;
          vec3 night=texture2D(nightTex,vUv).rgb*1.5;
          float s=dot(normalize(vNormal),normalize(sunDir));
          float m=smoothstep(-0.15,0.4,s);
          vec3 col=mix(night,day,m);
          vec3 vd=normalize(cameraPosition-vWorldPos);
          vec3 hv=normalize(normalize(sunDir)+vd);
          col+=pow(max(dot(vNormal,hv),0.0),80.0)*0.1*m;
          col*=1.0-max(dot(normalize(vNormal),vd),0.0)*0.0*0.18;
          gl_FragColor=vec4(col,1.0);
        }`,
    });

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1,128,128), globeMat);
    scene.add(globe);

    // Atmosphere
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.022,64,64), new THREE.ShaderMaterial({
      uniforms:{glowColor:{value:new THREE.Color(0x1a44aa)}},
      vertexShader:`varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform vec3 glowColor; varying vec3 vN;
        void main(){vec3 vd=normalize(cameraPosition-(modelMatrix*vec4(0,0,0,1)).xyz);float i=pow(1.0-abs(dot(vN,vd)),4.0);gl_FragColor=vec4(glowColor*i*0.5,i*0.4);}`,
      side:THREE.FrontSide,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,
    })));

    // Markers (tiny — just location indicators, not UI elements)
    const markerGroup = new THREE.Group(); scene.add(markerGroup);
    const markerDots: THREE.Mesh[] = [];
    SITES.forEach((s,i)=>{
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.0018,8,8),
        new THREE.MeshBasicMaterial({color: i===0?0xD4AF37:0xffffff, transparent:true, opacity: i===0?0.9:0.2}),
      );
      m.position.copy(latLonToVec3(s.lat,s.lon,1.003));
      markerGroup.add(m); markerDots.push(m);
    });

    // Active ring — small and refined
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.003,0.004,32),
      new THREE.MeshBasicMaterial({color:0xD4AF37,transparent:true,opacity:0.8,side:THREE.DoubleSide}),
    );
    const p0 = latLonToVec3(SITES[0].lat,SITES[0].lon,1.004);
    ringMesh.position.copy(p0); ringMesh.lookAt(p0.clone().multiplyScalar(2));
    markerGroup.add(ringMesh);

    scene.add(new THREE.AmbientLight(0xffffff,0.04));
    const sun = new THREE.DirectionalLight(0xfff8e0,2.3); sun.position.set(5,2,3); scene.add(sun);

    // ── State ──────────────────────────────────────────────────────────────
    const S = {
      renderer,scene,camera,globe,globeMat,sun,markerDots,markerGroup,ringMesh,
      camFrom:new THREE.Vector3(0,0,3), camTo:new THREE.Vector3(0,0,3),
      tarFrom:new THREE.Vector3(0,0,0), tarTo:new THREE.Vector3(0,0,0),
      camCur:new THREE.Vector3(0,0,3), tarCur:new THREE.Vector3(0,0,0),
      animStart:0, animDur:4000, animT:1.0,
      ringPulse:0, dwellTimer:null as any, isDestroyed:false, currentIdx:0,
      globeOpacity:1.0,
    };
    stateRef.current = S;

    // ── Go to site ──────────────────────────────────────────────────────────
    const goTo = (idx: number, instant=false) => {
      if (S.isDestroyed) return;
      const s = SITES[idx];
      const camPos = latLonToVec3(s.lat+s.tiltLat, s.lon+s.tiltLon, s.camDist);
      const tarPos = latLonToVec3(s.lat, s.lon, 1.0);
      S.camFrom=S.camCur.clone(); S.tarFrom=S.tarCur.clone();
      S.camTo=camPos; S.tarTo=tarPos;
      S.animStart=performance.now(); S.animDur=instant?400:4000; S.animT=0;
      S.currentIdx=idx;

      S.markerDots.forEach((d:THREE.Mesh,i:number)=>{
        (d.material as THREE.MeshBasicMaterial).color.set(i===idx?0xD4AF37:0xffffff);
        (d.material as THREE.MeshBasicMaterial).opacity=i===idx?0.9:0.18;
      });
      const rp = latLonToVec3(s.lat,s.lon,1.004);
      S.ringMesh.position.copy(rp); S.ringMesh.lookAt(rp.clone().multiplyScalar(2));

      setSiteIdx(idx);
      setLabelVisible(false);
      setSiteVisible(false);
      setImgLoaded(false);
      setPhase('globe');

      if (S.dwellTimer) clearTimeout(S.dwellTimer);

      // After fly-in: show globe label briefly, then reveal site photo
      S.dwellTimer = setTimeout(()=>{
        if(S.isDestroyed) return;
        setLabelVisible(true);
        // After 2s of label, cross-fade to site photo
        S.dwellTimer = setTimeout(()=>{
          if(S.isDestroyed) return;
          setSiteVisible(true);
          setPhase('site');
          // Dwell on photo 9s, then next site
          S.dwellTimer = setTimeout(()=>{
            if(S.isDestroyed) return;
            setSiteVisible(false);
            setLabelVisible(false);
            setTimeout(()=>{ if(!S.isDestroyed) goTo((idx+1)%SITES.length); }, 800);
          }, 9000);
        }, 2500);
      }, instant?600:4200);
    };

    // ── Render loop ────────────────────────────────────────────────────────
    let raf: number;
    const tick = (now:number) => {
      if(S.isDestroyed) return;
      raf=requestAnimationFrame(tick);
      if(S.animT<1.0){
        const raw=Math.min((now-S.animStart)/S.animDur,1.0);
        S.animT=raw>=1.0?1.0:easeInOutQuart(raw);
        // Smooth arc
        const fN=S.camFrom.clone().normalize(), tN=S.camTo.clone().normalize();
        const ang=fN.angleTo(tN);
        if(ang<0.0001){ S.camCur.lerpVectors(S.camFrom,S.camTo,S.animT); }
        else {
          const sin=Math.sin(ang), wa=Math.sin((1-S.animT)*ang)/sin, wb=Math.sin(S.animT*ang)/sin;
          const slerped=fN.clone().multiplyScalar(wa).addScaledVector(tN,wb);
          const fd=S.camFrom.length(), td=S.camTo.length();
          const d=fd+(td-fd)*S.animT+Math.sin(S.animT*Math.PI)*0.12;
          S.camCur=slerped.normalize().multiplyScalar(d);
        }
        S.tarCur.lerpVectors(S.tarFrom,S.tarTo,easeOutCubic(Math.min((now-S.animStart)/S.animDur,1.0)));
      }
      camera.position.copy(S.camCur);
      camera.lookAt(S.tarCur);

      // Ring pulse
      S.ringPulse+=0.02;
      const p=0.5+0.5*Math.sin(S.ringPulse);
      (S.ringMesh.material as THREE.MeshBasicMaterial).opacity=0.3+p*0.6;
      S.ringMesh.scale.setScalar(1+p*0.25);

      // Gentle idle rotation
      if(S.animT>=1.0){ globe.rotation.y+=0.00010; markerGroup.rotation.y+=0.00010; }

      // Sun drift
      const sa=now*0.000022;
      (S.globeMat.uniforms.sunDir.value as THREE.Vector3).set(Math.cos(sa),0.22,Math.sin(sa)).normalize();
      S.sun.position.set(Math.cos(sa)*5,2,Math.sin(sa)*5);

      renderer.render(scene,camera);
    };
    raf=requestAnimationFrame(tick);

    // Boot
    const s0=SITES[0];
    const startCam=latLonToVec3(s0.lat+20,s0.lon-20,2.4);
    S.camCur.copy(startCam); S.tarCur.copy(latLonToVec3(s0.lat,s0.lon,1.0));
    camera.position.copy(startCam); camera.lookAt(S.tarCur);
    const boot=setTimeout(()=>{ setPhase('globe'); setTimeout(()=>goTo(0),800); },1600);

    const onResize=()=>{
      if(!mount)return;
      camera.aspect=mount.clientWidth/mount.clientHeight;
      camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth,mount.clientHeight);
    };
    window.addEventListener('resize',onResize);

    return ()=>{
      S.isDestroyed=true; clearTimeout(boot);
      if(S.dwellTimer)clearTimeout(S.dwellTimer);
      cancelAnimationFrame(raf); window.removeEventListener('resize',onResize);
      renderer.dispose();
      if(mount.contains(renderer.domElement))mount.removeChild(renderer.domElement);
    };
  },[]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden">

      {/* ── Three.js Globe ── */}
      <div
        ref={mountRef}
        className="absolute inset-0 transition-opacity duration-1000"
        style={{ opacity: siteVisible ? 0 : 1 }}
      />

      {/* ── High-res site photograph ── */}
      <div
        className="absolute inset-0 transition-opacity duration-1500"
        style={{ opacity: siteVisible ? 1 : 0 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={site.siteImage}
          alt={site.name}
          className="w-full h-full object-cover"
          style={{
            filter: 'brightness(0.82) contrast(1.08) saturate(1.05)',
            transform: 'scale(1.04)',
            transition: 'transform 12s ease',
          }}
          onLoad={() => setImgLoaded(true)}
        />
        {/* Photo overlay gradient */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.75) 100%)',
        }}/>
        {/* Left vignette */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.3) 0%, transparent 40%)',
        }}/>
      </div>

      {/* ── Loading screen ── */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
        style={{ opacity:phase==='loading'?1:0, pointerEvents:phase==='loading'?'auto':'none', transition:'opacity 1.4s ease' }}
      >
        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" className="mb-6">
          <circle cx="15" cy="15" r="14" stroke="#D4AF37" strokeWidth="0.6" strokeOpacity="0.3"/>
          <circle cx="15" cy="15" r="8"  stroke="#D4AF37" strokeWidth="0.6" strokeOpacity="0.5"/>
          <circle cx="15" cy="15" r="1.6" fill="#D4AF37" fillOpacity="0.85"/>
          <line x1="15" y1="1" x2="15" y2="29" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.2"/>
          <line x1="1" y1="15" x2="29" y2="15" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.2"/>
        </svg>
        <div className="w-24 h-px bg-white/8 mb-5 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-[#D4AF37]/50 transition-all duration-500" style={{width:`${progress}%`}}/>
        </div>
        <p className="text-[9px] text-[#D4AF37]/35 tracking-[0.65em] uppercase font-light">Preparing the archive</p>
      </div>

      {/* ── Globe vignette (only on globe phase) ── */}
      <div className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-1000"
        style={{ opacity:siteVisible?0:1, background:'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 35%, rgba(0,0,0,0.65) 100%)' }}
      />

      {/* ── Top gradient ── */}
      <div className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{background:'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)'}}/>

      {/* ── Bottom gradient ── */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
        style={{height:200,background:'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)'}}/>

      {/* ── Site information panel ── */}
      <div className="absolute bottom-24 left-10 z-20 pointer-events-none max-w-sm"
        style={{ transition:'opacity 1.3s ease, transform 1.3s ease', opacity:labelVisible?1:0, transform:labelVisible?'translateY(0)':'translateY(14px)' }}
      >
        <div style={{width:labelVisible?'32px':'0px',height:'1px',background:'linear-gradient(to right,#D4AF37,transparent)',transition:'width 1.8s ease 0.3s',marginBottom:'10px'}}/>
        <p className="text-[8px] text-[#D4AF37]/50 tracking-[0.55em] uppercase font-light mb-2">Now Viewing</p>
        <p style={{fontFamily:'"Cormorant Garamond","Georgia",serif',fontStyle:'italic',fontWeight:300,fontSize:'1.5rem',letterSpacing:'0.03em',color:'rgba(255,255,255,0.93)',lineHeight:1.15}}>
          {site.name}
        </p>
        <div className="flex items-center gap-2.5 mt-1.5 mb-3">
          <p className="text-[9px] text-white/30 tracking-[0.35em] uppercase font-light">{site.region}</p>
          <div style={{width:1,height:9,background:'rgba(255,255,255,0.12)'}}/>
          <p className="text-[9px] text-white/22 tracking-[0.18em] font-light">{site.year}</p>
        </div>
        {/* Description appears only in photo mode */}
        <p style={{
          fontFamily:'"Cormorant Garamond","Georgia",serif', fontWeight:300,
          fontSize:'0.88rem', lineHeight:1.65, color:'rgba(255,255,255,0.5)',
          letterSpacing:'0.01em',
          opacity: siteVisible ? 1 : 0,
          transition: 'opacity 1.5s ease 0.8s',
          maxWidth: '320px',
        }}>
          {site.description}
        </p>
      </div>

      {/* ── Progress ── */}
      <div className="absolute bottom-[96px] right-10 z-20 pointer-events-none"
        style={{opacity:phase!=='loading'?1:0,transition:'opacity 1s ease'}}
      >
        <div className="flex flex-col gap-[5px] items-end">
          {SITES.map((s,i)=>(
            <div key={s.name} className="flex items-center gap-2">
              {i===siteIdx&&<span className="text-[7px] text-[#D4AF37]/40 tracking-widest font-light">{String(i+1).padStart(2,'0')}</span>}
              <div style={{width:i===siteIdx?'20px':'4px',height:'1.5px',background:i===siteIdx?'#D4AF37':'rgba(255,255,255,0.14)',borderRadius:'1px',transition:'all 0.7s ease'}}/>
            </div>
          ))}
        </div>
      </div>

      {/* ── Manifesto — globe transition ── */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        style={{opacity:phase==='globe'&&!labelVisible?0.5:0,transition:'opacity 2s ease'}}
      >
        <p style={{fontFamily:'"Cormorant Garamond","Georgia",serif',fontStyle:'italic',fontWeight:300,fontSize:'1rem',letterSpacing:'0.05em',color:'rgba(255,255,255,0.6)',textAlign:'center',lineHeight:1.75}}>
          Map what is buried<br/>before it is lost forever.
        </p>
      </div>

      {/* ── Photo credit ── */}
      <div className="absolute bottom-8 right-10 z-20 pointer-events-none"
        style={{opacity:siteVisible?0.4:0,transition:'opacity 1s ease 1s'}}
      >
        <p className="text-[7px] text-white/40 tracking-[0.25em] uppercase font-light">{site.imageCredit}</p>
      </div>

      {/* ── Scroll hint ── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2"
        style={{opacity:labelVisible&&siteVisible?0.65:0,transition:'opacity 2s ease 1s'}}
      >
        <p className="text-[8px] text-white/18 tracking-[0.45em] uppercase font-light">Scroll to explore</p>
        <div style={{width:1,height:26,background:'linear-gradient(to bottom,rgba(212,175,55,0.3),transparent)'}}/>
      </div>

    </div>
  );
}
