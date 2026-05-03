'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { createClient } from '@/lib/supabase/client';
import * as THREE from 'three';
import { Layers, X, ChevronDown, ChevronUp, Copy, Check, Flag, FolderPlus, AlertCircle } from 'lucide-react';

interface LayerConfig {
  id: string; label: string; group: string;
  active: boolean; opacity: number; source: string;
}

interface PointReadout {
  lat: number; lng: number;
  elevation?: number; ndvi?: number; magnetic?: number;
  gravity?: number; sarVV?: number; radon?: string;
  geology?: string; soil?: string;
}

interface PublicPost {
  id: string; lat: number; lng: number;
  title: string; category: string; image_url: string;
}

interface Project {
  id: string; name: string; client?: string;
}

interface StratumSite {
  id: string; name: string; latitude: number; longitude: number;
  source: string; site_type?: string; ceto_score?: number;
  ceto_tier?: string; esa_phase?: string; status: string; tags?: string[];
  stratum_sensor_readings?: { sensor_type: string; value: number; unit: string; created_at: string }[];
  stratum_observations?: { observation_type: string; notes: string; created_at: string }[];
  stratum_documents?: { doc_type: string; title: string; url: string }[];
}

const DEFAULT_LAYERS: LayerConfig[] = [
  { id: 'satellite', label: 'Satellite Imagery',  group: 'Base',          active: true,  opacity: 1,    source: 'Sentinel-2' },
  { id: 'terrain',   label: 'Elevation / DEM',    group: 'Base',          active: true,  opacity: 0.8,  source: 'USGS 3DEP' },
  { id: 'ndvi',      label: 'NDVI Vegetation',    group: 'Environmental', active: false, opacity: 0.7,  source: 'Sentinel-2' },
  { id: 'sar',       label: 'SAR Backscatter',    group: 'Environmental', active: false, opacity: 0.7,  source: 'Sentinel-1' },
  { id: 'hydro',     label: 'Hydrology / NHD',    group: 'Environmental', active: false, opacity: 0.8,  source: 'USGS NHD' },
  { id: 'floodplain',label: 'FEMA Floodplain',    group: 'Environmental', active: false, opacity: 0.6,  source: 'FEMA MSC' },
  { id: 'magnetic',  label: 'Magnetic Anomaly',   group: 'Geophysical',   active: false, opacity: 0.65, source: 'EMAG2 / USGS' },
  { id: 'gravity',   label: 'Gravity Anomaly',    group: 'Geophysical',   active: false, opacity: 0.65, source: 'BGI / USGS' },
  { id: 'radon',     label: 'Radon Zones',        group: 'Geophysical',   active: false, opacity: 0.6,  source: 'EPA' },
  { id: 'geology',   label: 'Geologic Map',       group: 'Geophysical',   active: false, opacity: 0.7,  source: 'USGS Geolex' },
  { id: 'lidar',     label: 'LiDAR Bare Earth',   group: 'Archaeological',active: false, opacity: 0.75, source: 'OpenTopo / 3DEP' },
  { id: 'historic',  label: 'Historic Imagery',   group: 'Archaeological',active: false, opacity: 0.7,  source: 'USGS CORONA' },
];

const GROUPS = ['Base', 'Environmental', 'Geophysical', 'Archaeological'];

function vec3ToLatLng(v: THREE.Vector3): { lat: number; lng: number } {
  const r = v.length();
  const lat = 90 - (Math.acos(v.y / r) * 180) / Math.PI;
  const lng = ((Math.atan2(-v.z, -v.x) * 180) / Math.PI + 180 + 180) % 360 - 180;
  return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
}

