'use client'
import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  X, Layers, Clock, Download, Flag, ChevronDown, ChevronUp,
  Copy, Check, ArrowLeft, Crosshair, AlertCircle, Radio,
  Thermometer, Mountain, Eye, Atom, Droplets, Zap
} from 'lucide-react'

// ── Coordinate utilities ───────────────────────────────────────────────
function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat))
}
function wrapLng(lng: number): number {
  // Normalize to [-180, 180] — handles Leaflet tile-wrap giving e.g. -439
  return ((((lng + 180) % 360) + 360) % 360) - 180
}
function sanitizeCoords(lat: number, lng: number) {
  return {
    lat: parseFloat(clampLat(lat).toFixed(5)),
    lng: parseFloat(wrapLng(lng).toFixed(5)),
  }
}

// ── Types ──────────────────────────────────────────────────────────────
interface LayerDef {
  id: string
  label: string
  group: string
  color: string
  tileUrl?: string
  wmsUrl?: string
  wmsLayer?: string
  opacity: number
  active: boolean
  source: string
  available: boolean
}
interface IntelData {
  location: { lat: number; lng: number }
  measurements: {
    ndvi?: { value: number | null; status: string; method?: string; acquired?: string; resolution_m?: number }
    sar?: { value: number | null; status: string; orbit?: string; acquired?: string; platform?: string }
    elevation?: { value: number | null; status: string; source?: string; resolution_m?: number }
    thermal?: { value: number | null; status: string; acquired?: string; method?: string }
    sentinel2_meta?: { date?: string; cloud_cover?: number; platform?: string; thumbnail?: string }
  }
  coverage_quality: number
  measurement_quality: number
  source_trace: string[]
  note: string
}

// ── Layer definitions ──────────────────────────────────────────────────
const LAYER_DEFS: LayerDef[] = [
  {
    id: 'satellite',
    label: 'Satellite Imagery',
    group: 'Base',
    color: '#38bdf8',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opacity: 1,
    active: true,
    source: 'Esri World Imagery',
    available: true,
  },
  {
    id: 'terrain',
    label: 'Terrain / Hillshade',
    group: 'Base',
    color: '#fb923c',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    opacity: 0.6,
    active: false,
    source: 'Esri World Shaded Relief',
    available: true,
  },
  {
    id: 'hydro',
    label: 'Hydrology / NHD',
    group: 'Environmental',
    color: '#06b6d4',
    wmsUrl: 'https://hydro.nationalmap.gov/arcgis/services/NHDPlus_HR/MapServer/WMSServer',
    wmsLayer: 'NHDFlowline',
    opacity: 0.8,
    active: false,
    source: 'USGS NHD',
    available: true,
  },
  {
    id: 'fema',
    label: 'FEMA Floodplain',
    group: 'Environmental',
    color: '#4ade80',
    wmsUrl: 'https://hazards.fema.gov/gis/nfhl/services/public/NFHL/MapServer/WMSServer',
    wmsLayer: '28',
    opacity: 0.65,
    active: false,
    source: 'FEMA NFHL',
    available: true,
  },
  {
    id: 'nwi',
    label: 'Wetlands (NWI)',
    group: 'Environmental',
    color: '#34d399',
    wmsUrl: 'https://www.fws.gov/wetlandsmapper/rest/services/Wetlands/MapServer/WMSServer',
    wmsLayer: '0',
    opacity: 0.7,
    active: false,
    source: 'USFWS NWI',
    available: true,
  },
  {
    id: 'geology',
    label: 'Geologic Map',
    group: 'Geophysical',
    color: '#a78bfa',
    wmsUrl: 'https://mrdata.usgs.gov/geology/state/wms.php',
    wmsLayer: 'geol_bg',
    opacity: 0.55,
    active: false,
    source: 'USGS State Geologic Maps',
    available: true,
  },
  {
    id: 'topo',
    label: 'USGS Topo',
    group: 'Base',
    color: '#fbbf24',
    tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    opacity: 0.7,
    active: false,
    source: 'USGS National Map',
    available: true,
  },
  {
    id: 'sar',
    label: 'SAR / Radar',
    group: 'Radar',
    color: '#4ade80',
    opacity: 0.7,
    active: false,
    source: 'Sentinel-1 — point readout only',
    available: false,
  },
  {
    id: 'ndvi',
    label: 'NDVI Vegetation',
    group: 'Spectral',
    color: '#86efac',
    opacity: 0.75,
    active: false,
    source: 'Sentinel-2 — point readout only',
    available: false,
  },
  {
    id: 'thermal',
    label: 'Thermal IR',
    group: 'Thermal',
    color: '#f87171',
    opacity: 0.7,
    active: false,
    source: 'Landsat-9 — point readout only',
    available: false,
  },
]

