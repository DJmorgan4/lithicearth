 
 
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Navigation } from '@/components/Navigation';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
interface ArchiveImage {
  id: string;
  lat: number;
  lng: number;
  image_url: string;
  thumbnail_url?: string;
  uploaded_at: string;
  uploader_name: string;
  title: string;
  description: string;
  category: 'archaeological' | 'environmental' | 'geological' | 'cultural' | 'wildlife' | 'urban';
  location_name: string;
  elevation?: number;
  tags?: string[];
}

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

const CATEGORY_COLORS: Record<string, string> = {
  archaeological: '#D4AF37',
  environmental:  '#6B9B7F',
  geological:     '#C4763A',
  cultural:       '#9B8B6E',
  wildlife:       '#7A9D54',
  urban:          '#888',
};

// ─────────────────────────────────────────────────────────────────────────────
export default function ArchivePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const mountRef   = useRef<HTMLDivElement>(null);
  const stateRef   = useRef<any>({});
  const raycaster  = useRef(new THREE.Raycaster());
  const mouse      = useRef(new THREE.Vector2());

  const [booted,          setBooted]          = useState(false);
  const [images,          setImages]          = useState<ArchiveImage[]>([]);
  const [selectedImage,   setSelectedImage]   = useState<ArchiveImage | null>(null);
  const [hoveredImage,    setHoveredImage]    = useState<ArchiveImage | null>(null);
  const [showUpload,      setShowUpload]      = useState(false);
  const [showPinModal,    setShowPinModal]    = useState(false);
  const [pinLocation,     setPinLocation]     = useState<{lat:number,lon:number}|null>(null);
  const [stats,           setStats]           = useState({ total: 0, today: 0, contributors: 0 });
  const [camHeight,       setCamHeight]       = useState(2.5);
  const [isDragging,      setIsDragging]      = useState(false);
  const [isLoggedIn,      setIsLoggedIn]      = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────
  // ── Three.js globe ───────────────────────────────────────────────────────
  // ── Three.js globe ───────────────────────────────────────────────────────
  // ── Three.js globe ───────────────────────────────────────────────────────
  // ── Three.js globe ───────────────────────────────────────────────────────
  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsLoggedIn(!!session);
  };

  const loadImages = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) {
      setImages(data);
      const today = new Date(); today.setHours(0,0,0,0);
      const todayCount = data.filter(i => new Date(i.created_at) >= today).length;
      const contributors = new Set(data.map((i:ArchiveImage) => i.uploader_name)).size;
      setStats({ total: data.length, today: todayCount, contributors });
    }
  };

  


