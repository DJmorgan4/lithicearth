'use client'

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, Loader, Download, ChevronDown, ChevronUp,
  Crosshair, MapPin, History, CheckSquare, Square
} from 'lucide-react'

// ── Report types with sensible layer presets ───────────────────────────
// Picking a report type preloads the layers that type actually needs.
// The selection stays fully editable afterwards.
const REPORT_TYPES = [
  {
    id: 'msigi',
    label: 'MSIGI Analysis',
    sub: 'Multi-Source Interferometric Ground Intelligence',
    defaultLayers: ['cdse_sar_iw_vv', 'cdse_ndvi', 'lidar_hs', 'hydro'],
  },
  {
    id: 'anomaly',
    label: 'Anomaly Summary',
    sub: 'Flagged observations with coordinates',
    defaultLayers: ['cdse_sar_iw_vv', 'cdse_ndvi', 'lidar_1m'],
  },
  {
    id: 'phase1',
    label: 'Phase I ESA Prep',
    sub: 'Site reconnaissance + data layer review',
    defaultLayers: ['hydro', 'fema', 'nwi', 'geology'],
  },
  {
    id: 'field',
    label: 'Field Report',
    sub: 'Observation notes + photo documentation',
    defaultLayers: ['lidar_hs', 'hydro'],
  },
]

