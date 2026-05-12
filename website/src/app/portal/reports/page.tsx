import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, FileText, Calendar, ArrowRight } from 'lucide-react'

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: projects } = await supabase
    .from('portal_projects')
    .select('id, name, client, created_at')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-4 md:p-8 min-min-h-screen">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">INTELLIGENCE STACK</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">Reports</h1>
            <p className="text-[#3a4a3e] text-sm font-light mt-1">Ceto-branded PDF export · MSIGI methodology</p>
          </div>
          <Link
            href="/portal/reports/new"
            className="flex items-center gap-2 px-5 py-2.5 border border-[#2a3d2e] hover:border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-wide transition-colors"
          >
            <Plus size={12} />
            Generate Report
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-[#1a2a1e] mb-10">
        {[
          { label: 'PHASE I ESA', sub: 'ASTM E1527-21', status: 'Available via Ceto' },
          { label: 'MSIGI ANALYSIS', sub: 'Multi-source interferometric', status: 'Beta' },
          { label: 'ANOMALY REPORT', sub: 'Field observation summary', status: 'Available' },
        ].map(t => (
          <div key={t.label} className="bg-[#0d1410] px-6 py-5">
            <p className="text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-1">{t.label}</p>
            <p className="text-[#e8e4da] text-sm font-light mb-2">{t.sub}</p>
            <p className="text-[#5b7c6f] text-[9px] tracking-widest font-light">{t.status}</p>
          </div>
        ))}
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-4 h-px bg-[#5b7c6f]" />
          <span className="text-[#7a8a7d] text-xs tracking-[0.2em] font-light">GENERATE FROM PROJECT</span>
        </div>
        {projects && projects.length > 0 ? (
          <div className="space-y-px">
            {projects.map(project => (
              <Link
                key={project.id}
                href={`/portal/reports/new?project=${project.id}`}
                className="flex items-center justify-between bg-[#0d1410] border border-[#1a2a1e] px-5 py-4 hover:border-[#2a3d2e] hover:bg-[#111a14] transition-all group"
              >
                <div className="flex items-center gap-5">
                  <FileText size={14} className="text-[#3a4a3e] group-hover:text-[#5b7c6f] transition-colors" />
                  <div>
                    <p className="text-[#e8e4da] text-sm font-light tracking-wide">{project.name}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1 text-[#3a4a3e] text-[10px] font-light">
                        <Calendar size={9} />
                        {new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {project.client && <span className="text-[#3a4a3e] text-[10px] font-light">{project.client}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#3a4a3e] text-[10px] tracking-widest font-light">GENERATE PDF</span>
                  <ArrowRight size={12} className="text-[#2a3d2e] group-hover:text-[#5b7c6f] transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-[#0d1410] border border-[#1a2a1e] border-dashed px-5 py-10 text-center">
            <p className="text-[#3a4a3e] text-sm font-light mb-3">No projects to report on yet</p>
            <Link href="/portal/projects/new" className="text-[#5b7c6f] text-xs tracking-wide font-light hover:text-[#7b9c8f] transition-colors">
              Create a project first →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
