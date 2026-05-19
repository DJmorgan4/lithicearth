'use client';
import Link from 'next/link'

import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
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
interface PublicPost { id: string; lat: number; lng: number; title: string; category: string; image_url: string; }
interface Project { id: string; name: string; client?: string; }
interface StratumSite {
  id: string; name: string; latitude: number; longitude: number;
  source: string; site_type?: string; ceto_score?: number;
  ceto_tier?: string; esa_phase?: string; status: string; tags?: string[];
  stratum_sensor_readings?: { sensor_type: string; value: number; unit: string; created_at: string }[];
  stratum_observations?: { observation_type: string; notes: string; created_at: string }[];
  stratum_documents?: { doc_type: string; title: string; url: string }[];
}
interface AstraCandidate {
  id: string; name: string; lat: number; lng: number;
  type: string; score: number; reason: string;
  layers: string[]; brief: string[];
}
interface AstraDiscovery {
  intent: string;
  query: string;
  center: { lat: number; lng: number };
  recommended_layers: string[];
  synthesis: string;
  source?: string;
  candidates: AstraCandidate[];
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
  const lat = 90 - (Math.acos(Math.max(-1, Math.min(1, v.y / r))) * 180) / Math.PI;
  const lng = ((Math.atan2(v.z, v.x) * 180) / Math.PI + 360) % 360 - 180;
  return { lat: Number((lat - 90).toFixed(5) === '-90' ? -90 : lat - 90 > 90 ? 90 : lat - 90), lng: Number(lng.toFixed(5)) };
}

