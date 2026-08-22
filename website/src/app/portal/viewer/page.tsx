'use client'
import { useEffect, useRef, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  X, Layers, ChevronDown, ChevronUp, Search,
  Copy, Check, ArrowLeft, Crosshair, AlertCircle, Radio,
  Thermometer, Mountain, Eye, Atom, Zap, History, Plus, Clock, Wrench
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

type AOIMode = 'pin' | 'rectangle' | 'polygon'

type AOIGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'Polygon'; coordinates: [number, number][][] }

type TerrainProfilePoint = {
  distance: number
  elevation: number
}

type SavedAOI = {
  id: string
  name: string
  geometry: AOIGeometry
  lat: number
  lng: number
  zoom: number
  created_at: string
}

function polygonCenter(ring: [number, number][]) {
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring
  const lng = pts.reduce((sum, p) => sum + p[0], 0) / Math.max(pts.length, 1)
  const lat = pts.reduce((sum, p) => sum + p[1], 0) / Math.max(pts.length, 1)
  return sanitizeCoords(lat, lng)
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
  cdseAuth?: boolean
}

// ── Historical overlay types ───────────────────────────────────────────
// Rows come from public.historical_maps via the historical_maps_in_bbox
// RPC. Three delivery kinds:
//   xyz     — a {z}/{x}/{y} template (Georeferencer WMTS→XYZ, gdal2tiles, COG)
//   wms     — a WMS GetMap endpoint (Klokan Georeferencer exposes these)
//   allmaps — an IIIF Georeference Annotation, warped client-side
type HistoricalKind = 'xyz' | 'wms' | 'allmaps'

interface HistoricalMap {
  id: string
  title: string
  year: number | null
  publisher: string | null
  source: string
  kind: HistoricalKind
  tile_url: string | null
  wms_url: string | null
  wms_layer: string | null
  annotation_url: string | null
  min_zoom: number | null
  max_zoom: number | null
  attribution: string
  license: string
  proxy: boolean
  /** [west, south, east, north] */
  bbox: [number, number, number, number]
}

interface ActiveHistorical {
  map: HistoricalMap
  opacity: number
}

/** Licenses clear for commercial client deliverables. Everything else is
 *  viewer-only and gets stripped from report export. */
const COMMERCIAL_OK = new Set(['public-domain', 'cc0', 'licensed'])

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

interface ScanCandidate {
  id: string
  lat: number
  lng: number
  score: number
  terrain_score: number
  ndvi_signal: number
  sar_signal: number
  confidence: string
  height_above_mean_m: number
  diameter_m: number
  circularity: number
  point_count: number
  type: string
  sensors: string[]
  ndvi_detail: string
  muon_detail: string
}
interface SpectralData {
  ndvi_mean: number
  ndvi_std: number
  cloud_cover: number
  date: string
  pixel_count: number
  valid: boolean
}
interface MuonBaseline {
  flux_m2_min: number
  void_threshold_m2_min: number
  kp_index: number
  cutoff_rigidity_gv: number
  model: string
  valid: boolean
}
interface ScanCluster {
  id: string
  lat: number
  lng: number
  members: ScanCandidate[]
  score: number
}

interface ScanData {
  candidates: ScanCandidate[]
  radius_m: number
  grid: { spacing_m: number; sample_count: number; sampled_count: number }
  terrain: { mean_elevation_m: number; std_elevation_m: number; threshold_m: number; elevated_point_count: number; source: string }
  spectral: SpectralData
  muon_baseline: MuonBaseline
  note: string
}

// ── Layer definitions ──────────────────────────────────────────────────
const LAYER_DEFS: LayerDef[] = [{
    id: 'satellite', label: 'Satellite Imagery', group: 'Base', color: '#38bdf8', tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opacity: 1, active: true, source: 'Esri World Imagery', available: true, }, {
    id: 'terrain', label: 'Terrain / Hillshade', group: 'Base', color: '#fb923c', tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', opacity: 0.6, active: false, source: 'Esri World Shaded Relief', available: true, }, {
    id: 'topo', label: 'USGS Topo', group: 'Base', color: '#fbbf24', tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', opacity: 0.7, active: false, source: 'USGS National Map', available: true, }, {
    id: 'hydro', label: 'Hydrology / NHD', group: 'Environmental', color: '#06b6d4', wmsUrl: 'https://hydro.nationalmap.gov/arcgis/services/NHDPlus_HR/MapServer/WMSServer', wmsLayer: 'NHDFlowline', opacity: 0.8, active: false, source: 'USGS NHD', available: true, }, {
    id: 'fema', label: 'FEMA Floodplain', group: 'Environmental', color: '#4ade80', wmsUrl: 'https://hazards.fema.gov/gis/nfhl/services/public/NFHLWMS/MapServer/WMSServer', wmsLayer: '28', opacity: 0.65, active: false, source: 'FEMA NFHL', available: true, }, {
    id: 'nwi', label: 'Wetlands (NWI)', group: 'Environmental', color: '#34d399', wmsUrl: 'https://www.fws.gov/wetlandsmapper/rest/services/Wetlands/MapServer/WMSServer', wmsLayer: '0', opacity: 0.7, active: false, source: 'USFWS NWI', available: true, }, {
    id: 'geology', label: 'Geologic Map', group: 'Geophysical', color: '#a78bfa', wmsUrl: 'https://mrdata.usgs.gov/services/geology/wms', wmsLayer: 'geol_bg', opacity: 0.55, active: false, source: 'USGS State Geologic Maps', available: true, }, {
    id: 'lidar', label: 'LiDAR Bare Earth', group: 'Geophysical', color: '#f59e0b', tileUrl: 'https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/tile/{z}/{y}/{x}', opacity: 0.7, active: false, source: 'USGS 3DEP LiDAR Index', available: true, }, {
    id: 'lidar_hs', label: 'LiDAR Hillshade', group: 'Geophysical', color: '#fcd34d', wmsUrl: 'https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer', wmsLayer: '3DEPElevation:Hillshade Gray', opacity: 0.6, active: false, source: 'USGS 3DEP Elevation', available: true, }, {
    id: 'lidar_1m', label: 'LiDAR 1m (High Res)', group: 'Geophysical', color: '#f97316', wmsUrl: 'https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer', wmsLayer: '3DEPElevation:Hillshade Multidirectional', opacity: 0.7, active: false, source: 'USGS 3DEP 1m LiDAR', available: true, }, {
    id: 'bathy_lavon', label: 'Lake Depth — Lavon', group: 'Bathymetry', color: '#3fb3a5', tileUrl: '/bathy/lavon_color_tiles/{z}/{x}/{y}.png', opacity: 0.85, active: false, source: 'TWDB 2021 Hydrographic Survey', available: true, }, {
    id: 'cdse_ndvi', label: 'NDVI (Live S2)', group: 'Spectral', color: '#86efac', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1', wmsLayer: 'NDVI', opacity: 0.75, active: false, source: 'Copernicus S2 L2A', available: true, cdseAuth: true, }, {
    id: 'cdse_false_color', label: 'False Color (Vegetation)', group: 'Spectral', color: '#4ade80', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1', wmsLayer: 'FALSE_COLOR', opacity: 0.75, active: false, source: 'Copernicus S2 L2A', available: true, cdseAuth: true, }, {
    id: 'cdse_swir', label: 'SWIR', group: 'Spectral', color: '#f97316', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1', wmsLayer: 'SWIR', opacity: 0.75, active: false, source: 'Copernicus S2 L2A', available: true, cdseAuth: true, }, {
    id: 'cdse_geology', label: 'Geology (S2)', group: 'Geophysical', color: '#a78bfa', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1', wmsLayer: 'GEOLOGY', opacity: 0.75, active: false, source: 'Copernicus S2 L2A', available: true, cdseAuth: true, }, {
    id: 'cdse_sar_iw_vv', label: 'SAR IW-VV dB (Live)', group: 'Radar', color: '#4ade80', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/38df2b92-62bd-4b7d-a4db-94f011c7b386', wmsLayer: 'IW_VV_DB', opacity: 0.9, active: false, source: 'Copernicus S1 GRD', available: true, cdseAuth: true, }, {
    id: 'cdse_sar_iw_vh', label: 'SAR IW-VH dB (Live)', group: 'Radar', color: '#86efac', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/38df2b92-62bd-4b7d-a4db-94f011c7b386', wmsLayer: 'IW-VH-DB', opacity: 0.9, active: false, source: 'Copernicus S1 GRD', available: true, cdseAuth: true, }, {
    id: 'cdse_ndwi', label: 'NDWI (Water Index)', group: 'Spectral', color: '#0ea5e9', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1', wmsLayer: 'NDWI', opacity: 0.75, active: false, source: 'Copernicus S2 L2A', available: true, cdseAuth: true, }, {
    id: 'cdse_moisture', label: 'Moisture Index', group: 'Spectral', color: '#38bdf8', wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1', wmsLayer: 'MOISTURE_INDEX', opacity: 0.75, active: false, source: 'Copernicus S2 L2A', available: true, cdseAuth: true, }, {
    id: 'sar', label: 'SAR / Radar', group: 'Radar', color: '#4ade80', opacity: 0.7, active: false, source: 'Sentinel-1 — point readout only', available: false, }, {
    id: 'ndvi', label: 'NDVI Vegetation', group: 'Spectral', color: '#86efac', opacity: 0.75, active: false, source: 'Sentinel-2 — point readout only', available: false, }, {
    id: 'thermal', label: 'Thermal IR', group: 'Thermal', color: '#f87171', opacity: 0.7, active: false, source: 'Landsat-9 — point readout only', available: false, }]

const GROUP_ORDER = ['Base', 'Environmental', 'Geophysical', 'Bathymetry', 'Radar', 'Spectral', 'Thermal']

// ── One-tap layer presets ──────────────────────────────────────────────
// Each preset replaces the whole overlay stack. Satellite stays as the
// base in every preset so the map never goes blank.
const PRESETS: { id: string; label: string; hint: string; layers: string[] }[] = [
  { id: 'survey',   label: 'Survey',   hint: 'Clean satellite base',              layers: ['satellite'] },
  { id: 'terrain',  label: 'Terrain',  hint: 'LiDAR hillshade + topo',            layers: ['satellite', 'lidar_hs', 'topo'] },
  { id: 'water',    label: 'Water',    hint: 'NHD + wetlands + floodplain',       layers: ['satellite', 'hydro', 'nwi', 'fema'] },
  { id: 'spectral', label: 'Spectral', hint: 'Live Sentinel-2 NDVI',              layers: ['satellite', 'cdse_ndvi'] },
  { id: 'radar',    label: 'Radar',    hint: 'Live Sentinel-1 SAR VV',            layers: ['satellite', 'cdse_sar_iw_vv'] },
  { id: 'geology',  label: 'Geology',  hint: 'USGS state geologic maps',          layers: ['satellite', 'geology'] },
]