const GROUPS = ['Base', 'Environmental', 'Geophysical', 'Radar', 'Spectral', 'Thermal']
// Note: Radar/Spectral/Thermal are point-readout only via Lithic Engine

// ── ReadoutRow ─────────────────────────────────────────────────────────
function ReadoutRow({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[#1a2a1e] last:border-0">
      <span className="text-[#3a4a3e] text-[9px] tracking-[0.2em] font-light flex-shrink-0">{label}</span>
      <div className="text-right">
        <span className="font-light text-[11px]" style={{ color: accent || '#c8c4ba' }}>{value}</span>
        {sub && <span className="block text-[#2a3a2e] text-[8px] font-light">{sub}</span>}
      </div>
    </div>
  )
}

// ── Main Viewer ────────────────────────────────────────────────────────
function ViewerInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const layerRefs = useRef<Record<string, any>>({})
  const markerRef = useRef<any>(null)

  // Sanitize initial coords from URL params
  const rawLat = parseFloat(searchParams.get('lat') || '33.17429')
  const rawLng = parseFloat(searchParams.get('lng') || '-96.61903')
  const initCoords = sanitizeCoords(rawLat, rawLng)

  const [layers, setLayers] = useState<LayerDef[]>(LAYER_DEFS)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [coords, setCoords] = useState(initCoords)
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [intel, setIntel] = useState<IntelData | null>(null)
  const [intelLoading, setIntelLoading] = useState(false)
  const [intelError, setIntelError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [zoom, setZoom] = useState(14)

  // ── Fetch intel from engine ──────────────────────────────────────────
  const fetchIntel = useCallback(async (lat: number, lng: number) => {
    // Guard — never send invalid coords to engine
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
    setIntelLoading(true)
    setIntelError(false)
    setIntel(null)
    try {
      const res = await fetch(`/api/intel?lat=${lat}&lng=${lng}`)
      if (!res.ok) throw new Error('engine offline')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setIntel(data)
    } catch {
      setIntelError(true)
    } finally {
      setIntelLoading(false)
    }
  }, [])

  // ── Init Leaflet ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    const initMap = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const map = L.map(mapRef.current!, {
        center: [initCoords.lat, initCoords.lng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      })
      leafletRef.current = map

      // Base satellite tile
      const satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 1 }
      ).addTo(map)
      layerRefs.current['satellite'] = satLayer

      // Crosshair marker
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;position:relative;">
          <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#D4AF37;transform:translateY(-50%)"></div>
          <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:#D4AF37;transform:translateX(-50%)"></div>
          <div style="position:absolute;top:50%;left:50%;width:6px;height:6px;background:#D4AF37;border-radius:50%;transform:translate(-50%,-50%)"></div>
        </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
      markerRef.current = L.marker([initCoords.lat, initCoords.lng], { icon }).addTo(map)

      // Click → sanitize coords → move AOI + fetch
      map.on('click', (e: any) => {
        const safe = sanitizeCoords(e.latlng.lat, e.latlng.lng)
        setCoords(safe)
        markerRef.current?.setLatLng([safe.lat, safe.lng])
        fetchIntel(safe.lat, safe.lng)
        router.replace(`/portal/viewer?lat=${safe.lat}&lng=${safe.lng}`, { scroll: false })
      })

      // Mousemove — sanitize to prevent -439 display
      map.on('mousemove', (e: any) => {
        const safe = sanitizeCoords(e.latlng.lat, e.latlng.lng)
        setCursorCoords(safe)
      })
      map.on('mouseout', () => setCursorCoords(null))
      map.on('zoom', () => setZoom(map.getZoom()))
    }

    initMap()
    fetchIntel(initCoords.lat, initCoords.lng)
    return () => {
      leafletRef.current?.remove()
      leafletRef.current = null
    }
  }, [])

  // ── Layer toggle ─────────────────────────────────────────────────────
  const toggleLayer = useCallback(async (id: string) => {
    const L = (await import('leaflet')).default
    const map = leafletRef.current
    if (!map) return
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const newActive = !l.active
      if (!newActive) {
        layerRefs.current[id]?.remove()
        delete layerRefs.current[id]
      } else {
        if (l.tileUrl) {
          const tl = L.tileLayer(l.tileUrl, { maxZoom: 19, opacity: l.opacity })
          tl.addTo(map)
          layerRefs.current[id] = tl
        } else if (l.wmsUrl && l.wmsLayer) {
          const wl = L.tileLayer.wms(l.wmsUrl, {
            layers: l.wmsLayer,
            format: 'image/png',
            transparent: true,
            opacity: l.opacity,
          })
          wl.addTo(map)
          layerRefs.current[id] = wl
        }
      }
      return { ...l, active: newActive }
    }))
  }, [])

  const setOpacity = useCallback((id: string, opacity: number) => {
    layerRefs.current[id]?.setOpacity(opacity)
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity } : l))
  }, [])

  const toggleGroup = (g: string) => setCollapsedGroups(p => {
    const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n
  })

  const copyCoords = () => {
    navigator.clipboard.writeText(`${coords.lat}, ${coords.lng}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const ndvi = intel?.measurements?.ndvi
  const elev = intel?.measurements?.elevation
  const sar = intel?.measurements?.sar
  const thermal = intel?.measurements?.thermal
  const s2meta = intel?.measurements?.sentinel2_meta

  return (
    <div className="flex h-screen bg-[#0a0e0b] overflow-hidden font-light">

      {/* ── Layer Sidebar ─────────────────────────────────────────────── */}
      {sidebarOpen && (
        <aside className="w-60 h-full bg-[#0b0f0c] border-r border-[#1a2a1e] flex flex-col z-10 flex-shrink-0">
          <div className="px-4 py-3 border-b border-[#1a2a1e] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={11} className="text-[#5b7c6f]" />
              <span className="text-[#5b7c6f] text-[9px] tracking-[0.3em]">DATA LAYERS</span>
            </div>
            <span className="text-[#2a3a2e] text-[9px]">{layers.filter(l => l.active).length} on</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {GROUPS.map(group => {
              const gl = layers.filter(l => l.group === group)
              if (!gl.length) return null
              const collapsed = collapsedGroups.has(group)
              return (
                <div key={group}>
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-[#2a3a2e] hover:text-[#5b7c6f] transition-colors border-b border-[#111a14]"
                  >
                    <span className="text-[8px] tracking-[0.3em]">{group.toUpperCase()}</span>
                    {collapsed ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
                  </button>
                  {!collapsed && gl.map(layer => (
                    <div key={layer.id} className="border-b border-[#0f160f]">
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        <button
                          onClick={() => layer.available && toggleLayer(layer.id)}
                          disabled={!layer.available}
                          className="relative w-6 h-3 rounded-full flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ background: layer.active ? layer.color + '40' : '#1a2a1e' }}
                        >
                          <span
                            className="absolute top-0.5 w-2 h-2 rounded-full transition-all"
                            style={{
                              background: layer.active ? layer.color : '#2a3a2e',
                              left: layer.active ? '12px' : '2px',
                            }}
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] truncate transition-colors ${!layer.available ? 'text-[#2a3a2e]' : layer.active ? 'text-[#c8c4ba]' : 'text-[#3a4a3e]'}`}>
                            {layer.label}
                          </p>
                          <p className="text-[#2a3a2e] text-[8px]">{layer.source}</p>
                        </div>
                      </div>
                      {layer.active && (
                        <div className="px-4 pb-2.5 pl-12">
                          <input
                            type="range" min="0" max="1" step="0.05"
                            value={layer.opacity}
                            onChange={e => setOpacity(layer.id, Number(e.target.value))}
                            className="w-full h-px cursor-pointer"
                            style={{ accentColor: layer.color }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="px-4 py-3 border-t border-[#1a2a1e]">
            <button
              onClick={() => router.push('/portal/globe')}
              className="w-full flex items-center gap-2 text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors"
            >
              <ArrowLeft size={10} />
              <span className="text-[9px] tracking-widest">BACK TO GLOBE</span>
            </button>
          </div>
        </aside>
      )}

      {/* ── Map Area ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-20 bg-[#0b0f0c] border border-[#1a2a1e] p-2 hover:border-[#2a3d2e] transition-colors"
        >
          <Layers size={13} className="text-[#5b7c6f]" />
        </button>

        {/* Zoom controls */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-px">
          <button
            onClick={() => leafletRef.current?.zoomIn()}
            className="w-8 h-8 bg-[#0b0f0c] border border-[#1a2a1e] hover:border-[#2a3d2e] text-[#5b7c6f] text-lg leading-none flex items-center justify-center transition-colors"
          >+</button>
          <button
            onClick={() => leafletRef.current?.zoomOut()}
            className="w-8 h-8 bg-[#0b0f0c] border border-[#1a2a1e] hover:border-[#2a3d2e] text-[#5b7c6f] text-lg leading-none flex items-center justify-center transition-colors"
          >−</button>
        </div>

        {/* Map canvas */}
        <div ref={mapRef} className="w-full h-full" style={{ cursor: 'crosshair' }} />

        {/* Cursor coords — sanitized, always valid */}
        {cursorCoords && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0b0f0c]/90 border border-[#1a2a1e] px-4 py-1.5 pointer-events-none z-10">
            <span className="text-[#2a3a2e] text-[9px] tracking-widest font-mono">
              {cursorCoords.lat}° N · {cursorCoords.lng}° E · z{zoom}
            </span>
          </div>
        )}

        {/* AOI coords bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#0b0f0c]/95 border border-[#1a2a1e] px-4 py-2 flex items-center gap-3">
          <Crosshair size={10} className="text-[#D4AF37]" />
          <span className="text-[#D4AF37] text-[9px] tracking-[0.2em] font-mono">
            {coords.lat}° · {coords.lng}°
          </span>
          <button onClick={copyCoords} className="text-[#2a3a2e] hover:text-[#5b7c6f] transition-colors">
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </button>
        </div>
      </div>

      {/* ── Intel Panel ───────────────────────────────────────────────── */}
      <div className="w-64 h-full bg-[#0b0f0c] border-l border-[#1a2a1e] flex flex-col z-10 flex-shrink-0">
        <div className="px-4 py-3 border-b border-[#1a2a1e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#5b7c6f]" />
            <span className="text-[#5b7c6f] text-[9px] tracking-[0.3em]">LITHIC ENGINE</span>
          </div>
          {intelLoading && (
            <span className="text-[#2a3a2e] text-[8px] animate-pulse">SCANNING...</span>
          )}
          {!intelLoading && intel && (
            <span className="text-[#2a3a2e] text-[8px]">
              {Math.round(intel.measurement_quality * 100)}% PIXEL
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {intelLoading && (
            <div className="p-6 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border border-[#1a2a1e] border-t-[#5b7c6f] rounded-full animate-spin" />
              <p className="text-[#2a3a2e] text-[9px] tracking-widest">QUERYING SATELLITES</p>
            </div>
          )}

          {intelError && !intelLoading && (
            <div className="p-5">
              <div className="border border-[#f87171]/20 px-4 py-3 flex items-start gap-2">
                <AlertCircle size={11} className="text-[#f87171] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#f87171] text-[9px] tracking-widest mb-1">ENGINE OFFLINE</p>
                  <p className="text-[#3a4a3e] text-[8px] leading-relaxed">
                    Start the Lithic Engine locally on port 8000 to enable real data.
                  </p>
                </div>
              </div>
            </div>
          )}

          {intel && !intelLoading && (
            <div className="p-4 space-y-4">
              {/* Location */}
              <div>
                <p className="text-[#2a3a2e] text-[8px] tracking-[0.25em] mb-2">COORDINATES</p>
                <ReadoutRow label="LAT" value={`${intel.location.lat}°`} />
                <ReadoutRow label="LNG" value={`${intel.location.lng}°`} />
              </div>

              {/* Elevation */}
              {elev?.status === 'found' && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Mountain size={9} style={{ color: '#fb923c' }} />
                    <p className="text-[8px] tracking-[0.25em]" style={{ color: '#fb923c' }}>ELEVATION</p>
                  </div>
                  <ReadoutRow
                    label="ALT"
                    value={`${elev.value}m`}
                    sub={`${elev.source} · ${elev.resolution_m}m res`}
                    accent="#fb923c"
                  />
                </div>
              )}

              {/* NDVI */}
              {ndvi?.status === 'found' && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Eye size={9} style={{ color: '#4ade80' }} />
                    <p className="text-[8px] tracking-[0.25em]" style={{ color: '#4ade80' }}>VEGETATION</p>
                  </div>
                  <ReadoutRow
                    label="NDVI"
                    value={ndvi.value !== null ? ndvi.value.toString() : '—'}
                    sub={ndvi.method === 'pixel_sample_B08_B04' ? '10m pixel · B08/B04' : 'scene estimate'}
                    accent={ndvi.value !== null ? (ndvi.value > 0.5 ? '#4ade80' : ndvi.value > 0.2 ? '#fbbf24' : '#f87171') : '#3a4a3e'}
                  />
                  {s2meta?.cloud_cover !== undefined && (
                    <ReadoutRow
                      label="CLOUD"
                      value={`${s2meta.cloud_cover.toFixed(1)}%`}
                      sub={s2meta.date?.slice(0, 10)}
                    />
                  )}
                </div>
              )}

              {/* SAR */}
              {sar?.status === 'found' && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Radio size={9} style={{ color: '#38bdf8' }} />
                    <p className="text-[8px] tracking-[0.25em]" style={{ color: '#38bdf8' }}>SAR / RADAR</p>
                  </div>
                  <ReadoutRow label="PLATFORM" value={sar.platform ?? '—'} accent="#38bdf8" />
                  <ReadoutRow label="ORBIT" value={sar.orbit ?? '—'} sub={sar.acquired?.slice(0, 10)} />
                </div>
              )}

              {/* Thermal */}
              {thermal?.status === 'found' && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Thermometer size={9} style={{ color: '#f87171' }} />
                    <p className="text-[8px] tracking-[0.25em]" style={{ color: '#f87171' }}>THERMAL</p>
                  </div>
                  <ReadoutRow
                    label="LST"
                    value={thermal.value !== null ? `${thermal.value}°C` : 'scene confirmed'}
                    sub={thermal.acquired?.slice(0, 10) + ' · 30m'}
                    accent="#f87171"
                  />
                </div>
              )}

              {/* Quality */}
              <div className="border-t border-[#1a2a1e] pt-3">
                <p className="text-[#2a3a2e] text-[8px] tracking-[0.25em] mb-2">DATA QUALITY</p>
                <div className="flex gap-1 mb-2">
                  <div className="flex-1">
                    <div className="h-1 bg-[#1a2a1e] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#5b7c6f] rounded-full transition-all"
                        style={{ width: `${intel.coverage_quality * 100}%` }}
                      />
                    </div>
                    <p className="text-[#2a3a2e] text-[7px] mt-1">COVERAGE {Math.round(intel.coverage_quality * 100)}%</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-1 bg-[#1a2a1e] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#D4AF37] rounded-full transition-all"
                        style={{ width: `${intel.measurement_quality * 100}%` }}
                      />
                    </div>
                    <p className="text-[#2a3a2e] text-[7px] mt-1">PIXEL {Math.round(intel.measurement_quality * 100)}%</p>
                  </div>
                </div>
                {intel.note && (
                  <p className="text-[#2a3a2e] text-[8px] leading-relaxed border-l border-[#1a2a1e] pl-2">
                    {intel.note}
                  </p>
                )}
              </div>

              {/* Source trace */}
              {intel.source_trace.length > 0 && (
                <div className="border-t border-[#1a2a1e] pt-3">
                  <p className="text-[#2a3a2e] text-[8px] tracking-[0.25em] mb-2">SOURCE TRACE</p>
                  {intel.source_trace.map((s, i) => (
                    <p key={i} className="text-[#2a3a2e] text-[8px] leading-relaxed border-l border-[#1a2a1e] pl-2 mb-1">
                      {s}
                    </p>
                  ))}
                </div>
              )}

              {/* Thumbnail */}
              {s2meta?.thumbnail && (
                <div className="border-t border-[#1a2a1e] pt-3">
                  <p className="text-[#2a3a2e] text-[8px] tracking-[0.25em] mb-2">SENTINEL-2 PREVIEW</p>
                  <img
                    src={s2meta.thumbnail}
                    alt="Sentinel-2 scene"
                    className="w-full border border-[#1a2a1e]"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <p className="text-[#2a3a2e] text-[7px] mt-1">{s2meta.date?.slice(0, 10)} · {s2meta.platform}</p>
                </div>
              )}
            </div>
          )}

          {!intel && !intelLoading && !intelError && (
            <div className="p-6 text-center">
              <Zap size={20} className="text-[#1a2a1e] mx-auto mb-3" />
              <p className="text-[#2a3a2e] text-[9px] tracking-widest">CLICK MAP TO ANALYZE</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-[#1a2a1e] p-3 space-y-2">
          <button
            onClick={() => fetchIntel(coords.lat, coords.lng)}
            disabled={intelLoading}
            className="w-full py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[9px] tracking-[0.2em] transition-colors disabled:opacity-40"
          >
            {intelLoading ? 'SCANNING...' : '↻ REFRESH INTEL'}
          </button>
          <button
            onClick={() => router.push(`/portal/reports/new?lat=${coords.lat}&lng=${coords.lng}`)}
            className="w-full py-2 border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 text-[#D4AF37] text-[9px] tracking-[0.2em] transition-colors"
          >
            → OPEN IN CETO
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Export with Suspense (required for useSearchParams) ────────────────
export default function ViewerPage() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-[#0a0e0b] flex items-center justify-center">
        <div className="text-[#2a3a2e] text-[9px] tracking-[0.3em]">INITIALIZING...</div>
      </div>
    }>
      <ViewerInner />
    </Suspense>
  )
}
