'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars } from '@react-three/drei';
import * as THREE from 'three';

function GlobeMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Canvas-based earth texture — dark ocean, muted land, no cyan
  const texture = (() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Deep ocean
    ctx.fillStyle = '#050e18';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Land masses — muted olive/charcoal
    ctx.fillStyle = '#1a2410';
    const lands = [
      [400, 380, 200, 260, 0.2],   // North America
      [490, 690, 140, 195, 0.25],  // South America
      [980, 330, 175, 145, -0.2],  // Europe
      [1040, 540, 175, 215, 0.0],  // Africa
      [1390, 380, 340, 240, 0.0],  // Asia
      [1590, 740, 115, 95,  0.0],  // Australia
    ];
    lands.forEach(([cx, cy, rx, ry, rot]) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot as number);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx as number, ry as number, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Polar ice caps
    ctx.fillStyle = '#1e2a1e';
    ctx.beginPath();
    ctx.ellipse(1024, 40, 900, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1024, 984, 800, 55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle noise
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 12;
      imgData.data[i]     = Math.max(0, Math.min(255, imgData.data[i]     + n));
      imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
      imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    return new THREE.CanvasTexture(canvas);
  })();

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.0008;
    if (glowRef.current) glowRef.current.rotation.y += 0.0008;
  });

  return (
    <group>
      {/* Core globe */}
      <Sphere ref={meshRef} args={[2, 64, 64]}>
        <meshStandardMaterial
          map={texture ?? undefined}
          roughness={0.85}
          metalness={0.05}
        />
      </Sphere>

      {/* Atmosphere — very subtle gold-tinged glow */}
      <Sphere ref={glowRef} args={[2.06, 64, 64]}>
        <meshBasicMaterial
          color="#D4AF37"
          transparent
          opacity={0.025}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Outer haze */}
      <Sphere args={[2.18, 32, 32]}>
        <meshBasicMaterial
          color="#0a1520"
          transparent
          opacity={0.18}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Gold site markers — equatorial belt */}
      {[
        [0.62, 0.55, 1.88],    // ~Giza
        [-1.2, -0.4, 1.55],   // ~Machu Picchu
        [1.5, 0.22, 1.32],    // ~Angkor
        [0.72, 0.48, 1.82],   // ~Petra
        [-0.06, 0.87, 1.75],  // ~Stonehenge
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z] as [number, number, number]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshBasicMaterial color="#D4AF37" transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}

export function GlobeScene() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 42 }}>
      <ambientLight intensity={0.15} />
      <pointLight position={[8, 6, 8]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-8, -4, -6]} intensity={0.2} color="#D4AF37" />

      <Suspense fallback={null}>
        <GlobeMesh />
        <Stars
          radius={120}
          depth={60}
          count={4000}
          factor={3}
          saturation={0}
          fade
          speed={0.3}
        />
      </Suspense>

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        minPolarAngle={Math.PI * 0.3}
        maxPolarAngle={Math.PI * 0.7}
      />
    </Canvas>
  );
}