/** Create + attach a Leaflet layer for a LayerDef. Shared by toggle,
 *  presets, and init so the mounting logic exists exactly once. */
async function mountLayer(map: any, l: LayerDef): Promise<any | null> {
  const L = (await import('leaflet')).default
  if (l.tileUrl) {
    const tileMaxZoom = l.id === 'topo' ? 16 : 19
    const tl = L.tileLayer(l.tileUrl, { maxZoom: tileMaxZoom, opacity: l.opacity })
    tl.on('tileerror', (err: any) => console.warn('[viewer] tile error', l.id, err))
    tl.addTo(map)
    return tl
  }
  if (l.wmsUrl && l.wmsLayer) {
    if (l.cdseAuth) {
      // Authenticated CDSE WMS — proxy through /api/cdse/tiles
      const baseWms = `${l.wmsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(l.wmsLayer)}&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256`
      const tl = L.tileLayer(
        `/api/cdse/tiles?url=${encodeURIComponent(baseWms + '&BBOX={bbox-epsg-3857}')}`,
        { maxZoom: 19, opacity: l.opacity ?? 0.85, tileSize: 256, className: 'cdse-overlay' }
      )
      tl.addTo(map)
      return tl
    }
    const wl = L.tileLayer.wms(l.wmsUrl, {
      layers: l.wmsLayer,
      format: 'image/png',
      transparent: true,
      opacity: l.opacity,
    })
    wl.on('tileerror', (err: any) => console.warn('[viewer] WMS error', l.id, err))
    wl.addTo(map)
    return wl
  }
  return null
}

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

// ── Panel tab ids ──────────────────────────────────────────────────────
type SideTab = 'layers' | 'historical'
type PanelTab = 'intel' | 'scan' | 'tools' | 'time'

