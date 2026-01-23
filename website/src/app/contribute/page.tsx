'use client'

import { AuthModal } from '@/components/AuthModal'
import { useState } from 'react'

export default function ContributePage() {
  const [open, setOpen] = useState(false)

  return (
    <main className="py-24 px-6 bg-[#5b7c6f] text-center">
      <h1 className="text-5xl font-light text-white mb-6">
        Start contributing today
      </h1>

      <button
        onClick={() => setOpen(true)}
        className="px-10 py-4 bg-white text-black"
      >
        Create Account
      </button>

      <AuthModal isOpen={open} onClose={() => setOpen(false)} />
    </main>
  )
}

