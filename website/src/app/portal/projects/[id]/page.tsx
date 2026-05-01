import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Calendar, MapPin, FileText, ArrowLeft, Globe, Flag } from 'lucide-react'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: project } = await supabase
    .from('portal_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user?.id)
    .single()

  if (!project) notFound()

  const { data: observations } = await supabase
    .from('portal_observations')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })

  const flagged = observations?.filter(o => o.flagged) ?? []
  const total = observations?.length ?? 0

  return (
    <div className="p-8 min-h-screen">
      <Link href="/portal" className="flex items-center gap-2 text-[#3a4a3e] hover:text-[#7a8a7d] text-xs font-light mb-8 transition-colors">
        <ArrowLeft size={11} />
        Projects
      </Link>

      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[9px] tracking-[0.3em] font-light">
            {(project.platform ?? ['lithicearth']).join(' · ').toUpperCase()}
          </span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide mb-2">{project.name}</h1>
            <div className="flex items-center gap-5">
              {project.client && <span className="text-[#7a8a7d] text-xs font-light">{project.client}</span>}
              <span className="flex items-center gap-1 text-[#3a4a3e] text-xs font-light">
                <Calendar size={10} />
                {new Date(project.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              <span
                className="text-[9px] tracking-widest font-light px-2 py-0.5"
                style={{
                  color: project.status === 'active' ? '#4ade80' : '#3a4a3e',
                  background: project.status === 'active' ? 'rgba(74,222,128,0.08)' : 'transparent',
                }}
              >
                {(project.status ?? 'active').toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/portal/reports/new?project=${project.id}`}
              className="flex items-center gap-2 px-4 py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-wide transition-colors"
            >
              <FileText size={11} />
              Generate Report
            </Link>
            <Link
              href="/portal/globe"
              className="flex items-center gap-2 px-4 py-2 border border-[#1a2a1e] hover:border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-wide transition-colors"
            >
              <Globe size={11} />
              Open Globe
            </Link>
          </div>
        </div>
      </div>

      {project.description && (
        <p className="text-[#7a8a7d] text-sm font-light leading-relaxed mb-10 border-l-2 border-[#1a2a1e] pl-5 max-w-2xl">
          {project.description}
        </p>
      )}

      <div className="grid grid-cols-4 gap-px bg-[#1a2a1e] mb-10">
        {[
          { label: 'OBSERVATIONS', value: total },
          { label: 'FLAGGED ANOMALIES', value: flagged.length },
          { label: 'STATUS', value: (project.status ?? 'active').toUpperCase() },
          { label: 'PLATFORMS', value: (project.platform ?? ['lithicearth']).length },
        ].map(stat => (
          <div key={stat.label} className="bg-[#0d1410] px-6 py-5">
            <p className="text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">{stat.label}</p>
            <p className="text-[#e8e4da] text-2xl font-light">{stat.value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-4 h-px bg-[#5b7c6f]" />
          <span className="text-[#7a8a7d] text-xs tracking-[0.2em] font-light">OBSERVATIONS</span>
        </div>

        {observations && observations.length > 0 ? (
          <div className="space-y-px">
            {observations.map(obs => (
              <div key={obs.id} className="flex items-start justify-between bg-[#0d1410] border border-[#1a2a1e] px-5 py-4">
                <div className="flex items-start gap-4">
                  {obs.flagged && <Flag size={12} className="mt-0.5 flex-shrink-0 text-[#f87171]" />}
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[#5b7c6f] text-[9px] tracking-widest font-light uppercase">{obs.type ?? 'observation'}</span>
                      <span className="text-[#3a4a3e] text-[9px] font-light">
                        {new Date(obs.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {obs.notes && <p className="text-[#a8a49c] text-xs font-light leading-snug">{obs.notes}</p>}
                    {obs.geometry && (
                      <span className="flex items-center gap-1 mt-2 text-[#2a3a2e] text-[9px] font-light">
                        <MapPin size={8} />
                        {JSON.stringify(obs.geometry).slice(0, 60)}...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#0d1410] border border-[#1a2a1e] border-dashed px-5 py-10 text-center">
            <p className="text-[#3a4a3e] text-sm font-light mb-2">No observations yet</p>
            <p className="text-[#2a3a2e] text-xs font-light">Flag anomalies from the Globe view — they will appear here</p>
            <Link href="/portal/globe" className="inline-block mt-4 text-[#5b7c6f] text-xs tracking-wide font-light hover:text-[#7b9c8f] transition-colors">
              Open Globe →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