// ── Main Viewer ────────────────────────────────────────────────────────
function ViewerInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const layerRefs = useRef<Record<string, any>>({})
  const markerRef = useRef<any>(null)
  const aoiLayerRef = useRef<any>(null)
  const aoiGuideLayerRef = useRef<any>(null)
  const aoiModeRef = useRef<AOIMode>('pin')
  const rectangleStartRef = useRef<{ lat: number; lng: number } | null>(null)
  const polygonPointsRef = useRef<[number, number][]>([])
  const geojsonImportRef = useRef<HTMLInputElement>(null)
  const terrainStartRef = useRef<{ lat: number; lng: number } | null>(null)
  const terrainLineRef = useRef<any>(null)
  const scanLayerRef = useRef<any>(null)
  const webglCanvasRef = useRef<HTMLCanvasElement>(null)
  // Historical overlays live in their own Leaflet pane so they stack above
  // the basemap but below AOI vectors, markers and the scan layer.
  const histLayerRefs = useRef<Record<string, any>>({})

  // Sanitize initial coords from URL params.
  // Defaults to Lake Lavon instead of null island when opened bare.
  const rawLat = parseFloat(searchParams.get('lat') || '33.03407')
  const rawLng = parseFloat(searchParams.get('lng') || '-96.48694')
  const initCoords = sanitizeCoords(rawLat, rawLng)

  const [layers, setLayers] = useState<LayerDef[]>(() => {
    const requested = (searchParams.get('layers') || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean)

    if (!requested.length) return LAYER_DEFS

    return LAYER_DEFS.map(layer => ({
      ...layer,
      active: layer.active || requested.includes(layer.id),
    }))
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sideTab, setSideTab] = useState<SideTab>('layers')
  const [panelTab, setPanelTab] = useState<PanelTab>('intel')
  const [layerQuery, setLayerQuery] = useState('')
  const [coords, setCoords] = useState(initCoords)
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [intel, setIntel] = useState<IntelData | null>(null)
  const [intelLoading, setIntelLoading] = useState(false)
  const [intelError, setIntelError] = useState(false)
  const [copied, setCopied] = useState(false)
  const initialZoom = Number.isFinite(parseInt(searchParams.get('zoom') || '14', 10)) ? parseInt(searchParams.get('zoom') || '14', 10) : 14
  const [zoom, setZoom] = useState(initialZoom)
  const [scan, setScan] = useState<ScanData | null>(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [aoiMode, setAoiMode] = useState<AOIMode>('pin')
  const [aoiGeometry, setAoiGeometry] = useState<AOIGeometry | null>({
    type: 'Point',
    coordinates: [initCoords.lng, initCoords.lat],
  })
  const [aoiSaveStatus, setAoiSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedAOIs, setSavedAOIs] = useState<SavedAOI[]>([])
  const [aoiHistory, setAoiHistory] = useState<SavedAOI[]>([])
  const [shareCopied, setShareCopied] = useState(false)
  const [terrainMode, setTerrainMode] = useState(false)
  const [terrainProfile, setTerrainProfile] = useState<TerrainProfilePoint[]>([])
  const [timeSlider, setTimeSlider] = useState(50)
  const [temporalMode, setTemporalMode] = useState(false)
  const [webglOverlay, setWebglOverlay] = useState(false)
  const [intelDrawerOpen, setIntelDrawerOpen] = useState(false)

  // ── Historical overlay state ────────────────────────────────────────
  const [histResults, setHistResults] = useState<HistoricalMap[]>([])
  const [histActive, setHistActive] = useState<ActiveHistorical[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState<string | null>(null)
  const [histRange, setHistRange] = useState<[number, number]>([1850, 2010])
  const [swipe, setSwipe] = useState<number | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerBusy, setRegisterBusy] = useState(false)
  const [registerForm, setRegisterForm] = useState({
    title: '', year: '', publisher: '', kind: 'xyz' as HistoricalKind,
    url: '', attribution: '', license: 'public-domain', proxy: true,
  })

  // ── Refs mirroring state, for the once-registered Leaflet handlers ──
  // The map click handler is attached ONE time at init, so its closure
  // permanently captures the FIRST render's state. Anything it reads
  // must go through a ref — this stale closure is exactly why terrain
  // profile mode never fired from map clicks before.
  const terrainModeRef = useRef(false)
  useEffect(() => { terrainModeRef.current = terrainMode }, [terrainMode])

  const coordsRef = useRef(initCoords)
  useEffect(() => { coordsRef.current = coords }, [coords])

  const intelRef = useRef<IntelData | null>(null)
  useEffect(() => { intelRef.current = intel }, [intel])

  const layersRef = useRef<LayerDef[]>(layers)
  useEffect(() => { layersRef.current = layers }, [layers])

  const histRangeRef = useRef(histRange)
  useEffect(() => { histRangeRef.current = histRange }, [histRange])

  const swipeRef = useRef<number | null>(null)
  useEffect(() => { swipeRef.current = swipe }, [swipe])

  const setAOIModeSafe = useCallback((mode: AOIMode) => {
    aoiModeRef.current = mode
    setAoiMode(mode)
    setAoiSaveStatus('idle')
    rectangleStartRef.current = null
    polygonPointsRef.current = []
    aoiGuideLayerRef.current?.remove()
    aoiGuideLayerRef.current = null
  }, [])

  const redrawAOI = useCallback(async (geometry: AOIGeometry) => {
    const L = (await import('leaflet')).default
    const map = leafletRef.current
    if (!map) return

    aoiLayerRef.current?.remove()

    if (geometry.type === 'Point') {
      const [lng, lat] = geometry.coordinates
      aoiLayerRef.current = L.circleMarker([lat, lng], {
        radius: 9,
        color: '#D4AF37',
        weight: 2,
        fillColor: '#D4AF37',
        fillOpacity: 0.25,
      }).addTo(map)
      markerRef.current?.setLatLng([lat, lng])
      return
    }

    const ring = geometry.coordinates[0]
    const latlngs = ring.map(([lng, lat]) => [lat, lng] as [number, number])
    aoiLayerRef.current = L.polygon(latlngs, {
      color: '#D4AF37',
      weight: 2,
      fillColor: '#D4AF37',
      fillOpacity: 0.12,
    }).addTo(map)
  }, [])

  const rememberAOI = useCallback((geometry: AOIGeometry, center: { lat: number; lng: number }) => {
    const item: SavedAOI = {
      id: `aoi-${Date.now()}`,
      name: `AOI ${center.lat}, ${center.lng}`,
      geometry,
      lat: center.lat,
      lng: center.lng,
      zoom,
      created_at: new Date().toISOString(),
    }
    setAoiHistory(prev => [item, ...prev].slice(0, 8))
  }, [zoom])

  // ── HISTORICAL OVERLAYS ─────────────────────────────────────────────

  /**
   * Swipe compare. Leaflet tile containers are absolutely positioned inside
   * a mapPane that gets CSS-transformed on every pan, so a percentage
   * clip-path would drift with the map. Recompute the clip rect in LAYER
   * point space on every move — same trick leaflet-side-by-side uses.
   */
  const updateSwipeClip = useCallback(() => {
    const map = leafletRef.current
    if (!map) return
    const fraction = swipeRef.current
    const entries = Object.values(histLayerRefs.current)

    if (fraction === null) {
      entries.forEach((e: any) => {
        const el = e?.layer?.getContainer?.() ?? e?.layer?._container
        if (el) el.style.clip = ''
      })
      return
    }

    const size = map.getSize()
    const nw = map.containerPointToLayerPoint([0, 0])
    const se = map.containerPointToLayerPoint([size.x, size.y])
    const cut = map.containerPointToLayerPoint([size.x * fraction, 0]).x
    const rect = `rect(${nw.y}px, ${cut}px, ${se.y}px, ${nw.x}px)`

    entries.forEach((e: any) => {
      const el = e?.layer?.getContainer?.() ?? e?.layer?._container
      if (el) el.style.clip = rect
    })
  }, [])

  /** Query the PostGIS catalog for maps intersecting the current view. */
  const searchHistorical = useCallback(async () => {
    const map = leafletRef.current
    if (!map) return
    setHistLoading(true)
    setHistError(null)
    try {
      const b = map.getBounds()
      const [from, to] = histRangeRef.current
      const { data, error } = await supabase.rpc('historical_maps_in_bbox', {
        w: b.getWest(),
        s: b.getSouth(),
        e: b.getEast(),
        n: b.getNorth(),
        year_from: from,
        year_to: to,
      })
      if (error) throw error
      setHistResults((data ?? []) as HistoricalMap[])
    } catch (err) {
      console.warn('[viewer] historical catalog query failed', err)
      setHistError('Catalog unavailable')
      setHistResults([])
    } finally {
      setHistLoading(false)
    }
  }, [])

  const searchHistoricalRef = useRef(searchHistorical)
  useEffect(() => { searchHistoricalRef.current = searchHistorical }, [searchHistorical])

  const addHistorical = useCallback(async (hm: HistoricalMap) => {
    const L = (await import('leaflet')).default
    const map = leafletRef.current
    if (!map || histLayerRefs.current[hm.id]) return

    const bounds = L.latLngBounds(
      [hm.bbox[1], hm.bbox[0]],
      [hm.bbox[3], hm.bbox[2]]
    )
    const opacity = 0.7
    let layer: any = null

    try {
      if (hm.kind === 'allmaps' && hm.annotation_url) {
        // Warps the IIIF image client-side — no tiles, no GeoTIFF.
        // Requires: npm i @allmaps/leaflet
        const mod: any = await import('@allmaps/leaflet')
        layer = new mod.WarpedMapLayer(undefined, { pane: 'historical' })
        layer.addTo(map)
        await layer.addGeoreferenceAnnotationByUrl(hm.annotation_url)
        layer.setOpacity?.(opacity)
      } else if (hm.kind === 'wms' && hm.wms_url && hm.wms_layer) {
        layer = L.tileLayer.wms(hm.wms_url, {
          layers: hm.wms_layer,
          format: 'image/png',
          transparent: true,
          opacity,
          pane: 'historical',
          bounds,
          maxZoom: hm.max_zoom ?? 19,
        })
        layer.on('tileerror', () => console.warn('[viewer] historical WMS error', hm.id))
        layer.addTo(map)
      } else if (hm.tile_url) {
        // Placeholders stay OUTSIDE the encoded src so Leaflet can fill them
        // and the proxy route can substitute them server-side.
        const url = hm.proxy
          ? `/api/tiles/proxy?src=${encodeURIComponent(hm.tile_url)}&z={z}&x={x}&y={y}`
          : hm.tile_url
        layer = L.tileLayer(url, {
          opacity,
          pane: 'historical',
          bounds,
          minZoom: hm.min_zoom ?? 0,
          maxZoom: hm.max_zoom ?? 19,
          crossOrigin: true,
        })
        layer.on('tileerror', () => console.warn('[viewer] historical tile error', hm.id))
        layer.addTo(map)
      }
    } catch (err) {
      console.error('[viewer] failed to add historical overlay', hm.id, err)
      return
    }

    if (!layer) return
    histLayerRefs.current[hm.id] = { layer, meta: hm }
    setHistActive(prev => [...prev, { map: hm, opacity }])
    updateSwipeClip()
  }, [updateSwipeClip])

  const removeHistorical = useCallback((id: string) => {
    const entry = histLayerRefs.current[id]
    if (entry?.layer) {
      try { entry.layer.remove() } catch { /* already gone */ }
    }
    delete histLayerRefs.current[id]
    setHistActive(prev => prev.filter(a => a.map.id !== id))
  }, [])

  const setHistoricalOpacity = useCallback((id: string, value: number) => {
    const entry = histLayerRefs.current[id]
    entry?.layer?.setOpacity?.(value)
    setHistActive(prev => prev.map(a => a.map.id === id ? { ...a, opacity: value } : a))
  }, [])

  const toggleHistorical = useCallback((hm: HistoricalMap) => {
    if (histLayerRefs.current[hm.id]) removeHistorical(hm.id)
    else addHistorical(hm)
  }, [addHistorical, removeHistorical])

  const registerHistorical = useCallback(async () => {
    const map = leafletRef.current
    if (!map || !registerForm.title || !registerForm.url) return
    setRegisterBusy(true)
    try {
      const b = map.getBounds()
      const { error } = await supabase.rpc('register_historical_map', {
        p_title: registerForm.title,
        p_year: registerForm.year ? parseInt(registerForm.year, 10) : null,
        p_publisher: registerForm.publisher || null,
        p_source: 'manual',
        p_kind: registerForm.kind,
        p_tile_url: registerForm.kind === 'xyz' ? registerForm.url : null,
        p_annotation_url: registerForm.kind === 'allmaps' ? registerForm.url : null,
        p_wms_url: registerForm.kind === 'wms' ? registerForm.url : null,
        p_wms_layer: null,
        p_attribution: registerForm.attribution || 'Unattributed',
        p_license: registerForm.license,
        p_proxy: registerForm.proxy,
        p_w: b.getWest(),
        p_s: b.getSouth(),
        p_e: b.getEast(),
        p_n: b.getNorth(),
      })
      if (error) throw error
      setRegisterForm(f => ({ ...f, title: '', year: '', url: '' }))
      setRegisterOpen(false)
      await searchHistoricalRef.current()
    } catch (err) {
      console.error('[viewer] register historical map failed', err)
      setHistError('Register failed')
    } finally {
      setRegisterBusy(false)
    }
  }, [registerForm])

  // Re-query when the year band changes.
  useEffect(() => {
    if (!leafletRef.current) return
    const t = setTimeout(() => void searchHistoricalRef.current(), 250)
    return () => clearTimeout(t)
  }, [histRange])

  // Keep the swipe cut pinned to the viewport through pan/zoom/resize.
  useEffect(() => {
    const map = leafletRef.current
    if (!map) return
    updateSwipeClip()
    map.on('move zoom viewreset resize', updateSwipeClip)
    return () => { map.off('move zoom viewreset resize', updateSwipeClip) }
  }, [swipe, histActive, updateSwipeClip])

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

  const clusterCandidates = useCallback((candidates: ScanCandidate[]): ScanCluster[] => {
    const visited = new Set<string>()
    const clusters: ScanCluster[] = []

    const threshold = 0.0025 // ~250m

    function dist(a: ScanCandidate, b: ScanCandidate) {
      const dx = a.lng - b.lng
      const dy = a.lat - b.lat
      return Math.sqrt(dx * dx + dy * dy)
    }

    for (const c of candidates) {
      if (visited.has(c.id)) continue

      const neighbors = candidates.filter(n => dist(c, n) < threshold)

      if (neighbors.length < 2) continue

      neighbors.forEach(n => visited.add(n.id))

      const lat = neighbors.reduce((s, n) => s + n.lat, 0) / neighbors.length
      const lng = neighbors.reduce((s, n) => s + n.lng, 0) / neighbors.length
      const score = neighbors.reduce((s, n) => s + n.score, 0) / neighbors.length

      clusters.push({
        id: `cluster-${c.id}`,
        lat,
        lng,
        members: neighbors,
        score,
      })
    }

    return clusters
  }, [])

  // ── Fetch scan from engine ──────────────────────────────────────────
  const fetchScan = useCallback(async (lat: number, lng: number) => {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
    setScanLoading(true)
    setScan(null)
    if (scanLayerRef.current && leafletRef.current) {
      scanLayerRef.current.remove()
      scanLayerRef.current = null
    }
    try {
      const res = await fetch(`/api/scan?lat=${lat}&lng=${lng}&radius=600`)
      if (!res.ok) throw new Error('scan failed')
      const data: ScanData = await res.json()
      setScan(data)
      if (leafletRef.current && data.candidates?.length) {
        const L = (await import('leaflet')).default
        const group = L.layerGroup()
        const clusters = clusterCandidates(data.candidates)

        clusters.forEach((cluster) => {
          const intensity =
            cluster.score > 0.7 ? '#ef4444' :
            cluster.score > 0.45 ? '#f59e0b' :
            '#5b7c6f'

          L.circle([cluster.lat, cluster.lng], {
            radius: 140,
            color: intensity,
            weight: 1,
            opacity: 0.9,
            fillColor: intensity,
            fillOpacity: 0.08,
          }).bindTooltip(
            `<div style="font-size:10px;font-family:monospace;background:#0b0f0c;border:1px solid #1a2a1e;color:#c8c4ba;padding:4px 8px"><b>ANOMALY CLUSTER</b><br/>members: ${cluster.members.length}<br/>confidence: ${(cluster.score * 100).toFixed(0)}%</div>`
          ).addTo(group)

          L.circleMarker([cluster.lat, cluster.lng], {
            radius: 6,
            color: intensity,
            weight: 2,
            fillColor: intensity,
            fillOpacity: 0.9,
          }).addTo(group)
        })

        data.candidates.forEach((c) => {
          const color = c.score > 0.7 ? '#f87171' : c.score > 0.4 ? '#fbbf24' : '#5b7c6f'
          L.circle([c.lat, c.lng], {
            radius: c.diameter_m / 2,
            color, weight: 1, opacity: 0.9,
            fillColor: color, fillOpacity: 0.15,
          }).bindTooltip(
            `<div style="font-size:10px;font-family:monospace;background:#0b0f0c;border:1px solid #1a2a1e;color:#c8c4ba;padding:4px 8px"><b>${c.type}</b><br/>score: ${c.score.toFixed(2)} · ⌀${Math.round(c.diameter_m)}m · +${c.height_above_mean_m}m</div>`,
            { className: '', permanent: false }
          ).addTo(group)
          L.circleMarker([c.lat, c.lng], {
            radius: 3, color, weight: 1, fillColor: color, fillOpacity: 1,
          }).addTo(group)
        })
        group.addTo(leafletRef.current)
        scanLayerRef.current = group
      }
    } catch { /* silent — scan is additive */ }
    finally { setScanLoading(false) }
  }, [clusterCandidates])

  const applyAOI = useCallback(async (geometry: AOIGeometry, center: { lat: number; lng: number }) => {
    setAoiGeometry(geometry)
    setCoords(center)
    coordsRef.current = center
    markerRef.current?.setLatLng([center.lat, center.lng])
    await redrawAOI(geometry)
    fetchIntel(center.lat, center.lng)
    fetchScan(center.lat, center.lng)
    const z = leafletRef.current?.getZoom?.() ?? zoom
    router.replace(`/portal/viewer?lat=${center.lat}&lng=${center.lng}&zoom=${z}`, { scroll: false })
    rememberAOI(geometry, center)
  }, [redrawAOI, router, zoom, fetchIntel, fetchScan, rememberAOI])

  const saveAOI = useCallback(async () => {
    if (!aoiGeometry) return
    setAoiSaveStatus('saving')
    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth?.user?.id

      const payload: any = {
        source: 'lithicearth_viewer',
        type: 'aoi',
        lat: coords.lat,
        lng: coords.lng,
        flagged: false,
        properties: {
          aoi_mode: aoiMode,
          geometry_type: aoiGeometry.type,
          geometry: aoiGeometry,
          zoom,
          // Provenance: what was on screen when this AOI was captured
          historical_overlays: histActive.map(a => ({
            id: a.map.id, title: a.map.title, year: a.map.year, license: a.map.license,
          })),
        },
      }

      if (userId) payload.user_id = userId

      const { error } = await supabase.from('portal_observations').insert(payload)
      if (error) throw error
      setAoiSaveStatus('saved')
    } catch (e) {
      console.error('AOI save failed', e)
      setAoiSaveStatus('error')
    }
  }, [aoiGeometry, aoiMode, coords.lat, coords.lng, zoom, histActive])

  const exportGeoJSON = useCallback(() => {
    if (!aoiGeometry) return
    const feature = {
      type: 'Feature',
      properties: {
        name: `LithicEarth AOI ${coords.lat}, ${coords.lng}`,
        lat: coords.lat,
        lng: coords.lng,
        zoom,
        generated_by: 'LithicEarth',
        historical_overlays: histActive.map(a => ({
          title: a.map.title, year: a.map.year, attribution: a.map.attribution, license: a.map.license,
        })),
      },
      geometry: aoiGeometry,
    }
    const blob = new Blob([JSON.stringify(feature, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lithicearth-aoi-${coords.lat}-${coords.lng}.geojson`
    a.click()
    URL.revokeObjectURL(url)
  }, [aoiGeometry, coords.lat, coords.lng, zoom, histActive])

  const importGeoJSON = useCallback(async (file: File) => {
    const text = await file.text()
    const json = JSON.parse(text)
    const geometry = json.type === 'Feature' ? json.geometry : json
    if (!geometry || !['Point', 'Polygon'].includes(geometry.type)) {
      throw new Error('Unsupported GeoJSON geometry')
    }
    const imported = geometry as AOIGeometry
    const center = imported.type === 'Point'
      ? sanitizeCoords(imported.coordinates[1], imported.coordinates[0])
      : polygonCenter(imported.coordinates[0])
    await applyAOI(imported, center)
  }, [applyAOI])

  const copyShareURL = useCallback(() => {
    const url = `${window.location.origin}/portal/viewer?lat=${coords.lat}&lng=${coords.lng}&zoom=${zoom}`
    navigator.clipboard.writeText(url)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [coords.lat, coords.lng, zoom])

  const loadSavedAOIs = useCallback(async () => {
    const local = localStorage.getItem('lithicearth:aoi-history')
    if (local) {
      try { setSavedAOIs(JSON.parse(local)) } catch { /* corrupt storage */ }
    }

    const { data } = await supabase
      .from('portal_observations')
      .select('id, lat, lng, properties, created_at')
      .eq('type', 'aoi')
      .order('created_at', { ascending: false })
      .limit(8)

    if (data?.length) {
      setSavedAOIs(data.map((row: any) => ({
        id: row.id,
        name: `AOI ${row.lat}, ${row.lng}`,
        geometry: row.properties?.geometry,
        lat: row.lat,
        lng: row.lng,
        zoom: row.properties?.zoom ?? 14,
        created_at: row.created_at,
      })).filter((x: SavedAOI) => x.geometry))
    }
  }, [])

  const generateTerrainProfile = useCallback(async (
    start: { lat: number; lng: number },
    end: { lat: number; lng: number }
  ) => {
    try {
      const res = await fetch(
        `/api/terrain/profile?startLat=${start.lat}&startLng=${start.lng}&endLat=${end.lat}&endLng=${end.lng}&samples=32`
      )

      if (!res.ok) throw new Error('terrain profile failed')

      const data = await res.json()
      setTerrainProfile(data.profile)
    } catch {
      // Fallback synthetic profile — elevation read via ref so it is the
      // LIVE intel value, not the stale first-render closure
      const samples = 24
      const points: TerrainProfilePoint[] = []
      const baseElevation = intelRef.current?.measurements?.elevation?.value ?? 120

      for (let i = 0; i <= samples; i++) {
        const t = i / samples
        const elevation =
          baseElevation +
          Math.sin(i / 2.8) * 8 +
          Math.cos(i / 3.7) * 5

        points.push({
          distance: Math.round(t * 1000),
          elevation: Math.round(elevation * 10) / 10,
        })
      }

      setTerrainProfile(points)
    }
  }, [])

  // Live pointers for the once-registered map click handler
  const applyAOIRef = useRef(applyAOI)
  useEffect(() => { applyAOIRef.current = applyAOI }, [applyAOI])
  const generateTerrainProfileRef = useRef(generateTerrainProfile)
  useEffect(() => { generateTerrainProfileRef.current = generateTerrainProfile }, [generateTerrainProfile])

  // ── Init Leaflet ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    const initMap = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const map = L.map(mapRef.current!, {
        center: [initCoords.lat, initCoords.lng],
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: false,
        doubleClickZoom: false, // dblclick finishes polygons — zoom was fighting it
      })
      leafletRef.current = map

      // Dedicated pane for historical rasters: above tilePane (200),
      // below overlayPane (400) so AOI vectors and scan circles stay on top.
      map.createPane('historical')
      const histPane = map.getPane('historical')
      if (histPane) histPane.style.zIndex = '350'

      // Mount every layer marked active — this now includes layers
      // requested through the ?layers= URL param, which previously were
      // flagged active in state but never actually added to the map.
      for (const l of layersRef.current) {
        if (!l.active || !l.available) continue
        const inst = await mountLayer(map, l)
        if (inst) layerRefs.current[l.id] = inst
      }

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

      // Click → AOI tools. Every state read goes through a ref (see above).
      map.on('click', async (e: any) => {
        const safe = sanitizeCoords(e.latlng.lat, e.latlng.lng)
        const mode = aoiModeRef.current

        if (terrainModeRef.current) {
          if (!terrainStartRef.current) {
            terrainStartRef.current = safe
            markerRef.current?.setLatLng([safe.lat, safe.lng])
            return
          }

          const start = terrainStartRef.current
          terrainStartRef.current = null

          const L2 = (await import('leaflet')).default

          // Replace the previous profile line instead of stacking forever
          terrainLineRef.current?.remove()
          terrainLineRef.current = L2.polyline(
            [[start.lat, start.lng], [safe.lat, safe.lng]],
            { color: '#fb923c', weight: 2, dashArray: '6 4' }
          ).addTo(map)

          await generateTerrainProfileRef.current(start, safe)
          return
        }

        if (mode === 'pin') {
          await applyAOIRef.current({ type: 'Point', coordinates: [safe.lng, safe.lat] }, safe)
          return
        }

        if (mode === 'rectangle') {
          if (!rectangleStartRef.current) {
            rectangleStartRef.current = safe
            markerRef.current?.setLatLng([safe.lat, safe.lng])
            return
          }

          const start = rectangleStartRef.current
          rectangleStartRef.current = null
          const west = Math.min(start.lng, safe.lng)
          const east = Math.max(start.lng, safe.lng)
          const south = Math.min(start.lat, safe.lat)
          const north = Math.max(start.lat, safe.lat)
          const ring: [number, number][] = [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ]
          await applyAOIRef.current({ type: 'Polygon', coordinates: [ring] }, polygonCenter(ring))
          return
        }

        if (mode === 'polygon') {
          polygonPointsRef.current = [...polygonPointsRef.current, [safe.lng, safe.lat]]
          aoiGuideLayerRef.current?.remove()
          const L2 = (await import('leaflet')).default
          if (polygonPointsRef.current.length > 1) {
            aoiGuideLayerRef.current = L2.polyline(
              polygonPointsRef.current.map(([lng, lat]) => [lat, lng]),
              { color: '#D4AF37', weight: 1, dashArray: '4 4' }
            ).addTo(map)
          }
          markerRef.current?.setLatLng([safe.lat, safe.lng])
        }
      })

      map.on('dblclick', async () => {
        if (aoiModeRef.current !== 'polygon') return
        if (polygonPointsRef.current.length < 3) return
        const ring = [...polygonPointsRef.current, polygonPointsRef.current[0]]
        polygonPointsRef.current = []
        aoiGuideLayerRef.current?.remove()
        aoiGuideLayerRef.current = null
        await applyAOIRef.current({ type: 'Polygon', coordinates: [ring] }, polygonCenter(ring))
      })

      // Mousemove — sanitize to prevent -439 display
      map.on('mousemove', (e: any) => {
        const safe = sanitizeCoords(e.latlng.lat, e.latlng.lng)
        setCursorCoords(safe)
      })
      map.on('mouseout', () => setCursorCoords(null))
      map.on('zoom', () => {
        const z = map.getZoom()
        setZoom(z)
        // coordsRef, not coords — this closure would otherwise hold the
        // first render's coordinates forever
        const c = coordsRef.current
        router.replace(`/portal/viewer?lat=${c.lat}&lng=${c.lng}&zoom=${z}`, { scroll: false })
      })

      // Historical catalog follows the viewport. Ref indirection again —
      // this handler is registered once and must not capture stale state.
      map.on('moveend', () => { void searchHistoricalRef.current() })
      void searchHistoricalRef.current()
    }

    initMap()
    fetchIntel(initCoords.lat, initCoords.lng)
    fetchScan(initCoords.lat, initCoords.lng)
    return () => {
      leafletRef.current?.remove()
      leafletRef.current = null
      histLayerRefs.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Anomaly heatmap overlay ─────────────────────────────────────────
  // Paints scan candidates as radial-gradient heat blobs on the canvas
  // over the map, sized to real candidate diameters, redrawn on pan/zoom.
  useEffect(() => {
    const canvas = webglCanvasRef.current
    const map = leafletRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    if (!webglOverlay || !map) { clear(); return }

    const draw = () => {
      const size = map.getSize()
      const dpr = window.devicePixelRatio || 1
      canvas.width = size.x * dpr
      canvas.height = size.y * dpr
      canvas.style.width = `${size.x}px`
      canvas.style.height = `${size.y}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.x, size.y)

      const candidates = scan?.candidates ?? []
      for (const c of candidates) {
        const pt = map.latLngToContainerPoint([c.lat, c.lng])
        // Convert candidate diameter (meters) to on-screen pixels
        const edge = map.latLngToContainerPoint([c.lat + Math.max(c.diameter_m, 60) / 2 / 111320, c.lng])
        const radius = Math.max(16, Math.abs(pt.y - edge.y) * 2.5)
        const rgb = c.score > 0.7 ? '239,68,68' : c.score > 0.4 ? '245,158,11' : '18,168,172'
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius)
        g.addColorStop(0, `rgba(${rgb},${0.28 + c.score * 0.35})`)
        g.addColorStop(1, `rgba(${rgb},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    draw()
    map.on('move zoom viewreset resize', draw)
    return () => {
      map.off('move zoom viewreset resize', draw)
      clear()
    }
  }, [webglOverlay, scan])

  // ── Layer toggle / presets ──────────────────────────────────────────
  const toggleLayer = useCallback(async (id: string) => {
    const map = leafletRef.current
    if (!map) return
    const l = layersRef.current.find(x => x.id === id)
    if (!l || !l.available) return

    if (l.active) {
      layerRefs.current[id]?.remove()
      delete layerRefs.current[id]
      setLayers(prev => prev.map(x => x.id === id ? { ...x, active: false } : x))
    } else {
      const inst = await mountLayer(map, l)
      if (inst) layerRefs.current[id] = inst
      setLayers(prev => prev.map(x => x.id === id ? { ...x, active: true } : x))
    }
  }, [])

  /** Replace the whole overlay stack with a preset's layers in one tap. */
  const applyPreset = useCallback(async (ids: string[]) => {
    const map = leafletRef.current
    if (!map) return
    for (const l of layersRef.current) {
      const want = ids.includes(l.id) && l.available
      const mounted = !!layerRefs.current[l.id]
      if (mounted && !want) {
        layerRefs.current[l.id]?.remove()
        delete layerRefs.current[l.id]
      } else if (!mounted && want) {
        const inst = await mountLayer(map, l)
        if (inst) layerRefs.current[l.id] = inst
      }
    }
    setLayers(prev => prev.map(l => ({ ...l, active: ids.includes(l.id) && l.available })))
  }, [])

  const setOpacity = useCallback((id: string, opacity: number) => {
    layerRefs.current[id]?.setOpacity(opacity)
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity } : l))
  }, [])

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

  const temporalScenes = [{
      label: 'Past', date: '2021-08-14', ndvi: 0.41, cloud: 12, }, {
      label: 'Current', date: s2meta?.date?.slice(0, 10) ?? '2025-05-10', ndvi: ndvi?.value ?? 0.58, cloud: s2meta?.cloud_cover ?? 4, }, {
      label: 'Projected', date: '2026-03-22', ndvi: ((ndvi?.value ?? 0.58) + 0.06), cloud: 6, }]

  const ndviDelta = temporalScenes[1].ndvi - temporalScenes[0].ndvi

  const activeHistIds = new Set(histActive.map(a => a.map.id))
  const restrictedCount = histActive.filter(a => !COMMERCIAL_OK.has(a.map.license)).length

  const activeCount = layers.filter(l => l.active).length
  const activeIdSet = useMemo(() => new Set(layers.filter(l => l.active).map(l => l.id)), [layers])

  /** Which preset (if any) exactly matches the current stack — for highlighting. */
  const activePresetId = useMemo(() => {
    for (const p of PRESETS) {
      const set = new Set(p.layers)
      if (set.size === activeIdSet.size && [...set].every(id => activeIdSet.has(id))) return p.id
    }
    return null
  }, [activeIdSet])

  /** Flat, searchable layer list, ordered by group. */
  const visibleLayers = useMemo(() => {
    const q = layerQuery.trim().toLowerCase()
    const filtered = q
      ? layers.filter(l =>
          l.label.toLowerCase().includes(q) ||
          l.source.toLowerCase().includes(q) ||
          l.group.toLowerCase().includes(q))
      : layers
    return [...filtered].sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.group)
      const gb = GROUP_ORDER.indexOf(b.group)
      if (ga !== gb) return ga - gb
      // Active layers float to the top of their group
      if (a.active !== b.active) return a.active ? -1 : 1
      return 0
    })
  }, [layers, layerQuery])

  useEffect(() => {
    if (aoiHistory.length) {
      localStorage.setItem('lithicearth:aoi-history', JSON.stringify(aoiHistory))
    }
  }, [aoiHistory])

  useEffect(() => {
    loadSavedAOIs()
  }, [loadSavedAOIs])

  const panelTabs: { id: PanelTab; label: string; badge?: number }[] = [
    { id: 'intel', label: 'INTEL' },
    { id: 'scan', label: 'SCAN', badge: scan?.candidates.length },
    { id: 'tools', label: 'TOOLS' },
    { id: 'time', label: 'TIME' },
  ]

  return (
    <div className="flex h-screen bg-[#0a0e0b] overflow-hidden font-light">

      {/* ── Left Sidebar: LAYERS / HISTORICAL ─────────────────────────── */}
      {sidebarOpen && (
        <aside className="fixed md:relative inset-y-0 left-0 w-64 h-full bg-[#0b0f0c] border-r border-[#1a2a1e] flex flex-col z-30 flex-shrink-0">

          {/* Tab bar */}
          <div className="flex border-b border-[#1a2a1e]">
            <button
              onClick={() => setSideTab('layers')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[8px] tracking-[0.25em] transition-colors border-b-2 ${
                sideTab === 'layers'
                  ? 'border-[#D4AF37] text-[#D4AF37]'
                  : 'border-transparent text-[#3a4a3e] hover:text-[#5b7c6f]'
              }`}
            >
              <Layers size={10} /> LAYERS
              <span className="text-[#2a3a2e]">{activeCount}</span>
            </button>
            <button
              onClick={() => setSideTab('historical')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[8px] tracking-[0.25em] transition-colors border-b-2 ${
                sideTab === 'historical'
                  ? 'border-[#D4AF37] text-[#D4AF37]'
                  : 'border-transparent text-[#3a4a3e] hover:text-[#5b7c6f]'
              }`}
            >
              <History size={10} /> HISTORICAL
              {histActive.length > 0 && <span className="text-[#D4AF37]">{histActive.length}</span>}
            </button>
          </div>

          {/* ── LAYERS TAB ──────────────────────────────────────────── */}
          {sideTab === 'layers' && (
            <div className="flex-1 overflow-y-auto">

              {/* Presets — one tap swaps the whole stack */}
              <div className="px-3 pt-3 pb-2 border-b border-[#111a14]">
                <p className="text-[#2a3a2e] text-[7px] tracking-[0.25em] mb-2">QUICK VIEWS</p>
                <div className="grid grid-cols-3 gap-1">
                  {PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.layers)}
                      title={p.hint}
                      className={`py-2 border text-[8px] tracking-[0.1em] uppercase transition-colors ${
                        activePresetId === p.id
                          ? 'border-[#D4AF37]/70 text-[#D4AF37] bg-[#D4AF37]/5'
                          : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#5b7c6f]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="px-3 py-2 border-b border-[#111a14]">
                <div className="flex items-center gap-2 bg-[#09100b] border border-[#1a2a1e] px-2 focus-within:border-[#5b7c6f] transition-colors">
                  <Search size={10} className="text-[#3a4a3e] flex-shrink-0" />
                  <input
                    value={layerQuery}
                    onChange={e => setLayerQuery(e.target.value)}
                    placeholder="Find a layer…"
                    className="w-full bg-transparent py-1.5 text-[10px] text-[#c8c4ba] placeholder-[#2a3a2e] outline-none"
                  />
                  {layerQuery && (
                    <button onClick={() => setLayerQuery('')} className="text-[#3a4a3e] hover:text-[#5b7c6f]">
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>

              {/* Flat layer list */}
              {visibleLayers.length === 0 && (
                <p className="px-4 py-4 text-[#2a3a2e] text-[9px]">
                  No layers match “{layerQuery}”. Try “lidar”, “water”, or “SAR”.
                </p>
              )}
              {visibleLayers.map((layer, i) => {
                const prev = visibleLayers[i - 1]
                const showGroupCaption = !prev || prev.group !== layer.group
                return (
                  <div key={layer.id}>
                    {showGroupCaption && (
                      <p className="px-4 pt-2.5 pb-1 text-[#2a3a2e] text-[7px] tracking-[0.3em]">
                        {layer.group.toUpperCase()}
                      </p>
                    )}
                    <div className="border-b border-[#0f160f]">
                      <div className="flex items-center gap-2 px-4 py-2">
                        <button
                          onClick={() => layer.available && toggleLayer(layer.id)}
                          disabled={!layer.available}
                          className="relative w-6 h-3 rounded-full flex-shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ background: layer.active ? layer.color + '40' : '#1a2a1e' }}
                          aria-label={`Toggle ${layer.label}`}
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
                          <p className="text-[#2a3a2e] text-[8px] truncate">
                            {!layer.available ? 'readout only — click map to read' : layer.source}
                          </p>
                        </div>
                      </div>
                      {layer.active && (
                        <div className="px-4 pb-2 pl-12">
                          <input
                            type="range" min="0" max="1" step="0.05"
                            value={layer.opacity}
                            onChange={e => setOpacity(layer.id, Number(e.target.value))}
                            className="w-full h-px cursor-pointer"
                            style={{ accentColor: layer.color }}
                            aria-label={`Opacity for ${layer.label}`}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── HISTORICAL TAB ──────────────────────────────────────── */}
          {sideTab === 'historical' && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {histLoading && (
                <p className="text-[#2a3a2e] text-[7px] tracking-[0.2em] animate-pulse">SYNCING CATALOG…</p>
              )}

              {/* Year band */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[#2a3a2e] text-[7px] tracking-[0.2em]">YEAR BAND</span>
                  <span className="text-[#5b7c6f] text-[8px] font-mono">
                    {histRange[0]}–{histRange[1]}
                  </span>
                </div>
                <input
                  type="range" min={1700} max={2010} step={10}
                  value={histRange[0]}
                  onChange={e => setHistRange(([, hi]) => [Math.min(Number(e.target.value), hi - 10), hi])}
                  className="w-full h-px cursor-pointer mb-1"
                  style={{ accentColor: '#D4AF37' }}
                  aria-label="Earliest publication year"
                />
                <input
                  type="range" min={1700} max={2010} step={10}
                  value={histRange[1]}
                  onChange={e => setHistRange(([lo]) => [lo, Math.max(Number(e.target.value), lo + 10)])}
                  className="w-full h-px cursor-pointer"
                  style={{ accentColor: '#D4AF37' }}
                  aria-label="Latest publication year"
                />
              </div>

              {/* Swipe compare */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[#2a3a2e] text-[7px] tracking-[0.2em]">SWIPE COMPARE</span>
                  <button
                    onClick={() => setSwipe(v => (v === null ? 0.5 : null))}
                    className={`text-[7px] tracking-[0.15em] px-1.5 py-0.5 border transition-colors ${
                      swipe !== null
                        ? 'border-[#D4AF37]/60 text-[#D4AF37]'
                        : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#5b7c6f]'
                    }`}
                  >
                    {swipe !== null ? 'ON' : 'OFF'}
                  </button>
                </div>
                {swipe !== null && (
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={swipe}
                    onChange={e => setSwipe(Number(e.target.value))}
                    className="w-full h-px cursor-pointer"
                    style={{ accentColor: '#D4AF37' }}
                    aria-label="Swipe position"
                  />
                )}
              </div>

              {/* Active overlays */}
              {histActive.length > 0 && (
                <div className="border-t border-[#111a14] pt-2 space-y-2">
                  <p className="text-[#2a3a2e] text-[7px] tracking-[0.2em]">ACTIVE</p>
                  {histActive.map(a => (
                    <div key={a.map.id}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[#c8c4ba] text-[9px] truncate" title={a.map.title}>
                          {a.map.year ?? '—'} · {a.map.title}
                        </span>
                        <button
                          onClick={() => removeHistorical(a.map.id)}
                          className="text-[#2a3a2e] hover:text-[#f87171] flex-shrink-0"
                          aria-label={`Remove ${a.map.title}`}
                        >
                          <X size={9} />
                        </button>
                      </div>
                      <input
                        type="range" min={0} max={1} step={0.02}
                        value={a.opacity}
                        onChange={e => setHistoricalOpacity(a.map.id, Number(e.target.value))}
                        className="w-full h-px cursor-pointer"
                        style={{ accentColor: '#D4AF37' }}
                        aria-label={`Opacity for ${a.map.title}`}
                      />
                    </div>
                  ))}
                  {restrictedCount > 0 && (
                    <p className="text-[#fbbf24] text-[7px] leading-relaxed border-l border-[#fbbf24]/30 pl-2">
                      {restrictedCount} overlay{restrictedCount > 1 ? 's are' : ' is'} viewer-only
                      under its license and will be excluded from report export.
                    </p>
                  )}
                </div>
              )}

              {/* Results in view */}
              <div className="border-t border-[#111a14] pt-2">
                <p className="text-[#2a3a2e] text-[7px] tracking-[0.2em] mb-1.5">IN THIS VIEW</p>
                {histError && (
                  <p className="text-[#f87171] text-[8px] leading-relaxed">{histError}</p>
                )}
                {!histError && !histLoading && histResults.length === 0 && (
                  <p className="text-[#2a3a2e] text-[8px] leading-relaxed">
                    No georeferenced maps here in that year band. Widen the band, zoom
                    out, or register one below.
                  </p>
                )}
                <div className="max-h-64 overflow-y-auto">
                  {histResults.map(r => {
                    const on = activeHistIds.has(r.id)
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleHistorical(r)}
                        className={`w-full text-left border-b border-[#0f160f] py-1.5 px-1 -mx-1 transition-colors ${
                          on ? 'bg-[#D4AF37]/5' : 'hover:bg-[#111a14]'
                        }`}
                      >
                        <p className={`text-[9px] truncate ${on ? 'text-[#D4AF37]' : 'text-[#c8c4ba]'}`}>
                          {r.title}
                        </p>
                        <p className="text-[#2a3a2e] text-[7px] truncate">
                          {r.year ?? 'undated'} · {r.publisher ?? r.source}
                          {!COMMERCIAL_OK.has(r.license) && (
                            <span className="text-[#fbbf24]"> · {r.license}</span>
                          )}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Register a map */}
              <div className="border-t border-[#111a14] pt-2">
                <button
                  onClick={() => setRegisterOpen(v => !v)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[7px] tracking-[0.2em] transition-colors"
                >
                  <Plus size={8} /> REGISTER MAP TO THIS VIEW
                </button>

                {registerOpen && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[#2a3a2e] text-[7px] leading-relaxed">
                      Footprint is taken from the current viewport — frame the map
                      extent before saving.
                    </p>
                    <input
                      value={registerForm.title}
                      onChange={e => setRegisterForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Title"
                      className="w-full bg-[#09100b] border border-[#1a2a1e] px-2 py-1 text-[9px] text-[#c8c4ba] placeholder-[#2a3a2e] focus:border-[#5b7c6f] outline-none"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        value={registerForm.year}
                        onChange={e => setRegisterForm(f => ({ ...f, year: e.target.value }))}
                        placeholder="Year"
                        inputMode="numeric"
                        className="w-full bg-[#09100b] border border-[#1a2a1e] px-2 py-1 text-[9px] text-[#c8c4ba] placeholder-[#2a3a2e] focus:border-[#5b7c6f] outline-none"
                      />
                      <select
                        value={registerForm.kind}
                        onChange={e => setRegisterForm(f => ({ ...f, kind: e.target.value as HistoricalKind }))}
                        className="w-full bg-[#09100b] border border-[#1a2a1e] px-2 py-1 text-[9px] text-[#c8c4ba] focus:border-[#5b7c6f] outline-none"
                      >
                        <option value="xyz">XYZ tiles</option>
                        <option value="wms">WMS</option>
                        <option value="allmaps">Allmaps IIIF</option>
                      </select>
                    </div>
                    <input
                      value={registerForm.url}
                      onChange={e => setRegisterForm(f => ({ ...f, url: e.target.value }))}
                      placeholder={
                        registerForm.kind === 'allmaps'
                          ? 'Georeference Annotation URL'
                          : registerForm.kind === 'wms'
                          ? 'WMS GetMap endpoint'
                          : 'https://…/{z}/{x}/{y}.png'
                      }
                      className="w-full bg-[#09100b] border border-[#1a2a1e] px-2 py-1 text-[9px] text-[#c8c4ba] placeholder-[#2a3a2e] focus:border-[#5b7c6f] outline-none"
                    />
                    <input
                      value={registerForm.attribution}
                      onChange={e => setRegisterForm(f => ({ ...f, attribution: e.target.value }))}
                      placeholder="Attribution (required by most collections)"
                      className="w-full bg-[#09100b] border border-[#1a2a1e] px-2 py-1 text-[9px] text-[#c8c4ba] placeholder-[#2a3a2e] focus:border-[#5b7c6f] outline-none"
                    />
                    <select
                      value={registerForm.license}
                      onChange={e => setRegisterForm(f => ({ ...f, license: e.target.value }))}
                      className="w-full bg-[#09100b] border border-[#1a2a1e] px-2 py-1 text-[9px] text-[#c8c4ba] focus:border-[#5b7c6f] outline-none"
                    >
                      <option value="public-domain">public-domain (USGS, LOC)</option>
                      <option value="cc0">cc0</option>
                      <option value="licensed">licensed (written permission)</option>
                      <option value="cc-by-nc-sa">cc-by-nc-sa (Rumsey — viewer only)</option>
                      <option value="unknown">unknown</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-[#5b7c6f] text-[8px]">
                      <input
                        type="checkbox"
                        checked={registerForm.proxy}
                        onChange={e => setRegisterForm(f => ({ ...f, proxy: e.target.checked }))}
                        style={{ accentColor: '#D4AF37' }}
                      />
                      Route tiles through /api/tiles/proxy
                    </label>
                    <button
                      onClick={registerHistorical}
                      disabled={registerBusy || !registerForm.title || !registerForm.url}
                      className="w-full py-1.5 border border-[#D4AF37]/30 hover:border-[#D4AF37]/70 text-[#D4AF37] text-[8px] tracking-[0.2em] transition-colors disabled:opacity-40"
                    >
                      {registerBusy ? 'SAVING…' : 'SAVE TO CATALOG'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-4 py-3 border-t border-[#1a2a1e]">
            <button
              onClick={() => router.push('/portal')}
              className="w-full flex items-center gap-2 text-[#3a4a3e] hover:text-[#5b7c6f] transition-colors"
            >
              <ArrowLeft size={10} />
              <span className="text-[9px] tracking-widest">BACK TO PORTAL</span>
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
          aria-label="Toggle layer sidebar"
        >
          <Layers size={13} className="text-[#5b7c6f]" />
        </button>

        {/* Zoom controls */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-px">
          <button
            onClick={() => leafletRef.current?.zoomIn()}
            className="w-8 h-8 bg-[#0b0f0c] border border-[#1a2a1e] hover:border-[#2a3d2e] text-[#5b7c6f] text-lg leading-none flex items-center justify-center transition-colors"
            aria-label="Zoom in"
          >+</button>
          <button
            onClick={() => leafletRef.current?.zoomOut()}
            className="w-8 h-8 bg-[#0b0f0c] border border-[#1a2a1e] hover:border-[#2a3d2e] text-[#5b7c6f] text-lg leading-none flex items-center justify-center transition-colors"
            aria-label="Zoom out"
          >−</button>
        </div>

        {/* Map canvas */}
        <div ref={mapRef} className="w-full h-full" style={{ cursor: 'crosshair' }} />

        {/* Swipe divider — visual only, the clip is applied to the layers */}
        {swipe !== null && histActive.length > 0 && (
          <div
            className="absolute inset-y-0 z-[15] pointer-events-none"
            style={{ left: `${swipe * 100}%` }}
          >
            <div className="w-px h-full bg-[#D4AF37]/70" />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-[#D4AF37]" />
          </div>
        )}

        {/* Attribution strip for whatever historical overlays are live */}
        {histActive.length > 0 && (
          <div className="absolute bottom-4 right-4 z-20 max-w-xs bg-[#0b0f0c]/90 border border-[#1a2a1e] px-3 py-1.5 pointer-events-none">
            <p className="text-[#2a3a2e] text-[7px] leading-relaxed">
              {Array.from(new Set(histActive.map(a => a.map.attribution))).join(' · ')}
            </p>
          </div>
        )}

        {/* Anomaly heatmap canvas — painted by the effect above */}
        {webglOverlay && (
          <canvas
            ref={webglCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10 mix-blend-screen"
          />
        )}

        {/* Mobile intel drawer trigger */}
        <button
          onClick={() => setIntelDrawerOpen(true)}
          className="md:hidden fixed bottom-5 right-5 z-40 bg-[#D4AF37] text-black px-4 py-2 text-[10px] tracking-[0.2em] font-light shadow-lg"
        >
          INTEL
        </button>

        {intelDrawerOpen && (
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-[#0b0f0c] border-t border-[#D4AF37]/40 max-h-[72vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2a1e]">
              <span className="text-[#D4AF37] text-[10px] tracking-[0.3em]">SITE INTEL</span>
              <button onClick={() => setIntelDrawerOpen(false)} className="text-[#5b7c6f] hover:text-[#D4AF37]">
                <X size={14} />
              </button>
            </div>
            <div className="p-4">
              <ReadoutRow label="NDVI" value={intelLoading ? 'loading' : ndvi?.value != null ? ndvi.value.toFixed(3) : '—'} sub={ndvi?.status} accent="#86efac" />
              <ReadoutRow label="ELEVATION" value={intelLoading ? 'loading' : elev?.value != null ? `${Math.round(elev.value)} m` : '—'} sub={elev?.status} accent="#fbbf24" />
              <ReadoutRow label="SAR" value={intelLoading ? 'loading' : sar?.value != null ? sar.value.toFixed(2) : '—'} sub={sar?.status} accent="#4ade80" />
              <ReadoutRow label="THERMAL" value={intelLoading ? 'loading' : thermal?.value != null ? thermal.value.toFixed(2) : '—'} sub={thermal?.status} accent="#f87171" />
            </div>
          </div>
        )}

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
          <button onClick={copyCoords} className="text-[#2a3a2e] hover:text-[#5b7c6f] transition-colors" aria-label="Copy coordinates">
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </button>
        </div>
      </div>

      {/* ── Right Panel: INTEL / SCAN / TOOLS / TIME ──────────────────── */}
      <div className="hidden md:flex md:w-64 h-full bg-[#0b0f0c] border-l border-[#1a2a1e] flex-col z-10 flex-shrink-0">

        {/* Engine status */}
        <div className="px-4 py-2.5 border-b border-[#1a2a1e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#5b7c6f]" />
            <span className="text-[#5b7c6f] text-[9px] tracking-[0.3em]">LITHIC ENGINE</span>
          </div>
          {(intelLoading || scanLoading) && (
            <span className="text-[#2a3a2e] text-[8px] animate-pulse">WORKING…</span>
          )}
          {!intelLoading && !scanLoading && intel && (
            <span className="text-[#2a3a2e] text-[8px]">
              {Math.round(intel.measurement_quality * 100)}% PIXEL
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[#1a2a1e]">
          {panelTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setPanelTab(t.id)}
              className={`flex-1 py-2.5 text-[7px] tracking-[0.2em] transition-colors border-b-2 relative ${
                panelTab === t.id
                  ? 'border-[#D4AF37] text-[#D4AF37]'
                  : 'border-transparent text-[#3a4a3e] hover:text-[#5b7c6f]'
              }`}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`ml-1 ${panelTab === t.id ? 'text-[#D4AF37]' : 'text-[#5b7c6f]'}`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── INTEL TAB ─────────────────────────────────────────── */}
          {panelTab === 'intel' && (
            <>
              {intelLoading && (
                <div className="p-4 md:p-6 flex flex-col items-center gap-3">
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
                        Lithic Engine timed out. Railway may be cold-starting — try Refresh Intel.
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

                  {/* Historical provenance — what old cartography is in play */}
                  {histActive.length > 0 && (
                    <div className="border-t border-[#1a2a1e] pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <History size={9} style={{ color: '#D4AF37' }} />
                        <p className="text-[8px] tracking-[0.25em]" style={{ color: '#D4AF37' }}>HISTORICAL BASE</p>
                      </div>
                      {histActive.map(a => (
                        <ReadoutRow
                          key={a.map.id}
                          label={String(a.map.year ?? '—')}
                          value={a.map.title.length > 22 ? a.map.title.slice(0, 22) + '…' : a.map.title}
                          sub={`${a.map.source} · ${a.map.license}`}
                          accent={COMMERCIAL_OK.has(a.map.license) ? '#D4AF37' : '#fbbf24'}
                        />
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

                  <button
                    onClick={() => fetchIntel(coords.lat, coords.lng)}
                    disabled={intelLoading}
                    className="w-full py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[9px] tracking-[0.2em] transition-colors disabled:opacity-40"
                  >
                    ↻ REFRESH INTEL
                  </button>
                </div>
              )}

              {!intel && !intelLoading && !intelError && (
                <div className="p-4 md:p-6 text-center">
                  <Zap size={20} className="text-[#1a2a1e] mx-auto mb-3" />
                  <p className="text-[#2a3a2e] text-[9px] tracking-widest">CLICK MAP TO ANALYZE</p>
                </div>
              )}
            </>
          )}

          {/* ── SCAN TAB ──────────────────────────────────────────── */}
          {panelTab === 'scan' && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Atom size={9} style={{ color: '#a78bfa' }} />
                <p className="text-[8px] tracking-[0.25em]" style={{ color: '#a78bfa' }}>TERRAIN SCAN</p>
                {scanLoading && <span className="text-[#2a3a2e] text-[8px] animate-pulse ml-auto">SCANNING…</span>}
              </div>

              {!scan && !scanLoading && (
                <p className="text-[#2a3a2e] text-[9px] tracking-widest text-center py-6">
                  CLICK MAP TO SCAN
                </p>
              )}

              {scan && !scanLoading && (
                <>
                  <button
                    onClick={() => setWebglOverlay(v => !v)}
                    className={`w-full py-2 mb-3 border text-[8px] tracking-[0.15em] transition-colors ${
                      webglOverlay
                        ? 'border-[#ef4444] text-[#ef4444]'
                        : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#5b7c6f]'
                    }`}
                  >
                    {webglOverlay ? 'HIDE ANOMALY HEATMAP' : 'SHOW ANOMALY HEATMAP'}
                  </button>

                  <div className="flex gap-3 mb-3">
                    <div>
                      <p className="text-[#c8c4ba] text-[11px]">{scan.candidates.length}</p>
                      <p className="text-[#2a3a2e] text-[7px] tracking-widest">ANOMALIES</p>
                    </div>
                    <div>
                      <p className="text-[#c8c4ba] text-[11px]">{scan.grid?.sampled_count ?? '—'}</p>
                      <p className="text-[#2a3a2e] text-[7px] tracking-widest">SAMPLES</p>
                    </div>
                    <div>
                      <p className="text-[#c8c4ba] text-[11px]">{scan.terrain?.mean_elevation_m ?? '—'}m</p>
                      <p className="text-[#2a3a2e] text-[7px] tracking-widest">MEAN ELEV</p>
                    </div>
                  </div>
                  <div className="mb-3 space-y-1">
                    <ReadoutRow label="STD" value={`±${scan.terrain?.std_elevation_m ?? '—'}m`} />
                    <ReadoutRow label="THRESHOLD" value={`${scan.terrain?.threshold_m ?? '—'}m`} accent="#a78bfa" />
                    <ReadoutRow label="ELEVATED PTS" value={`${scan.terrain?.elevated_point_count ?? '—'}`} />
                    <ReadoutRow label="DEM SOURCE" value={scan.terrain?.source ?? '—'} />
                  </div>

                  {scan.spectral?.valid && (
                    <div className="border-t border-[#1a2a1e] pt-2 mb-3">
                      <p className="text-[#2a3a2e] text-[7px] tracking-[0.25em] mb-1">S2 SPECTRAL</p>
                      <ReadoutRow label="NDVI MEAN" value={scan.spectral.ndvi_mean?.toFixed(3) ?? '—'}
                        accent={scan.spectral.ndvi_mean < 0.2 ? '#f87171' : scan.spectral.ndvi_mean < 0.4 ? '#fbbf24' : '#4ade80'} />
                      <ReadoutRow label="NDVI STD" value={`±${scan.spectral.ndvi_std?.toFixed(3) ?? '—'}`} />
                      <ReadoutRow label="CLOUD" value={`${scan.spectral.cloud_cover?.toFixed(1) ?? '—'}%`} sub={scan.spectral.date} />
                      <ReadoutRow label="PIXELS" value={scan.spectral.pixel_count?.toLocaleString() ?? '—'} />
                    </div>
                  )}

                  {scan.muon_baseline?.valid && (
                    <div className="border-t border-[#1a2a1e] pt-2 mb-3">
                      <p className="text-[#2a3a2e] text-[7px] tracking-[0.25em] mb-1">MUON BASELINE</p>
                      <ReadoutRow label="FLUX" value={`${scan.muon_baseline.flux_m2_min?.toFixed(0) ?? '—'}/m²/min`} accent="#a78bfa" />
                      <ReadoutRow label="VOID THRESH" value={`${scan.muon_baseline.void_threshold_m2_min?.toFixed(0) ?? '—'}/m²/min`} />
                      <ReadoutRow label="Kp INDEX" value={`${scan.muon_baseline.kp_index ?? '—'}`}
                        accent={scan.muon_baseline.kp_index > 5 ? '#f87171' : scan.muon_baseline.kp_index > 3 ? '#fbbf24' : '#5b7c6f'} />
                      <ReadoutRow label="RIGIDITY" value={`${scan.muon_baseline.cutoff_rigidity_gv ?? '—'} GV`} />
                      <ReadoutRow label="MODEL" value={scan.muon_baseline.model ?? '—'} />
                    </div>
                  )}

                  {scan.candidates.length === 0 && (
                    <p className="text-[#2a3a2e] text-[8px]">No anomalies detected</p>
                  )}
                  {scan.candidates.slice(0, 8).map((c) => {
                    const color = c.score > 0.7 ? '#f87171' : c.score > 0.4 ? '#fbbf24' : '#5b7c6f'
                    return (
                      <div key={c.id} className="border-b border-[#1a2a1e] py-2 last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-mono font-medium" style={{ color }}>{c.id}</span>
                          <span className="text-[10px] font-mono" style={{ color }}>{c.score.toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2 mb-1">
                          <div className="flex-1 h-0.5 rounded-full bg-[#1a2a1e] overflow-hidden">
                            <div className="h-full bg-[#fb923c] rounded-full" style={{ width: `${(c.terrain_score ?? 0) * 100}%` }} />
                          </div>
                          <div className="flex-1 h-0.5 rounded-full bg-[#1a2a1e] overflow-hidden">
                            <div className="h-full bg-[#4ade80] rounded-full" style={{ width: `${(c.ndvi_signal ?? 0.5) * 100}%` }} />
                          </div>
                          <div className="flex-1 h-0.5 rounded-full bg-[#1a2a1e] overflow-hidden">
                            <div className="h-full bg-[#a78bfa] rounded-full" style={{ width: `${(c.sar_signal ?? 0.5) * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex gap-1 mb-1">
                          <span className="text-[6px] text-[#fb923c] flex-1">DEM</span>
                          <span className="text-[6px] text-[#4ade80] flex-1">NDVI</span>
                          <span className="text-[6px] text-[#a78bfa] flex-1">SAR</span>
                        </div>
                        <p className="text-[#2a3a2e] text-[7px]">
                          ⌀{Math.round(c.diameter_m)}m · +{c.height_above_mean_m}m · {c.confidence}
                        </p>
                        {c.muon_detail && c.muon_detail !== 'awaiting_detector' && (
                          <p className="text-[#2a3a2e] text-[7px] mt-0.5">μ {c.muon_detail.split(' ')[0]}</p>
                        )}
                        {c.sensors && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {c.sensors.map((s: string) => (
                              <span key={s} className="text-[6px] px-1 py-0.5 border border-[#1a2a1e] text-[#2a3a2e]">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* ── TOOLS TAB ─────────────────────────────────────────── */}
          {panelTab === 'tools' && (
            <div className="p-3 space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Wrench size={9} className="text-[#5b7c6f]" />
                  <p className="text-[#5b7c6f] text-[8px] tracking-[0.25em]">AOI MANAGER</p>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {(['pin', 'rectangle', 'polygon'] as AOIMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setAOIModeSafe(mode)}
                      className={`py-1 border text-[7px] tracking-[0.16em] uppercase transition-colors ${
                        aoiMode === mode
                          ? 'border-[#D4AF37]/60 text-[#D4AF37]'
                          : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#5b7c6f]'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <p className="text-[#2a3a2e] text-[7px] leading-relaxed mt-1.5">
                  {aoiMode === 'pin' && 'Click map to drop AOI pin.'}
                  {aoiMode === 'rectangle' && 'Click two corners to draw AOI rectangle.'}
                  {aoiMode === 'polygon' && 'Click vertices, double-click to finish polygon.'}
                </p>
              </div>

              <button
                onClick={() => { setTerrainMode(v => !v); terrainStartRef.current = null }}
                className={`w-full py-2 border text-[8px] tracking-[0.15em] transition-colors ${
                  terrainMode
                    ? 'border-[#fb923c] text-[#fb923c]'
                    : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#5b7c6f]'
                }`}
              >
                {terrainMode ? 'TERRAIN PROFILE ACTIVE — CLICK 2 POINTS' : 'TERRAIN PROFILE'}
              </button>

              {terrainProfile.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[#fb923c] text-[8px] tracking-[0.25em]">
                      TERRAIN PROFILE
                    </p>
                    <p className="text-[#2a3a2e] text-[7px]">
                      {terrainProfile.length} samples
                    </p>
                  </div>

                  <svg
                    viewBox="0 0 240 80"
                    className="w-full h-24 border border-[#111a14] bg-[#09100b]"
                  >
                    <polyline
                      fill="none"
                      stroke="#fb923c"
                      strokeWidth="2"
                      points={
                        terrainProfile.map((p, i) => {
                          const x = (i / Math.max(terrainProfile.length - 1, 1)) * 240
                          const minElev = Math.min(...terrainProfile.map(t => t.elevation))
                          const maxElev = Math.max(...terrainProfile.map(t => t.elevation))
                          const y =
                            70 -
                            ((p.elevation - minElev) /
                              Math.max(maxElev - minElev, 1)) *
                              60
                          return `${x},${y}`
                        }).join(' ')
                      }
                    />

                    {scan?.candidates?.slice(0, 5).map((c, i) => {
                      const x = ((i + 1) / 6) * 240
                      return (
                        <circle
                          key={c.id}
                          cx={x}
                          cy="40"
                          r="3"
                          fill="#ef4444"
                        />
                      )
                    })}
                  </svg>

                  <div className="grid grid-cols-3 gap-1 mt-2">
                    <div className="border border-[#111a14] p-2">
                      <p className="text-[#2a3a2e] text-[6px]">MIN</p>
                      <p className="text-[#c8c4ba] text-[9px]">
                        {Math.min(...terrainProfile.map(p => p.elevation)).toFixed(1)}m
                      </p>
                    </div>

                    <div className="border border-[#111a14] p-2">
                      <p className="text-[#2a3a2e] text-[6px]">MAX</p>
                      <p className="text-[#c8c4ba] text-[9px]">
                        {Math.max(...terrainProfile.map(p => p.elevation)).toFixed(1)}m
                      </p>
                    </div>

                    <div className="border border-[#111a14] p-2">
                      <p className="text-[#2a3a2e] text-[6px]">RELIEF</p>
                      <p className="text-[#c8c4ba] text-[9px]">
                        {(
                          Math.max(...terrainProfile.map(p => p.elevation)) -
                          Math.min(...terrainProfile.map(p => p.elevation))
                        ).toFixed(1)}m
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1">
                <button onClick={saveAOI} disabled={!aoiGeometry || aoiSaveStatus === 'saving'} className="py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[8px] tracking-[0.15em] disabled:opacity-40">
                  {aoiSaveStatus === 'saving' ? 'SAVING' : aoiSaveStatus === 'saved' ? 'SAVED' : aoiSaveStatus === 'error' ? 'FAILED' : 'SAVE'}
                </button>
                <button onClick={exportGeoJSON} className="py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[8px] tracking-[0.15em]">
                  EXPORT
                </button>
                <button onClick={() => geojsonImportRef.current?.click()} className="py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[8px] tracking-[0.15em]">
                  IMPORT
                </button>
                <button onClick={copyShareURL} className="py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-[8px] tracking-[0.15em]">
                  {shareCopied ? 'COPIED' : 'SHARE'}
                </button>
              </div>

              <input
                ref={geojsonImportRef}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try { await importGeoJSON(file) } catch (err) { console.error('GeoJSON import failed', err) }
                  e.target.value = ''
                }}
              />

              {(savedAOIs.length > 0 || aoiHistory.length > 0) && (
                <div className="pt-2 border-t border-[#111a14]">
                  <p className="text-[#2a3a2e] text-[7px] tracking-[0.2em] mb-1">SAVED AOIS</p>
                  {(savedAOIs.length ? savedAOIs : aoiHistory).slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => applyAOI(item.geometry, { lat: item.lat, lng: item.lng })}
                      className="w-full text-left border border-[#111a14] hover:border-[#5b7c6f]/40 px-2 py-1 mb-1 transition-colors"
                    >
                      <p className="text-[#5b7c6f] text-[7px] truncate">{item.name}</p>
                      <p className="text-[#2a3a2e] text-[6px]">{new Date(item.created_at).toLocaleDateString()} · z{item.zoom}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TIME TAB ──────────────────────────────────────────── */}
          {panelTab === 'time' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={9} className="text-[#5b7c6f]" />
                  <p className="text-[#5b7c6f] text-[8px] tracking-[0.25em]">TEMPORAL ANALYSIS</p>
                </div>

                <button
                  onClick={() => setTemporalMode(v => !v)}
                  className={`px-2 py-1 border text-[7px] tracking-[0.15em] transition-colors ${
                    temporalMode
                      ? 'border-[#38bdf8] text-[#38bdf8]'
                      : 'border-[#1a2a1e] text-[#5b7c6f]'
                  }`}
                >
                  {temporalMode ? 'ACTIVE' : 'ENABLE'}
                </button>
              </div>

              {!temporalMode && (
                <p className="text-[#2a3a2e] text-[8px] leading-relaxed">
                  Compare vegetation across acquisition dates for the current AOI.
                </p>
              )}

              {temporalMode && (
                <>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={timeSlider}
                      onChange={(e) => setTimeSlider(Number(e.target.value))}
                      className="w-full"
                    />

                    <div className="flex justify-between text-[6px] text-[#2a3a2e]">
                      <span>{temporalScenes[0].date}</span>
                      <span>{temporalScenes[1].date}</span>
                      <span>{temporalScenes[2].date}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    {temporalScenes.map((scene) => (
                      <div key={scene.label} className="border border-[#111a14] p-2">
                        <p className="text-[#5b7c6f] text-[7px]">{scene.label}</p>
                        <p className="text-[#c8c4ba] text-[8px] mt-1">{scene.date}</p>
                        <p className="text-[#4ade80] text-[8px] mt-1">
                          NDVI {scene.ndvi.toFixed(2)}
                        </p>
                        <p className="text-[#2a3a2e] text-[7px]">
                          Cloud {scene.cloud}%
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="border border-[#111a14] p-3 bg-[#09100b]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[#2a3a2e] text-[7px] tracking-[0.2em]">
                        VEGETATION DELTA
                      </p>

                      <span className={`text-[8px] ${
                        ndviDelta > 0 ? 'text-[#4ade80]' : 'text-[#f87171]'
                      }`}>
                        {ndviDelta > 0 ? '+' : ''}{ndviDelta.toFixed(2)}
                      </span>
                    </div>

                    <div className="w-full h-2 bg-[#111a14] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          ndviDelta > 0 ? 'bg-[#4ade80]' : 'bg-[#f87171]'
                        }`}
                        style={{
                          width: `${Math.min(Math.abs(ndviDelta) * 100, 100)}%`
                        }}
                      />
                    </div>

                    <p className="text-[#2a3a2e] text-[7px] mt-2 leading-relaxed">
                      {ndviDelta > 0
                        ? 'Vegetation density increasing across AOI. Possible hydrological recovery or seasonal growth.'
                        : 'Vegetation density decreasing across AOI. Potential excavation, drought stress, or surface disturbance.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Persistent report action — always one click away */}
        <div className="border-t border-[#1a2a1e] p-3">
          <button
            onClick={() => {
              const aoiParam = aoiGeometry ? encodeURIComponent(JSON.stringify(aoiGeometry)) : ''
              const loc = encodeURIComponent(coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5) + ' — LithicEarth scan')
              // Only license-clear overlays travel into the report pipeline.
              const overlays = histActive
                .filter(a => COMMERCIAL_OK.has(a.map.license))
                .map(a => a.map.id)
                .join(',')
              router.push(
                `/portal/reports/new?lat=${coords.lat}&lng=${coords.lng}&location=${loc}` +
                (aoiParam ? `&aoi=${aoiParam}` : '') +
                (overlays ? `&overlays=${overlays}` : '')
              )
            }}
            className="w-full py-2.5 border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 text-[#D4AF37] text-[9px] tracking-[0.2em] transition-colors"
          >
            → GENERATE REPORT
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
      <div className="min-h-screen bg-[#0a0e0b] flex items-center justify-center">
        <div className="text-[#2a3a2e] text-[9px] tracking-[0.3em]">INITIALIZING...</div>
      </div>
    }>
      <ViewerInner />
    </Suspense>
  )
}
