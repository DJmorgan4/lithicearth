'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';

interface MarkerData {
  position: [number, number, number];
  title: string;
  count: number;
}

function EarthGlobe({ viewMode, selectedYear }: { viewMode: string; selectedYear: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [markers] = useState<MarkerData[]>([
    // Sample markers - will be populated from database
    { position: [0, 0, 2], title: "North America", count: 0 },
    { position: [1, 0, 1.5], title: "Europe", count: 0 },
    { position: [-1, 0, 1.5], title: "Asia", count: 0 },
  ]);

  useFrame((state) => {
    if (meshRef.current && viewMode === 'realtime') {
      meshRef.current.rotation.y += 0.001;
    }
  });

  // Create Earth texture with heightmap illusion
  const earthTexture = new THREE.CanvasTexture(createEarthTexture());

  return (
    <group>
      {/* Main Earth sphere */}
      <Sphere ref={meshRef} args={[2, 64, 64]}>
        <meshStandardMaterial
          map={earthTexture}
          roughness={0.7}
          metalness={0.1}
          bumpScale={0.05}
        />
      </Sphere>

      {/* Atmosphere glow */}
      <Sphere args={[2.05, 64, 64]}>
        <meshBasicMaterial
          color="#5b7c6f"
          transparent
          opacity={0.15}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Location markers */}
      {markers.map((marker, i) => (
        <group key={i} position={marker.position}>
          <mesh>
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshBasicMaterial color="#8b9d8a" />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.1]} />
            <meshBasicMaterial color="#8b9d8a" opacity={0.6} transparent />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function createEarthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Create gradient for ocean
  const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGradient.addColorStop(0, '#0a3d62');
  oceanGradient.addColorStop(0.5, '#0c5f8a');
  oceanGradient.addColorStop(1, '#0a3d62');
  
  ctx.fillStyle = oceanGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add land masses (simplified)
  ctx.fillStyle = '#2d5016';
  
  // North America
  ctx.beginPath();
  ctx.ellipse(400, 400, 200, 250, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // South America
  ctx.beginPath();
  ctx.ellipse(500, 700, 150, 200, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Europe
  ctx.beginPath();
  ctx.ellipse(1000, 350, 180, 150, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Africa
  ctx.beginPath();
  ctx.ellipse(1050, 550, 180, 220, 0, 0, Math.PI * 2);
  ctx.fill();

  // Asia
  ctx.beginPath();
  ctx.ellipse(1400, 400, 350, 250, 0, 0, Math.PI * 2);
  ctx.fill();

  // Australia
  ctx.beginPath();
  ctx.ellipse(1600, 750, 120, 100, 0, 0, Math.PI * 2);
  ctx.fill();

  // Add subtle noise for texture
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    imageData.data[i] += noise;
    imageData.data[i + 1] += noise;
    imageData.data[i + 2] += noise;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

export default function InteractiveGlobe({ 
  viewMode, 
  selectedYear 
}: { 
  viewMode: string; 
  selectedYear: number;
}) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#5b7c6f" />
      
      <EarthGlobe viewMode={viewMode} selectedYear={selectedYear} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      <OrbitControls
        enableZoom={true}
        enablePan={false}
        minDistance={3}
        maxDistance={10}
        autoRotate={viewMode === 'realtime'}
        autoRotateSpeed={0.5}
      />
    </Canvas>
  );
}
