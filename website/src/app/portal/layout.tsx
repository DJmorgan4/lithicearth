import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Globe, FolderOpen, FileText, LogOut, Layers } from 'lucide-react'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?next=/portal')
  }

  return (
    <div className="min-min-h-screen bg-[#0a0e0b] flex flex-col md:flex-row">
      <aside className="w-full md:w-full md:w-56 md:min-min-h-screen bg-[#0d1410] border-b md:border-b-0 md:border-r border-[#1a2a1e] flex md:flex-col overflow-x-auto md:overflow-visible sticky top-0 z-40">
        <div className="shrink-0 p-4 md:p-4 md:p-6 border-r md:border-r-0 md:border-b border-[#1a2a1e]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-px bg-[#5b7c6f]" />
            <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">PORTAL</span>
          </div>
          <span className="text-[#e8e4da] text-sm font-light tracking-wider whitespace-nowrap">LithicEarth</span>
        </div>

        <nav className="flex-1 p-3 md:p-4 flex md:flex-col gap-1 md:space-y-1 overflow-x-auto">
          <NavItem href="/portal" icon={<FolderOpen size={14} />} label="Projects" />
          <NavItem href="/portal/globe" icon={<Globe size={14} />} label="Globe" />
          <NavItem href="/portal/layers" icon={<Layers size={14} />} label="Data Layers" />
          <NavItem href="/portal/reports" icon={<FileText size={14} />} label="Reports" />
        </nav>

        <div className="hidden md:block p-4 border-t border-[#1a2a1e]">
          <p className="text-[#3a4a3e] text-[10px] tracking-widest font-light mb-3 truncate">
            {user.email}
          </p>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-2 text-[#3a4a3e] hover:text-[#5b7c6f] text-xs font-light transition-colors"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0 w-full min-min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-2 px-3 py-2 text-[#5b7c6f] hover:text-[#D4AF37] hover:bg-[#111a14] text-xs font-light tracking-wider transition-colors whitespace-nowrap"
    >
      {icon}
      {label}
    </Link>
  )
}
