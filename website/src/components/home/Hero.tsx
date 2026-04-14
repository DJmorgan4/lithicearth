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
  { name: 'Pyramids of Giza', region: 'Egypt', lon: 31.1342, lat: 29.9792, height: 1800, heading: 35, pitch: -28 },
  { name: 'Machu Picchu', region: 'Peru', lon: -72.5450, lat: -13.1631, height: 1400, heading: 140, pitch: -32 },
  { name: 'Angkor Wat', region: 'Cambodia', lon: 103.8670, lat: 13.4125, height: 1100, heading: 5, pitch: -30 },
  { name: 'Petra', region: 'Jordan', lon: 35.4444, lat: 30.3285, height: 1200, heading: 175, pitch: -34 },
  { name: 'Stonehenge', region: 'England', lon: -1.8262, lat: 51.1789, height: 600, heading: 265, pitch: -22 },
  { name: 'Göbekli Tepe', region: 'Turkey', lon: 38.9224, lat: 37.2232, height: 900, heading: 210, pitch: -26 },
  { name: 'Nazca Lines', region: 'Peru', lon: -74.9285, lat: -14.7391, height: 2200, heading: 0, pitch: -55 },
  { name: 'Chichen Itza', region: 'Mexico', lon: -88.5686, lat: 20.6843, height: 900, heading: 45, pitch: -28 },
];