useEffect(() => {
    loadImages();
    checkAuth();
    const ch = supabase.channel('archive')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, loadImages)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  
useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(45, W/H, 0.001, 200);
    camera.position.set(0, 0, 2.5);

    // Stars — denser, electrical feel
    const starPos = new Float32Array(12000 * 3);
    const starCol = new Float32Array(12000 * 3);
    for (let i = 0; i < 12000; i++) {
      const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1), r = 45+Math.random()*35;
      starPos[i*3]=r*Math.sin(ph)*Math.cos(th); starPos[i*3+1]=r*Math.sin(ph)*Math.sin(th); starPos[i*3+2]=r*Math.cos(ph);
      // Slight blue/white/gold color variation
      const t = Math.random();
      starCol[i*3]   = t < 0.1 ? 0.85 : t < 0.2 ? 0.9 : 1;
      starCol[i*3+1] = t < 0.1 ? 0.9  : t < 0.2 ? 0.85: 1;
      starCol[i*3+2] = t < 0.1 ? 1    : t < 0.2 ? 0.6 : 1;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(starPos,3));
    sg.setAttribute('color', new THREE.BufferAttribute(starCol,3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
      vertexColors:true, size:0.055, sizeAttenuation:true, transparent:true, opacity:0.75,
    })));

    // Globe textures
    const loader   = new THREE.TextureLoader();
    const dayTex   = loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
    dayTex.colorSpace = THREE.SRGBColorSpace;
    dayTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const nightTex = loader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg');
    nightTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const globeMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex:{value:dayTex}, nightTex:{value:nightTex},
        sunDir:{value:new THREE.Vector3(1,0.3,0.5).normalize()},
        electricField:{value:0.0},
      },
      vertexShader:`
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
        void main(){
          vUv=uv; vNormal=normalize((modelMatrix*vec4(normal,0.0)).xyz);
          vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }`,
      fragmentShader:`
        uniform sampler2D dayTex,nightTex; uniform vec3 sunDir; uniform float electricField;
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
        void main(){
          vec3 day=texture2D(dayTex,vUv).rgb;
          vec3 night=texture2D(nightTex,vUv).rgb*1.55;
          float s=dot(normalize(vNormal),normalize(sunDir));
          float m=smoothstep(-0.12,0.42,s);
          vec3 col=mix(night,day,m);
          vec3 vd=normalize(cameraPosition-vWorldPos);
          // Specular
          col+=pow(max(dot(vNormal,normalize(normalize(sunDir)+vd)),0.0),90.0)*0.11*m;
          // Electric field pulse on night side
          float pulse=electricField*(1.0-m)*0.08;
          col+=vec3(0.2,0.5,1.0)*pulse;
          // Limb
          col*=1.0-max(dot(normalize(vNormal),vd),0.0)*0.12;
          gl_FragColor=vec4(col,1.0);
        }`,
    });

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1,128,128), globeMat);
    scene.add(globe);

    // Atmosphere — more electrical blue
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.022,64,64), new THREE.ShaderMaterial({
      uniforms:{c:{value:new THREE.Color(0x0022ff)}},
      vertexShader:`varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform vec3 c; varying vec3 vN;
        void main(){float i=pow(1.0-abs(dot(vN,normalize(cameraPosition-(modelMatrix*vec4(0,0,0,1)).xyz))),4.5);gl_FragColor=vec4(c*i*0.6,i*0.45);}`,
      side:THREE.FrontSide,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,
    })));

    // Electrical field lines — arc between random surface points
    const fieldLineGroup = new THREE.Group(); scene.add(fieldLineGroup);
    const createFieldLine = () => {
      const lat1 = (Math.random()-0.5)*160, lon1 = Math.random()*360-180;
      const lat2 = lat1 + (Math.random()-0.5)*40, lon2 = lon1 + (Math.random()-0.5)*40;
      const p1 = latLonToVec3(lat1, lon1, 1.002);
      const p2 = latLonToVec3(lat2, lon2, 1.002);
      const mid = p1.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(1.06);
      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const pts = curve.getPoints(40);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0x4488ff, transparent: true, opacity: Math.random()*0.12+0.03,
      });
      return new THREE.Line(geo, mat);
    };
    for (let i=0;i<60;i++) fieldLineGroup.add(createFieldLine());

    // Markers group (populated when images load)
    const markerGroup = new THREE.Group(); scene.add(markerGroup);
    const markerMeshes: Array<{mesh:THREE.Mesh,image:ArchiveImage}> = [];

    // Light
    scene.add(new THREE.AmbientLight(0xffffff, 0.04));
    const sun = new THREE.DirectionalLight(0xfff6e0, 2.3); sun.position.set(5,2,3); scene.add(sun);

    // ── Interaction state ────────────────────────────────────────────────
    const S = {
      renderer,scene,camera,globe,globeMat,sun,
      fieldLineGroup,markerGroup,markerMeshes,
      // Orbit controls (manual)
      isPointerDown: false,
      lastPointer: {x:0,y:0},
      spherical: {theta:0.3,phi:Math.PI/2,r:2.5},
      targetSpherical: {theta:0.3,phi:Math.PI/2,r:2.5},
      autoRotate: true,
      autoRotateTimeout: null as any,
      electricPulse: 0,
      dead: false,
    };
    stateRef.current = S;

    // ── Orbit math ────────────────────────────────────────────────────────
    const updateCamera = () => {
      const {theta,phi,r} = S.spherical;
      camera.position.set(
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(0,0,0);
      setCamHeight(r);
    };

    // ── Pointer events ────────────────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      S.isPointerDown = true;
      S.autoRotate = false;
      S.lastPointer = {x:e.clientX,y:e.clientY};
      if(S.autoRotateTimeout) clearTimeout(S.autoRotateTimeout);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!S.isPointerDown) return;
      const dx = e.clientX - S.lastPointer.x;
      const dy = e.clientY - S.lastPointer.y;
      S.lastPointer = {x:e.clientX,y:e.clientY};
      S.spherical.theta -= dx * 0.006;
      S.spherical.phi    = Math.max(0.1, Math.min(Math.PI-0.1, S.spherical.phi + dy*0.006));
      updateCamera();
    };
    const onPointerUp = (e: PointerEvent) => {
      const wasDragging = S.isPointerDown && (Math.abs(e.clientX - S.lastPointer.x) > 3 || Math.abs(e.clientY - S.lastPointer.y) > 3);
      S.isPointerDown = false;
      setIsDragging(false);
      S.autoRotateTimeout = setTimeout(()=>{ S.autoRotate=true; }, 4000);

      // Raycast click on markers
      if (!wasDragging && mount) {
        const rect = mount.getBoundingClientRect();
        mouse.current.x = ((e.clientX-rect.left)/rect.width)*2-1;
        mouse.current.y = -((e.clientY-rect.top)/rect.height)*2+1;
        raycaster.current.setFromCamera(mouse.current, camera);
        const hits = raycaster.current.intersectObjects(S.markerMeshes.map(m=>m.mesh));
        if (hits.length > 0) {
          const hit = S.markerMeshes.find(m=>m.mesh===hits[0].object);
          if (hit) setSelectedImage(hit.image);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      S.spherical.r = Math.max(1.12, Math.min(4.5, S.spherical.r + e.deltaY * 0.002));
      S.autoRotate = false;
      updateCamera();
      if(S.autoRotateTimeout) clearTimeout(S.autoRotateTimeout);
      S.autoRotateTimeout = setTimeout(()=>{ S.autoRotate=true; }, 3000);
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!mount) return;
      const rect = mount.getBoundingClientRect();
      mouse.current.x = ((e.clientX-rect.left)/rect.width)*2-1;
      mouse.current.y = -((e.clientY-rect.top)/rect.height)*2+1;
      raycaster.current.setFromCamera(mouse.current, camera);
      const hits = raycaster.current.intersectObject(globe);
      if (hits.length > 0) {
        const pt = hits[0].point.clone().normalize();
        const phi = Math.acos(pt.y);
        const theta = Math.atan2(pt.z, -pt.x);
        const lat = 90 - phi*(180/Math.PI);
        const lon = theta*(180/Math.PI) - 180;
        setPinLocation({lat,lon});
        setShowPinModal(true);
      }
    };

    mount.addEventListener('pointerdown', onPointerDown);
    mount.addEventListener('pointermove', onPointerMove);
    mount.addEventListener('pointerup', onPointerUp);
    mount.addEventListener('wheel', onWheel, {passive:false});
    mount.addEventListener('contextmenu', onContextMenu);

    // ── Render loop ───────────────────────────────────────────────────────
    let raf: number;
    const tick = (now: number) => {
      if (S.dead) return;
      raf = requestAnimationFrame(tick);

      if (S.autoRotate) {
        S.spherical.theta += 0.0008;
        updateCamera();
      }

      // Electric pulse
      S.electricPulse = (Math.sin(now*0.001)*0.5+0.5);
      (S.globeMat.uniforms.electricField.value) = S.electricPulse;

      // Pulse field lines opacity
      S.fieldLineGroup.children.forEach((l:any,i:number)=>{
        const t = (now*0.0008 + i*0.15) % (Math.PI*2);
        (l.material as THREE.LineBasicMaterial).opacity = 0.02 + Math.sin(t)*0.06;
      });

      // Pulse markers
      S.markerMeshes.forEach(({mesh}:any, i:number)=>{
        const t = (now*0.002 + i*0.5) % (Math.PI*2);
        mesh.scale.setScalar(1 + Math.sin(t)*0.15);
      });

      // Sun drift
      const sa = now*0.000018;
      (S.globeMat.uniforms.sunDir.value as THREE.Vector3).set(Math.cos(sa),0.2,Math.sin(sa)).normalize();
      S.sun.position.set(Math.cos(sa)*5,2,Math.sin(sa)*5);

      renderer.render(scene,camera);
    };
    raf = requestAnimationFrame(tick);

    // Boot
    setTimeout(()=>setBooted(true), 1200);

    const onResize = () => {
      if(!mount) return;
      camera.aspect=mount.clientWidth/mount.clientHeight;
      camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth,mount.clientHeight);
    };
    window.addEventListener('resize',onResize);

    return () => {
      S.dead=true; cancelAnimationFrame(raf);
      mount.removeEventListener('pointerdown',onPointerDown);
      mount.removeEventListener('pointermove',onPointerMove);
      mount.removeEventListener('pointerup',onPointerUp);
      mount.removeEventListener('wheel',onWheel);
      mount.removeEventListener('contextmenu',onContextMenu);
      window.removeEventListener('resize',onResize);
      renderer.dispose();
      if(mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Update markers when images change ────────────────────────────────────
  useEffect(() => {
    const S = stateRef.current;
    if (!S.markerGroup) return;
    S.markerGroup.clear();
    S.markerMeshes.length = 0;

    images.forEach((img) => {
      const color = CATEGORY_COLORS[img.category] || '#D4AF37';
      const pos   = latLonToVec3(img.lat, img.lng, 1.008);

      // Outer ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.008, 0.012, 32),
        new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.5, side:THREE.DoubleSide }),
      );
      ring.position.copy(pos); ring.lookAt(pos.clone().multiplyScalar(2));
      S.markerGroup.add(ring);

      // Inner dot
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.004,8,8),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(pos);
      S.markerGroup.add(dot);
      S.markerMeshes.push({ mesh:dot, image:img });

      // Field line from marker — electrical connection
      const end = latLonToVec3(img.lat + (Math.random()-0.5)*8, img.lng + (Math.random()-0.5)*8, 1.002);
      const mid = pos.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(1.03);
      const curve = new THREE.QuadraticBezierCurve3(pos, mid, end);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
      S.markerGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color, transparent:true, opacity:0.15,
      })));
    });
  }, [images]);

  // Fly to image
  const flyToImage = (img: ArchiveImage) => {
    const S = stateRef.current;
    if (!S.spherical) return;
    const target = latLonToVec3(img.lat+4, img.lon+3, 1.0);
    // Convert back to spherical
    const phi   = Math.acos(target.y / target.length());
    const theta = Math.atan2(target.x, target.z);
    S.spherical.phi   = phi;
    S.spherical.theta = theta;
    S.spherical.r     = 1.35;
    S.autoRotate = false;
    setSelectedImage(img);
  };

  const returnToOrbit = () => {
    const S = stateRef.current;
    if (!S.spherical) return;
    S.spherical.r = 2.5;
    S.autoRotate = true;
  };

  const timeAgo = (d: string) => {
    const currentTime = new Date().getTime();
    const ms = currentTime - new Date(d).getTime();
    const m=Math.floor(ms/60000),h=Math.floor(ms/3600000),day=Math.floor(ms/86400000);
    if(m<1) return 'just now'; if(m<60) return `${m}m ago`; if(h<24) return `${h}h ago`;
    if(day<7) return `${day}d ago`;
    return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  };

  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-black" style={{cursor:isDragging?'grabbing':'grab'}}>

      {/* ── Globe ── */}
      <div ref={mountRef} className="absolute inset-0" style={{cursor:'inherit'}}/>

      {/* ── Loading ── */}
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black pointer-events-none"
        style={{opacity:booted?0:1,transition:'opacity 1.4s ease'}}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-6">
          <circle cx="16" cy="16" r="15" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.3"/>
          <circle cx="16" cy="16" r="9" stroke="#D4AF37" strokeWidth="0.5" strokeOpacity="0.5"/>
          <circle cx="16" cy="16" r="2" fill="#D4AF37" fillOpacity="0.8"/>
          <line x1="16" y1="1" x2="16" y2="31" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.2"/>
          <line x1="1" y1="16" x2="31" y2="16" stroke="#D4AF37" strokeWidth="0.4" strokeOpacity="0.2"/>
        </svg>
        <p className="text-[8px] text-[#D4AF37]/30 tracking-[0.7em] uppercase font-light">Loading Archive</p>
      </div>

      {/* ── Nav ── */}
      <Navigation
        onSignInClick={() => setShowUpload(true)}
        archiveAction={
          <button onClick={() => isLoggedIn ? setShowUpload(true) : setShowUpload(true)}
            className="pointer-events-auto px-5 py-2.5 text-xs font-light text-[#D4AF37]/80 hover:text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 transition-colors tracking-[0.15em] uppercase">
            Add Site
          </button>
        }
      />

      {/* ── Top gradient ── */}
      <div className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{background:'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,transparent 100%)'}}/>

      {/* ── Bottom gradient ── */}
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-10"
        style={{background:'linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 100%)'}}/>

      {/* ── Empty state — center ── */}
      {booted && images.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
          <div className="text-center" style={{
            opacity:0, animation:'fadeInUp 1.4s ease 0.8s forwards',
          }}>
            <p style={{
              fontFamily:'"Cormorant Garamond","Georgia",serif',
              fontStyle:'italic',fontWeight:300,
              fontSize:'1.35rem',letterSpacing:'0.06em',
              color:'rgba(255,255,255,0.38)',
              lineHeight:1.7,marginBottom:24,
            }}>
              The archive is empty.<br/>
              <span style={{color:'rgba(212,175,55,0.5)'}}>Be the first to document a site.</span>
            </p>
            <p className="text-[8px] text-white/18 tracking-[0.45em] uppercase font-light">
              Right-click on the globe to pin a location
            </p>
          </div>
        </div>
      )}

      {/* ── Left panel — site list ── */}
      <div className="absolute left-6 top-28 z-20 pointer-events-auto"
        style={{
          width:300, maxHeight:'calc(100vh - 180px)',
          opacity:booted?1:0, transition:'opacity 1s ease 0.5s',
        }}
      >
        {/* Stats row */}
        <div className="flex gap-3 mb-3">
          {[
            {label:'Sites',   value:stats.total},
            {label:'Today',   value:stats.today},
            {label:'Explorers',value:stats.contributors},
          ].map(s=>(
            <div key={s.label} className="flex-1 relative"
              style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(20px)',border:'1px solid rgba(212,175,55,0.12)',padding:'10px 12px'}}>
              <div className="absolute left-0 top-0 w-2 h-2 border-l border-t border-[#D4AF37]/25"/>
              <div className="absolute right-0 bottom-0 w-2 h-2 border-r border-b border-[#D4AF37]/25"/>
              <p className="text-[18px] font-light text-[#D4AF37]/80 font-mono leading-none mb-1">{s.value}</p>
              <p className="text-[7px] text-white/30 tracking-[0.35em] uppercase font-light">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Site list */}
        {images.length > 0 && (
          <div className="overflow-y-auto" style={{maxHeight:'calc(100vh - 260px)'}}>
            <div style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(20px)',border:'1px solid rgba(212,175,55,0.12)'}}>
              <div className="relative px-5 py-4 border-b border-[#D4AF37]/8">
                <div className="absolute left-0 top-0 w-3 h-3 border-l border-t border-[#D4AF37]/25"/>
                <div className="absolute right-0 top-0 w-3 h-3 border-r border-t border-[#D4AF37]/25"/>
                <p className="text-[8px] text-white/35 tracking-[0.45em] uppercase font-light">Recent Discoveries</p>
              </div>
              <div className="divide-y divide-white/4">
                {images.slice(0,25).map(img=>(
                  <button key={img.id} onClick={()=>flyToImage(img)}
                    className="w-full text-left px-5 py-3.5 hover:bg-[#D4AF37]/6 transition-colors group">
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                        style={{background:CATEGORY_COLORS[img.category]||'#D4AF37'}}/>
                      <div className="min-w-0">
                        <p className="text-[12px] font-light text-white/80 group-hover:text-white/95 transition-colors truncate mb-0.5">
                          {img.title}
                        </p>
                        <p className="text-[9px] text-white/30 truncate">{img.location_name}</p>
                        <p className="text-[8px] text-white/20 mt-0.5">{timeAgo(img.uploaded_at)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel — selected image ── */}
      {selectedImage && (
        <div className="absolute right-6 top-28 z-20 pointer-events-auto"
          style={{
            width:320,
            background:'rgba(0,0,0,0.80)',backdropFilter:'blur(24px)',
            border:'1px solid rgba(212,175,55,0.18)',
            animation:'slideInRight 0.5s ease',
          }}>
          <div className="relative">
            <div className="absolute left-0 top-0 w-4 h-4 border-l-2 border-t-2 border-[#D4AF37]/35 z-10"/>
            <div className="absolute right-0 top-0 w-4 h-4 border-r-2 border-t-2 border-[#D4AF37]/35 z-10"/>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedImage.thumbnail_url||selectedImage.image_url} alt={selectedImage.title}
              className="w-full object-cover" style={{height:200,filter:'brightness(0.85) contrast(1.05)'}}/>
            <div className="absolute inset-0" style={{background:'linear-gradient(to bottom,transparent 50%,rgba(0,0,0,0.7) 100%)'}}/>
            <button onClick={()=>setSelectedImage(null)}
              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-white/50 hover:text-white/90 transition-colors"
              style={{background:'rgba(0,0,0,0.5)'}}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
          </div>
          <div className="px-5 py-4">
            <div style={{width:24,height:1,background:'linear-gradient(to right,#D4AF37,transparent)',marginBottom:10}}/>
            <p style={{fontFamily:'"Cormorant Garamond","Georgia",serif',fontStyle:'italic',fontWeight:300,fontSize:'1.1rem',color:'rgba(255,255,255,0.9)',marginBottom:4}}>
              {selectedImage.title}
            </p>
            <p className="text-[9px] text-white/30 tracking-[0.3em] uppercase mb-3">{selectedImage.location_name}</p>
            {selectedImage.description && (
              <p className="text-[11px] text-white/50 leading-relaxed mb-4" style={{fontFamily:'"Cormorant Garamond","Georgia",serif'}}>
                {selectedImage.description}
              </p>
            )}
            <div className="flex items-center justify-between pt-3" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
              <div>
                <p className="text-[8px] text-[#D4AF37]/50 tracking-[0.3em] uppercase">{selectedImage.uploader_name}</p>
                <p className="text-[8px] text-white/20 mt-0.5">{timeAgo(selectedImage.uploaded_at)}</p>
              </div>
              <span className="text-[7px] tracking-[0.3em] uppercase px-2 py-1"
                style={{border:'1px solid rgba(212,175,55,0.2)',color:'rgba(212,175,55,0.5)'}}>
                {selectedImage.category}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Status bar ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
        style={{opacity:booted?1:0,transition:'opacity 1s ease 0.8s'}}>
        <div className="relative flex items-center gap-4 md:p-8 px-8 py-3.5"
          style={{background:'rgba(0,0,0,0.72)',backdropFilter:'blur(20px)',border:'1px solid rgba(212,175,55,0.12)'}}>
          <div className="absolute left-2 top-2 w-2.5 h-2.5 border-l border-t border-[#D4AF37]/30"/>
          <div className="absolute right-2 top-2 w-2.5 h-2.5 border-r border-t border-[#D4AF37]/30"/>
          <div className="absolute left-2 bottom-2 w-2.5 h-2.5 border-l border-b border-[#D4AF37]/30"/>
          <div className="absolute right-2 bottom-2 w-2.5 h-2.5 border-r border-b border-[#D4AF37]/30"/>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/60 animate-pulse"/>
            <span className="text-[8px] text-white/30 tracking-[0.2em] uppercase">Live</span>
          </div>
          <div className="w-px h-4 bg-[#D4AF37]/15"/>
          <span className="text-[8px] text-white/25 tracking-[0.15em] uppercase">
            Scroll to zoom &nbsp;·&nbsp; Drag to rotate &nbsp;·&nbsp; Right-click to pin
          </span>
          <div className="w-px h-4 bg-[#D4AF37]/15"/>
          <span className="text-[8px] text-[#D4AF37]/40 font-mono">{stats.total} sites archived</span>
        </div>
      </div>

      {/* ── Pin modal ── */}
      {showPinModal && pinLocation && (
        <PinModal
          lat={pinLocation.lat} lon={pinLocation.lon}
          onClose={()=>{setShowPinModal(false);setPinLocation(null);}}
          onSubmit={()=>{setShowPinModal(false);setShowUpload(true);}}
        />
      )}

      {/* ── Upload modal ── */}
      {showUpload && (
        <UploadModal
          supabase={supabase}
          pinLocation={pinLocation}
          onClose={()=>setShowUpload(false)}
          onSuccess={()=>{setShowUpload(false);loadImages();}}
        />
      )}

      <style jsx global>{`
        @keyframes fadeInUp {
          from{opacity:0;transform:translateY(12px);}
          to{opacity:1;transform:translateY(0);}
        }
        @keyframes slideInRight {
          from{opacity:0;transform:translateX(12px);}
          to{opacity:1;transform:translateX(0);}
        }
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(212,175,55,0.2);border-radius:2px;}
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function PinModal({lat,lon,onClose,onSubmit}:{lat:number,lon:number,onClose:()=>void,onSubmit:()=>void}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-lg">
      <div className="relative p-4 md:p-8 max-w-sm w-full mx-6"
        style={{background:'rgba(5,5,5,0.95)',border:'1px solid rgba(212,175,55,0.25)'}}>
        <div className="absolute left-0 top-0 w-5 h-5 border-l-2 border-t-2 border-[#D4AF37]/40"/>
        <div className="absolute right-0 top-0 w-5 h-5 border-r-2 border-t-2 border-[#D4AF37]/40"/>
        <div className="absolute left-0 bottom-0 w-5 h-5 border-l-2 border-b-2 border-[#D4AF37]/40"/>
        <div className="absolute right-0 bottom-0 w-5 h-5 border-r-2 border-b-2 border-[#D4AF37]/40"/>
        <p className="text-[10px] text-[#D4AF37]/60 tracking-[0.5em] uppercase font-light mb-6">New Discovery</p>
        <p style={{fontFamily:'"Cormorant Garamond","Georgia",serif',fontSize:'1.2rem',fontStyle:'italic',fontWeight:300,color:'rgba(255,255,255,0.8)',marginBottom:8}}>
          Pin this location?
        </p>
        <p className="font-mono text-[10px] text-white/35 mb-8">{lat.toFixed(5)}°, {lon.toFixed(5)}°</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-[10px] tracking-[0.2em] uppercase font-light text-white/40 hover:text-white/70 transition-colors border border-white/10 hover:border-white/20">
            Cancel
          </button>
          <button onClick={onSubmit} className="flex-1 py-3 text-[10px] tracking-[0.2em] uppercase font-light text-[#D4AF37]/80 hover:text-[#D4AF37] transition-colors border border-[#D4AF37]/30 hover:border-[#D4AF37]/50">
            Document Site
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function UploadModal({supabase,pinLocation,onClose,onSuccess}:{
  supabase:any, pinLocation:{lat:number,lon:number}|null, onClose:()=>void, onSuccess:()=>void
}) {
  const [uploading,  setUploading]  = useState(false);
  const [preview,    setPreview]    = useState('');
  const [imageFile,  setImageFile]  = useState<File|null>(null);
  const [form, setForm] = useState({
    title:'', description:'', location_name:'', category:'archaeological',
    uploader_name:'',
    lat: pinLocation?.lat?.toFixed(6) || '',
    lon: pinLocation?.lon?.toFixed(6) || '',
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if(!f) return;
    setImageFile(f);
    const r = new FileReader(); r.onloadend=()=>setPreview(r.result as string); r.readAsDataURL(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if(!imageFile) return;
    setUploading(true);
    try {
      const ext = imageFile.name.split('.').pop();
      const path = `archive-images/${Date.now()}.${ext}`;
      const {error:ue} = await supabase.storage.from('lithicearth-archive').upload(path, imageFile);
      if(ue) throw ue;
      const {data:{publicUrl}} = supabase.storage.from('lithicearth-archive').getPublicUrl(path);
      const {error:de} = await supabase.from('archive_images').insert({
        ...form, lat:parseFloat(form.lat), lon:parseFloat(form.lon),
        image_url:publicUrl, thumbnail_url:publicUrl,
        uploaded_at:new Date().toISOString(),
      });
      if(de) throw de;
      onSuccess();
    } catch(err) {
      console.error(err); alert('Upload failed. Please try again.');
    } finally { setUploading(false); }
  };

  const field = (label:string, key:string, props:any={}) => (
    <div>
      <label className="block text-[8px] text-white/40 tracking-[0.4em] uppercase font-light mb-2">{label}</label>
      <input value={(form as any)[key]} onChange={e=>setForm({...form,[key]:e.target.value})}
        className="w-full px-4 py-3 text-sm font-light text-white/85 placeholder-white/20 focus:outline-none transition-colors"
        style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(212,175,55,0.15)',}}
        {...props}/>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-lg overflow-y-auto py-8">
      <div className="relative p-10 max-w-2xl w-full mx-6"
        style={{background:'rgba(5,5,5,0.97)',border:'1px solid rgba(212,175,55,0.2)'}}>
        <div className="absolute left-0 top-0 w-7 h-7 border-l-2 border-t-2 border-[#D4AF37]/40"/>
        <div className="absolute right-0 top-0 w-7 h-7 border-r-2 border-t-2 border-[#D4AF37]/40"/>
        <div className="absolute left-0 bottom-0 w-7 h-7 border-l-2 border-b-2 border-[#D4AF37]/40"/>
        <div className="absolute right-0 bottom-0 w-7 h-7 border-r-2 border-b-2 border-[#D4AF37]/40"/>

        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[8px] text-[#D4AF37]/45 tracking-[0.55em] uppercase font-light mb-1">LithicEarth Archive</p>
            <p style={{fontFamily:'"Cormorant Garamond","Georgia",serif',fontStyle:'italic',fontWeight:300,fontSize:'1.25rem',color:'rgba(255,255,255,0.85)'}}>
              Document a Discovery
            </p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors p-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {/* Image drop */}
          <div>
            <label className="block text-[8px] text-white/40 tracking-[0.4em] uppercase font-light mb-2">Photographic Evidence</label>
            <input type="file" accept="image/*" onChange={onFile} required id="img-up" className="hidden"/>
            <label htmlFor="img-up" className="flex items-center justify-center w-full cursor-pointer transition-all"
              style={{height:180,background:preview?'transparent':'rgba(255,255,255,0.02)',border:'1px dashed rgba(212,175,55,0.2)',overflow:'hidden'}}>
              {preview
                ? <img src={preview} alt="" className="w-full h-full object-cover"/>
                : <div className="text-center">
                    <div className="w-8 h-8 mx-auto mb-3 flex items-center justify-center opacity-40">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="1.5" className="w-full h-full">
                        <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                      </svg>
                    </div>
                    <p className="text-[9px] text-white/25 tracking-[0.3em] uppercase">Upload photograph</p>
                  </div>
              }
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Site Name','title',{placeholder:'e.g., Temple Complex Ruins',required:true})}
            {field('Location','location_name',{placeholder:'e.g., Valley of Kings, Egypt',required:true})}
          </div>

          <div>
            <label className="block text-[8px] text-white/40 tracking-[0.4em] uppercase font-light mb-2">Field Notes</label>
            <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}
              rows={3} placeholder="Observations, historical context, notable features..."
              className="w-full px-4 py-3 text-sm font-light text-white/85 placeholder-white/20 focus:outline-none resize-none transition-colors"
              style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(212,175,55,0.15)'}}/>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Latitude','lat',{type:'number',step:'any',placeholder:'29.9792',required:true,className:'font-mono'})}
            {field('Longitude','lon',{type:'number',step:'any',placeholder:'31.1342',required:true,className:'font-mono'})}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[8px] text-white/40 tracking-[0.4em] uppercase font-light mb-2">Classification</label>
              <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}
                className="w-full px-4 py-3 text-sm font-light text-white/85 focus:outline-none"
                style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(212,175,55,0.15)'}}>
                {['archaeological','environmental','geological','cultural','wildlife','urban'].map(c=>(
                  <option key={c} value={c} style={{background:'#050505'}}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
                ))}
              </select>
            </div>
            {field('Explorer Name','uploader_name',{placeholder:'Your name',required:true})}
          </div>

          <button type="submit" disabled={uploading}
            className="w-full py-4 text-[10px] tracking-[0.3em] uppercase font-light transition-all disabled:opacity-40"
            style={{background:'rgba(212,175,55,0.08)',border:'1px solid rgba(212,175,55,0.3)',color:'rgba(212,175,55,0.85)'}}>
            {uploading ? 'Archiving Discovery...' : 'Archive Discovery'}
          </button>
        </form>
      </div>
    </div>
  );
}
