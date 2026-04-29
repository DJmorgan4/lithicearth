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
    <div className="min-h-screen bg-[#0a0e0b] flex">
      <aside className="w-56 min-h-screen bg-[#0d1410] border-r border-[#1a2a1e] flex flex-col fixed left-0 top-0 z-40">
        <div className="p-6 border-b border-[#1a2a1e]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-px bg-[#5b7c6f]" />
            <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">PORTAL</span>
          </div>
          <span className="text-[#e8e4da] text-sm font-light tracking-wider">LithicEarth</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavItem href="/portal" icon={<FolderOpen size={14} />} label="Projects" />
          <NavItem href="/portal/globe" icon={<Globe size={14} />} label="Globe" />
          <NavItem href="/portal/layers" icon={<Layers size={14} />} label="Data Layers" />
          <NavItem href="/portal/reports" icon={<FileText size={14} />} label="Reports" />
        </nav>

        <div className="p-4 border-t border-[#1a2a1e]">
          <p className="text-[#3a4a3e] text-[10px] tracking-widest font-light mb-3 truncate">
            {user.email}
          </p>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-2 text-[#3a4a3e] hover:text-[#5b7c6f] text-xs font-light tracking-wide transition-colors w-full"
            >
              <LogOut size={12} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 ml-56 min-h-screen">
        {children}
      </main>
    </div>
  )
}

function NavItem({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 text-[#7a8a7d] hover:text-[#e8e4da] hover:bg-[#111a14] text-xs font-light tracking-wide transition-colors group"
    >
      <span className="text-[#5b7c6f] group-hover:text-[#7b9c8f] transition-colors">
        {icon}
      </span>
      {label}
    </Link>
  )
}