function GlobeScene({ posts, stratumSites, onGlobeClick, onMouseMove, onStratumSiteClick }: {
  posts: PublicPost[];
  stratumSites: StratumSite[];
  onGlobeClick: (lat: number, lng: number) => void;
  onMouseMove: (lat: number, lng: number) => void;
  onStratumSiteClick: (site: StratumSite) => void;
}) {
  const globeRef = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    // Try multiple sources — fallback chain
    const sources = [
      'https://unpkg.com/three-globe/example/img/earth-dark.jpg',
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
    ];
    let loaded = false;
    const tryLoad = (idx: number) => {
      if (idx >= sources.length) return;
      loader.load(
        sources[idx],
        (t) => { if (!loaded) { loaded = true; t.colorSpace = THREE.SRGBColorSpace; setTexture(t); } },
        undefined,
        () => tryLoad(idx + 1)
      );
    };
    tryLoad(0);
  }, []);

  useFrame(() => { if (globeRef.current) globeRef.current.rotation.y += 0.00003; });

  const getLatLng = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!globeRef.current) return null;
    const rect = gl.domElement.getBoundingClientRect();
    mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, camera);
    const hits = raycaster.current.intersectObject(globeRef.current);
    return hits.length > 0 ? vec3ToLatLng(hits[0].point) : null;
  }, [camera, gl]);

  const handleClick = useCallback((e: any) => {
    const coords = getLatLng(e);
    if (coords) onGlobeClick(coords.lat, coords.lng);
  }, [getLatLng, onGlobeClick]);

  const handleMove = useCallback((e: any) => {
    const coords = getLatLng(e);
    if (coords) onMouseMove(coords.lat, coords.lng);
  }, [getLatLng, onMouseMove]);

  const markerPositions = posts.slice(0, 100).map(post => {
    const phi = (90 - post.lat) * (Math.PI / 180);
    const theta = (post.lng + 180) * (Math.PI / 180);
    const r = 2.03;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), -r * Math.sin(phi) * Math.sin(theta));
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <pointLight position={[8, 6, 8]} intensity={1.1} color="#ffffff" />
      <pointLight position={[-6, -4, -6]} intensity={0.15} color="#5b7c6f" />
      <mesh ref={globeRef} onClick={handleClick} onPointerMove={handleMove}>
        <sphereGeometry args={[2, 128, 64]} />
        {texture ? (
          <meshPhongMaterial map={texture} specular={new THREE.Color(0x334466)} shininess={14} />
        ) : (
          <meshPhongMaterial color={0x1a3d5c} specular={new THREE.Color(0x224466)} shininess={18} />
        )}
      </mesh>
      <mesh>
        <sphereGeometry args={[2.16, 64, 32]} />
        <shaderMaterial
          vertexShader={`varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
          fragmentShader={`varying vec3 vN; void main(){ float i=pow(0.7-dot(vN,vec3(0,0,1)),4.0); gl_FragColor=vec4(0.1,0.4,0.9,1.0)*i*0.6; }`}
          side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false}
        />
      </mesh>
      {markerPositions.map((pos, i) => (
        <mesh key={posts[i].id} position={pos}>
          <sphereGeometry args={[0.008, 6, 6]} />
          <meshBasicMaterial color={0x5b7c6f} transparent opacity={0.7} />
        </mesh>
      ))}
      {stratumSites.map(site => {
        const phi = (90 - site.latitude) * (Math.PI / 180);
        const theta = (site.longitude + 180) * (Math.PI / 180);
        const r = 2.04;
        const pos = new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), -r * Math.sin(phi) * Math.sin(theta));
        const score = site.ceto_score ?? 50;
        const color = score < 40 ? '#5b9c6f' : score < 70 ? '#D4AF37' : '#c0503a';
        return (
          <mesh key={site.id} position={pos} onClick={(e) => { e.stopPropagation(); onStratumSiteClick(site); }}>
            <sphereGeometry args={[0.014, 10, 10]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} />
          </mesh>
        );
      })}
      <Stars radius={120} depth={60} count={6000} factor={3} saturation={0} fade speed={0.2} />
      <OrbitControls enableZoom enablePan={false} minDistance={2.5} maxDistance={8} autoRotateSpeed={0} minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.9} />
    </>
  );
}

export default function PortalGlobe() {
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [readout, setReadout] = useState<PointReadout | null>(null);
  const [intel, setIntel] = useState<any | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [stratumSites, setStratumSites] = useState<StratumSite[]>([]);
  const [selectedStratumSite, setSelectedStratumSite] = useState<StratumSite | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [copied, setCopied] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [flagDone, setFlagDone] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [savingProject, setSavingProject] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savingSite, setSavingSiteState] = useState(false);
  const [siteSaved, setSiteSaved] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.from('posts').select('id, lat, lng, title, category, image_url').not('lat', 'is', null).limit(200).then(({ data }) => { if (data) setPosts(data); });
    supabase.from('stratum_sites').select(`id, name, latitude, longitude, source, site_type, ceto_score, ceto_tier, esa_phase, status, tags, stratum_sensor_readings(sensor_type, value, unit, created_at), stratum_observations(observation_type, notes, created_at), stratum_documents(doc_type, title, url)`).eq('status', 'active').then(({ data }) => { if (data) setStratumSites(data as StratumSite[]); });
    supabase.from('portal_projects').select('id, name, client').order('created_at', { ascending: false }).then(({ data }) => { if (data) setProjects(data); });
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const buildReadout = useCallback((lat: number, lng: number): PointReadout => {
    // No synthetic values — all data comes from Lithic Engine real pixel measurements
    return { lat, lng };
  }, []);

  const handleGlobeClick = useCallback(async (lat: number, lng: number) => {
    setReadout(buildReadout(lat, lng));
    setFlagDone(false);
    setShowProjectPicker(false);
    setIntel(null);
    setIntelLoading(true);
    try {
      const res = await fetch(`/api/intel?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      setIntel(data);
    } catch {
      // engine offline
    } finally {
      setIntelLoading(false);
    }
  }, [buildReadout]);

  const handleMouseMove = useCallback((lat: number, lng: number) => { setCursorCoords({ lat, lng }); }, []);

  const copyCoords = () => {
    if (!readout) return;
    navigator.clipboard.writeText(`${readout.lat}, ${readout.lng}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const flagAnomaly = async () => {
    if (!readout || flagging) return;
    setFlagging(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setFlagging(false); return; }
    const { error } = await supabase.from('portal_observations').insert({
      user_id: user.id, source: 'manual', type: 'anomaly',
      lat: readout.lat, lng: readout.lng, flagged: true,
      geometry: `POINT(${readout.lng} ${readout.lat})`,
      properties: { elevation: readout.elevation, ndvi: readout.ndvi, magnetic: readout.magnetic, gravity: readout.gravity, sarVV: readout.sarVV, radon: readout.radon, geology: readout.geology, active_layers: layers.filter(l => l.active).map(l => l.id) },
    });
    setFlagging(false);
    if (!error) { setFlagDone(true); showToast('Anomaly flagged and saved'); }
    else { showToast('Error saving'); console.error(error); }
  };

  const addToProject = async (projectId: string) => {
    if (!readout) return;
    setSavingProject(projectId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingProject(null); return; }
    const { error } = await supabase.from('portal_observations').insert({
      user_id: user.id, project_id: projectId, source: 'manual', type: 'field_note',
      lat: readout.lat, lng: readout.lng, flagged: false,
      properties: { elevation: readout.elevation, ndvi: readout.ndvi, active_layers: layers.filter(l => l.active).map(l => l.id) },
    });
    setSavingProject(null);
    setShowProjectPicker(false);
    if (!error) showToast('Added to project');
    else { showToast('Error saving'); console.error(error); }
  };

  const saveAsSite = async () => {
    if (!readout || savingSite) return;
    setSavingSiteState(true);
    const { error } = await supabase.from('sites').insert({
      lat: readout.lat,
      lng: readout.lng,
      created_from: 'lithic',
      status: 'new',
      name: `Site @ ${readout.lat}, ${readout.lng}`,
    });
    setSavingSiteState(false);
    if (!error) { setSiteSaved(true); showToast('Site saved to pipeline'); setTimeout(() => setSiteSaved(false), 3000); }
    else { showToast('Error saving site'); console.error(error); }
  };

  const toggleLayer = (id: string) => setLayers(p => p.map(l => l.id === id ? { ...l, active: !l.active } : l));
  const setOpacity  = (id: string, v: number) => setLayers(p => p.map(l => l.id === id ? { ...l, opacity: v } : l));
  const toggleGroup = (g: string) => setCollapsedGroups(p => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });

  return (
    <div className="flex h-screen bg-[#0a0e0b] overflow-hidden">
      {sidebarOpen && (
        <aside className="w-64 h-full bg-[#0d1410] border-r border-[#1a2a1e] flex flex-col overflow-hidden z-10 flex-shrink-0">
          <div className="px-5 py-4 border-b border-[#1a2a1e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={12} className="text-[#5b7c6f]" />
              <span className="text-[#7a8a7d] text-[10px] tracking-[0.25em] font-light">DATA LAYERS</span>
            </div>
            <span className="text-[#3a4a3e] text-[10px] font-light">{layers.filter(l => l.active).length} active</span>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {GROUPS.map(group => {
              const gl = layers.filter(l => l.group === group);
              const collapsed = collapsedGroups.has(group);
              return (
                <div key={group} className="mb-1">
                  <button onClick={() => toggleGroup(group)} className="w-full flex items-center justify-between px-5 py-2 text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors">
                    <span className="text-[9px] tracking-[0.25em] font-light">{group.toUpperCase()}</span>
                    {collapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                  </button>
                  {!collapsed && gl.map(layer => (
                    <div key={layer.id} className="px-4 py-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <button onClick={() => toggleLayer(layer.id)} className={`w-7 h-3.5 rounded-full transition-colors relative flex-shrink-0 ${layer.active ? 'bg-[#5b7c6f]' : 'bg-[#1a2a1e]'}`}>
                          <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${layer.active ? 'left-3.5' : 'left-0.5'}`} />
                        </button>
                        <span className={`text-[11px] font-light tracking-wide flex-1 ${layer.active ? 'text-[#c8c4ba]' : 'text-[#3a4a3e]'}`}>{layer.label}</span>
                      </div>
                      {layer.active && (
                        <div className="pl-9">
                          <input type="range" min="0" max="1" step="0.05" value={layer.opacity} onChange={e => setOpacity(layer.id, Number(e.target.value))} className="w-full h-px accent-[#5b7c6f] cursor-pointer" />
                          <p className="text-[#2a3a2e] text-[9px] font-light mt-0.5">{layer.source}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="px-5 py-3 border-t border-[#1a2a1e]">
            <p className="text-[#2a3a2e] text-[9px] font-light tracking-wide">{posts.length} public observation{posts.length !== 1 ? 's' : ''} loaded</p>
          </div>
        </aside>
      )}

      <div className="flex-1 relative">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute top-4 left-4 z-20 bg-[#0d1410] border border-[#1a2a1e] p-2 hover:border-[#2a3d2e] transition-colors">
          <Layers size={14} className="text-[#5b7c6f]" />
        </button>

        <Canvas camera={{ position: [0, 0, 5.5], fov: 42 }} style={{ background: '#020508' }} gl={{ antialias: true }}>
          <GlobeScene posts={posts} stratumSites={stratumSites} onGlobeClick={handleGlobeClick} onMouseMove={handleMouseMove} onStratumSiteClick={(site) => { setSelectedStratumSite(site); setReadout(null); setIntel(null); }} />
        </Canvas>

        {cursorCoords && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0d1410]/80 border border-[#1a2a1e] px-4 py-1.5 pointer-events-none z-10">
            <span className="text-[#3a4a3e] text-[10px] font-light tracking-widest">{cursorCoords.lat}° N · {cursorCoords.lng}° E</span>
          </div>
        )}

        {readout && (
          <div className="absolute top-4 right-4 w-64 bg-[#0d1410] border border-[#1a2a1e] z-20">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2a1e]">
              <span className="text-[#5b7c6f] text-[9px] tracking-[0.25em] font-light">POINT READOUT</span>
              <div className="flex items-center gap-2">
                <button onClick={copyCoords} className="text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors">
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
                <button onClick={() => { setReadout(null); setIntel(null); setShowProjectPicker(false); }} className="text-[#3a4a3e] hover:text-[#c8c4ba] transition-colors">
                  <X size={11} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-2.5">
              <ReadoutRow label="LAT" value={`${readout.lat}°`} />
              <ReadoutRow label="LNG" value={`${readout.lng}°`} />
              {(readout.elevation !== undefined || readout.ndvi !== undefined || readout.magnetic !== undefined) && (
                <div className="border-t border-[#1a2a1e] pt-2.5 space-y-2.5">
                  {readout.elevation !== undefined && <ReadoutRow label="ELEVATION" value={`${readout.elevation} m`} source="USGS 3DEP" />}
                  {readout.ndvi      !== undefined && <ReadoutRow label="NDVI"      value={readout.ndvi.toString()} source="Sentinel-2" accent={readout.ndvi > 0.5 ? '#6b9c5f' : '#c09050'} />}
                  {readout.magnetic  !== undefined && <ReadoutRow label="MAGNETIC"  value={`${readout.magnetic} nT`} source="EMAG2" />}
                  {readout.gravity   !== undefined && <ReadoutRow label="GRAVITY"   value={`${readout.gravity} mGal`} source="BGI" />}
                  {readout.sarVV     !== undefined && <ReadoutRow label="SAR VV"    value={`${readout.sarVV} dB`} source="Sentinel-1" />}
                  {readout.radon     && <ReadoutRow label="RADON"   value={readout.radon} source="EPA" />}
                  {readout.geology   && <ReadoutRow label="GEOLOGY" value={readout.geology} source="USGS" />}
                  {readout.soil      && <ReadoutRow label="SOIL"    value={readout.soil} source="SSURGO" />}
                </div>
              )}
            </div>

            {(intelLoading || intel) && (
              <div className="border-t border-[#1a2a1e] px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-px bg-[#5b7c6f]" />
                  <span className="text-[#5b7c6f] text-[9px] tracking-[0.2em] font-light">LITHIC ENGINE</span>
                  {intelLoading && <span className="text-[#3a4a3e] text-[9px] font-light animate-pulse">scanning...</span>}
                </div>
                {intel && !intel.error && (
                  <>
                    {intel.summary && (
                      <p className="text-[#e8e4da] text-[10px] font-light leading-snug border-l-2 border-[#5b7c6f] pl-2 mb-2">{intel.summary}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">SCORE</span>
                      <span className="text-[#c8c4ba] text-xs font-light">
                        {intel.score}/8 · {intel.confidence != null ? Math.round(intel.confidence * 100) + '%' : 'pending'} confidence
                      </span>
                    </div>
                    {/* Support both old layers.* and new measurements.* response format */}
                    {(intel.measurements?.ndvi?.status === 'found' || intel.layers?.sentinel2?.status === 'found') && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">SENTINEL-2</span>
                        <span className="text-[#5b7c6f] text-[9px] font-light">
                          {(intel.measurements?.sentinel2_meta?.cloud_cover ?? intel.layers?.sentinel2?.cloud_cover)?.toFixed(1)}% cloud · {(intel.measurements?.sentinel2_meta?.date ?? intel.layers?.sentinel2?.date)?.slice(0,10)}
                        </span>
                      </div>
                    )}
                    {(intel.measurements?.ndvi?.value != null || intel.layers?.sentinel2?.ndvi_approx != null) && (() => {
                      const ndvi = intel.measurements?.ndvi?.value ?? intel.layers?.sentinel2?.ndvi_approx
                      const method = intel.measurements?.ndvi?.method
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">NDVI</span>
                          <div className="text-right">
                            <span className="text-[9px] font-light" style={{color: ndvi > 0.5 ? '#4ade80' : ndvi > 0.2 ? '#fbbf24' : '#f87171'}}>{ndvi}</span>
                            {method && <span className="block text-[#2a3a2e] text-[8px]">{method === 'pixel_sample_B08_B04' ? '10m pixel' : 'scene est.'}</span>}
                          </div>
                        </div>
                      )
                    })()}
                    {(intel.measurements?.elevation?.status === 'found' || intel.layers?.elevation?.status === 'found') && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">ELEVATION</span>
                        <div className="text-right">
                          <span className="text-[#5b7c6f] text-[9px] font-light">{intel.measurements?.elevation?.value ?? intel.layers?.elevation?.value}m</span>
                          <span className="block text-[#2a3a2e] text-[8px]">{intel.measurements?.elevation?.source ?? intel.layers?.elevation?.source}</span>
                        </div>
                      </div>
                    )}
                    {(intel.measurements?.sar?.status === 'found' || intel.layers?.sentinel1_sar?.status === 'found') && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">SAR</span>
                        <span className="text-[#5b7c6f] text-[9px] font-light">
                          {intel.measurements?.sar?.orbit ?? intel.layers?.sentinel1_sar?.orbit} · {(intel.measurements?.sar?.acquired ?? intel.layers?.sentinel1_sar?.date)?.slice(0,10)}
                        </span>
                      </div>
                    )}
                    {(intel.measurements?.thermal?.status === 'found' || intel.layers?.landsat_thermal?.status === 'found') && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">THERMAL</span>
                        <div className="text-right">
                          {intel.measurements?.thermal?.value != null
                            ? <span className="text-[#5b7c6f] text-[9px] font-light">{intel.measurements.thermal.value}°C · 30m</span>
                            : <span className="text-[#5b7c6f] text-[9px] font-light">Landsat-9 · {(intel.measurements?.thermal?.acquired ?? intel.layers?.landsat_thermal?.date)?.slice(0,10)}</span>
                          }
                        </div>
                      </div>
                    )}
                    {intel.measurement_quality != null && (
                      <div className="flex items-center justify-between border-t border-[#1a2a1e] pt-2">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">MEAS. QUALITY</span>
                        <span className="text-[9px] font-light" style={{color: intel.measurement_quality >= 0.75 ? '#4ade80' : intel.measurement_quality >= 0.5 ? '#fbbf24' : '#f87171'}}>
                          {Math.round(intel.measurement_quality * 100)}%
                        </span>
                      </div>
                    )}
                    {intel.insights?.map((ins: string, i: number) => (
                      <p key={i} className="text-[#7a8a7d] text-[9px] font-light leading-snug border-l border-[#1a2a1e] pl-2">{ins}</p>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="border-t border-[#1a2a1e]">
              <a
                href={`/portal/viewer?lat=${readout?.lat}&lng=${readout?.lng}`}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0d1410] hover:bg-[#111a14] transition-colors border-b border-[#1a2a1e]"
              >
                <span className="text-[#D4AF37] text-[9px] tracking-[0.2em] font-light">→ OPEN IN VIEWER</span>
              </a>
            </div>
            <div className="border-t border-[#1a2a1e] grid grid-cols-3 gap-px bg-[#1a2a1e]">
              <button onClick={flagAnomaly} disabled={flagging || flagDone} className="bg-[#0d1410] px-3 py-2.5 flex items-center justify-center gap-1.5 hover:bg-[#111a14] transition-colors disabled:opacity-50">
                {flagDone ? <Check size={10} className="text-[#5b7c6f]" /> : flagging ? <AlertCircle size={10} className="text-[#5b7c6f] animate-pulse" /> : <Flag size={10} className="text-[#5b7c6f]" />}
                <span className="text-[#5b7c6f] text-[9px] tracking-[0.12em] font-light">{flagDone ? 'FLAGGED' : flagging ? 'SAVING...' : 'FLAG ANOMALY'}</span>
              </button>
              <button onClick={() => setShowProjectPicker(!showProjectPicker)} className="bg-[#0d1410] px-3 py-2.5 flex items-center justify-center gap-1.5 hover:bg-[#111a14] transition-colors">
                <FolderPlus size={10} className="text-[#5b7c6f]" />
                <span className="text-[#5b7c6f] text-[9px] tracking-[0.12em] font-light">ADD TO PROJECT</span>
              </button>
              <button onClick={saveAsSite} disabled={savingSite || siteSaved} className="bg-[#0d1410] px-3 py-2.5 flex items-center justify-center gap-1.5 hover:bg-[#111a14] transition-colors disabled:opacity-50">
                {siteSaved ? <Check size={10} className="text-[#5b7c6f]" /> : <FolderPlus size={10} className="text-[#5b7c6f]" />}
                <span className="text-[#5b7c6f] text-[9px] tracking-[0.12em] font-light">{siteSaved ? 'SAVED' : savingSite ? 'SAVING...': 'SAVE SITE'}</span>
              </button>
            </div>

            {showProjectPicker && (
              <div className="border-t border-[#1a2a1e]">
                {projects.length === 0 ? (
                  <div className="px-4 py-3 text-center">
                    <p className="text-[#3a4a3e] text-[10px] font-light">No projects yet</p>
                    <a href="/portal/projects/new" className="text-[#5b7c6f] text-[10px] font-light hover:text-[#7b9c8f] transition-colors">Create one →</a>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto">
                    {projects.map(p => (
                      <button key={p.id} onClick={() => addToProject(p.id)} disabled={savingProject === p.id} className="w-full px-4 py-2.5 text-left hover:bg-[#111a14] transition-colors border-b border-[#1a2a1e] last:border-0 disabled:opacity-50">
                        <p className="text-[#c8c4ba] text-[11px] font-light">{p.name}</p>
                        {p.client && <p className="text-[#3a4a3e] text-[9px] font-light">{p.client}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {selectedStratumSite && (
          <div className="absolute top-4 right-4 w-72 bg-[#0d1410] border border-[#D4AF37]/30 z-20">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#D4AF37]/20">
              <span className="text-[#D4AF37] text-[9px] tracking-[0.25em] font-light">STRATUM · CETO SITE</span>
              <button onClick={() => setSelectedStratumSite(null)} className="text-[#3a4a3e] hover:text-[#c8c4ba]"><X size={11} /></button>
            </div>
            <div className="p-4 space-y-2.5">
              <p className="text-[#c8c4ba] text-sm font-light">{selectedStratumSite.name}</p>
              {selectedStratumSite.ceto_score !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">CETO SCORE</span>
                  <span className={`text-xs font-light ${selectedStratumSite.ceto_score < 40 ? "text-[#5b9c6f]" : selectedStratumSite.ceto_score < 70 ? "text-[#D4AF37]" : "text-[#c0503a]"}`}>{selectedStratumSite.ceto_score} — {selectedStratumSite.ceto_tier}</span>
                </div>
              )}
              {selectedStratumSite.esa_phase && <ReadoutRow label="ESA PHASE" value={selectedStratumSite.esa_phase} source="Ceto Interactive" />}
              <ReadoutRow label="LAT" value={`${selectedStratumSite.latitude}°`} />
              <ReadoutRow label="LNG" value={`${selectedStratumSite.longitude}°`} />
              {selectedStratumSite.site_type && <ReadoutRow label="TYPE" value={selectedStratumSite.site_type} />}
              {selectedStratumSite.stratum_sensor_readings && selectedStratumSite.stratum_sensor_readings.length > 0 && (
                <div className="border-t border-[#1a2a1e] pt-2.5">
                  <p className="text-[#3a4a3e] text-[9px] tracking-[0.2em] mb-2">LIVE SENSOR DATA</p>
                  {selectedStratumSite.stratum_sensor_readings.slice(0, 4).map((r, i) => (
                    <ReadoutRow key={i} label={r.sensor_type.toUpperCase()} value={`${r.value} ${r.unit ?? ""}`} source="STRATUM" />
                  ))}
                </div>
              )}
              {selectedStratumSite.stratum_documents && selectedStratumSite.stratum_documents.length > 0 && (
                <div className="border-t border-[#1a2a1e] pt-2.5">
                  <p className="text-[#3a4a3e] text-[9px] tracking-[0.2em] mb-2">DOCUMENTS</p>
                  {selectedStratumSite.stratum_documents.map((d, i) => (
                    <a key={i} href={d.url} target="_blank" rel="noreferrer" className="block text-[#5b7c6f] text-[10px] font-light hover:text-[#D4AF37] transition-colors mb-1">{d.title} ({d.doc_type})</a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[#0d1410] border border-[#5b7c6f]/30 px-5 py-2.5 z-30 pointer-events-none">
            <span className="text-[#5b7c6f] text-xs font-light tracking-wide">{toast}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadoutRow({ label, value, source, accent }: { label: string; value: string; source?: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em] font-light flex-shrink-0">{label}</span>
      <div className="text-right">
        <span className="font-light text-xs" style={{ color: accent || '#c8c4ba' }}>{value}</span>
        {source && <span className="block text-[#2a3a2e] text-[8px] font-light">{source}</span>}
      </div>
    </div>
  );
}