// Brighten a loaded image via canvas and return a new THREE.Texture
function brightenTexture(img: HTMLImageElement, factor: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth  || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i]   = Math.min(255, data[i]   * factor);
    data[i+1] = Math.min(255, data[i+1] * factor);
    data[i+2] = Math.min(255, data[i+2] * factor);
  }
  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function GlobeScene({ posts, stratumSites, layers, astraCandidates, selectedAstraCandidate, scanResult, onGlobeClick, onMouseMove, onStratumSiteClick }: {
  posts: PublicPost[];
  stratumSites: StratumSite[];
  layers: LayerConfig[];
  astraCandidates: AstraCandidate[];
  selectedAstraCandidate: AstraCandidate | null;
  scanResult: any;
  onGlobeClick: (lat: number, lng: number) => void;
  onMouseMove: (lat: number, lng: number) => void;
  onStratumSiteClick: (site: StratumSite) => void;
}) {
  const globeRef = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const texture = useLoader(THREE.TextureLoader, '/earth.jpg');
  const overlayRef = useRef<THREE.Group>(null);

  const active = useCallback((id: string) => layers.some(l => l.id === id && l.active), [layers]);

  useFrame(({ camera, clock }, delta) => {
    if (overlayRef.current) overlayRef.current.rotation.y += delta * 0.025;

    if (selectedAstraCandidate && globeRef.current) {
      const phi = (90 - selectedAstraCandidate.lat) * (Math.PI / 180);
      const theta = selectedAstraCandidate.lng * (Math.PI / 180);

      const target = new THREE.Vector3(
        3.15 * Math.sin(phi) * Math.cos(theta),
        3.15 * Math.cos(phi),
        3.15 * Math.sin(phi) * Math.sin(theta)
      );

      camera.position.lerp(target, 0.018);
      camera.lookAt(0, 0, 0);

      const pulse = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.03;
      globeRef.current.scale.setScalar(pulse);
    } else if (globeRef.current) {
      globeRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.05);
    }
  });

  // No auto-rotation — keeps markers aligned with texture

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
    const theta = post.lng * (Math.PI / 180);
    const r = 2.03;
    return new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  });

  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#fff8ee" />

      <mesh ref={globeRef} onClick={handleClick} onPointerMove={handleMove} rotation={[0, Math.PI * 1.08, 0]}>
        <sphereGeometry args={[2, 128, 64]} />
        {texture
          ? <meshBasicMaterial map={texture} />
          : <meshBasicMaterial color={0x1a3d5c} />
        }
      </mesh>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[2.16, 64, 32]} />
        <shaderMaterial
          vertexShader={`varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
          fragmentShader={`varying vec3 vN; void main(){ float i=pow(0.7-dot(vN,vec3(0,0,1)),4.0); gl_FragColor=vec4(0.1,0.4,0.9,1.0)*i*0.5; }`}
          side={THREE.BackSide} blending={THREE.AdditiveBlending} transparent depthWrite={false}
        />
      </mesh>

      {/* Post markers */}
      {markerPositions.map((pos, i) => (
        <mesh key={posts[i].id} position={pos}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshBasicMaterial color={0x5b7c6f} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* ASTRA discovery markers */}
      {astraCandidates.map(candidate => {
        const phi = (90 - candidate.lat) * (Math.PI / 180);
        const theta = candidate.lng * (Math.PI / 180);
        const r = 2.085;
        const pos = new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
        const hot = candidate.score >= 88;
        return (
          <group key={candidate.id} position={pos}>
            <mesh>
              <sphereGeometry args={[hot ? 0.04 : 0.032, 16, 16]} />
              <meshBasicMaterial color={hot ? '#D4AF37' : '#12A8AC'} transparent opacity={0.95} />
            </mesh>
            <mesh>
              <sphereGeometry args={[hot ? 0.075 : 0.06, 16, 16]} />
              <meshBasicMaterial color={hot ? '#D4AF37' : '#12A8AC'} transparent opacity={0.18} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        );
      })}


      {/* Selected ASTRA target beam */}
      {selectedAstraCandidate && (() => {
        const phi = (90 - selectedAstraCandidate.lat) * (Math.PI / 180);
        const theta = selectedAstraCandidate.lng * (Math.PI / 180);

        const r = 2.18;

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);

        return (
          <group position={[x, y, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.012, 0.001, 0.7, 16, 1, true]} />
              <meshBasicMaterial
                color="#D4AF37"
                transparent
                opacity={0.18}
                blending={THREE.AdditiveBlending}
              />
            </mesh>

            <mesh>
              <sphereGeometry args={[0.055, 24, 24]} />
              <meshBasicMaterial
                color="#D4AF37"
                transparent
                opacity={0.9}
              />
            </mesh>
          </group>
        );
      })()}

      {/* Stratum site markers */}
      {stratumSites.map(site => {
        const phi = (90 - site.latitude) * (Math.PI / 180);
        const theta = site.longitude * (Math.PI / 180);
        const r = 2.04;
        const pos = new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
        const score = site.ceto_score ?? 50;
        const color = score < 40 ? '#5b9c6f' : score < 70 ? '#D4AF37' : '#c0503a';
        return (
          <mesh key={site.id} position={pos} onClick={(e) => { e.stopPropagation(); onStratumSiteClick(site); }}>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} />
          </mesh>
        );
      })}

      {/* Layer-reactive intelligence overlays */}
      <group ref={overlayRef}>
        {active('terrain') && (
          <mesh>
            <sphereGeometry args={[2.012, 128, 64]} />
            <shaderMaterial
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              uniforms={{ uColor: { value: new THREE.Color('#fb923c') } }}
              vertexShader={`
                varying vec3 vPos;
                void main() {
                  vPos = position;
                  vec3 displaced = position + normal * (sin(position.x * 18.0) * sin(position.y * 22.0) * 0.018);
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
                }
              `}
              fragmentShader={`
                uniform vec3 uColor;
                varying vec3 vPos;
                void main() {
                  float bands = abs(sin(vPos.y * 42.0));
                  float alpha = smoothstep(0.92, 1.0, bands) * 0.22;
                  gl_FragColor = vec4(uColor, alpha);
                }
              `}
            />
          </mesh>
        )}

        {active('lidar') && (
          <mesh>
            <sphereGeometry args={[2.026, 96, 48]} />
            <meshBasicMaterial color="#fcd34d" wireframe transparent opacity={0.18} />
          </mesh>
        )}

        {active('ndvi') && (
          <mesh>
            <sphereGeometry args={[2.04, 96, 48]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.08} blending={THREE.AdditiveBlending} />
          </mesh>
        )}

        {active('sar') && [0.15, 0.35, 0.55].map((offset, i) => (
          <mesh key={`sar-ring-${i}`} rotation={[Math.PI / 2 + offset, 0, offset]}>
            <torusGeometry args={[2.09, 0.0035, 8, 192]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}

        {active('hydro') && [-0.8, -0.4, 0, 0.4, 0.8].map((y, i) => (
          <mesh key={`hydro-band-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[Math.sqrt(Math.max(0.01, 2.05 * 2.05 - y * y)), 0.0025, 8, 160]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.22} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}

        {active('geology') && (
          <mesh rotation={[0, Math.PI / 4, 0]}>
            <sphereGeometry args={[2.055, 48, 24]} />
            <meshBasicMaterial color="#a78bfa" wireframe transparent opacity={0.11} />
          </mesh>
        )}
      </group>

      {/* MSIGI scan candidates — hex cluster markers */}
      {scanResult?.candidates?.map((c: any) => {
        const phi = (90 - c.lat) * (Math.PI / 180);
        const theta = c.lng * (Math.PI / 180);
        const r = 2.055;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);
        const score = c.score || 0;
        const color = score >= 0.7 ? '#D4AF37' : score >= 0.5 ? '#12A8AC' : '#5b7c6f';
        const size = 0.018 + score * 0.022;
        return (
          <group key={`msigi-${c.id}`} position={[x, y, z]}>
            {/* Core dot */}
            <mesh>
              <sphereGeometry args={[size, 16, 16]} />
              <meshBasicMaterial color={color} transparent opacity={0.95} />
            </mesh>
            {/* Outer ring */}
            <mesh>
              <sphereGeometry args={[size * 2.2, 16, 16]} />
              <meshBasicMaterial color={color} transparent opacity={0.12} blending={THREE.AdditiveBlending} />
            </mesh>
            {/* Score label ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[size * 3.5, 0.002, 8, 32]} />
              <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        );
      })}

      {/* Scan origin pulse ring */}
      {scanResult?.location && (() => {
        const phi = (90 - scanResult.location.lat) * (Math.PI / 180);
        const theta = scanResult.location.lng * (Math.PI / 180);
        const r = 2.015;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);
        // Radius ring at ~500m scale on globe surface
        return (
          <group position={[x, y, z]}>
            <mesh>
              <sphereGeometry args={[0.004, 12, 12]} />
              <meshBasicMaterial color="#D4AF37" />
            </mesh>
          </group>
        );
      })()}

      <Stars radius={120} depth={60} count={6000} factor={3} saturation={0} fade speed={0.2} />
      <OrbitControls enableZoom enablePan={false} minDistance={2.05} maxDistance={20} zoomSpeed={0.8} autoRotateSpeed={0} minPolarAngle={Math.PI * 0.1} maxPolarAngle={Math.PI * 0.9} />
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
  const [narrating, setNarrating] = useState(false);
  const [narration, setNarration] = useState<string | null>(null);
  const [siteSaved, setSiteSaved] = useState(false);
  const [astraQuery, setAstraQuery] = useState('');
  const [astraLoading, setAstraLoading] = useState(false);
  const [astraDiscovery, setAstraDiscovery] = useState<AstraDiscovery | null>(null);
  const [selectedAstraCandidate, setSelectedAstraCandidate] = useState<AstraCandidate | null>(null);
  const [expeditionMode, setExpeditionMode] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [nexusResult, setNexusResult] = useState<any>(null);
  const [nexusLoading, setNexusLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    // posts table not yet created — stratum_sites is the live data source
    supabase.from('stratum_sites').select(`id, name, latitude, longitude, source, site_type, ceto_score, ceto_tier, esa_phase, status, tags, stratum_sensor_readings(sensor_type, value, unit, created_at), stratum_observations(observation_type, notes, created_at), stratum_documents(doc_type, title, url)`).eq('status', 'active').then(({ data }) => { if (data) setStratumSites(data as StratumSite[]); });
    supabase.from('portal_projects').select('id, name, client').order('created_at', { ascending: false }).then(({ data }) => { if (data) setProjects(data); });
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const buildReadout = useCallback((lat: number, lng: number): PointReadout => ({ lat, lng }), []);

  const handleGlobeClick = useCallback(async (lat: number, lng: number) => {
    setReadout(buildReadout(lat, lng));
    setFlagDone(false); setShowProjectPicker(false); setIntel(null); setIntelLoading(true);
    setScanResult(null); setScanLoading(true); setNexusResult(null); setNexusLoading(true);
    // Parallel: intel analyze + MSIGI scan + NEXUS signal fusion
    await Promise.allSettled([
      fetch(`/api/intel?lat=${lat}&lng=${lng}`)
        .then(r => r.json()).then(setIntel).catch(() => {})
        .finally(() => setIntelLoading(false)),
      fetch(`/api/scan?lat=${lat}&lng=${lng}&radius=500`)
        .then(r => r.json()).then(setScanResult).catch(() => {})
        .finally(() => setScanLoading(false)),
      fetch(`/api/nexus/signal?lat=${lat}&lng=${lng}`)
        .then(r => r.json()).then(d => setNexusResult(d.nexus)).catch(() => {})
        .finally(() => setNexusLoading(false)),
    ]);
  }, [buildReadout]);

  const handleMouseMove = useCallback((lat: number, lng: number) => { setCursorCoords({ lat, lng }); }, []);

  const copyCoords = () => {
    if (!readout) return;
    navigator.clipboard.writeText(`${readout.lat}, ${readout.lng}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const narrateLocation = async () => {
    if (!readout) return;
    setNarrating(true); setNarration(null);
    try {
      const r = await fetch("/api/nexus/narrate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: readout.lat, lng: readout.lng, layers, readout }) });
      const j = await r.json();
      setNarration(j.narration || "No analysis available");
    } catch { setNarration("ASTRA unavailable"); }
    finally { setNarrating(false); }
  };

  const flagAnomaly = async () => {
    if (!readout || flagging) return;
    setFlagging(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setFlagging(false); return; }
    const { error } = await supabase.from('portal_observations').insert({ user_id: user.id, source: 'manual', type: 'anomaly', lat: readout.lat, lng: readout.lng, flagged: true, geometry: `POINT(${readout.lng} ${readout.lat})`, properties: { elevation: readout.elevation, ndvi: readout.ndvi, magnetic: readout.magnetic, gravity: readout.gravity, sarVV: readout.sarVV, radon: readout.radon, geology: readout.geology, active_layers: layers.filter(l => l.active).map(l => l.id) } });
    setFlagging(false);
    if (!error) { setFlagDone(true); showToast('Anomaly flagged and saved'); }
    else { showToast('Error saving'); console.error(error); }
  };

  const addToProject = async (projectId: string) => {
    if (!readout) return;
    setSavingProject(projectId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingProject(null); return; }
    const { error } = await supabase.from('portal_observations').insert({ user_id: user.id, project_id: projectId, source: 'manual', type: 'field_note', lat: readout.lat, lng: readout.lng, flagged: false, properties: { elevation: readout.elevation, ndvi: readout.ndvi, active_layers: layers.filter(l => l.active).map(l => l.id) } });
    setSavingProject(null); setShowProjectPicker(false);
    if (!error) showToast('Added to project');
    else { showToast('Error saving'); console.error(error); }
  };

  const saveAsSite = async () => {
    if (!readout || savingSite) return;
    setSavingSiteState(true);
    const { error } = await supabase.from('sites').insert({ lat: readout.lat, lng: readout.lng, created_from: 'lithic', status: 'new', name: `Site @ ${readout.lat}, ${readout.lng}` });
    setSavingSiteState(false);
    if (!error) { setSiteSaved(true); showToast('Site saved to pipeline'); setTimeout(() => setSiteSaved(false), 3000); }
    else { showToast('Error saving site'); console.error(error); }
  };

  const toggleLayer = (id: string) => setLayers(p => p.map(l => l.id === id ? { ...l, active: !l.active } : l));
  const setOpacity  = (id: string, v: number) => setLayers(p => p.map(l => l.id === id ? { ...l, opacity: v } : l));

  const activateAstraLayers = (layerIds: string[]) => {
    const mapped = layerIds.map(id => id === 'wetlands' ? 'hydro' : id === 'topo' ? 'terrain' : id);
    setLayers(prev => prev.map(layer => ({
      ...layer,
      active: layer.active || mapped.includes(layer.id),
    })));
  };


  const generateExpeditionBrief = (candidate: AstraCandidate) => {
    const terrainFocus =
      candidate.layers.includes('terrain') || candidate.layers.includes('topo')
        ? 'Terrain relief, slope transitions, and elevation visibility should be inspected.'
        : 'Terrain review recommended during viewer analysis.'

    const hydroFocus =
      candidate.layers.includes('hydro') || candidate.layers.includes('wetlands')
        ? 'Hydrology and wetland structure are likely central to this target.'
        : 'Water proximity should still be verified.'

    const lidarFocus =
      candidate.layers.includes('lidar')
        ? 'LiDAR review recommended for microtopography and hidden terrain structure.'
        : 'Satellite and terrain overlays are primary review modes.'

    return [
      `ASTRA confidence score ${candidate.score}%`,
      terrainFocus,
      hydroFocus,
      lidarFocus,
      'Validate public/private access before field operations.',
      'Use Viewer mode for terrain profiles, AOIs, spectral overlays, and scan analytics.',
    ]
  }

  const runAstraDiscovery = async () => {
    if (!astraQuery.trim() || astraLoading) return;
    setAstraLoading(true);
    setSelectedAstraCandidate(null);
    try {
      const res = await fetch('/api/astra/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: astraQuery }),
      });
      const data = await res.json();
      if (data?.astra) {
        setAstraDiscovery(data.astra);
        activateAstraLayers(data.astra.recommended_layers || []);
        if (data.astra.candidates?.[0]) {
          const c = data.astra.candidates[0];
          setSelectedAstraCandidate(c);
          setReadout({ lat: c.lat, lng: c.lng });
        }
        showToast('ASTRA discovery rendered on globe');
      }
    } catch (e) {
      console.error(e);
      showToast('ASTRA discovery failed');
    } finally {
      setAstraLoading(false);
    }
  };
  const toggleGroup = (g: string) => setCollapsedGroups(p => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });

  return (
    <div className="flex min-h-screen bg-[#0a0e0b] overflow-hidden">
      {sidebarOpen && (
        <aside className="w-full md:w-64 h-full bg-[#0d1410] border-r border-[#1a2a1e] flex flex-col overflow-hidden z-10 flex-shrink-0">
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

        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[min(720px,calc(100vw-2rem))] bg-[#07110c]/95 border border-[#D4AF37]/30 shadow-2xl">
          <div className="px-4 py-3 border-b border-[#1a2a1e] flex items-center justify-between">
            <span className="text-[#D4AF37] text-[9px] tracking-[0.3em]">ASTRA DISCOVERY GLOBE</span>
            <span className="text-[#3a4a3e] text-[8px] tracking-[0.18em]">{astraDiscovery?.intent?.replaceAll('_', ' ').toUpperCase() || 'ASK THE PLANET'}</span>
          </div>
          <div className="p-3 flex gap-2">
            <input
              value={astraQuery}
              onChange={(e) => setAstraQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runAstraDiscovery(); }}
              placeholder="Ask ASTRA: find low-key public water for dogs, historical terrain, WMA wetlands, sandhill crane zones..."
              className="flex-1 bg-[#020806] border border-[#1a2a1e] px-3 py-2 text-[#c8c4ba] text-[11px] outline-none focus:border-[#D4AF37]/50"
            />
            <button
              onClick={runAstraDiscovery}
              disabled={astraLoading}
              className="px-4 py-2 border border-[#D4AF37]/40 text-[#D4AF37] text-[9px] tracking-[0.2em] hover:border-[#D4AF37] disabled:opacity-50"
            >
              {astraLoading ? 'THINKING' : 'RENDER'}
            </button>
          </div>
          {astraDiscovery && (
            <div className="px-4 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 text-[7px] tracking-[0.18em] border ${
                  astraDiscovery.source === 'openstreetmap-overpass'
                    ? 'border-[#12A8AC]/40 text-[#12A8AC]'
                    : 'border-[#5b7c6f]/40 text-[#5b7c6f]'
                }`}>
                  {astraDiscovery.source === 'openstreetmap-overpass'
                    ? 'LIVE OSM DISCOVERY'
                    : 'ASTRA FALLBACK'}
                </span>

                <span className="px-2 py-1 text-[7px] tracking-[0.18em] border border-[#D4AF37]/30 text-[#D4AF37]">
                  {astraDiscovery.intent.replaceAll('_', ' ').toUpperCase()}
                </span>
              </div>

              <p className="text-[#7a8a7d] text-[10px] leading-relaxed border-l border-[#D4AF37]/30 pl-3 mb-2">
                {astraDiscovery.synthesis}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {astraDiscovery.candidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedAstraCandidate(c); setReadout({ lat: c.lat, lng: c.lng }); activateAstraLayers(c.layers); }}
                    className={`min-w-[190px] text-left border px-3 py-2 transition-colors ${
                      selectedAstraCandidate?.id === c.id
                        ? 'border-[#D4AF37]/70 bg-[#11100a]'
                        : 'border-[#1a2a1e] hover:border-[#5b7c6f]'
                    }`}
                  >
                    <p className="text-[#c8c4ba] text-[10px] truncate">{c.name}</p>
                    <p className="text-[#D4AF37] text-[8px] mt-1">{c.score}% · {c.type}</p>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.layers.slice(0, 4).map(layer => (
                        <span
                          key={layer}
                          className="px-1.5 py-0.5 border border-[#1a2a1e] text-[#12A8AC] text-[6px] tracking-[0.12em]"
                        >
                          {layer.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Canvas camera={{ position: [-1.5, 0.8, 3.0], fov: 42 }} style={{ background: '#020508' }} gl={{ antialias: true }}>
          <GlobeScene posts={posts} stratumSites={stratumSites} layers={layers} astraCandidates={astraDiscovery?.candidates || []} selectedAstraCandidate={selectedAstraCandidate} scanResult={scanResult} onGlobeClick={handleGlobeClick} onMouseMove={handleMouseMove} onStratumSiteClick={(site) => { setSelectedStratumSite(site); setReadout(null); setIntel(null); }} />
        </Canvas>

        {cursorCoords && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0d1410]/80 border border-[#1a2a1e] px-4 py-1.5 pointer-events-none z-10">
            <span className="text-[#3a4a3e] text-[10px] font-light tracking-widest">{cursorCoords.lat}° N · {cursorCoords.lng}° E</span>
          </div>
        )}

        {readout && (
          <div className="absolute top-4 right-4 w-full md:w-64 bg-[#0d1410] border border-[#1a2a1e] z-20 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2a1e]">
              <span className="text-[#5b7c6f] text-[9px] tracking-[0.25em] font-light">POINT READOUT</span>
              <div className="flex items-center gap-2">
                <button onClick={copyCoords} className="text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors">{copied ? <Check size={11} /> : <Copy size={11} />}</button>
                <button onClick={() => { setReadout(null); setIntel(null); setShowProjectPicker(false); }} className="text-[#3a4a3e] hover:text-[#c8c4ba] transition-colors"><X size={11} /></button>
              </div>
            </div>
            <div className="p-4 space-y-2.5">
              <ReadoutRow label="LAT" value={`${readout.lat}°`} />
              <ReadoutRow label="LNG" value={`${readout.lng}°`} />
              {(readout.elevation !== undefined || readout.ndvi !== undefined || readout.magnetic !== undefined) && (
                <div className="border-t border-[#1a2a1e] pt-2.5 space-y-2.5">
                  {readout.elevation !== undefined && <ReadoutRow label="ELEVATION" value={`${readout.elevation} m`} source="USGS 3DEP" />}
                  {readout.ndvi !== undefined && <ReadoutRow label="NDVI" value={readout.ndvi.toString()} source="Sentinel-2" accent={readout.ndvi > 0.5 ? '#6b9c5f' : '#c09050'} />}
                  {readout.magnetic !== undefined && <ReadoutRow label="MAGNETIC" value={`${readout.magnetic} nT`} source="EMAG2" />}
                  {readout.gravity !== undefined && <ReadoutRow label="GRAVITY" value={`${readout.gravity} mGal`} source="BGI" />}
                  {readout.sarVV !== undefined && <ReadoutRow label="SAR VV" value={`${readout.sarVV} dB`} source="Sentinel-1" />}
                  {readout.radon && <ReadoutRow label="RADON" value={readout.radon} source="EPA" />}
                  {readout.geology && <ReadoutRow label="GEOLOGY" value={readout.geology} source="USGS" />}
                  {readout.soil && <ReadoutRow label="SOIL" value={readout.soil} source="SSURGO" />}
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
                    {intel.summary && <p className="text-[#e8e4da] text-[10px] font-light leading-snug border-l-2 border-[#5b7c6f] pl-2 mb-2">{intel.summary}</p>}
                    <div className="flex items-center justify-between">
                      <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">SCORE</span>
                      <span className="text-[#c8c4ba] text-xs font-light">{intel.score}/8 · {intel.confidence != null ? Math.round(intel.confidence * 100) + '%' : 'pending'} confidence</span>
                    </div>
                    {(intel.measurements?.ndvi?.status === 'found' || intel.layers?.sentinel2?.status === 'found') && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">SENTINEL-2</span>
                        <span className="text-[#5b7c6f] text-[9px] font-light">{(intel.measurements?.sentinel2_meta?.cloud_cover ?? intel.layers?.sentinel2?.cloud_cover)?.toFixed(1)}% cloud · {(intel.measurements?.sentinel2_meta?.date ?? intel.layers?.sentinel2?.date)?.slice(0,10)}</span>
                      </div>
                    )}
                    {(intel.measurements?.ndvi?.value != null || intel.layers?.sentinel2?.ndvi_approx != null) && (() => {
                      const ndvi = intel.measurements?.ndvi?.value ?? intel.layers?.sentinel2?.ndvi_approx;
                      const method = intel.measurements?.ndvi?.method;
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">NDVI</span>
                          <div className="text-right">
                            <span className="text-[9px] font-light" style={{color: ndvi > 0.5 ? '#4ade80' : ndvi > 0.2 ? '#fbbf24' : '#f87171'}}>{ndvi}</span>
                            {method && <span className="block text-[#2a3a2e] text-[8px]">{method === 'pixel_sample_B08_B04' ? '10m pixel' : 'scene est.'}</span>}
                          </div>
                        </div>
                      );
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
                        <span className="text-[#5b7c6f] text-[9px] font-light">{intel.measurements?.sar?.orbit ?? intel.layers?.sentinel1_sar?.orbit} · {(intel.measurements?.sar?.acquired ?? intel.layers?.sentinel1_sar?.date)?.slice(0,10)}</span>
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
                        <span className="text-[9px] font-light" style={{color: intel.measurement_quality >= 0.75 ? '#4ade80' : intel.measurement_quality >= 0.5 ? '#fbbf24' : '#f87171'}}>{Math.round(intel.measurement_quality * 100)}%</span>
                      </div>
                    )}
                    {intel.insights?.map((ins: string, i: number) => (
                      <p key={i} className="text-[#7a8a7d] text-[9px] font-light leading-snug border-l border-[#1a2a1e] pl-2">{ins}</p>
                    ))}
                  </>
                )}
              </div>
            )}
            {/* NEXUS Signal Panel */}
            {(nexusLoading || nexusResult) && (
              <div className="border-t border-[#1a2a1e] px-4 py-3 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-px bg-[#12A8AC]" />
                    <span className="text-[#12A8AC] text-[9px] tracking-[0.2em] font-light">NEXUS SIGNAL</span>
                    {nexusLoading && <span className="text-[#3a4a3e] text-[9px] animate-pulse">fusing...</span>}
                  </div>
                  {nexusResult && (
                    <span className={`text-[9px] tracking-[0.15em] font-light px-2 py-0.5 rounded ${
                      nexusResult.tier === 'ANOMALY' ? 'bg-red-900/30 text-red-400' :
                      nexusResult.tier === 'ELEVATED' ? 'bg-yellow-900/30 text-yellow-400' :
                      nexusResult.tier === 'NOMINAL' ? 'bg-green-900/20 text-[#5b7c6f]' :
                      'bg-[#1a2a1e] text-[#3a4a3e]'
                    }`}>{nexusResult.tier}</span>
                  )}
                </div>
                {nexusResult && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">FUSION SCORE</span>
                      <span className="text-[#12A8AC] text-xs font-light">{(nexusResult.score * 100).toFixed(1)}<span className="text-[#3a4a3e] text-[9px]">/100</span></span>
                    </div>
                    <div className="w-full h-1 bg-[#1a2a1e] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${nexusResult.score * 100}%`, backgroundColor: nexusResult.tier === 'ANOMALY' ? '#ef4444' : nexusResult.tier === 'ELEVATED' ? '#eab308' : '#12A8AC' }} />
                    </div>
                    <div className="grid grid-cols-5 gap-1 mt-2">
                      {Object.entries(nexusResult.signals || {}).map(([k, v]: [string, any]) => (
                        <div key={k} className="text-center">
                          <div className="text-[#3a4a3e] text-[7px] tracking-widest uppercase mb-1">{k.slice(0,3)}</div>
                          <div className="w-full h-6 bg-[#1a2a1e] rounded relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 right-0 rounded transition-all" style={{ height: `${v * 100}%`, backgroundColor: v > 0.7 ? '#ef4444' : v > 0.5 ? '#eab308' : '#12A8AC', opacity: 0.7 }} />
                          </div>
                          <div className="text-[#c8c4ba] text-[7px] mt-0.5">{(v * 100).toFixed(0)}</div>
                        </div>
                      ))}
                    </div>
                    {nexusResult.sources?.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {nexusResult.sources.map((s: string, i: number) => (
                          <div key={i} className="text-[#3a4a3e] text-[8px] font-light">{s}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {/* MSIGI Scan Results Panel */}
            {(scanLoading || scanResult) && (
              <div className="border-t border-[#1a2a1e] px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-px bg-[#D4AF37]" />
                  <span className="text-[#D4AF37] text-[9px] tracking-[0.2em] font-light">MSIGI SCAN</span>
                  {scanLoading && <span className="text-[#3a4a3e] text-[9px] animate-pulse">scanning...</span>}
                </div>
                {scanResult && !scanResult.error && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">CANDIDATES</span>
                      <span className="text-[#c8c4ba] text-[9px]">{scanResult.candidates?.length || 0} detected</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">ELEVATION</span>
                      <span className="text-[#5b7c6f] text-[9px]">{scanResult.terrain?.mean_elevation_m}m mean · {scanResult.terrain?.source}</span>
                    </div>
                    {scanResult.spectral?.valid && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">NDVI AOI</span>
                        <span className="text-[9px]" style={{color: (scanResult.spectral.ndvi_mean||0) > 0.4 ? '#4ade80' : '#fbbf24'}}>{scanResult.spectral.ndvi_mean} · {scanResult.spectral.date}</span>
                      </div>
                    )}
                    {scanResult.sar?.valid && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">SAR</span>
                        <span className="text-[#5b7c6f] text-[9px]">{scanResult.sar.platform} · {scanResult.sar.date}</span>
                      </div>
                    )}
                    {scanResult.muon_baseline?.valid && (
                      <div className="flex items-center justify-between">
                        <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em]">MUON Kp</span>
                        <span className="text-[#5b7c6f] text-[9px]">{scanResult.muon_baseline.kp_index} · {scanResult.muon_baseline.flux_m2_min}/m²/min</span>
                      </div>
                    )}
                    {scanResult.candidates?.length > 0 && (
                      <div className="border-t border-[#1a2a1e] pt-2 space-y-1.5">
                        <span className="text-[#3a4a3e] text-[8px] tracking-[0.2em]">TOP CANDIDATES</span>
                        {scanResult.candidates.slice(0, 3).map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between border border-[#1a2a1e] px-2 py-1.5">
                            <div>
                              <span className="text-[#D4AF37] text-[9px] font-light">{c.id}</span>
                              <span className="text-[#3a4a3e] text-[8px] ml-2">{c.confidence}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px]" style={{color: c.score >= 0.7 ? '#D4AF37' : c.score >= 0.5 ? '#12A8AC' : '#5b7c6f'}}>{Math.round(c.score * 100)}%</span>
                              <span className="block text-[#2a3a2e] text-[8px]">{c.height_above_mean_m}m · ⌀{c.diameter_m}m</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="border-t border-[#1a2a1e]">
              <Link href={`/portal/viewer?lat=${readout?.lat}&lng=${readout?.lng}`} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0d1410] hover:bg-[#111a14] transition-colors border-b border-[#1a2a1e]">
                <span className="text-[#D4AF37] text-[9px] tracking-[0.2em] font-light">→ OPEN IN VIEWER</span>
              </Link>
              <button onClick={narrateLocation} disabled={narrating} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0a1410] hover:bg-[#111a14] transition-colors border-b border-[#1a2a1e] disabled:opacity-50">
                <span className="text-[#12A8AC] text-[9px] tracking-[0.2em] font-light">{narrating ? "ASTRA ANALYZING..." : "→ ASTRA NARRATE"}</span>
              </button>
              {narration && (
                <div className="px-4 py-3 border-b border-[#1a2a1e] bg-[#060e0a] max-h-64 overflow-y-auto">
                  <p className="text-[#3a4a3e] text-[8px] tracking-[0.15em] mb-1.5">ASTRA NEXUS</p>
                  <p className="text-[#c8c4ba] text-[10px] font-light leading-relaxed">{narration}</p>
                </div>
              )}
            </div>
            <div className="border-t border-[#1a2a1e] grid grid-cols-1 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-[#1a2a1e]">
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
                <span className="text-[#5b7c6f] text-[9px] tracking-[0.12em] font-light">{siteSaved ? 'SAVED' : savingSite ? 'SAVING...' : 'SAVE SITE'}</span>
              </button>
            </div>
            {showProjectPicker && (
              <div className="border-t border-[#1a2a1e]">
                {projects.length === 0 ? (
                  <div className="px-4 py-3 text-center">
                    <p className="text-[#3a4a3e] text-[10px] font-light">No projects yet</p>
                    <Link href="/portal/projects/new" className="text-[#5b7c6f] text-[10px] font-light hover:text-[#7b9c8f] transition-colors">Create one →</Link>
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

        {selectedAstraCandidate && (
          <div className="absolute bottom-4 right-4 w-full md:w-80 bg-[#07110c] border border-[#D4AF37]/40 z-30">
            <div className="px-4 py-3 border-b border-[#D4AF37]/20 flex items-center justify-between">
              <span className="text-[#D4AF37] text-[9px] tracking-[0.25em]">ASTRA TARGET</span>
              <button onClick={() => setSelectedAstraCandidate(null)} className="text-[#3a4a3e] hover:text-[#c8c4ba]"><X size={11} /></button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-[#c8c4ba] text-sm">{selectedAstraCandidate.name}</p>
              <ReadoutRow label="TYPE" value={selectedAstraCandidate.type} />
              <ReadoutRow label="SCORE" value={`${selectedAstraCandidate.score}%`} accent="#D4AF37" />
              <p className="text-[#7a8a7d] text-[10px] leading-relaxed border-l border-[#1a2a1e] pl-2">{selectedAstraCandidate.reason}</p>

              <div className="border border-[#1a2a1e] bg-[#060b08] p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#3a4a3e] text-[7px] tracking-[0.16em]">
                    ASTRA CONFIDENCE ANALYSIS
                  </span>

                  <span className="text-[#D4AF37] text-[8px]">
                    {selectedAstraCandidate.score}%
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {selectedAstraCandidate.layers.map(layer => (
                    <span
                      key={layer}
                      className="px-2 py-1 border border-[#1a2a1e] text-[#12A8AC] text-[6px]"
                    >
                      {layer.toUpperCase()} SIGNAL
                    </span>
                  ))}
                </div>
              </div>
              <div className="border-t border-[#1a2a1e] pt-2 space-y-1">
                {selectedAstraCandidate.brief.map((b, i) => (
                  <p key={i} className="text-[#3a4a3e] text-[9px] leading-relaxed">• {b}</p>
                ))}
              </div>
              <button
                onClick={() => setExpeditionMode(v => !v)}
                className={`w-full py-2 border text-[9px] tracking-[0.2em] transition-colors ${
                  expeditionMode
                    ? 'border-[#12A8AC] text-[#12A8AC]'
                    : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#12A8AC]/50'
                }`}
              >
                {expeditionMode ? 'HIDE FIELD BRIEF' : 'GENERATE FIELD BRIEF'}
              </button>


              {expeditionMode && (
                <div className="border border-[#12A8AC]/20 bg-[#061012] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#12A8AC] text-[8px] tracking-[0.22em]">
                      ASTRA FIELD BRIEF
                    </span>

                    <span className="text-[#3a4a3e] text-[7px]">
                      LIVE RECON SYNTHESIS
                    </span>
                  </div>

                  <div className="space-y-2">
                    {generateExpeditionBrief(selectedAstraCandidate).map((item, i) => (
                      <div
                        key={i}
                        className="border-l border-[#12A8AC]/20 pl-2"
                      >
                        <p className="text-[#8ea39a] text-[9px] leading-relaxed">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-[#1a2a1e] pt-2">
                    <p className="text-[#3a4a3e] text-[8px] tracking-[0.15em] mb-1">
                      RECOMMENDED ANALYSIS LAYERS
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {selectedAstraCandidate.layers.map(layer => (
                        <span
                          key={layer}
                          className="px-2 py-1 border border-[#1a2a1e] text-[#12A8AC] text-[7px]"
                        >
                          {layer.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Link
                href={`/portal/viewer?lat=${selectedAstraCandidate.lat}&lng=${selectedAstraCandidate.lng}&zoom=13&layers=${encodeURIComponent(selectedAstraCandidate.layers.join(','))}`}
                className="block text-center border border-[#D4AF37]/30 text-[#D4AF37] text-[9px] tracking-[0.2em] py-2 hover:border-[#D4AF37]"
              >
                OPEN TARGET IN VIEWER
              </Link>
            </div>
          </div>
        )}

        {selectedStratumSite && (
          <div className="absolute top-4 right-4 w-full md:w-72 bg-[#0d1410] border border-[#D4AF37]/30 z-20">
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
                    <Link key={i} href={d.url} target="_blank" rel="noreferrer" className="block text-[#5b7c6f] text-[10px] font-light hover:text-[#D4AF37] transition-colors mb-1">{d.title} ({d.doc_type})</Link>
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
