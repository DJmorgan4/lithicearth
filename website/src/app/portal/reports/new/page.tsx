'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, Loader, CheckCircle, Download } from 'lucide-react'

const REPORT_TYPES = [
  { id: 'msigi', label: 'MSIGI Analysis', sub: 'Multi-Source Interferometric Ground Intelligence' },
  { id: 'anomaly', label: 'Anomaly Summary', sub: 'Flagged observations with coordinates' },
  { id: 'phase1', label: 'Phase I ESA Prep', sub: 'Site reconnaissance + data layer review' },
  { id: 'field', label: 'Field Report', sub: 'Observation notes + photo documentation' },
]

const LAYERS = [
  'SAR / InSAR', 'LiDAR / DEM', 'Hyperspectral', 'Multispectral (NDVI)',
  'Thermal IR', 'Magnetometry', 'Nighttime Light', 'Bathymetry',
]

function NewReportInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project')

  const [projects, setProjects] = useState<Array<{id: string; name: string; client?: string}>>([])
  const [selectedProject, setSelectedProject] = useState(projectId ?? '')
  const [reportType, setReportType] = useState('msigi')
  const [selectedLayers, setSelectedLayers] = useState<string[]>(['SAR / InSAR', 'LiDAR / DEM', 'Hyperspectral'])
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    createClient()
      .from('portal_projects')
      .select('id, name, client')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setProjects(data) })
  }, [])

  const toggleLayer = (l: string) => {
    setSelectedLayers(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  }

  const handleGenerate = async () => {
    setGenerating(true)
    await new Promise(r => setTimeout(r, 2200))
    setGenerating(false)
    setDone(true)
  }

  const project = projects.find(p => p.id === selectedProject)

  return (
    <div className="p-8 min-h-screen max-w-3xl">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">REPORTS</span>
        </div>
        <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">Generate Report</h1>
        <p className="text-[#3a4a3e] text-sm font-light mt-1">Ceto-branded PDF · MSIGI methodology</p>
      </div>

      {done ? (
        <div className="bg-[#0d1410] border border-[#1a2a1e] px-8 py-12 text-center">
          <CheckCircle size={32} className="mx-auto mb-4 text-[#5b7c6f]" />
          <p className="text-[#e8e4da] text-lg font-light mb-2">Report Generated</p>
          <p className="text-[#3a4a3e] text-sm font-light mb-8">
            {REPORT_TYPES.find(r => r.id === reportType)?.label} · {project?.name ?? 'Standalone'}
          </p>
          <div className="flex items-center justify-center gap-4">
            <button className="flex items-center gap-2 px-6 py-2.5 border border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-wide hover:bg-[#5b7c6f]/10 transition-colors">
              <Download size={12} />
              Download PDF
            </button>
            <button onClick={() => { setDone(false); setGenerating(false) }} className="text-[#3a4a3e] text-xs font-light hover:text-[#7a8a7d] transition-colors">
              Generate another
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">PROJECT</label>
            <div className="space-y-px">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProject(p.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 border text-left transition-colors ${
                    selectedProject === p.id ? 'border-[#5b7c6f] bg-[#5b7c6f]/5 text-[#e8e4da]' : 'border-[#1a2a1e] bg-[#0d1410] text-[#7a8a7d] hover:border-[#2a3d2e]'
                  }`}
                >
                  <span className="text-xs font-light">{p.name}</span>
                  {p.client && <span className="text-[#3a4a3e] text-[10px] font-light">{p.client}</span>}
                </button>
              ))}
              <button
                onClick={() => setSelectedProject('')}
                className={`w-full text-left px-4 py-3 border text-xs font-light transition-colors ${
                  selectedProject === '' ? 'border-[#5b7c6f] bg-[#5b7c6f]/5 text-[#e8e4da]' : 'border-[#1a2a1e] bg-[#0d1410] text-[#7a8a7d] hover:border-[#2a3d2e]'
                }`}
              >
                No project (standalone)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">REPORT TYPE</label>
            <div className="grid grid-cols-2 gap-px bg-[#1a2a1e]">
              {REPORT_TYPES.map(rt => (
                <button
                  key={rt.id}
                  onClick={() => setReportType(rt.id)}
                  className={`px-4 py-4 text-left transition-colors ${reportType === rt.id ? 'bg-[#111a14]' : 'bg-[#0d1410]'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {reportType === rt.id && <div className="w-1 h-1 rounded-full bg-[#5b7c6f]" />}
                    <p className={`text-xs font-light tracking-wide ${reportType === rt.id ? 'text-[#e8e4da]' : 'text-[#7a8a7d]'}`}>{rt.label}</p>
                  </div>
                  <p className="text-[#3a4a3e] text-[10px] font-light">{rt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">INCLUDE DATA LAYERS</label>
            <div className="flex flex-wrap gap-2">
              {LAYERS.map(l => (
                <button
                  key={l}
                  onClick={() => toggleLayer(l)}
                  className={`px-3 py-1.5 text-[10px] font-light tracking-wide border transition-colors ${
                    selectedLayers.includes(l) ? 'border-[#5b7c6f] text-[#5b7c6f] bg-[#5b7c6f]/5' : 'border-[#1a2a1e] text-[#3a4a3e] hover:border-[#2a3d2e]'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">ANALYST NOTES</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Additional context, findings, or methodology notes..."
              className="w-full bg-[#0d1410] border border-[#1a2a1e] px-4 py-3 text-[#c8c4ba] text-xs font-light placeholder-[#2a3a2e] focus:outline-none focus:border-[#3a5a3e] resize-none"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-3 px-6 py-3 border border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-widest hover:bg-[#5b7c6f]/10 transition-colors disabled:opacity-50"
          >
            {generating ? <Loader size={12} className="animate-spin" /> : <FileText size={12} />}
            {generating ? 'GENERATING PDF...' : 'GENERATE REPORT'}
          </button>
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
