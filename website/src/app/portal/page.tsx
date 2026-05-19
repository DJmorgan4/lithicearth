import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function PortalDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: projects } = await supabase
    .from('portal_projects')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: sites } = await supabase
    .from('stratum_sites')
    .select('id, name, source, ceto_score, ceto_tier, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const projectCount = projects?.length ?? 0
  const siteCount = sites?.length ?? 0

  return (
    <div className="p-6 md:p-10 min-h-screen">

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">PRIVATE PORTAL</span>
        </div>
        <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">Field Intelligence</h1>
        <p className="text-[#3a4a3e] text-sm font-light mt-1">LithicEarth · MSIGI · ASTRA · STRATUM</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1a2a1e] mb-10">
        {[
          { label: 'PROJECTS', value: projectCount },
          { label: 'STRATUM SITES', value: siteCount },
          { label: 'DATA LAYERS', value: '12' },
          { label: 'ENGINE', value: 'LIVE' },
        ].map((s) => (
          <div key={s.label} className="bg-[#0d1410] px-6 py-5">
            <p className="text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">{s.label}</p>
            <p className="text-[#e8e4da] text-2xl font-light">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1a2a1e] mb-10">
        <Link href="/portal/globe" className="bg-[#0d1410] px-6 py-8 hover:bg-[#111a14] transition-colors group block">
          <p className="text-[#5b7c6f] text-xs tracking-[0.2em] font-light mb-2 group-hover:text-[#7b9c8f] transition-colors">GLOBE → MSIGI SCAN</p>
          <p className="text-[#e8e4da] text-lg font-light mb-1">Discovery Globe</p>
          <p className="text-[#3a4a3e] text-xs font-light">ASTRA discovery · TPWD WMAs · terrain intelligence · candidate scoring</p>
        </Link>
        <Link href="/portal/viewer" className="bg-[#0d1410] px-6 py-8 hover:bg-[#111a14] transition-colors group block">
          <p className="text-[#5b7c6f] text-xs tracking-[0.2em] font-light mb-2 group-hover:text-[#7b9c8f] transition-colors">VIEWER → ANALYSIS</p>
          <p className="text-[#e8e4da] text-lg font-light mb-1">Terrain Viewer</p>
          <p className="text-[#3a4a3e] text-xs font-light">LiDAR · NDVI · SAR · hydrology · geology · FEMA flood zones</p>
        </Link>
        <Link href="/portal/projects" className="bg-[#0d1410] px-6 py-8 hover:bg-[#111a14] transition-colors group block">
          <p className="text-[#5b7c6f] text-xs tracking-[0.2em] font-light mb-2 group-hover:text-[#7b9c8f] transition-colors">PROJECTS → REPORTS</p>
          <p className="text-[#e8e4da] text-lg font-light mb-1">Site Projects</p>
          <p className="text-[#3a4a3e] text-xs font-light">Manage sites · field notes · generate Ceto-branded PDF reports</p>
        </Link>
      </div>

      {/* Recent STRATUM sites */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-4 h-px bg-[#5b7c6f]" />
          <span className="text-[#7a8a7d] text-xs tracking-[0.2em] font-light">STRATUM — RECENT SITES</span>
        </div>
        <div className="space-y-px">
          {sites && sites.length > 0 ? sites.map((site) => (
            <div key={site.id} className="bg-[#0d1410] border border-[#1a2a1e] px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[#e8e4da] text-sm font-light">{site.name}</p>
                <p className="text-[#3a4a3e] text-[10px] font-light mt-0.5">{site.source} · {new Date(site.created_at).toLocaleDateString()}</p>
              </div>
              {site.ceto_score && (
                <div className="text-right">
                  <p className="text-[#5b7c6f] text-sm font-light">{site.ceto_score}</p>
                  <p className="text-[#3a4a3e] text-[9px] font-light">{site.ceto_tier}</p>
                </div>
              )}
            </div>
          )) : (
            <div className="bg-[#0d1410] border border-[#1a2a1e] border-dashed px-5 py-8 text-center">
              <p className="text-[#3a4a3e] text-sm font-light mb-2">No sites in STRATUM yet</p>
              <Link href="/portal/globe" className="text-[#5b7c6f] text-xs tracking-wide font-light hover:text-[#7b9c8f] transition-colors">
                Open Globe to scan your first site →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Engine status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1a2a1e]">
        {[
          { label: 'MSIGI ENGINE', status: 'live', url: 'https://lithicearth-production.up.railway.app/health' },
          { label: 'ASTRA CORE', status: 'live', url: 'https://astarte-works.vercel.app/api/astra/core' },
          { label: 'STRATUM DB', status: 'live', url: '' },
          { label: 'TPWD WMA', status: 'live', url: '' },
        ].map((e) => (
          <div key={e.label} className="bg-[#0d1410] px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#5b7c6f]" />
              <p className="text-[#3a4a3e] text-[9px] tracking-[0.2em] font-light">{e.label}</p>
            </div>
            <p className="text-[#5b7c6f] text-xs font-light">{e.status}</p>
          </div>
        ))}
      </div>

    </div>
  )
}