// ── Layer ids kept in lockstep with the viewer's LAYER_DEFS ────────────
// The old cdse_sar_vv / cdse_sar_vh ids were removed when the viewer
// consolidated to the IW pair — referencing them here selected nothing.
const LAYERS = [
  { id: 'cdse_sar_iw_vv', label: 'SAR IW-VV (Live)' },
  { id: 'cdse_sar_iw_vh', label: 'SAR IW-VH (Live)' },
  { id: 'cdse_ndvi', label: 'NDVI (Live S2)' },
  { id: 'cdse_moisture', label: 'Moisture Index' },
  { id: 'cdse_swir', label: 'SWIR' },
  { id: 'cdse_geology', label: 'Geology (S2)' },
  { id: 'cdse_ndwi', label: 'NDWI' },
  { id: 'lidar_1m', label: 'LiDAR 1m' },
  { id: 'lidar_hs', label: 'LiDAR Hillshade' },
  { id: 'hydro', label: 'Hydrology NHD' },
  { id: 'fema', label: 'FEMA Floodplain' },
  { id: 'nwi', label: 'Wetlands NWI' },
  { id: 'geology', label: 'Geologic Map' },
]

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[#1a2a1e] bg-[#0d1410]">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <span className="text-[#5b7c6f] text-[9px] tracking-[0.3em] font-light">{title}</span>
        {open ? <ChevronUp size={10} className="text-[#3a4a3e]" /> : <ChevronDown size={10} className="text-[#3a4a3e]" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}

function parseCoord(value: string, min: number, max: number): number | null {
  const n = parseFloat(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

function NewReportInner() {
  const searchParams = useSearchParams()
  const locationParam = searchParams.get('location') || ''

  // Coordinates are editable state, seeded from the URL. This replaces the
  // old behavior where missing params rendered "NaN° N" and Generate could
  // fire with NaN coordinates.
  const [latInput, setLatInput] = useState(searchParams.get('lat') ?? '')
  const [lngInput, setLngInput] = useState(searchParams.get('lng') ?? '')

  const lat = parseCoord(latInput, -90, 90)
  const lng = parseCoord(lngInput, -180, 180)
  const hasValidCoords = lat !== null && lng !== null

  // AOI geometry handed over from the viewer — parsed once, passed through
  // to the generate + export APIs, surfaced as a chip so the analyst knows
  // the report is scoped to a drawn area rather than a bare point.
  const aoi = useMemo(() => {
    const raw = searchParams.get('aoi')
    if (!raw) return null
    try {
      const g = JSON.parse(raw)
      if (g?.type === 'Point' || g?.type === 'Polygon') return g
    } catch { /* malformed param — ignore */ }
    return null
  }, [searchParams])

  // License-clear historical overlays selected in the viewer.
  const overlayIds = useMemo(() => {
    const raw = searchParams.get('overlays')
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
  }, [searchParams])

  const [reportType, setReportType] = useState('msigi')
  const [selectedLayers, setSelectedLayers] = useState<string[]>(
    REPORT_TYPES[0].defaultLayers
  )
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState(locationParam)
  const [generating, setGenerating] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [mapImage, setMapImage] = useState<string>('')
  const [terrainImage, setTerrainImage] = useState<string>('')
  const [ndviImage, setNdviImage] = useState<string>('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('')

  const selectType = (id: string) => {
    setReportType(id)
    const preset = REPORT_TYPES.find(rt => rt.id === id)
    if (preset) setSelectedLayers(preset.defaultLayers)
  }

  const toggleLayer = (id: string) => {
    setSelectedLayers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const allSelected = selectedLayers.length === LAYERS.length

  const handleGenerate = async () => {
    if (!hasValidCoords) return
    setGenerating(true)
    setError('')
    setReportData(null)

    try {
      setPhase('Running MSIGI scan...')
      const res = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat, lng,
          activeLayers: selectedLayers,
          reportType, notes, location,
          aoi: aoi ?? undefined,
          overlays: overlayIds.length ? overlayIds : undefined,
        }),
      })
      setPhase('ASTRA interpreting layers...')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setReportData(data)
      if (data.map_image) setMapImage(data.map_image)
      if (data.terrain_image) setTerrainImage(data.terrain_image)
      if (data.ndvi_image) setNdviImage(data.ndvi_image)
    } catch (e: any) {
      setError(e.message || 'Generation failed')
    } finally {
      setGenerating(false)
      setPhase('')
    }
  }

  const handleDownloadPDF = async () => {
    if (!reportData || !hasValidCoords) return
    try {
      const res = await fetch('/api/report/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          location: location || `${lat}, ${lng}`,
          reportType,
          activeLayers: selectedLayers,
          notes,
          aoi: aoi ?? undefined,
          overlays: overlayIds.length ? overlayIds : undefined,
          generated_at: reportData.generated_at,
          scan: reportData.scan,
          astra_interpretation: reportData.astra_interpretation,
          map_image: mapImage || undefined,
          terrain_image: terrainImage || undefined,
          ndvi_image: ndviImage || undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `LithicEarth_MSIGI_${lat}_${lng}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('PDF export failed: ' + String(e))
    }
  }

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-4xl pb-28">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">FIELD INTELLIGENCE</span>
        </div>
        <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">Generate Report</h1>
        <p className="text-[#3a4a3e] text-sm font-light mt-1">
          MSIGI scan · ASTRA layer interpretation · LithicEarth methodology
        </p>
      </div>

      {/* ── SITE ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">SITE</label>

        {hasValidCoords ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 px-3 py-1.5 border border-[#2a3d2e] text-[#c8c4ba] text-[11px] font-mono font-light">
              <Crosshair size={10} className="text-[#D4AF37]" />
              {lat}° · {lng}°
            </span>
            {aoi && (
              <span className="flex items-center gap-2 px-3 py-1.5 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-light">
                <MapPin size={10} />
                {aoi.type === 'Polygon'
                  ? `AOI polygon · ${Math.max((aoi.coordinates?.[0]?.length ?? 1) - 1, 0)} vertices`
                  : 'AOI pin'}
              </span>
            )}
            {overlayIds.length > 0 && (
              <span className="flex items-center gap-2 px-3 py-1.5 border border-[#1a2a1e] text-[#5b7c6f] text-[10px] font-light">
                <History size={10} />
                {overlayIds.length} historical overlay{overlayIds.length > 1 ? 's' : ''} attached
              </span>
            )}
            <button
              onClick={() => { setLatInput(''); setLngInput('') }}
              className="text-[#3a4a3e] text-[10px] font-light hover:text-[#5b7c6f] transition-colors"
            >
              change
            </button>
          </div>
        ) : (
          <div className="bg-[#0d1410] border border-[#1a2a1e] border-dashed px-5 py-5">
            <p className="text-[#7a8a7d] text-xs font-light mb-3">
              No site selected. Pick one in the Viewer, or enter coordinates directly.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={latInput}
                onChange={e => setLatInput(e.target.value)}
                placeholder="Latitude (−90 to 90)"
                inputMode="decimal"
                className="w-44 bg-[#09100b] border border-[#1a2a1e] px-3 py-2 text-[#c8c4ba] text-xs font-light font-mono placeholder-[#2a3a2e] focus:outline-none focus:border-[#3a5a3e]"
              />
              <input
                value={lngInput}
                onChange={e => setLngInput(e.target.value)}
                placeholder="Longitude (−180 to 180)"
                inputMode="decimal"
                className="w-44 bg-[#09100b] border border-[#1a2a1e] px-3 py-2 text-[#c8c4ba] text-xs font-light font-mono placeholder-[#2a3a2e] focus:outline-none focus:border-[#3a5a3e]"
              />
              <Link
                href="/portal/viewer"
                className="text-[#5b7c6f] text-[11px] font-light hover:text-[#D4AF37] transition-colors"
              >
                Open Viewer →
              </Link>
            </div>
            {(latInput || lngInput) && !hasValidCoords && (
              <p className="text-[#fbbf24] text-[10px] font-light mt-2">
                Coordinates must be decimal degrees within range.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6 mb-6">
        {/* ── REPORT TYPE ────────────────────────────────────────────── */}
        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">REPORT TYPE</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1a2a1e]">
            {REPORT_TYPES.map(rt => (
              <button key={rt.id} onClick={() => selectType(rt.id)}
                className={`px-4 py-3 text-left transition-colors ${reportType === rt.id ? 'bg-[#111a14]' : 'bg-[#0d1410]'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  {reportType === rt.id && <div className="w-1 h-1 rounded-full bg-[#5b7c6f]" />}
                  <p className={`text-xs font-light ${reportType === rt.id ? 'text-[#e8e4da]' : 'text-[#7a8a7d]'}`}>{rt.label}</p>
                </div>
                <p className="text-[#3a4a3e] text-[9px] font-light">{rt.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── LAYERS ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light">
              DATA LAYERS TO INTERPRET
              <span className="text-[#2a3a2e] ml-2 tracking-normal">preset for {REPORT_TYPES.find(rt => rt.id === reportType)?.label} — adjust freely</span>
            </label>
            <button
              onClick={() => setSelectedLayers(allSelected ? [] : LAYERS.map(l => l.id))}
              className="flex items-center gap-1.5 text-[#3a4a3e] text-[9px] font-light hover:text-[#5b7c6f] transition-colors"
            >
              {allSelected ? <CheckSquare size={10} /> : <Square size={10} />}
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LAYERS.map(l => (
              <button key={l.id} onClick={() => toggleLayer(l.id)}
                className={`px-3 py-1.5 text-[9px] font-light tracking-wide border transition-colors ${
                  selectedLayers.includes(l.id) ? 'border-[#5b7c6f] text-[#5b7c6f] bg-[#5b7c6f]/5' : 'border-[#1a2a1e] text-[#3a4a3e] hover:border-[#2a3d2e]'
                }`}>{l.label}</button>
            ))}
          </div>
          {selectedLayers.length === 0 && (
            <p className="text-[#fbbf24] text-[10px] font-light mt-2">
              Select at least one layer for ASTRA to interpret.
            </p>
          )}
        </div>

        {/* ── DETAILS ────────────────────────────────────────────────── */}
        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">LOCATION / ADDRESS</label>
          <input value={location} onChange={e => setLocation(e.target.value)}
            placeholder="Site address or description..."
            className="w-full bg-[#0d1410] border border-[#1a2a1e] px-4 py-2.5 text-[#c8c4ba] text-xs font-light placeholder-[#2a3a2e] focus:outline-none focus:border-[#3a5a3e]" />
        </div>

        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">ANALYST NOTES</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Additional context, field observations, or methodology notes..."
            className="w-full bg-[#0d1410] border border-[#1a2a1e] px-4 py-2.5 text-[#c8c4ba] text-xs font-light placeholder-[#2a3a2e] focus:outline-none focus:border-[#3a5a3e] resize-none" />
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 border border-red-900/40 bg-red-900/10 text-red-400 text-xs font-light">{error}</div>}

      {/* ── RESULT ───────────────────────────────────────────────────── */}
      {reportData && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[#e8e4da] text-sm font-light">Report Complete</p>
              <p className="text-[#3a4a3e] text-[10px] font-light mt-0.5">{new Date(reportData.generated_at).toLocaleString()}</p>
            </div>
            <button onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 border border-[#5b7c6f] text-[#5b7c6f] text-[10px] font-light tracking-wide hover:bg-[#5b7c6f]/10 transition-colors">
              <Download size={10} />
              Download PDF
            </button>
          </div>

          <Section title="TERRAIN SCAN" defaultOpen={true}>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 text-[10px] font-light">
              <div><span className="text-[#3a4a3e]">ANOMALIES</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.candidates?.length ?? '—'}</p></div>
              <div><span className="text-[#3a4a3e]">MEAN ELEV</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.terrain?.mean_elevation_m}m</p></div>
              <div><span className="text-[#3a4a3e]">STD</span><p className="text-[#e8e4da] mt-1">±{reportData.scan?.terrain?.std_elevation_m}m</p></div>
              <div><span className="text-[#3a4a3e]">ELEVATED PTS</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.terrain?.elevated_point_count}</p></div>
              <div><span className="text-[#3a4a3e]">DEM SOURCE</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.terrain?.source}</p></div>
              <div><span className="text-[#3a4a3e]">NDVI</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.spectral?.ndvi_mean}</p></div>
            </div>
          </Section>

          <Section title="ASTRA CORE — LAYER INTERPRETATION" defaultOpen={true}>
            <div className="text-[#c8c4ba] text-xs font-light leading-relaxed whitespace-pre-wrap">
              {reportData.astra_interpretation}
            </div>
          </Section>

          {reportData.scan?.candidates?.length > 0 && (
            <Section title={`CANDIDATE ANOMALIES (${reportData.scan.candidates.length})`}>
              <div className="space-y-2">
                {reportData.scan.candidates.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-4 py-2 border-b border-[#0f160f] last:border-0 text-[10px] font-light">
                    <span className="text-[#5b7c6f] w-4">{c.id}</span>
                    <span className="text-[#e8e4da]">Score {c.score}</span>
                    <span className="text-[#3a4a3e]">DEM {c.dem_score ?? c.terrain_score ?? '—'}</span>
                    <span className="text-[#3a4a3e]">NDVI {c.ndvi_score ?? c.ndvi_signal ?? '—'}</span>
                    <span className="text-[#3a4a3e]">SAR {c.sar_score ?? c.sar_signal ?? '—'}</span>
                    <span className="text-[#2a3a2e] ml-auto font-mono">{c.lat?.toFixed(5)}, {c.lng?.toFixed(5)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="SAR + MUON">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] font-light">
              <div><span className="text-[#3a4a3e]">SAR PLATFORM</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.sar?.platform ?? '—'}</p></div>
              <div><span className="text-[#3a4a3e]">SAR DATE</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.sar?.date ?? '—'}</p></div>
              <div><span className="text-[#3a4a3e]">MUON FLUX</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.muon_baseline?.flux_m2_min}/m²/min</p></div>
              <div><span className="text-[#3a4a3e]">Kp INDEX</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.muon_baseline?.kp_index}</p></div>
            </div>
          </Section>
        </div>
      )}

      {/* ── STICKY GENERATE BAR ──────────────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-[#0a0e0b]/95 border-t border-[#1a2a1e] backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {hasValidCoords ? (
              <p className="text-[#3a4a3e] text-[10px] font-light truncate">
                <span className="text-[#5b7c6f] font-mono">{lat}°, {lng}°</span>
                {' · '}{REPORT_TYPES.find(rt => rt.id === reportType)?.label}
                {' · '}{selectedLayers.length} layer{selectedLayers.length === 1 ? '' : 's'}
              </p>
            ) : (
              <p className="text-[#fbbf24] text-[10px] font-light">Select a site to generate.</p>
            )}
            {generating && phase && (
              <p className="text-[#5b7c6f] text-[9px] font-light animate-pulse mt-0.5">{phase}</p>
            )}
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || !hasValidCoords || selectedLayers.length === 0}
            className="flex items-center gap-3 px-6 py-2.5 border border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-widest hover:bg-[#5b7c6f]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            {generating ? <Loader size={12} className="animate-spin" /> : <FileText size={12} />}
            {generating ? 'GENERATING…' : 'GENERATE REPORT'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NewReportPage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-8 text-[#3a4a3e] text-xs font-light">Loading...</div>}>
      <NewReportInner />
    </Suspense>
  )
}
