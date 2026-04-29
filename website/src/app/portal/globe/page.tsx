'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Layers, X, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface LayerConfig {
  id: string;
  label: string;
  group: string;
  active: boolean;
  opacity: number;
  source: string;
}

interface PointReadout {
  lat: number;
  lng: number;
  elevation?: number;
  ndvi?: number;
  magnetic?: number;
  gravity?: number;
  sarVV?: number;
  radon?: string;
  geology?: string;
  soil?: string;
}

interface PublicPost {
  id: string;
  lat: number;
  lng: number;
  title: string;
  category: string;
  image_url: string;
}

const DEFAULT_LAYERS: LayerConfig[] = [
  { id: 'satellite', label: 'Satellite Imagery', group: 'Base', active: true, opacity: 1, source: 'Sentinel-2' },
  { id: 'terrain', label: 'Elevation / DEM', group: 'Base', active: true, opacity: 0.8, source: 'USGS 3DEP' },
  { id: 'ndvi', label: 'NDVI Vegetation', group: 'Environmental', active: false, opacity: 0.7, source: 'Sentinel-2' },
  { id: 'sar', label: 'SAR Backscatter', group: 'Environmental', active: false, opacity: 0.7, source: 'Sentinel-1' },
  { id: 'hydro', label: 'Hydrology / NHD', group: 'Environmental', active: false, opacity: 0.8, source: 'USGS NHD' },
  { id: 'floodplain', label: 'FEMA Floodplain', group: 'Environmental', active: false, opacity: 0.6, source: 'FEMA MSC' },
  { id: 'magnetic', label: 'Magnetic Anomaly', group: 'Geophysical', active: false, opacity: 0.65, source: 'EMAG2 / USGS' },
  { id: 'gravity', label: 'Gravity Anomaly', group: 'Geophysical', active: false, opacity: 0.65, source: 'BGI / USGS' },
  { id: 'radon', label: 'Radon Zones', group: 'Geophysical', active: false, opacity: 0.6, source: 'EPA' },
  { id: 'geology', label: 'Geologic Map', group: 'Geophysical', active: false, opacity: 0.7, source: 'USGS Geolex' },
  { id: 'lidar', label: 'LiDAR Bare Earth', group: 'Archaeological', active: false, opacity: 0.75, source: 'OpenTopo / 3DEP' },
  { id: 'historic', label: 'Historic Imagery', group: 'Archaeological', active: false, opacity: 0.7, source: 'USGS CORONA' },
]

const GROUPS = ['Base', 'Environmental', 'Geophysical', 'Archaeological']

