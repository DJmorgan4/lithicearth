'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Float, OrbitControls, Stars } from '@react-three/drei'
import { useRef, useState } from 'react'
import * as THREE from 'three'

const SITES = [
  {
    id: 'kailasa',
    name: 'Kailasa Temple',
    location: 'Ellora, India',
    era: '8th century CE',
    summary: 'A monolithic temple carved downward from living basalt.',
    accent: '#d4af37',
  },
  {
    id: 'machu',
    name: 'Machu Picchu',
    location: 'Andes, Peru',
    era: '15th century CE',
    summary: 'A city of stone terraces suspended between mountain and cloud.',
    accent: '#7fb069',
  },
  {
    id: 'giza',
    name: 'Giza Plateau',
    location: 'Egypt',
    era: 'Old Kingdom',
    summary: 'A sacred geometric landscape of pyramids, causeways, and hidden chambers.',
    accent: '#c79a45',
  },
]

function KailasaTemple({ active }: { active: boolean }) {
  const group = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!group.current) return
    group.current.rotation.y += delta * 0.05
  })

  return (
    <group ref={group} scale={active ? 1.15 : 1}>
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[3.8, 0.35, 3.8]} />
        <meshStandardMaterial color="#17130d" roughness={1} />
      </mesh>

      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[2.8, 0.5, 2.8]} />
        <meshStandardMaterial color="#3a2d1d" roughness={0.95} />
      </mesh>

      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.55, 0.9, 1.55]} />
        <meshStandardMaterial color="#6b5430" roughness={0.9} />
      </mesh>

      <mesh position={[0, 1.05, 0]}>
        <coneGeometry args={[0.9, 1.25, 4]} />
        <meshStandardMaterial color="#b99235" roughness={0.85} />
      </mesh>

      {[-1.25, -0.42, 0.42, 1.25].map((x) =>
        [-1.25, 1.25].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.15, z]}>
            <cylinderGeometry args={[0.08, 0.08, 1.1, 12]} />
            <meshStandardMaterial color="#4b3821" roughness={0.9} />
          </mesh>
        ))
      )}

      <mesh position={[0, -0.32, -1.42]}>
        <boxGeometry args={[0.9, 0.42, 0.08]} />
        <meshStandardMaterial color="#060504" roughness={1} />
      </mesh>
    </group>
  )
}

function Scene({ selectedId }: { selectedId: string }) {
  const selectedIndex = SITES.findIndex(s => s.id === selectedId)

  return (
    <>
      <ambientLight intensity={0.18} />
      <directionalLight position={[5, 8, 4]} intensity={2.2} color="#fff3d0" />
      <pointLight position={[-4, 2, -2]} intensity={1.2} color="#d4af37" />
      <fog attach="fog" args={['#020403', 6, 16]} />
      <Stars radius={100} depth={60} count={5000} factor={4} fade speed={0.2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.75, 0]}>
        <circleGeometry args={[18, 128]} />
        <meshStandardMaterial color="#030604" roughness={1} />
      </mesh>

      <Float speed={0.6} rotationIntensity={0.08} floatIntensity={0.15}>
        <KailasaTemple active={selectedId === 'kailasa'} />
      </Float>

      <mesh position={[-3.6, -0.55, -1.7]}>
        <boxGeometry args={[1.9, 0.25, 1.4]} />
        <meshStandardMaterial color="#1b2115" roughness={1} />
      </mesh>

      <mesh position={[3.7, -0.48, -1.55]}>
        <coneGeometry args={[1.1, 1.8, 4]} />
        <meshStandardMaterial color="#9b7430" roughness={0.95} />
      </mesh>

      <OrbitControls
        target={[0, 0.2, 0]}
        enablePan={false}
        minDistance={3.5}
        maxDistance={8}
        maxPolarAngle={Math.PI * 0.48}
      />

      <Environment preset="night" />
    </>
  )
}

export default function WorldExplorer() {
  const [selectedId, setSelectedId] = useState('kailasa')
  const selected = SITES.find(s => s.id === selectedId)!

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#020403] text-[#f4efe3]">
      <Canvas camera={{ position: [0, 2.2, 6.2], fov: 42 }}>
        <Scene selectedId={selectedId} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.25)_50%,rgba(0,0,0,0.8)_100%)]" />

      <section className="absolute left-8 top-8 max-w-lg border border-[#d4af37]/25 bg-black/55 p-7 backdrop-blur-xl">
        <p className="mb-3 text-xs uppercase tracking-[0.45em] text-[#d4af37]/70">
          LithicEarth Expedition
        </p>
        <h1 className="text-5xl font-extralight tracking-wide">{selected.name}</h1>
        <p className="mt-3 text-sm text-white/45">{selected.location} · {selected.era}</p>
        <p className="mt-6 text-base leading-8 text-white/70">{selected.summary}</p>

        <div className="mt-7 flex gap-3">
          <button className="border border-[#d4af37]/60 bg-[#d4af37]/10 px-5 py-3 text-xs uppercase tracking-[0.25em] text-[#d4af37]">
            Enter Site
          </button>
          <button className="border border-white/15 bg-white/5 px-5 py-3 text-xs uppercase tracking-[0.25em] text-white/45">
            Flyover
          </button>
        </div>
      </section>

      <section className="absolute bottom-8 left-8 right-8 flex gap-4 overflow-x-auto">
        {SITES.map(site => (
          <button
            key={site.id}
            onClick={() => setSelectedId(site.id)}
            className={`min-w-64 border px-5 py-4 text-left backdrop-blur-xl transition ${
              selectedId === site.id
                ? 'border-[#d4af37]/70 bg-[#d4af37]/10'
                : 'border-white/10 bg-black/45 hover:border-white/25'
            }`}
          >
            <p className="text-base text-white">{site.name}</p>
            <p className="mt-1 text-xs text-white/40">{site.location}</p>
          </button>
        ))}
      </section>
    </main>
  )
}
