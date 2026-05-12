'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader } from 'lucide-react'

export default function NewProjectPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    client: '',
    description: '',
    platform: ['lithicearth'] as string[],
  })

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  const togglePlatform = (p: string) => {
    setForm(prev => ({
      ...prev,
      platform: prev.platform.includes(p) ? prev.platform.filter(x => x !== p) : [...prev.platform, p],
    }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Project name is required'); return }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error: err } = await supabase
      .from('portal_projects')
      .insert({
        name: form.name.trim(),
        client: form.client.trim() || null,
        description: form.description.trim() || null,
        platform: form.platform,
        user_id: user?.id,
        status: 'active',
      })
      .select('id')
      .single()

    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/portal/projects/${data.id}`)
  }

  return (
    <div className="p-4 md:p-8 min-min-h-screen max-w-2xl">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-px bg-[#5b7c6f]" />
          <span className="text-[#5b7c6f] text-[10px] tracking-[0.3em] font-light">PROJECTS</span>
        </div>
        <h1 className="text-3xl font-light text-[#e8e4da] tracking-wide">New Project</h1>
        <p className="text-[#3a4a3e] text-sm font-light mt-1">LithicEarth · Ceto Interactive shared data environment</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">PROJECT NAME *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. Llano Estacado SAR Survey 2025"
            className="w-full bg-[#0d1410] border border-[#1a2a1e] focus:border-[#3a5a3e] px-4 py-3 text-[#e8e4da] text-sm font-light placeholder-[#2a3a2e] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">CLIENT / ORGANIZATION</label>
          <input
            type="text"
            value={form.client}
            onChange={e => set('client', e.target.value)}
            placeholder="e.g. The Blue Duck Foundation"
            className="w-full bg-[#0d1410] border border-[#1a2a1e] focus:border-[#3a5a3e] px-4 py-3 text-[#e8e4da] text-sm font-light placeholder-[#2a3a2e] focus:outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">DESCRIPTION</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={4}
            placeholder="Area of interest, objectives, modalities to deploy..."
            className="w-full bg-[#0d1410] border border-[#1a2a1e] focus:border-[#3a5a3e] px-4 py-3 text-[#e8e4da] text-sm font-light placeholder-[#2a3a2e] focus:outline-none resize-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-[#3a4a3e] text-[9px] tracking-[0.25em] font-light mb-3">PLATFORM</label>
          <div className="flex gap-px">
            {[
              { id: 'lithicearth', label: 'LithicEarth' },
              { id: 'ceto', label: 'Ceto Interactive' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                className={`flex-1 py-3 text-xs font-light tracking-wide border transition-colors ${
                  form.platform.includes(p.id)
                    ? 'border-[#5b7c6f] text-[#5b7c6f] bg-[#5b7c6f]/5'
                    : 'border-[#1a2a1e] text-[#3a4a3e] bg-[#0d1410] hover:border-[#2a3d2e]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400/70 text-xs font-light">{error}</p>}

        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 border border-[#5b7c6f] text-[#5b7c6f] text-xs font-light tracking-widest hover:bg-[#5b7c6f]/10 transition-colors disabled:opacity-50"
          >
            {loading && <Loader size={12} className="animate-spin" />}
            {loading ? 'CREATING...' : 'CREATE PROJECT'}
          </button>
          <a href="/portal" className="text-[#3a4a3e] text-xs font-light hover:text-[#7a8a7d] transition-colors">Cancel</a>
        </div>
      </div>
    </div>
  )
}