export default function PortalGlobe() {
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [readout, setReadout] = useState<PointReadout | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [copied, setCopied] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from('posts')
      .select('id, lat, lng, title, category, image_url')
      .not('lat', 'is', null)
      .limit(200)
      .then(({ data }) => { if (data) setPosts(data); });
  }, []);

  const handleGlobeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const lat = Number((90 - y * 180).toFixed(5));
    const lng = Number((x * 360 - 180).toFixed(5));

    const newReadout: PointReadout = { lat, lng };
    if (layers.find(l => l.id === 'terrain')?.active) newReadout.elevation = Math.round(100 + Math.random() * 400);
    if (layers.find(l => l.id === 'ndvi')?.active) newReadout.ndvi = Number((Math.random() * 0.8).toFixed(3));
    if (layers.find(l => l.id === 'magnetic')?.active) newReadout.magnetic = Number((-50 + Math.random() * 100).toFixed(1));
    if (layers.find(l => l.id === 'gravity')?.active) newReadout.gravity = Number((-20 + Math.random() * 40).toFixed(1));
    if (layers.find(l => l.id === 'sar')?.active) newReadout.sarVV = Number((-15 + Math.random() * 10).toFixed(1));
    if (layers.find(l => l.id === 'radon')?.active) newReadout.radon = `Zone ${Math.ceil(Math.random() * 3)}`;
    if (layers.find(l => l.id === 'geology')?.active) newReadout.geology = 'Woodbine Fm.';
    if (layers.find(l => l.id === 'lidar')?.active) newReadout.soil = 'Silty clay loam';
    setReadout(newReadout);
  }, [layers]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCursorCoords({
      lat: Number((90 - y * 180).toFixed(4)),
      lng: Number((x * 360 - 180).toFixed(4)),
    });
  }, []);

  const toggleLayer = (id: string) => setLayers(prev => prev.map(l => l.id === id ? { ...l, active: !l.active } : l));
  const setOpacity = (id: string, val: number) => setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity: val } : l));
  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  const copyCoords = () => {
    if (!readout) return;
    navigator.clipboard.writeText(`${readout.lat}, ${readout.lng}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-screen bg-[#0a0e0b] overflow-hidden">
      {sidebarOpen && (
        <aside className="w-64 h-full bg-[#0d1410] border-r border-[#1a2a1e] flex flex-col overflow-hidden z-10">
          <div className="px-5 py-4 border-b border-[#1a2a1e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={12} className="text-[#5b7c6f]" />
              <span className="text-[#7a8a7d] text-[10px] tracking-[0.25em] font-light">DATA LAYERS</span>
            </div>
            <span className="text-[#3a4a3e] text-[10px] font-light">{layers.filter(l => l.active).length} active</span>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {GROUPS.map(group => {
              const groupLayers = layers.filter(l => l.group === group);
              const collapsed = collapsedGroups.has(group);
              return (
                <div key={group} className="mb-1">
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between px-5 py-2 text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors"
                  >
                    <span className="text-[9px] tracking-[0.25em] font-light">{group.toUpperCase()}</span>
                    {collapsed ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                  </button>
                  {!collapsed && groupLayers.map(layer => (
                    <div key={layer.id} className="px-4 py-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <button
                          onClick={() => toggleLayer(layer.id)}
                          className={`w-7 h-3.5 rounded-full transition-colors relative flex-shrink-0 ${layer.active ? 'bg-[#5b7c6f]' : 'bg-[#1a2a1e]'}`}
                        >
                          <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${layer.active ? 'left-3.5' : 'left-0.5'}`} />
                        </button>
                        <span className={`text-[11px] font-light tracking-wide flex-1 ${layer.active ? 'text-[#c8c4ba]' : 'text-[#3a4a3e]'}`}>
                          {layer.label}
                        </span>
                      </div>
                      {layer.active && (
                        <div className="pl-9">
                          <input
                            type="range" min="0" max="1" step="0.05"
                            value={layer.opacity}
                            onChange={e => setOpacity(layer.id, Number(e.target.value))}
                            className="w-full h-px accent-[#5b7c6f] cursor-pointer"
                          />
                          <p className="text-[#2a3a2e] text-[9px] font-light mt-0.5">{layer.source}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      <div className="flex-1 relative">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-20 bg-[#0d1410] border border-[#1a2a1e] p-2 hover:border-[#2a3d2e] transition-colors"
        >
          <Layers size={14} className="text-[#5b7c6f]" />
        </button>

        <div
          className="w-full h-full cursor-crosshair"
          onClick={handleGlobeClick}
          onMouseMove={handleMouseMove}
          style={{ background: 'radial-gradient(ellipse at center, #0f1f14 0%, #0a0e0b 70%)' }}
        >
          {/* INTEGRATION POINT: Replace with <InteractiveGlobe layers={layers} onPointClick={handleGlobeClick} /> */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-48 h-48 rounded-full border border-[#1a2a1e] mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'radial-gradient(ellipse at 35% 35%, #162a1e 0%, #0a1510 60%, #070c09 100%)' }}>
                <span className="text-[#1a2a1e] text-xs font-light tracking-widest">GLOBE</span>
              </div>
              <p className="text-[#2a3a2e] text-xs font-light tracking-widest">Wire InteractiveGlobe here</p>
            </div>
          </div>

          {posts.slice(0, 50).map(post => (
            <div
              key={post.id}
              className="absolute w-1.5 h-1.5 rounded-full bg-[#5b7c6f] opacity-60 hover:opacity-100 hover:scale-150 transition-all cursor-pointer"
              style={{
                left: `${((post.lng + 180) / 360) * 100}%`,
                top: `${((90 - post.lat) / 180) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
              title={post.title}
            />
          ))}
        </div>

        {cursorCoords && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0d1410]/80 border border-[#1a2a1e] px-4 py-1.5 pointer-events-none">
            <span className="text-[#3a4a3e] text-[10px] font-light tracking-widest">
              {cursorCoords.lat}° N · {cursorCoords.lng}° E
            </span>
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
                <button onClick={() => setReadout(null)} className="text-[#3a4a3e] hover:text-[#c8c4ba] transition-colors">
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
            <div className="border-t border-[#1a2a1e] grid grid-cols-2 gap-px bg-[#1a2a1e]">
              <button className="bg-[#0d1410] px-3 py-2.5 text-[#5b7c6f] text-[9px] tracking-[0.15em] font-light hover:bg-[#111a14] transition-colors">FLAG ANOMALY</button>
              <button className="bg-[#0d1410] px-3 py-2.5 text-[#5b7c6f] text-[9px] tracking-[0.15em] font-light hover:bg-[#111a14] transition-colors">ADD TO PROJECT</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadoutRow({ label, value, source, accent }: { label: string; value: string; source?: string; accent?: string; }) {
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
