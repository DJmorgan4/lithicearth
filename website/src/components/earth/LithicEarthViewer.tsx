'use client'

import { useEffect, useState } from 'react'
import { Viewer, Entity, CameraFlyTo } from 'resium'
import { Cartesian3, Color, Ion, Terrain, buildModuleUrl } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

buildModuleUrl.setBaseUrl('/cesium/')

const SITES = [
  { id: 'giza', name: 'Pyramids of Giza', lat: 29.9792, lng: 31.1342, height: 1800 },
  { id: 'machu', name: 'Machu Picchu', lat: -13.1631, lng: -72.545, height: 2200 },
  { id: 'kailasa', name: 'Kailasa Temple', lat: 20.0238, lng: 75.1791, height: 1600 },
  { id: 'petra', name: 'Petra', lat: 30.3285, lng: 35.4444, height: 1600 },
  { id: 'gobekli', name: 'Göbekli Tepe', lat: 37.2232, lng: 38.9224, height: 1600 },
]

export default function LithicEarthViewer() {
  const [selected, setSelected] = useState(SITES[0])

  useEffect(() => {
    Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN || ''
  }, [])

  return (
    <main className="relative h-screen w-full bg-black">
      <Viewer
        full
        terrain={Terrain.fromWorldTerrain()}
        timeline={false}
        animation={false}
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        infoBox={false}
        selectionIndicator={false}
      >
        <CameraFlyTo
          destination={Cartesian3.fromDegrees(selected.lng, selected.lat, selected.height)}
          duration={2.6}
        />

        {SITES.map((site) => (
          <Entity
            key={site.id}
            name={site.name}
            position={Cartesian3.fromDegrees(site.lng, site.lat, 80)}
            point={{
              pixelSize: selected.id === site.id ? 18 : 11,
              color: Color.fromCssColorString('#D4AF37'),
              outlineColor: Color.BLACK,
              outlineWidth: 2,
            }}
            onClick={() => setSelected(site)}
          />
        ))}
      </Viewer>

      <section className="absolute left-6 top-6 z-10 max-w-md border border-[#D4AF37]/30 bg-black/70 p-6 text-white backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.4em] text-[#D4AF37]/70">
          LithicEarth
        </p>
        <h1 className="mt-3 text-4xl font-light">{selected.name}</h1>
        <p className="mt-4 text-sm leading-7 text-white/65">
          Real geospatial Earth viewer foundation for flyovers, site reconstruction,
          photogrammetry uploads, AI narration, and walk-through mode.
        </p>
      </section>

      <section className="absolute bottom-6 left-6 right-6 z-10 flex gap-3 overflow-x-auto">
        {SITES.map((site) => (
          <button
            key={site.id}
            onClick={() => setSelected(site)}
            className={`min-w-56 border px-4 py-3 text-left text-white backdrop-blur-xl ${
              selected.id === site.id
                ? 'border-[#D4AF37]/70 bg-[#D4AF37]/15'
                : 'border-white/10 bg-black/60'
            }`}
          >
            <p className="text-sm">{site.name}</p>
          </button>
        ))}
      </section>
    </main>
  )
}
