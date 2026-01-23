'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, Stars } from '@react-three/drei';
import * as THREE from 'three';

function InteractiveGlobe() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1, 100, 100]}>
      <MeshDistortMaterial
        color="#5b7c6f"
        attach="material"
        distort={0.2}
        speed={1}
        roughness={0.6}
        metalness={0.3}
      />
    </Sphere>
  );
}

export function GlobeScene() {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#8b9d8a" />
      <Suspense fallback={null}>
        <InteractiveGlobe />
        <Stars radius={100} depth={50} count={3000} factor={3} saturation={0} fade speed={0.5} />
      </Suspense>
      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.3} />
    </Canvas>
  );
}
