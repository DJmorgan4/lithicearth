'use client';

import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { supabase } from '@/lib/supabase';

function latLonToXYZ(lat: number, lon: number, r = 2.02): [number, number, number] {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -(r * Math.sin(phi) * Math.cos(theta)),
     (r * Math.cos(phi)),
     (r * Math.sin(phi) * Math.sin(theta)),
  ];
}

function xyzToLatLon(x: number, y: number, z: number): { lat: number; lon: number } {
  const r   = Math.sqrt(x * x + y * y + z * z);
  const lat = 90 - (Math.acos(y / r) * 180) / Math.PI;
  const lon = (Math.atan2(z, -x) * 180) / Math.PI - 180;
  return { lat: parseFloat(lat.toFixed(5)), lon: parseFloat(lon.toFixed(5)) };
}

const SITES = [
  { name: 'Pyramids of Giza',  lat:  29.9792,  lon:  31.1342, count: 12 },
  { name: 'Machu Picchu',      lat: -13.1631,  lon: -72.5450, count:  8 },
  { name: 'Angkor Wat',        lat:  13.4125,  lon: 103.8670, count:  9 },
  { name: 'Petra',             lat:  30.3285,  lon:  35.4444, count:  6 },
  { name: 'Stonehenge',        lat:  51.1789,  lon:  -1.8262, count:  5 },
  { name: 'Göbekli Tepe',      lat:  37.2232,  lon:  38.9224, count:  4 },
  { name: 'Chichen Itza',      lat:  20.6843,  lon: -88.5686, count:  7 },
  { name: 'Nazca Lines',       lat: -14.7391,  lon: -74.9285, count:  3 },
  { name: 'Easter Island',     lat: -27.1127,  lon:-109.3497, count:  4 },
  { name: 'Great Wall',        lat:  40.4319,  lon: 116.5704, count:  6 },
];

function buildEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#060f1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#192210';
  const lands: [number, number, number, number, number][] = [
    [400, 380, 200, 260, 0.2],
    [490, 690, 140, 195, 0.25],
    [980, 330, 175, 145, -0.2],
    [1040, 540, 175, 215, 0],
    [1390, 380, 340, 240, 0],
    [1590, 740, 115, 95, 0],
  ];
  lands.forEach(([cx, cy, rx, ry, rot]) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    imgData.data[i]     = Math.max(0, Math.min(255, imgData.data[i]     + n));
    imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
    imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function SiteMarker({ lat, lon, count, onHover, onLeave }: {
  lat: number; lon: number; count: number;
  onHover: () => void; onLeave: () => void;
}) {
  const pos = latLonToXYZ(lat, lon);
  const scale = 0.012 + (count / 15) * 0.018;
  return (
    <mesh position={pos} onPointerEnter={onHover} onPointerLeave={onLeave}>
      <sphereGeometry args={[scale, 12, 12]} />
      <meshBasicMaterial color="#D4AF37" transparent opacity={0.8} />
    </mesh>
  );
}

function GlobeClickHandler({ onGlobeClick }: { onGlobeClick: (lat: number, lon: number) => void }) {
  const { camera, raycaster } = useThree();
  const globeSphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2), []);

  return (
    <mesh
      visible={false}
      onClick={(e) => {
        e.stopPropagation();
        const point = e.point;
        const { lat, lon } = xyzToLatLon(point.x, point.y, point.z);
        onGlobeClick(lat, lon);
      }}
    >
      <sphereGeometry args={[2, 64, 64]} />
      <meshBasicMaterial />
    </mesh>
  );
}

function GlobeMesh({ autoRotate }: { autoRotate: boolean }) {
  const globeRef = useRef<THREE.Mesh>(null);
  const texture  = useMemo(() => buildEarthTexture(), []);
  useFrame(() => {
    if (globeRef.current && autoRotate) globeRef.current.rotation.y += 0.0006;
  });
  return (
    <>
      <Sphere ref={globeRef} args={[2, 64, 64]}>
        <meshStandardMaterial map={texture} roughness={0.8} metalness={0.05} />
      </Sphere>
      <Sphere args={[2.07, 48, 48]}>
        <meshBasicMaterial color="#D4AF37" transparent opacity={0.02} side={THREE.BackSide} />
      </Sphere>
      <Sphere args={[2.2, 32, 32]}>
        <meshBasicMaterial color="#040c16" transparent opacity={0.2} side={THREE.BackSide} />
      </Sphere>
    </>
  );
}

