'use client';

import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, Stars } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Globe2, MapPin, Camera, Users, ArrowRight, Eye, Shield, Lightbulb, Info } from 'lucide-react';
import * as THREE from 'three';

function InteractiveGlobe() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.002;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1, 100, 100]}>
      <MeshDistortMaterial
        color="#0ea5e9"
        attach="material"
        distort={0.3}
        speed={1.5}
        roughness={0.4}
        metalness={0.8}
      />
    </Sphere>
  );
}

function GlobeScene() {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#818cf8" />
      <Suspense fallback={null}>
        <InteractiveGlobe />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      </Suspense>
      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe2 className="w-8 h-8 text-cyan-400" />
            <span className="text-xl font-bold text-white">LITHIC <span className="text-cyan-400">EARTH</span></span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#archive" className="text-slate-300 hover:text-white transition">Archive</a>
            <a href="#mission" className="text-slate-300 hover:text-white transition">Mission</a>
            <a href="#contribute" className="text-slate-300 hover:text-white transition">Contribute</a>
            <button className="px-6 py-2 bg-cyan-500 text-white rounded-full font-semibold hover:bg-cyan-400 transition text-sm">
              Sign In / Create Account
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center">
        <div className="absolute inset-0">
          <GlobeScene />
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/50 to-slate-950" />
        
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Live badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full mb-8 backdrop-blur-sm">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-cyan-300 text-sm font-medium">LIVE ARCHIVE</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 leading-tight">
              THE PLANET
              <br />
              <span className="text-cyan-400">ARCHIVED</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-300 mb-4 max-w-3xl mx-auto">
              A living, global record of Earth for the next century of decision-making
            </p>

            <p className="text-base md:text-lg text-slate-400 mb-12 max-w-2xl mx-auto">
              LithicEarth is building a continuously updated, human-scale map of the planet. 
              Every day, people capture a single photo that anchors a moment in time.
            </p>

            {/* Stats */}
            <div className="flex flex-wrap justify-center gap-8 mb-12 text-center">
              <div>
                <div className="text-3xl font-bold text-cyan-400">0</div>
                <div className="text-slate-400 text-sm">Photos</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-cyan-400">0</div>
                <div className="text-slate-400 text-sm">Countries</div>
              </div>
              <div>
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse mt-4" />
              </div>
              <div>
                <div className="text-cyan-300 text-sm font-medium">LIVE</div>
              </div>
            </div>

            {/* Primary CTA */}
            <motion.a
              href="#archive"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center gap-3 px-8 py-4 bg-cyan-500 text-white rounded-full font-semibold text-lg hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/20"
            >
              <MapPin className="w-5 h-5" />
              ENTER THE ARCHIVE
              <ArrowRight className="w-5 h-5" />
            </motion.a>

            {/* Scroll indicator */}
            <div className="mt-16 text-slate-500 text-sm">
              <div className="w-6 h-10 border-2 border-slate-500 rounded-full mx-auto mb-2 flex items-start justify-center p-2">
                <motion.div 
                  animate={{ y: [0, 12, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-1 h-2 bg-slate-500 rounded-full"
                />
              </div>
              Scroll or click to explore
            </div>
          </motion.div>
        </div>
      </section>

      {/* Archive Section - THE IMPORTANT PART */}
      <section id="archive" className="relative py-20 px-6 bg-slate-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Explore the Archive
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Click the globe to explore photos and sites from around the world
            </p>
          </div>

          {/* Interactive Globe Viewer - This is where users explore content */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="h-[600px] relative">
              <GlobeScene />
              
              {/* Controls overlay */}
              <div className="absolute bottom-6 right-6 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg p-4 text-sm text-slate-300">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4" />
                  <span className="font-semibold">Controls</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div>• Drag to rotate</div>
                  <div>• Scroll to zoom</div>
                  <div>• Click pins to view</div>
                </div>
              </div>
            </div>

            {/* Photo grid below globe */}
            <div className="p-6 border-t border-slate-800">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Contributions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-square bg-slate-800 rounded-lg flex items-center justify-center text-slate-600">
                    <Camera className="w-8 h-8" />
                  </div>
                ))}
              </div>
              <p className="text-center text-slate-500 text-sm mt-4">
                No photos yet. Be the first to contribute!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section id="mission" className="relative py-20 px-6 bg-slate-950">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6">
              <Globe2 className="w-4 h-4 text-blue-400" />
              <span className="text-blue-300 text-sm font-medium">MISSION</span>
            </div>
            
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
              A living, global record of Earth for the next century of decision-making
            </h2>
          </div>

          <div className="prose prose-invert max-w-none">
            <p className="text-lg text-slate-300 leading-relaxed mb-6">
              LithicEarth is building a continuously updated, human-scale map of the planet. 
              Every day, people capture a single photo that anchors a moment in time. Together, 
              those moments become an interactive, evolving view of Earth's health, beauty, and change.
            </p>

            <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-8 mb-8">
              <h3 className="text-2xl font-bold text-white mb-4">Why It Matters</h3>
              <p className="text-slate-300 leading-relaxed mb-4">
                Climate risk, supply chains, insurance, conservation, infrastructure—the next 
                generation of decisions requires a higher-fidelity view of the physical world.
              </p>
              <p className="text-slate-300 leading-relaxed">
                LithicEarth combines citizen imagery with enterprise-grade standards for provenance, 
                privacy, and observability—so organizations can act on what they see.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="relative py-20 px-6 bg-slate-900">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-white text-center mb-16">
            The principles behind the platform
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Eye,
                title: 'Radical Transparency',
                description: 'Every contribution visible. Every impact measurable. Real-time geospatial insight that leaders can rely on.'
              },
              {
                icon: Shield,
                title: 'Environmental Stewardship',
                description: 'Decision-grade data to protect ecosystems and biodiversity, underpinned by rigorous governance and security.'
              },
              {
                icon: Users,
                title: 'Global Community',
                description: 'Connecting people and institutions across borders to build a shared, living record of the planet.'
              },
              {
                icon: Lightbulb,
                title: 'Relentless Innovation',
                description: 'From edge devices to cloud pipelines, we continuously re-engineer how the world sees Earth.'
              }
            ].map((principle) => (
              <motion.div
                key={principle.title}
                whileHover={{ scale: 1.02, y: -5 }}
                className="bg-slate-950/50 border border-slate-800 hover:border-cyan-500/30 rounded-xl p-8 transition-all"
              >
                <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center mb-6">
                  <principle.icon className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{principle.title}</h3>
                <p className="text-slate-400 leading-relaxed">{principle.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contribute Section */}
      <section id="contribute" className="relative py-20 px-6 bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Ready to Start Contributing?
          </h2>
          <p className="text-xl text-blue-100 mb-10">
            Join thousands of people mapping our shared heritage, one photo at a time
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-4 bg-white text-blue-600 rounded-full font-semibold text-lg hover:bg-blue-50 transition">
              Create Account
            </button>
            <button className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-full font-semibold text-lg border border-white/20 hover:bg-white/20 transition">
              Learn How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-slate-950 border-t border-white/5">
        <div className="max-w-7xl mx-auto text-center text-slate-400">
          <p>© 2026 LithicEarth. Preserving heritage through technology.</p>
          <p className="text-sm mt-2">Powered by The Blue Duck LLC</p>
        </div>
      </footer>
    </main>
  );
}
