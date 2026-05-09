'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, Loader, Download, ChevronDown, ChevronUp } from 'lucide-react'

const REPORT_TYPES = [
  { id: 'msigi', label: 'MSIGI Analysis', sub: 'Multi-Source Interferometric Ground Intelligence' },
  { id: 'anomaly', label: 'Anomaly Summary', sub: 'Flagged observations with coordinates' },
  { id: 'phase1', label: 'Phase I ESA Prep', sub: 'Site reconnaissance + data layer review' },
  { id: 'field', label: 'Field Report', sub: 'Observation notes + photo documentation' },
]

const LAYERS = [
  { id: 'cdse_sar_vv', label: 'SAR VV (Live)' },
  { id: 'cdse_sar_vh', label: 'SAR VH (Live)' },
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

function NewReportInner() {
  const searchParams = useSearchParams()
  const lat = parseFloat(searchParams.get('lat') || '33.17429')
  const lng = parseFloat(searchParams.get('lng') || '-96.61903')
  const locationParam = searchParams.get('location') || ''

  const [reportType, setReportType] = useState('msigi')
  const [selectedLayers, setSelectedLayers] = useState<string[]>(['cdse_sar_vv', 'cdse_ndvi', 'lidar_hs', 'hydro'])
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState(locationParam)
  const [generating, setGenerating] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('')

  const toggleLayer = (id: string) => {
    setSelectedLayers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setReportData(null)

    try {
      setPhase('Running MSIGI scan...')
      const res = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, activeLayers: selectedLayers, reportType, notes, location }),
      })
      setPhase('ASTRA interpreting layers...')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setReportData(data)
    } catch (e: any) {
      setError(e.message || 'Generation failed')
    } finally {
      setGenerating(false)
      setPhase('')
    }
  }

  const handleDownloadPDF = async () => {
    if (!reportData) return
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
          generated_at: reportData.generated_at,
          scan: reportData.scan,
          astra_interpretation: reportData.astra_interpretation,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `LithicEarth_MSIGI_${lat}_${lng}_${new Date().toISOString().slice(0,10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('PDF export failed: ' + String(e))
    }
  }

  return (
    <div className="p-8 min-h-screen max-w-4xl">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">FIELD INTELLIGENCE</span>
        </div>
        <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">Generate Report</h1>
        <p className="text-[#3a4a3e] text-sm font-light mt-1">
          MSIGI scan · ASTRA layer interpretation · LithicEarth methodology
        </p>
        <div className="mt-3 flex items-center gap-4">
          <span className="text-[#5b7c6f] text-[10px] font-mono">{lat}° N · {lng}° E</span>
          {location && <span className="text-[#3a4a3e] text-[10px]">{location}</span>}
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">REPORT TYPE</label>
          <div className="grid grid-cols-2 gap-px bg-[#1a2a1e]">
            {REPORT_TYPES.map(rt => (
              <button key={rt.id} onClick={() => setReportType(rt.id)}
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

        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">DATA LAYERS TO INTERPRET</label>
          <div className="flex flex-wrap gap-1.5">
            {LAYERS.map(l => (
              <button key={l.id} onClick={() => toggleLayer(l.id)}
                className={`px-3 py-1.5 text-[9px] font-light tracking-wide border transition-colors ${
                  selectedLayers.includes(l.id) ? 'border-[#5b7c6f] text-[#5b7c6f] bg-[#5b7c6f]/5' : 'border-[#1a2a1e] text-[#3a4a3e] hover:border-[#2a3d2e]'
                }`}>{l.label}</button>
            ))}
          </div>
        </div>

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

      <button onClick={handleGenerate} disabled={generating}
        className="flex items-center gap-3 px-6 py-3 border border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-widest hover:bg-[#5b7c6f]/10 transition-colors disabled:opacity-50 mb-8">
        {generating ? <Loader size={12} className="animate-spin" /> : <FileText size={12} />}
        {generating ? (phase || 'GENERATING...') : 'GENERATE REPORT'}
      </button>

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
              Download
            </button>
          </div>

          <Section title="TERRAIN SCAN" defaultOpen={true}>
            <div className="grid grid-cols-3 gap-3 text-[10px] font-light">
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

          <Section title="CANDIDATES">
            <div className="space-y-2">
              {reportData.scan?.candidates?.map((c: any) => (
                <div key={c.id} className="flex items-center gap-4 py-2 border-b border-[#0f160f] text-[10px] font-light">
                  <span className="text-[#5b7c6f] w-4">{c.id}</span>
                  <span className="text-[#e8e4da]">Score {c.score}</span>
                  <span className="text-[#3a4a3e]">DEM {c.dem_score}</span>
                  <span className="text-[#3a4a3e]">NDVI {c.ndvi_score}</span>
                  <span className="text-[#3a4a3e]">SAR {c.sar_score}</span>
                  <span className="text-[#2a3a2e] ml-auto">{c.lat?.toFixed(5)}, {c.lng?.toFixed(5)}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="SAR + MUON">
            <div className="grid grid-cols-2 gap-3 text-[10px] font-light">
              <div><span className="text-[#3a4a3e]">SAR PLATFORM</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.sar?.platform ?? '—'}</p></div>
              <div><span className="text-[#3a4a3e]">SAR DATE</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.sar?.date ?? '—'}</p></div>
              <div><span className="text-[#3a4a3e]">MUON FLUX</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.muon_baseline?.flux_per_m2_min}/m²/min</p></div>
              <div><span className="text-[#3a4a3e]">Kp INDEX</span><p className="text-[#e8e4da] mt-1">{reportData.scan?.muon_baseline?.kp_index}</p></div>
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

export default function NewReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[#3a4a3e] text-xs font-light">Loading...</div>}>
      <NewReportInner />
    </Suspense>
  )
}
