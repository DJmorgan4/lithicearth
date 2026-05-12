 
 
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, MapPin, Calendar, ArrowRight } from 'lucide-react'

export default async function PortalDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: projects } = await supabase
    .from('portal_projects')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false })

  const { data: recentPosts } = await supabase
    .from('posts')
    .select('id, title, lat, lng, category, created_at, image_url')
    .order('created_at', { ascending: false })
    .limit(6)

  const postCount = recentPosts?.length ?? 0
  const projectCount = projects?.length ?? 0

  return (
    <div className="p-4 md:p-8 min-min-h-screen">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">PRIVATE PORTAL</span>
        </div>
        <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">Field Intelligence</h1>
        <p className="text-[#3a4a3e] text-sm font-light mt-1">LithicEarth · Ceto Interactive data environment</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-px bg-[#1a2a1e] mb-10">
        {[
          { label: 'ACTIVE PROJECTS', value: projectCount },
          { label: 'PUBLIC DATA POINTS', value: postCount },
          { label: 'DATA LAYERS', value: '12' },
          { label: 'REPORTS GENERATED', value: '—' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#0d1410] px-6 py-5">
            <p className="text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-2">{stat.label}</p>
            <p className="text-[#e8e4da] text-2xl font-light">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:p-6">
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-px bg-[#5b7c6f]" />
              <span className="text-[#7a8a7d] text-xs tracking-[0.2em] font-light">PROJECTS</span>
            </div>
            <Link
              href="/portal/projects/new"
              className="flex items-center gap-2 text-[#5b7c6f] hover:text-[#7b9c8f] text-xs font-light tracking-wide transition-colors"
            >
              <Plus size={12} />
              New Project
            </Link>
          </div>

          <div className="space-y-px">
            {projects && projects.length > 0 ? (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/portal/projects/${project.id}`}
                  className="flex items-center justify-between bg-[#0d1410] border border-[#1a2a1e] px-5 py-4 hover:border-[#2a3d2e] hover:bg-[#111a14] transition-all group"
                >
                  <div>
                    <p className="text-[#e8e4da] text-sm font-light tracking-wide">{project.name}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1 text-[#3a4a3e] text-[10px] font-light">
                        <Calendar size={9} />
                        {new Date(project.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {project.client && (
                        <span className="text-[#3a4a3e] text-[10px] font-light">{project.client}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-[#2a3d2e] group-hover:text-[#5b7c6f] transition-colors" />
                </Link>
              ))
            ) : (
              <div className="bg-[#0d1410] border border-[#1a2a1e] border-dashed px-5 py-10 text-center">
                <p className="text-[#3a4a3e] text-sm font-light mb-3">No projects yet</p>
                <Link
                  href="/portal/projects/new"
                  className="text-[#5b7c6f] text-xs tracking-wide font-light hover:text-[#7b9c8f] transition-colors"
                >
                  Create your first project →
                </Link>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-px bg-[#1a2a1e]">
            <Link href="/portal/globe" className="bg-[#0d1410] px-5 py-4 hover:bg-[#111a14] transition-colors group">
              <p className="text-[#5b7c6f] text-xs tracking-[0.15em] font-light mb-1 group-hover:text-[#7b9c8f] transition-colors">OPEN GLOBE →</p>
              <p className="text-[#3a4a3e] text-[10px] font-light">Full layer control + readout</p>
            </Link>
            <Link href="/portal/reports/new" className="bg-[#0d1410] px-5 py-4 hover:bg-[#111a14] transition-colors group">
              <p className="text-[#5b7c6f] text-xs tracking-[0.15em] font-light mb-1 group-hover:text-[#7b9c8f] transition-colors">GENERATE REPORT →</p>
              <p className="text-[#3a4a3e] text-[10px] font-light">Ceto-branded PDF export</p>
            </Link>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-4 h-px bg-[#5b7c6f]" />
            <span className="text-[#7a8a7d] text-xs tracking-[0.2em] font-light">PUBLIC FEED</span>
          </div>
          <div className="space-y-px">
            {recentPosts && recentPosts.length > 0 ? (
              recentPosts.map((post) => (
                <div key={post.id} className="bg-[#0d1410] border border-[#1a2a1e] px-4 py-3">
                  {post.image_url && (
                    <div className="w-full h-20 bg-[#111a14] mb-2 overflow-hidden">
                      <img src={post.image_url} alt="" className="w-full h-full object-cover opacity-70" />
                    </div>
                  )}
                  <p className="text-[#c8c4ba] text-xs font-light leading-snug">{post.title || 'Untitled observation'}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {post.lat && post.lng && (
                      <span className="flex items-center gap-1 text-[#3a4a3e] text-[9px] font-light">
                        <MapPin size={8} />
                        {Number(post.lat).toFixed(3)}, {Number(post.lng).toFixed(3)}
                      </span>
                    )}
                    {post.category && (
                      <span className="text-[#5b7c6f] text-[9px] tracking-wide font-light uppercase">{post.category}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-[#0d1410] border border-[#1a2a1e] px-4 py-6 text-center">
                <p className="text-[#3a4a3e] text-xs font-light">No public posts yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