export function Hero({ onSignInClick }: HeroProps) {
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [currentSite, setCurrentSite] = useState(SITES[0]);
  const [siteVisible, setSiteVisible] = useState(false);

  useEffect(() => {
    if (isLoaded && cesiumContainerRef.current && !viewerRef.current) {
      initializeCesium();
    }
  }, [isLoaded]);

  const initializeCesium = async () => {
    if (!window.Cesium || !cesiumContainerRef.current) return;
    const Cesium = window.Cesium;
    Cesium.Ion.defaultAccessToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjMGRjY2MwNC1hZjEyLTQzNzktOTJiOS0zN2ZkZGMyMTdlMWEiLCJpZCI6Mzg0NTg4LCJpYXQiOjE3Njk2NDE5ODh9.UGCST0fw1fP3bbzxSwNMKxkerweXJKeVrnRhfPYHAD8';

    try {
      const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        // Google Maps 2D Satellite — highest quality, already in your Ion account
        imageryProvider: new Cesium.IonImageryProvider({ assetId: 3830182 }),
        terrainProvider: await Cesium.createWorldTerrainAsync({ requestVertexNormals: true }),
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
        shadows: false,
        shouldAnimate: false,
        msaaSamples: 4,
        skyBox: false,        // No star field flicker during transitions
        skyAtmosphere: false, // No blue atmospheric haze — this was the main culprit
      });

      viewerRef.current = viewer;

      // Lock all camera interaction — pure cinematic
      const ctrl = viewer.scene.screenSpaceCameraController;
      ctrl.enableRotate = false;
      ctrl.enableZoom = false;
      ctrl.enableTilt = false;
      ctrl.enableLook = false;
      ctrl.enableTranslate = false;

      // Stripped rendering — let the satellite imagery speak
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.showGroundAtmosphere = false; // Kills the blue tint at low altitude
      viewer.scene.globe.maximumScreenSpaceError = 1.0;
      viewer.scene.globe.tileCacheSize = 1000;
      viewer.scene.globe.preloadAncestors = true;
      viewer.scene.fog.enabled = false;
      viewer.scene.highDynamicRange = false;
      viewer.scene.postProcessStages.fxaa.enabled = true;
      viewer.scene.postProcessStages.bloom.enabled = false;
      viewer.scene.backgroundColor = Cesium.Color.BLACK;

      // Pin to midday — terrain always lit, no dark side of earth
      viewer.clock.shouldAnimate = false;
      viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2024-06-21T10:00:00Z');
      viewer.cesiumWidget.creditContainer.style.display = 'none';

      let currentIndex = 0;
      let rotateTimer: ReturnType<typeof setInterval> | null = null;
      let dwellTimer: ReturnType<typeof setTimeout> | null = null;
      let isDestroyed = false;

      const waitForTiles = (): Promise<void> =>
        new Promise((resolve) => {
          const check = () => {
            if (viewer.scene.globe.tilesLoaded) resolve();
            else requestAnimationFrame(check);
          };
          check();
        });

      const journeyTo = async (idx: number) => {
        if (isDestroyed) return;
        const site = SITES[idx];
        setSiteVisible(false);
        if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }

        // Teleport high above site first — prevents camera sweeping through space
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.height * 10),
          orientation: {
            heading: Cesium.Math.toRadians(site.heading),
            pitch: Cesium.Math.toRadians(-60),
            roll: 0,
          },
        });

        // Brief pause so globe starts pre-fetching tiles at this location
        await new Promise<void>((r) => setTimeout(r, 300));
        if (isDestroyed) return;

        // Cinematic dive in
        await new Promise<void>((resolve) => {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(site.lon, site.lat, site.height),
            orientation: {
              heading: Cesium.Math.toRadians(site.heading),
              pitch: Cesium.Math.toRadians(site.pitch),
              roll: 0,
            },
            duration: 7,
            easingFunction: Cesium.EasingFunction.SINUSOIDAL_IN_OUT,
            complete: resolve,
            cancel: resolve,
          });
        });

        if (isDestroyed) return;

        // Wait for full tile resolution at destination (max 4s)
        await Promise.race([waitForTiles(), new Promise<void>((r) => setTimeout(r, 4000))]);
        if (isDestroyed) return;

        setCurrentSite(site);
        setSiteVisible(true);
        setShowLoading(false);

        // Slow cinematic orbit
        rotateTimer = setInterval(() => {
          if (!isDestroyed && viewerRef.current) {
            viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, Cesium.Math.toRadians(0.010));
          }
        }, 16);

        // Move to next site after 14s
        dwellTimer = setTimeout(() => {
          if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
          currentIndex = (currentIndex + 1) % SITES.length;
          journeyTo(currentIndex);
        }, 14000);
      };

      setTimeout(() => journeyTo(0), 500);

      return () => {
        isDestroyed = true;
        if (rotateTimer) clearInterval(rotateTimer);
        if (dwellTimer) clearTimeout(dwellTimer);
      };
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

        {showLoading && (
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
            <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/50 animate-pulse mb-5" />
            <p className="text-[10px] text-[#D4AF37]/40 tracking-[0.5em] uppercase font-light">
              Preparing sites
            </p>
          </div>
        )}

        <div ref={cesiumContainerRef} className="absolute inset-0 bg-black" />

        {/* Subtle vignette */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)' }}
        />

        {/* Bottom gradient for text legibility */}
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none z-10"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
        />

        {/* Site label — bottom left */}
        <div
          className="absolute bottom-20 left-10 z-20 pointer-events-none transition-all duration-1000"
          style={{ opacity: siteVisible ? 1 : 0, transform: siteVisible ? 'translateY(0)' : 'translateY(8px)' }}
        >
          <p className="text-[9px] text-[#D4AF37]/60 tracking-[0.45em] uppercase font-light mb-1">Now Viewing</p>
          <p className="text-base text-white/85 font-light tracking-[0.08em]">{currentSite.name}</p>
          <p className="text-[10px] text-white/35 tracking-[0.25em] uppercase font-light mt-0.5">{currentSite.region}</p>
        </div>

        {/* Progress dots — bottom right */}
        <div
          className="absolute bottom-[84px] right-10 z-20 pointer-events-none flex gap-1.5 transition-opacity duration-700"
          style={{ opacity: siteVisible ? 1 : 0 }}
        >
          {SITES.map((s) => (
            <div
              key={s.name}
              className="transition-all duration-500"
              style={{
                width: s.name === currentSite.name ? '16px' : '4px',
                height: '2px',
                background: s.name === currentSite.name ? '#D4AF37' : 'rgba(255,255,255,0.2)',
                borderRadius: '1px',
              }}
            />
          ))}
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none opacity-0 animate-[fadeIn_2s_ease-out_10s_forwards]">
          <p className="text-[9px] text-white/25 tracking-[0.35em] uppercase font-light">Scroll to explore</p>
          <div className="w-px h-8 bg-gradient-to-b from-[#D4AF37]/30 to-transparent" />
        </div>

        <style jsx global>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .cesium-viewer-toolbar, .cesium-viewer-animationContainer,
          .cesium-viewer-timelineContainer, .cesium-viewer-bottom { display: none !important; }
        `}</style>
      </div>
    </>
  );
}
