'use client';

import { useRef, useEffect, useState } from 'react';
import Script from 'next/script';

interface HeroProps {
  onSignInClick: () => void;
}

declare global {
  interface Window {
    Cesium: any;
  }
}

const SITES = [
  { name: 'Pyramids of Giza', lon: 31.1342, lat: 29.9792, height: 12000, heading: 35, pitch: -55 },
  { name: 'Machu Picchu', lon: -72.5450, lat: -13.1631, height: 7000, heading: 140, pitch: -48 },
  { name: 'Angkor Wat', lon: 103.8670, lat: 13.4125, height: 5500, heading: 85, pitch: -44 },
  { name: 'Petra', lon: 35.4444, lat: 30.3285, height: 4500, heading: 175, pitch: -52 },
  { name: 'Stonehenge', lon: -1.8262, lat: 51.1789, height: 2800, heading: 265, pitch: -38 },
  { name: 'Göbekli Tepe', lon: 38.9224, lat: 37.2232, height: 3200, heading: 210, pitch: -42 },
  { name: 'Nazca Lines', lon: -74.9285, lat: -14.7391, height: 8000, heading: 0, pitch: -70 },
  { name: 'Easter Island', lon: -109.3497, lat: -27.1127, height: 3800, heading: 220, pitch: -46 },
  { name: 'Chichen Itza', lon: -88.5686, lat: 20.6843, height: 4200, heading: 45, pitch: -50 },
  { name: 'Great Wall', lon: 116.5704, lat: 40.4319, height: 10000, heading: 310, pitch: -48 },
];

export function Hero({ onSignInClick }: HeroProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [currentSite, setCurrentSite] = useState(SITES[0].name);
  const [siteVisible, setSiteVisible] = useState(false);

  useEffect(() => {
    if (isLoaded && cesiumContainerRef.current && !viewerRef.current) {
      initializeCesium();
    }
  }, [isLoaded]);

  const initializeCesium = async () => {
    if (!window.Cesium || !cesiumContainerRef.current) return;

    const Cesium = window.Cesium;
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjMGRjY2MwNC1hZjEyLTQzNzktOTJiOS0zN2ZkZGMyMTdlMWEiLCJpZCI6Mzg0NTg4LCJpYXQiOjE3Njk2NDE5ODh9.UGCST0fw1fP3bbzxSwNMKxkerweXJKeVrnRhfPYHAD8';

    try {
      // Use Sentinel-2 (assetId 3954) — same as working archive page
      const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        terrainProvider: await Cesium.createWorldTerrainAsync({
          requestWaterMask: true,
          requestVertexNormals: true,
        }),
        imageryProvider: new Cesium.IonImageryProvider({ assetId: 3954 }),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        timeline: false,
        navigationHelpButton: false,
        animation: false,
        fullscreenButton: false,
        vrButton: false,
        infoBox: false,
        selectionIndicator: false,
        shadows: true,
        shouldAnimate: true,
        msaaSamples: 4,
      });

      viewerRef.current = viewer;

      // Lock all user interaction — pure cinematic
      const ctrl = viewer.scene.screenSpaceCameraController;
      ctrl.enableRotate = false;
      ctrl.enableZoom = false;
      ctrl.enableTilt = false;
      ctrl.enableLook = false;
      ctrl.enableTranslate = false;

      // Hyper-realistic rendering
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.maximumScreenSpaceError = 1.2;
      viewer.scene.globe.tileCacheSize = 800;

      viewer.scene.skyAtmosphere.hueShift = -0.04;
      viewer.scene.skyAtmosphere.saturationShift = 0.3;
      viewer.scene.skyAtmosphere.brightnessShift = 0.18;

      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.00015;
      viewer.scene.fog.minimumBrightness = 0.02;

      viewer.scene.highDynamicRange = true;
      viewer.scene.postProcessStages.fxaa.enabled = true;

      viewer.scene.postProcessStages.bloom.enabled = true;
      viewer.scene.postProcessStages.bloom.contrast = 120;
      viewer.scene.postProcessStages.bloom.brightness = -0.35;
      viewer.scene.postProcessStages.bloom.glowOnly = false;

      viewer.scene.globe.showWaterEffect = true;
      viewer.scene.light = new Cesium.SunLight();

      viewer.cesiumWidget.creditContainer.style.display = 'none';

      let currentIndex = 0;
      let rotateTimer: any = null;

      const journeyTo = async (idx: number) => {
        const site = SITES[idx];

        // Fade out site label
        setSiteVisible(false);

        await viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.height),
          orientation: {
            heading: Cesium.Math.toRadians(site.heading),
            pitch: Cesium.Math.toRadians(site.pitch),
            roll: 0,
          },
          duration: 9,
          easingFunction: Cesium.EasingFunction.SINUSOIDAL_IN_OUT,
        });

        // Show site name after arrival
        setCurrentSite(site.name);
        setSiteVisible(true);

        // Gentle orbit at site
        let angle = 0;
        rotateTimer = setInterval(() => {
          if (viewerRef.current) {
            viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, Cesium.Math.toRadians(0.02));
            angle += 0.02;
          }
        }, 16);

        // After dwell, move on
        setTimeout(() => {
          clearInterval(rotateTimer);
          currentIndex = (currentIndex + 1) % SITES.length;
          journeyTo(currentIndex);
        }, 16000);
      };

      journeyTo(0);

      setTimeout(() => setShowLoading(false), 1400);
    } catch (err) {
      console.error('Cesium init error:', err);
      setShowLoading(false);
    }
  };

  return (
    <>
      <Script
        src="https://cesium.com/downloads/cesiumjs/releases/1.112/Build/Cesium/Cesium.js"
        onLoad={() => setIsLoaded(true)}
      />
      <link
        rel="stylesheet"
        href="https://cesium.com/downloads/cesiumjs/releases/1.112/Build/Cesium/Widgets/widgets.css"
      />

      <div className="relative h-screen flex items-center justify-center bg-black overflow-hidden">

        {/* Loading */}
        {showLoading && (
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
            <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/50 animate-pulse mb-5" />
            <p className="text-[10px] text-[#D4AF37]/40 tracking-[0.5em] uppercase font-light">
              Initializing
            </p>
          </div>
        )}

        {/* Cesium Globe */}
        <div ref={cesiumContainerRef} className="absolute inset-0 bg-black" />

        {/* Vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)',
          }}
        />

        {/* Bottom gradient for text legibility */}
        <div
          className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}
        />

        {/* Site name — bottom left */}
        <div
          className="absolute bottom-20 left-10 z-20 pointer-events-none transition-all duration-1000"
          style={{ opacity: siteVisible ? 1 : 0, transform: siteVisible ? 'translateY(0)' : 'translateY(6px)' }}
        >
          <p className="text-[10px] text-[#D4AF37]/50 tracking-[0.4em] uppercase font-light mb-1">
            Now viewing
          </p>
          <p className="text-sm text-white/70 font-light tracking-[0.12em]">
            {currentSite}
          </p>
        </div>

        {/* Scroll hint — bottom center */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none opacity-0 animate-[fadeIn_2s_ease-out_6s_forwards]">
          <p className="text-[9px] text-white/25 tracking-[0.35em] uppercase font-light">
            Scroll to explore
          </p>
          <div className="w-px h-10 bg-gradient-to-b from-[#D4AF37]/25 to-transparent" />
        </div>

        <style jsx global>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        `}</style>
      </div>
    </>
  );
}
