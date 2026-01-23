'use client'

import { GlobeScene } from '@/components/GlobeScene'
import { MapPin, Camera } from 'lucide-react'

export default function ArchivePage() {
  return (
    <main className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-5xl font-light mb-8">Explore by Place</h1>

        <div className="bg-white border border-[#d4cfc0]">
          <div className="h-[600px] relative">
            <GlobeScene />
            <div className="absolute bottom-6 left-6 bg-white p-4">
              <MapPin className="w-4 h-4" />
              Navigation
            </div>
          </div>

          <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="aspect-square bg-[#e8e6dd] flex items-center justify-center">
                <Camera />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

