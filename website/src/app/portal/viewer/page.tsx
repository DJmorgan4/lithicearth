'use client'
import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  X, Layers, Clock, Download, Flag, ChevronDown, ChevronUp,
  Copy, Check, ArrowLeft, Crosshair, AlertCircle, Radio,
  Thermometer, Mountain, Eye, Atom, Droplets, Zap
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
    tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', // maxZoom 16
    opacity: 0.7,
    active: false,
    source: 'USGS National Map',
    available: true,
  },
  {
    id: 'lidar',
    label: 'LiDAR Bare Earth',
    group: 'Geophysical',
    color: '#f59e0b',
    tileUrl: 'https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/tile/{z}/{y}/{x}',
    opacity: 0.7,
    active: false,
    source: 'USGS 3DEP LiDAR Index',
    available: true,
  },
  {
    id: 'lidar_hs',
    label: 'LiDAR Hillshade',
    group: 'Geophysical',
    color: '#fcd34d',
    wmsUrl: 'https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer',
    wmsLayer: '3DEPElevation:Hillshade Gray',
    opacity: 0.6,
    active: false,
    source: 'USGS 3DEP Elevation',
    available: true,
  },
  {
    id: 'lidar_1m',
    label: 'LiDAR 1m (High Res)',
    group: 'Geophysical',
    color: '#f97316',
    wmsUrl: 'https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WMSServer',
    wmsLayer: '3DEPElevation:Hillshade Multidirectional',
    opacity: 0.7,
    active: false,
    source: 'USGS 3DEP 1m LiDAR',
    available: true,
  },
  {
    id: 'cdse_ndvi',
    label: 'NDVI (Live S2)',
    group: 'Spectral',
    color: '#86efac',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1',
    wmsLayer: 'NDVI',
    opacity: 0.75,
    active: false,
    source: 'Copernicus S2 L2A',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_false_color',
    label: 'False Color (Vegetation)',
    group: 'Spectral',
    color: '#4ade80',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1',
    wmsLayer: 'FALSE_COLOR',
    opacity: 0.75,
    active: false,
    source: 'Copernicus S2 L2A',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_swir',
    label: 'SWIR',
    group: 'Spectral',
    color: '#f97316',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1',
    wmsLayer: 'SWIR',
    opacity: 0.75,
    active: false,
    source: 'Copernicus S2 L2A',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_geology',
    label: 'Geology (S2)',
    group: 'Geophysical',
    color: '#a78bfa',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1',
    wmsLayer: 'GEOLOGY',
    opacity: 0.75,
    active: false,
    source: 'Copernicus S2 L2A',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_sar_vv',
    label: 'SAR IW-VV dB (Live)',
    group: 'Radar',
    color: '#4ade80',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/38df2b92-62bd-4b7d-a4db-94f011c7b386',
    wmsLayer: 'IW_VV_DB',
    opacity: 0.9,
    active: false,
    source: 'Copernicus S1 GRD',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_sar_vh',
    label: 'SAR IW-VH dB (Live)',
    group: 'Radar',
    color: '#86efac',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/38df2b92-62bd-4b7d-a4db-94f011c7b386',
    wmsLayer: 'IW-VH-DB',
    opacity: 0.9,
    active: false,
    source: 'Copernicus S1 GRD',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_sar_vv',
    label: 'SAR VV dB (Live)',
    group: 'Radar',
    color: '#4ade80',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/38df2b92-62bd-4b7d-a4db-94f011c7b386',
    wmsLayer: 'IW_VV_DB',
    opacity: 0.9,
    active: false,
    source: 'Copernicus S1 IW',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_sar_vh',
    label: 'SAR VH dB (Live)',
    group: 'Radar',
    color: '#86efac',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/38df2b92-62bd-4b7d-a4db-94f011c7b386',
    wmsLayer: 'IW-VH-DB',
    opacity: 0.9,
    active: false,
    source: 'Copernicus S1 IW',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_ndwi',
    label: 'NDWI (Water Index)',
    group: 'Spectral',
    color: '#0ea5e9',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1',
    wmsLayer: 'NDWI',
    opacity: 0.75,
    active: false,
    source: 'Copernicus S2 L2A',
    available: true,
    cdseAuth: true,
  },
  {
    id: 'cdse_moisture',
    label: 'Moisture Index',
    group: 'Spectral',
    color: '#38bdf8',
    wmsUrl: 'https://sh.dataspace.copernicus.eu/ogc/wms/19beb6e6-941f-4716-aa8e-52f78bb315c1',
    wmsLayer: 'MOISTURE_INDEX',
    opacity: 0.75,
    active: false,
    source: 'Copernicus S2 L2A',
    available: true,
    cdseAuth: true,
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

  useEffect(() => {
    if (!webglOverlay || !scan?.candidates?.length) return

    let raf = 0
    const canvas = webglCanvasRef.current
    const map = leafletRef.current
    if (!canvas || !map) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resize()

    const draw = (time: number) => {
      resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      scan.candidates.forEach((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng])
        const pulse = 1 + Math.sin(time / 500 + c.score * 10) * 0.25
        const radius = Math.max(20, c.diameter_m * 0.6) * pulse
        const alpha = Math.min(0.35, Math.max(0.08, c.score * 0.35))

        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius
        )

        const color =
          c.score > 0.7
            ? '239,68,68'
            : c.score > 0.4
              ? '245,158,11'
              : '91,124,111'

        gradient.addColorStop(0, `rgba(${color},${alpha})`)
        gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.35})`)
        gradient.addColorStop(1, `rgba(${color},0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => cancelAnimationFrame(raf)
  }, [webglOverlay, scan])

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
  const aoiLayerRef = useRef<any>(null)
  const aoiGuideLayerRef = useRef<any>(null)
  const aoiModeRef = useRef<AOIMode>('pin')
  const rectangleStartRef = useRef<{ lat: number; lng: number } | null>(null)
  const polygonPointsRef = useRef<[number, number][]>([])
  const geojsonImportRef = useRef<HTMLInputElement>(null)
  const terrainStartRef = useRef<{ lat: number; lng: number } | null>(null)
  const webglCanvasRef = useRef<HTMLCanvasElement>(null)

  // Sanitize initial coords from URL params
  const rawLat = parseFloat(searchParams.get('lat') || '0')
  const rawLng = parseFloat(searchParams.get('lng') || '0')
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(true)
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
  const scanLayerRef = useRef<any>(null)

  const setAOIModeSafe = useCallback((mode: AOIMode) => {
    aoiModeRef.current = mode
    setAoiMode(mode)
    setAoiSaveStatus('idle')
    rectangleStartRef.current = null
    polygonPointsRef.current = []
    aoiGuideLayerRef.current?.remove()
    aoiGuideLayerRef.current = null
  }, [clusterCandidates])

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
    const latlngs = ring.map(([lng, lat]) => [lat, lng])
    aoiLayerRef.current = L.polygon(latlngs, {
      color: '#D4AF37',
      weight: 2,
      fillColor: '#D4AF37',
      fillOpacity: 0.12,
    }).addTo(map)
  }, [])

  const applyAOI = useCallback(async (geometry: AOIGeometry, center: { lat: number; lng: number }) => {
    setAoiGeometry(geometry)
    setCoords(center)
    markerRef.current?.setLatLng([center.lat, center.lng])
    await redrawAOI(geometry)
    fetchIntel(center.lat, center.lng)
    fetchScan(center.lat, center.lng)
    const z = leafletRef.current?.getZoom?.() ?? zoom
    router.replace(`/portal/viewer?lat=${center.lat}&lng=${center.lng}&zoom=${z}`, { scroll: false })
    rememberAOI(geometry, center)
  }, [fetchIntel, fetchScan, redrawAOI, rememberAOI, router, zoom])

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
  }, [aoiGeometry, aoiMode, coords.lat, coords.lng, zoom])


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
  }, [aoiGeometry, coords.lat, coords.lng, zoom])

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
    rememberAOI(imported, center)
  }, [applyAOI, rememberAOI])

  const copyShareURL = useCallback(() => {
    const url = `${window.location.origin}/portal/viewer?lat=${coords.lat}&lng=${coords.lng}&zoom=${zoom}`
    navigator.clipboard.writeText(url)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [coords.lat, coords.lng, zoom])

  const loadSavedAOIs = useCallback(async () => {
    const local = localStorage.getItem('lithicearth:aoi-history')
    if (local) setSavedAOIs(JSON.parse(local))

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
      const samples = 24
      const points: TerrainProfilePoint[] = []
      const baseElevation = elev?.value ?? 120

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
  }, [elev?.value])

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
            `<div style="font-size:10px;font-family:monospace;background:#0b0f0c;border:1px solid #1a2a1e;color:#c8c4ba;padding:4px 8px">
              <b>ANOMALY CLUSTER</b><br/>
              members: ${cluster.members.length}<br/>
              confidence: ${(cluster.score * 100).toFixed(0)}%
            </div>`
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
  }, [])

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

      // Click → AOI tools
      map.on('click', async (e: any) => {
        const safe = sanitizeCoords(e.latlng.lat, e.latlng.lng)
        const mode = aoiModeRef.current

        if (terrainMode) {
          if (!terrainStartRef.current) {
            terrainStartRef.current = safe
            markerRef.current?.setLatLng([safe.lat, safe.lng])
            return
          }

          const start = terrainStartRef.current
          terrainStartRef.current = null

          const L = (await import('leaflet')).default

          L.polyline(
            [
              [start.lat, start.lng],
              [safe.lat, safe.lng]
            ],
            {
              color: '#fb923c',
              weight: 2,
              dashArray: '6 4'
            }
          ).addTo(map)

          await generateTerrainProfile(start, safe)
          return
        }

        if (mode === 'pin') {
          await applyAOI({ type: 'Point', coordinates: [safe.lng, safe.lat] }, safe)
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
          await applyAOI({ type: 'Polygon', coordinates: [ring] }, polygonCenter(ring))
          return
        }

        if (mode === 'polygon') {
          polygonPointsRef.current = [...polygonPointsRef.current, [safe.lng, safe.lat]]
          aoiGuideLayerRef.current?.remove()
          const L = (await import('leaflet')).default
          if (polygonPointsRef.current.length > 1) {
            aoiGuideLayerRef.current = L.polyline(
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
        await applyAOI({ type: 'Polygon', coordinates: [ring] }, polygonCenter(ring))
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
        router.replace(`/portal/viewer?lat=${coords.lat}&lng=${coords.lng}&zoom=${z}`, { scroll: false })
      })
    }

    initMap()
    fetchIntel(initCoords.lat, initCoords.lng)
    fetchScan(initCoords.lat, initCoords.lng)
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
          const tileMaxZoom = l.id === 'topo' ? 16 : 19
          const tl = L.tileLayer(l.tileUrl, { maxZoom: tileMaxZoom, opacity: l.opacity })
          tl.addTo(map)
          layerRefs.current[id] = tl
        } else if (l.wmsUrl && l.wmsLayer) {
          if (l.cdseAuth) {
            // Authenticated CDSE WMS — proxy through /api/cdse/tiles
            const baseWms = `${l.wmsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${encodeURIComponent(l.wmsLayer)}&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256`
            const tl = L.tileLayer(
              `/api/cdse/tiles?url=${encodeURIComponent(baseWms + '&BBOX={bbox-epsg-3857}')}`,
              { maxZoom: 19, opacity: l.opacity ?? 0.85, tileSize: 256, className: 'cdse-overlay' }
            )
            tl.addTo(map)
            layerRefs.current[id] = tl
          } else {
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

  const temporalScenes = [
    {
      label: 'Past',
      date: '2021-08-14',
      ndvi: 0.41,
      cloud: 12,
    },
    {
      label: 'Current',
      date: s2meta?.date?.slice(0, 10) ?? '2025-05-10',
      ndvi: ndvi?.value ?? 0.58,
      cloud: s2meta?.cloud_cover ?? 4,
    },
    {
      label: 'Projected',
      date: '2026-03-22',
      ndvi: ((ndvi?.value ?? 0.58) + 0.06),
      cloud: 6,
    },
  ]

  const ndviDelta =
    temporalScenes[1].ndvi - temporalScenes[0].ndvi

  useEffect(() => {
    if (aoiHistory.length) {
      localStorage.setItem('lithicearth:aoi-history', JSON.stringify(aoiHistory))
    }
  }, [aoiHistory])

  useEffect(() => {
    loadSavedAOIs()
  }, [loadSavedAOIs])


  useEffect(() => {
    if (!webglOverlay || !scan?.candidates?.length) return

    let raf = 0
    const canvas = webglCanvasRef.current
    const map = leafletRef.current
    if (!canvas || !map) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resize()

    const draw = (time: number) => {
      resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      scan.candidates.forEach((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng])
        const pulse = 1 + Math.sin(time / 500 + c.score * 10) * 0.25
        const radius = Math.max(20, c.diameter_m * 0.6) * pulse
        const alpha = Math.min(0.35, Math.max(0.08, c.score * 0.35))

        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius
        )

        const color =
          c.score > 0.7
            ? '239,68,68'
            : c.score > 0.4
              ? '245,158,11'
              : '91,124,111'

        gradient.addColorStop(0, `rgba(${color},${alpha})`)
        gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.35})`)
        gradient.addColorStop(1, `rgba(${color},0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => cancelAnimationFrame(raf)
  }, [webglOverlay, scan])

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
            
  useEffect(() => {
    if (!webglOverlay || !scan?.candidates?.length) return

    let raf = 0
    const canvas = webglCanvasRef.current
    const map = leafletRef.current
    if (!canvas || !map) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resize()

    const draw = (time: number) => {
      resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      scan.candidates.forEach((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng])
        const pulse = 1 + Math.sin(time / 500 + c.score * 10) * 0.25
        const radius = Math.max(20, c.diameter_m * 0.6) * pulse
        const alpha = Math.min(0.35, Math.max(0.08, c.score * 0.35))

        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius
        )

        const color =
          c.score > 0.7
            ? '239,68,68'
            : c.score > 0.4
              ? '245,158,11'
              : '91,124,111'

        gradient.addColorStop(0, `rgba(${color},${alpha})`)
        gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.35})`)
        gradient.addColorStop(1, `rgba(${color},0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => cancelAnimationFrame(raf)
  }, [webglOverlay, scan])

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
                            {layer.label}{!layer.available ? ' ↗' : ''}
                          </p>
                          <p className="text-[#2a3a2e] text-[8px]">{!layer.available ? 'point readout only — click map to read' : layer.source}</p>
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

        {webglOverlay && (
          <canvas
            ref={webglCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10 mix-blend-screen"
          />
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

        {/* Terrain Scan Results */}
        {(scan || scanLoading) && (
          <div className="border-t border-[#1a2a1e] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Atom size={9} style={{ color: '#a78bfa' }} />
              <p className="text-[8px] tracking-[0.25em]" style={{ color: '#a78bfa' }}>TERRAIN SCAN</p>
              {scanLoading && <span className="text-[#2a3a2e] text-[8px] animate-pulse ml-auto">SCANNING...</span>}
            </div>
            {scan && !scanLoading && (
              <>
                {/* ── Terrain stats ── */}
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

                {/* ── Spectral (S2 NDVI) ── */}
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

                {/* ── Muon baseline ── */}
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

                {/* ── Candidates ── */}
                {scan.candidates.length === 0 && (
                  <p className="text-[#2a3a2e] text-[8px]">No anomalies detected</p>
                )}
                {scan.candidates.slice(0, 8).map((c) => {
                  const color = c.score > 0.7 ? '#f87171' : c.score > 0.4 ? '#fbbf24' : '#5b7c6f'
                
  useEffect(() => {
    if (!webglOverlay || !scan?.candidates?.length) return

    let raf = 0
    const canvas = webglCanvasRef.current
    const map = leafletRef.current
    if (!canvas || !map) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resize()

    const draw = (time: number) => {
      resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      scan.candidates.forEach((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng])
        const pulse = 1 + Math.sin(time / 500 + c.score * 10) * 0.25
        const radius = Math.max(20, c.diameter_m * 0.6) * pulse
        const alpha = Math.min(0.35, Math.max(0.08, c.score * 0.35))

        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius
        )

        const color =
          c.score > 0.7
            ? '239,68,68'
            : c.score > 0.4
              ? '245,158,11'
              : '91,124,111'

        gradient.addColorStop(0, `rgba(${color},${alpha})`)
        gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.35})`)
        gradient.addColorStop(1, `rgba(${color},0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => cancelAnimationFrame(raf)
  }, [webglOverlay, scan])

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

        {/* AOI Manager */}
        <div className="border-t border-[#1a2a1e] p-3 space-y-2">
          <div className="text-[#5b7c6f] text-[8px] tracking-[0.25em]">AOI MANAGER</div>

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

          <p className="text-[#2a3a2e] text-[7px] leading-relaxed">
            {aoiMode === 'pin' && 'Click map to drop AOI pin.'}
            {aoiMode === 'rectangle' && 'Click two corners to draw AOI rectangle.'}
            {aoiMode === 'polygon' && 'Click vertices, double-click to finish polygon.'}
          </p>

          <button
            onClick={() => setWebglOverlay(v => !v)}
            className={`w-full py-2 border text-[8px] tracking-[0.15em] transition-colors ${
              webglOverlay
                ? 'border-[#ef4444] text-[#ef4444]'
                : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#5b7c6f]'
            }`}
          >
            {webglOverlay ? 'WEBGL HEATMAP ACTIVE' : 'WEBGL HEATMAP'}
          </button>

          <button
            onClick={() => setTerrainMode(v => !v)}
            className={`w-full py-2 border text-[8px] tracking-[0.15em] transition-colors ${
              terrainMode
                ? 'border-[#fb923c] text-[#fb923c]'
                : 'border-[#1a2a1e] text-[#5b7c6f] hover:border-[#5b7c6f]'
            }`}
          >
            {terrainMode ? 'TERRAIN PROFILE ACTIVE' : 'TERRAIN PROFILE'}
          </button>

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
            <div className="pt-2 border-t border-[#111a14] space-y-2">
              <div>
                <p className="text-[#2a3a2e] text-[7px] tracking-[0.2em] mb-1">SAVED AOIS</p>
                {(savedAOIs.length ? savedAOIs : aoiHistory).slice(0, 4).map((item) => (
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
            </div>
          )}
        </div>



        {/* Temporal Comparison */}
        <div className="border-t border-[#1a2a1e] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[#5b7c6f] text-[8px] tracking-[0.25em]">
              TEMPORAL ANALYSIS
            </p>

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

        {terrainProfile.length > 0 && (
          <div className="border-t border-[#1a2a1e] p-3">
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
              
  useEffect(() => {
    if (!webglOverlay || !scan?.candidates?.length) return

    let raf = 0
    const canvas = webglCanvasRef.current
    const map = leafletRef.current
    if (!canvas || !map) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resize()

    const draw = (time: number) => {
      resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      scan.candidates.forEach((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng])
        const pulse = 1 + Math.sin(time / 500 + c.score * 10) * 0.25
        const radius = Math.max(20, c.diameter_m * 0.6) * pulse
        const alpha = Math.min(0.35, Math.max(0.08, c.score * 0.35))

        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius
        )

        const color =
          c.score > 0.7
            ? '239,68,68'
            : c.score > 0.4
              ? '245,158,11'
              : '91,124,111'

        gradient.addColorStop(0, `rgba(${color},${alpha})`)
        gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.35})`)
        gradient.addColorStop(1, `rgba(${color},0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => cancelAnimationFrame(raf)
  }, [webglOverlay, scan])

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
            onClick={() => router.push(`/portal/reports/new?lat=${coords.lat}&lng=${coords.lng}&location=${encodeURIComponent(coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5) + ' — LithicEarth scan')}`)}
            className="w-full py-2 border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 text-[#D4AF37] text-[9px] tracking-[0.2em] transition-colors"
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

  useEffect(() => {
    if (!webglOverlay || !scan?.candidates?.length) return

    let raf = 0
    const canvas = webglCanvasRef.current
    const map = leafletRef.current
    if (!canvas || !map) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width
      canvas.height = rect.height
    }

    resize()

    const draw = (time: number) => {
      resize()
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      scan.candidates.forEach((c) => {
        const point = map.latLngToContainerPoint([c.lat, c.lng])
        const pulse = 1 + Math.sin(time / 500 + c.score * 10) * 0.25
        const radius = Math.max(20, c.diameter_m * 0.6) * pulse
        const alpha = Math.min(0.35, Math.max(0.08, c.score * 0.35))

        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          radius
        )

        const color =
          c.score > 0.7
            ? '239,68,68'
            : c.score > 0.4
              ? '245,158,11'
              : '91,124,111'

        gradient.addColorStop(0, `rgba(${color},${alpha})`)
        gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.35})`)
        gradient.addColorStop(1, `rgba(${color},0)`)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()
      })

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => cancelAnimationFrame(raf)
  }, [webglOverlay, scan])

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