/* ── Save Site Panel ────────────────────────────────────────────────── */
function SaveSitePanel({
  lat, lon, onSave, onDismiss,
}: {
  lat: number; lon: number;
  onSave: (name: string, county: string, state: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const [name, setName]     = useState('');
  const [county, setCounty] = useState('');
  const [state, setState]   = useState('TX');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(name, county, state);
    setSaving(false);
    setSaved(true);
    setTimeout(onDismiss, 1200);
  };

  return (
    <div className="absolute top-4 md:p-6 right-6 w-full md:w-72 bg-black/90 backdrop-blur-xl border border-[#D4AF37]/30 p-5">
      <div className="absolute left-0 top-0 w-3 h-3 border-l border-t border-[#D4AF37]/60" />
      <div className="absolute right-0 top-0 w-3 h-3 border-r border-t border-[#D4AF37]/60" />
      <div className="absolute left-0 bottom-0 w-3 h-3 border-l border-b border-[#D4AF37]/60" />
      <div className="absolute right-0 bottom-0 w-3 h-3 border-r border-b border-[#D4AF37]/60" />

      <p className="text-[10px] text-[#D4AF37]/60 tracking-[0.2em] uppercase mb-3">Save as Site</p>

      <div className="text-[10px] text-[#D4AF37]/40 tracking-widest mb-4 font-mono">
        {lat.toFixed(5)}°, {lon.toFixed(5)}°
      </div>

      <div className="space-y-2 mb-4">
        <input
          className="w-full bg-white/5 border border-[#D4AF37]/20 text-white/80 text-xs px-3 py-2 outline-none focus:border-[#D4AF37]/60 placeholder-white/20"
          placeholder="Site name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="w-full bg-white/5 border border-[#D4AF37]/20 text-white/80 text-xs px-3 py-2 outline-none focus:border-[#D4AF37]/60 placeholder-white/20"
          placeholder="County"
          value={county}
          onChange={e => setCounty(e.target.value)}
        />
        <input
          className="w-full bg-white/5 border border-[#D4AF37]/20 text-white/80 text-xs px-3 py-2 outline-none focus:border-[#D4AF37]/60 placeholder-white/20"
          placeholder="State"
          value={state}
          onChange={e => setState(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || saved || !name}
          className="flex-1 bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 border border-[#D4AF37]/40 text-[#D4AF37] text-[10px] tracking-[0.15em] uppercase py-2 transition-all disabled:opacity-40"
        >
          {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Site'}
        </button>
        <button
          onClick={onDismiss}
          className="px-3 border border-white/10 text-white/30 text-[10px] hover:text-white/60 transition-all"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────── */
export default function InteractiveGlobe({ viewMode, selectedYear }: {
  viewMode: string;
  selectedYear: number;
}) {
  const [hoveredSite, setHoveredSite]   = useState<string | null>(null);
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lon: number } | null>(null);

  const handleGlobeClick = (lat: number, lon: number) => {
    setClickedPoint({ lat, lon });
  };

  const handleSaveSite = async (name: string, county: string, state: string) => {
    if (!clickedPoint) return;
    const { lat, lon } = clickedPoint;
    await supabase.from('sites').insert({
      name:         name || `Site @ ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      lat,
      lng:          lon,
      county,
      state,
      created_from: 'lithic',
      status:       'new',
    });
  };

  return (
    <div className="relative w-full h-full">
      <Canvas camera={{ position: [0, 0, 5.5], fov: 42 }}>
        <ambientLight intensity={0.12} />
        <pointLight position={[8, 6, 8]}    intensity={1.1}  color="#ffffff" />
        <pointLight position={[-6, -4, -6]} intensity={0.15} color="#D4AF37" />

        <GlobeMesh autoRotate={viewMode === 'realtime'} />
        <GlobeClickHandler onGlobeClick={handleGlobeClick} />

        {SITES.map((site) => (
          <SiteMarker
            key={site.name}
            lat={site.lat}
            lon={site.lon}
            count={site.count}
            onHover={() => setHoveredSite(site.name)}
            onLeave={() => setHoveredSite(null)}
          />
        ))}

        <Stars radius={120} depth={60} count={4000} factor={3} saturation={0} fade speed={0.3} />

        <OrbitControls
          enableZoom
          enablePan={false}
          minDistance={3}
          maxDistance={10}
          autoRotate={viewMode === 'realtime'}
          autoRotateSpeed={0.4}
          minPolarAngle={Math.PI * 0.15}
          maxPolarAngle={Math.PI * 0.85}
        />
      </Canvas>

      {hoveredSite && !clickedPoint && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="relative bg-black/80 backdrop-blur-xl border border-[#D4AF37]/20 px-5 py-3">
            <div className="absolute left-0 top-0 w-3 h-3 border-l border-t border-[#D4AF37]/40" />
            <div className="absolute right-0 top-0 w-3 h-3 border-r border-t border-[#D4AF37]/40" />
            <div className="absolute left-0 bottom-0 w-3 h-3 border-l border-b border-[#D4AF37]/40" />
            <div className="absolute right-0 bottom-0 w-3 h-3 border-r border-b border-[#D4AF37]/40" />
            <p className="text-[11px] text-[#D4AF37]/80 tracking-[0.2em] uppercase font-light">
              {hoveredSite}
            </p>
          </div>
        </div>
      )}

      {!clickedPoint && (
        <div className="absolute bottom-6 right-6 pointer-events-none">
          <p className="text-[9px] text-white/20 tracking-[0.15em] uppercase">Click globe to save site</p>
        </div>
      )}

      {clickedPoint && (
        <SaveSitePanel
          lat={clickedPoint.lat}
          lon={clickedPoint.lon}
          onSave={handleSaveSite}
          onDismiss={() => setClickedPoint(null)}
        />
      )}
    </div>
  );
}
