'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';

declare global {
  interface Window {
    Cesium: any;
  }
}

interface ArchiveImage {
  id: string;
  lat: number;
  lon: number;
  image_url: string;
  thumbnail_url?: string;
  uploaded_at: string;
  uploader_name: string;
  title: string;
  description: string;
  category: 'archaeological' | 'environmental' | 'geological' | 'cultural' | 'wildlife' | 'urban';
  location_name: string;
  elevation?: number;
  tags?: string[];
}

export default function ArchivePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinLocation, setPinLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [archiveImages, setArchiveImages] = useState<ArchiveImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<ArchiveImage | null>(null);
  const [cameraHeight, setCameraHeight] = useState(20000000);
  const [hoveredSite, setHoveredSite] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalImages: 0,
    todayUploads: 0,
    activeContributors: 0,
    coords: '--',
    localTime: '--',
    elevation: '--',
  });
  const [siteStats, setSiteStats] = useState<any[]>([]);

  useEffect(() => {
    loadArchiveImages();
    loadStats();

    const channel = supabase
      .channel('archive_images_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'archive_images' },
        () => {
          loadArchiveImages();
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (isLoaded && cesiumContainerRef.current && !viewerRef.current) {
      initializeCesium();
    }
  }, [isLoaded]);

  useEffect(() => {
    if (viewerRef.current && archiveImages.length > 0) {
      addImageMarkers();
    }
  }, [archiveImages, cameraHeight]);

  const loadArchiveImages = async () => {
    const { data, error } = await supabase
      .from('archive_images')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (data && !error) {
      setArchiveImages(data);
      aggregateSiteStats(data);
    }
  };

  const loadStats = async () => {
    const { count: totalCount } = await supabase
      .from('archive_images')
      .select('*', { count: 'exact', head: true });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from('archive_images')
      .select('*', { count: 'exact', head: true })
      .gte('uploaded_at', today.toISOString());

    const { data: contributors } = await supabase
      .from('archive_images')
      .select('uploader_name');

    const uniqueContributors = new Set(
      contributors?.map((c: { uploader_name: string }) => c.uploader_name) || []
    ).size;

    setStats((prev) => ({
      ...prev,
      totalImages: totalCount || 0,
      todayUploads: todayCount || 0,
      activeContributors: uniqueContributors,
    }));
  };

  const aggregateSiteStats = (images: ArchiveImage[]) => {
    const siteMap = new Map<
      string,
      { name: string; lat: number; lon: number; images: number; category: string; lastUpload: string }
    >();

    images.forEach((img) => {
      const key = img.location_name || `${img.lat.toFixed(2)},${img.lon.toFixed(2)}`;

      if (siteMap.has(key)) {
        const site = siteMap.get(key)!;
        site.images++;
        if (new Date(img.uploaded_at) > new Date(site.lastUpload)) {
          site.lastUpload = img.uploaded_at;
        }
      } else {
        siteMap.set(key, {
          name: img.location_name || 'Unknown Location',
          lat: img.lat,
          lon: img.lon,
          images: 1,
          category: img.category,
          lastUpload: img.uploaded_at,
        });
      }
    });

    setSiteStats(Array.from(siteMap.values()));
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const createGeometricMarker = (category: string, imageCount: number) => {
    const canvas = document.createElement('canvas');
    const size = 80;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const colors: { [key: string]: string } = {
      archaeological: '#D4AF37',
      environmental: '#6B9B7F',
      geological: '#B87333',
      cultural: '#8B7355',
      wildlife: '#7A9D54',
      urban: '#A0826D',
    };

    const color = colors[category] || '#D4AF37';
    const center = size / 2;

    const glowIntensity = Math.min(imageCount / 15, 1);
    const glowSize = 28 + glowIntensity * 12;

    const gradient = ctx.createRadialGradient(center, center, 0, center, center, glowSize);
    gradient.addColorStop(
      0,
      `${color}${Math.floor(glowIntensity * 60).toString(16).padStart(2, '0')}`
    );
    gradient.addColorStop(
      0.5,
      `${color}${Math.floor(glowIntensity * 30).toString(16).padStart(2, '0')}`
    );
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = center + Math.cos(angle) * 16;
      const y = center + Math.sin(angle) * 16;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(center, center, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `${color}60`;
    ctx.lineWidth = 1.5;
    [0, 90, 180, 270].forEach((deg) => {
      const angle = (deg * Math.PI) / 180;
      const dist = 28;
      const x = center + Math.cos(angle) * dist;
      const y = center + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.stroke();
    });

    if (imageCount > 1) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(center + 20, center - 20, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(imageCount.toString(), center + 20, center - 20);
    }

    return canvas.toDataURL();
  };

  const initializeCesium = async () => {
    if (!window.Cesium || !cesiumContainerRef.current) return;

    const Cesium = window.Cesium;
    Cesium.Ion.defaultAccessToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjMGRjY2MwNC1hZjEyLTQzNzktOTJiOS0zN2ZkZGMyMTdlMWEiLCJpZCI6Mzg0NTg4LCJpYXQiOjE3Njk2NDE5ODh9.UGCST0fw1fP3bbzxSwNMKxkerweXJKeVrnRhfPYHAD8';

    try {
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
        infoBox: true,
        selectionIndicator: true,
        shadows: true,
        shouldAnimate: true,
        msaaSamples: 4,
        requestRenderMode: false,
      });

      viewerRef.current = viewer;

      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.nightFadeOutDistance = 6000000;
      viewer.scene.globe.nightFadeInDistance = 50000000;
      viewer.scene.skyAtmosphere.hueShift = -0.05;
      viewer.scene.skyAtmosphere.saturationShift = 0.25;
      viewer.scene.skyAtmosphere.brightnessShift = 0.2;
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.0002;
      viewer.scene.fog.screenSpaceErrorFactor = 2.0;
      viewer.scene.fog.minimumBrightness = 0.03;
      viewer.scene.globe.maximumScreenSpaceError = 1.0;
      viewer.scene.globe.tileCacheSize = 1000;
      viewer.scene.light = new Cesium.SunLight();
      viewer.shadows = true;
      viewer.shadowMap.maximumDistance = 10000;
      viewer.shadowMap.size = 2048;
      viewer.shadowMap.softShadows = true;
      viewer.shadowMap.darkness = 0.6;
      viewer.scene.highDynamicRange = true;
      viewer.scene.globe.showWaterEffect = true;
      viewer.scene.postProcessStages.fxaa.enabled = true;
      viewer.scene.postProcessStages.bloom.enabled = true;
      viewer.scene.postProcessStages.bloom.contrast = 128;
      viewer.scene.postProcessStages.bloom.brightness = -0.3;
      viewer.scene.postProcessStages.bloom.glowOnly = false;
      viewer.scene.postProcessStages.bloom.delta = 1.0;
      viewer.scene.postProcessStages.bloom.sigma = 2.0;
      viewer.scene.postProcessStages.ambientOcclusion.enabled = true;
      viewer.scene.postProcessStages.ambientOcclusion.intensity = 3.0;
      viewer.scene.postProcessStages.ambientOcclusion.bias = 0.1;
      viewer.scene.postProcessStages.ambientOcclusion.lengthCap = 0.03;
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 40000000;
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.95;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.95;
      viewer.scene.screenSpaceCameraController.inertiaZoom = 0.9;
      viewer.scene.screenSpaceCameraController.zoomEventTypes = [
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH,
      ];

      viewer.cesiumWidget.creditContainer.style.display = 'none';

      // Right-click to pin new site
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: any) => {
        const pickedPosition = viewer.scene.pickPosition(click.position);
        if (Cesium.defined(pickedPosition)) {
          const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          setPinLocation({ lat, lon });
          setShowPinModal(true);
        }
      }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

      // Camera stat tracking
      viewer.camera.moveEnd.addEventListener(() => {
        const cameraPosition = viewer.camera.positionCartographic;
        const height = cameraPosition.height;
        const lat = Cesium.Math.toDegrees(cameraPosition.latitude).toFixed(4);
        const lon = Cesium.Math.toDegrees(cameraPosition.longitude).toFixed(4);
        const elevation = (height / 1000).toFixed(1);

        setCameraHeight(height);

        setStats((prev) => ({
          ...prev,
          coords: `${lat}°, ${lon}°`,
          elevation: `${elevation}km`,
          localTime: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        }));
      });

      // Initial view over Giza
      await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(31.1342, 29.9792, 8000000),
        orientation: {
          heading: Cesium.Math.toRadians(45),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 0,
      });

      // Gentle auto-rotate
      let rotating = true;

      viewer.clock.onTick.addEventListener(() => {
        if (rotating && viewer.camera.positionCartographic.height > 3000000) {
          viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, Cesium.Math.toRadians(0.008));
        }
      });

      viewer.camera.moveStart.addEventListener(() => {
        rotating = false;
      });

      viewer.camera.moveEnd.addEventListener(() => {
        setTimeout(() => {
          rotating = true;
        }, 5000);
      });

      setTimeout(() => setShowLoading(false), 1800);
    } catch (error) {
      console.error('Error initializing Cesium:', error);
      setShowLoading(false);
    }
  };

  const addImageMarkers = () => {
    if (!viewerRef.current || !window.Cesium) return;

    const viewer = viewerRef.current;
    const Cesium = window.Cesium;

    viewer.entities.removeAll();

    if (cameraHeight >= 8000000) return;

    const locationGroups = new Map<string, ArchiveImage[]>();
    archiveImages.forEach((img) => {
      const key = `${img.lat.toFixed(3)},${img.lon.toFixed(3)}`;
      if (!locationGroups.has(key)) locationGroups.set(key, []);
      locationGroups.get(key)!.push(img);
    });

    locationGroups.forEach((images) => {
      const firstImage = images[0];
      const markerImage = createGeometricMarker(firstImage.category, images.length);

      viewer.entities.add({
        id: `site_${firstImage.lat.toFixed(3)}_${firstImage.lon.toFixed(3)}`,
        position: Cesium.Cartesian3.fromDegrees(firstImage.lon, firstImage.lat, 0),
        name: firstImage.location_name,
        description: `
          <div style="font-family: 'Inter', system-ui, sans-serif; padding: 24px; max-width: 450px; background: #0a0a0a; color: #e8e4d9;">
            <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #2a2a2a;">
              <h3 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 400; color: #D4AF37; letter-spacing: 0.03em;">${firstImage.location_name}</h3>
              <div style="font-size: 11px; color: #999; letter-spacing: 0.08em; text-transform: uppercase; display: flex; gap: 12px; align-items: center;">
                <span>${firstImage.category}</span>
                <span style="color: #444;">•</span>
                <span>${images.length} observation${images.length > 1 ? 's' : ''}</span>
                <span style="color: #444;">•</span>
                <span>${getTimeAgo(firstImage.uploaded_at)}</span>
              </div>
            </div>
            ${images
              .slice(0, 4)
              .map(
                (img) => `
              <div style="margin-bottom: 20px; border: 1px solid #1a1a1a; background: #050505;">
                <img src="${img.image_url}" style="width: 100%; height: 220px; object-fit: cover; display: block;" />
                <div style="padding: 14px;">
                  <div style="font-size: 14px; color: #e8e4d9; margin-bottom: 6px; font-weight: 400;">${img.title}</div>
                  <div style="font-size: 11px; color: #777; margin-bottom: 8px; letter-spacing: 0.02em;">
                    ${img.uploader_name} • ${new Date(img.uploaded_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                  ${img.description ? `<div style="font-size: 12px; color: #aaa; line-height: 1.6; margin-top: 8px;">${img.description}</div>` : ''}
                </div>
              </div>
            `
              )
              .join('')}
            ${
              images.length > 4
                ? `<div style="text-align: center; padding: 16px; background: #0f0f0f; border: 1px solid #1a1a1a; margin-top: 12px;">
                <span style="font-size: 12px; color: #777; letter-spacing: 0.05em;">+ ${images.length - 4} more observations</span>
              </div>`
                : ''
            }
          </div>
        `,
        billboard: {
          image: markerImage,
          scale: 1.0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          scaleByDistance: new Cesium.NearFarScalar(1000, 1.2, 100000, 0.6),
        },
      });
    });
  };

  const flyToSite = (lat: number, lon: number, siteName: string) => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    setHoveredSite(siteName);
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 2500),
      orientation: {
        heading: Cesium.Math.toRadians(Math.random() * 360),
        pitch: Cesium.Math.toRadians(-45 - Math.random() * 20),
        roll: 0,
      },
      duration: 3,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  };

  const flyToImage = (image: ArchiveImage) => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    setSelectedImage(image);
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(image.lon, image.lat, 600),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-50),
        roll: 0,
      },
      duration: 3,
      easingFunction: Cesium.EasingFunction.SINUSOIDAL_IN_OUT,
    });
  };

  const returnToOrbit = () => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(31.1342, 29.9792, 8000000),
      orientation: {
        heading: Cesium.Math.toRadians(45),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 5,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
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

      <div className="relative w-full h-screen overflow-hidden bg-black">
        {/* Loading */}
        {showLoading && (
          <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black">
            <div className="flex flex-col items-center gap-6">
              <div className="w-3 h-3 bg-[#D4AF37]/50 rounded-full animate-pulse" />
              <div className="text-xs text-[#D4AF37]/50 tracking-[0.4em] uppercase font-light">
                Loading Archive
              </div>
            </div>
          </div>
        )}

        {showUploadModal && (
          <UploadModal onClose={() => setShowUploadModal(false)} supabase={supabase} />
        )}

        {showPinModal && pinLocation && (
          <PinModal
            lat={pinLocation.lat}
            lon={pinLocation.lon}
            onClose={() => {
              setShowPinModal(false);
              setPinLocation(null);
            }}
            onSubmit={() => {
              setShowPinModal(false);
              setShowUploadModal(true);
            }}
          />
        )}

        {/* Cesium Globe */}
        <div ref={cesiumContainerRef} className="absolute inset-0 bg-black" />

        {/* ── SINGLE NAV — shared Navigation component, no inline duplicate ── */}
        <Navigation
          onSignInClick={() => setShowUploadModal(true)}
          archiveAction={
            <button
              onClick={() => setShowUploadModal(true)}
              className="pointer-events-auto px-5 py-2.5 text-xs font-light text-[#D4AF37]/80 hover:text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 transition-colors tracking-[0.15em] uppercase"
            >
              Add Site
            </button>
          }
        />

        {/* Panels + Status — z-index below nav (z-[2000]) */}
        <div className="fixed inset-0 pointer-events-none z-[1000]">

          {/* Left: Sites Explorer */}
          {cameraHeight < 15000000 && siteStats.length > 0 && (
            <div className="absolute left-6 top-28 w-[320px] max-h-[calc(100vh-180px)] overflow-y-auto pointer-events-auto custom-scrollbar">
              <div className="relative bg-black/70 backdrop-blur-2xl border border-[#D4AF37]/15 p-6 shadow-2xl">
                <div className="absolute left-0 top-0 w-4 h-4 border-l-2 border-t-2 border-[#D4AF37]/30" />
                <div className="absolute right-0 top-0 w-4 h-4 border-r-2 border-t-2 border-[#D4AF37]/30" />
                <div className="absolute left-0 bottom-0 w-4 h-4 border-l-2 border-b-2 border-[#D4AF37]/30" />
                <div className="absolute right-0 bottom-0 w-4 h-4 border-r-2 border-b-2 border-[#D4AF37]/30" />

                <div className="flex items-center justify-between mb-5">
                  <div className="text-xs font-light text-white/50 tracking-[0.12em] uppercase">
                    Ancient Sites
                  </div>
                  <div className="text-xs font-mono text-[#D4AF37]/70">{siteStats.length}</div>
                </div>

                <div className="space-y-2">
                  {siteStats.slice(0, 30).map((site, idx) => (
                    <button
                      key={idx}
                      onClick={() => flyToSite(site.lat, site.lon, site.name)}
                      className="w-full p-4 bg-white/3 hover:bg-[#D4AF37]/8 border border-white/5 hover:border-[#D4AF37]/25 transition-all text-left group relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#D4AF37]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative">
                        <div className="text-sm font-light text-white/95 mb-2 group-hover:text-[#D4AF37]/95 transition-colors">
                          {site.name}
                        </div>
                        <div className="flex items-center justify-between text-xs text-white/40">
                          <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/60" />
                            {site.images} {site.images === 1 ? 'record' : 'records'}
                          </span>
                          <span>{getTimeAgo(site.lastUpload)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Right: Recent Finds */}
          {cameraHeight < 15000000 && archiveImages.length > 0 && (
            <div className="absolute right-6 top-28 w-[320px] max-h-[calc(100vh-180px)] overflow-y-auto pointer-events-auto custom-scrollbar">
              <div className="relative bg-black/70 backdrop-blur-2xl border border-[#D4AF37]/15 p-6 shadow-2xl">
                <div className="absolute left-0 top-0 w-4 h-4 border-l-2 border-t-2 border-[#D4AF37]/30" />
                <div className="absolute right-0 top-0 w-4 h-4 border-r-2 border-t-2 border-[#D4AF37]/30" />
                <div className="absolute left-0 bottom-0 w-4 h-4 border-l-2 border-b-2 border-[#D4AF37]/30" />
                <div className="absolute right-0 bottom-0 w-4 h-4 border-r-2 border-b-2 border-[#D4AF37]/30" />

                <div className="flex items-center justify-between mb-5">
                  <div className="text-xs font-light text-white/50 tracking-[0.12em] uppercase">
                    Recent Finds
                  </div>
                  <button
                    onClick={returnToOrbit}
                    className="text-xs font-light text-[#D4AF37]/60 hover:text-[#D4AF37] transition-colors tracking-[0.1em] uppercase"
                  >
                    Orbit View
                  </button>
                </div>

                <div className="space-y-3">
                  {archiveImages.slice(0, 20).map((image) => (
                    <button
                      key={image.id}
                      onClick={() => flyToImage(image)}
                      className="w-full bg-white/3 hover:bg-[#D4AF37]/8 border border-white/5 hover:border-[#D4AF37]/25 transition-all text-left group overflow-hidden"
                    >
                      <div className="relative">
                        <img
                          src={image.thumbnail_url || image.image_url}
                          alt={image.title}
                          className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-4">
                          <div className="text-sm font-light text-white/95 mb-1 group-hover:text-[#D4AF37]/95 transition-colors">
                            {image.title}
                          </div>
                          <div className="text-xs text-white/50">{image.location_name}</div>
                        </div>
                      </div>
                      <div className="p-3 flex items-center justify-between">
                        <span className="text-xs text-white/40">{image.uploader_name}</span>
                        <span className="text-xs text-white/40">{getTimeAgo(image.uploaded_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Status Bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="relative bg-black/70 backdrop-blur-2xl border border-[#D4AF37]/15 px-10 py-4 shadow-2xl">
              <div className="absolute left-2 top-2 w-3 h-3 border-l-2 border-t-2 border-[#D4AF37]/40" />
              <div className="absolute right-2 top-2 w-3 h-3 border-r-2 border-t-2 border-[#D4AF37]/40" />
              <div className="absolute left-2 bottom-2 w-3 h-3 border-l-2 border-b-2 border-[#D4AF37]/40" />
              <div className="absolute right-2 bottom-2 w-3 h-3 border-r-2 border-b-2 border-[#D4AF37]/40" />

              <div className="flex items-center gap-10 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/60 animate-pulse" />
                  <span className="text-white/40 tracking-[0.1em] uppercase">Live</span>
                </div>
                <div className="w-px h-5 bg-[#D4AF37]/20" />
                <div>
                  <span className="text-white/40 tracking-[0.1em] uppercase">Altitude </span>
                  <span className="text-white/70 font-mono">{stats.elevation}</span>
                </div>
                <div className="w-px h-5 bg-[#D4AF37]/20" />
                <div>
                  <span className="text-white/40 tracking-[0.1em] uppercase">Time </span>
                  <span className="text-white/70 font-mono">{stats.localTime}</span>
                </div>
                <div className="w-px h-5 bg-[#D4AF37]/20" />
                <div>
                  <span className="text-white/40 tracking-[0.1em] uppercase">Position </span>
                  <span className="text-white/70 font-mono text-[10px]">{stats.coords}</span>
                </div>
                <div className="w-px h-5 bg-[#D4AF37]/20" />
                <div>
                  <span className="text-white/40 tracking-[0.1em] uppercase">Sites </span>
                  <span className="text-[#D4AF37]/80 font-mono">{stats.totalImages}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hint */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center opacity-50 hover:opacity-100 transition-opacity">
            <div className="text-xs text-white/30 tracking-[0.15em] uppercase font-light">
              Right-click to pin new location
            </div>
          </div>
        </div>

        <style jsx global>{`
          .custom-scrollbar::-webkit-scrollbar { width: 5px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.25); border-radius: 3px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212,175,55,0.4); }
        `}</style>
      </div>
    </>
  );
}

/* ─── PinModal ─────────────────────────────────────────────────────────────── */
function PinModal({
  lat,
  lon,
  onClose,
  onSubmit,
}: {
  lat: number;
  lon: number;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
      <div className="relative bg-black/90 backdrop-blur-xl border-2 border-[#D4AF37]/30 p-8 max-w-md w-full shadow-2xl">
        <div className="absolute left-0 top-0 w-6 h-6 border-l-2 border-t-2 border-[#D4AF37]/50" />
        <div className="absolute right-0 top-0 w-6 h-6 border-r-2 border-t-2 border-[#D4AF37]/50" />
        <div className="absolute left-0 bottom-0 w-6 h-6 border-l-2 border-b-2 border-[#D4AF37]/50" />
        <div className="absolute right-0 bottom-0 w-6 h-6 border-r-2 border-b-2 border-[#D4AF37]/50" />

        <div className="text-lg font-light text-[#D4AF37] tracking-[0.15em] uppercase mb-6">
          New Discovery
        </div>

        <div className="mb-6">
          <div className="text-sm text-white/60 mb-2">Coordinates:</div>
          <div className="font-mono text-white/90 text-sm">
            {lat.toFixed(6)}°, {lon.toFixed(6)}°
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-5 bg-white/5 hover:bg-white/10 border border-white/20 hover:border-white/30 text-white/80 text-sm font-light tracking-[0.1em] uppercase transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 py-3 px-5 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/40 hover:border-[#D4AF37]/60 text-[#D4AF37] text-sm font-light tracking-[0.1em] uppercase transition-all"
          >
            Document Site
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── UploadModal ──────────────────────────────────────────────────────────── */
function UploadModal({ onClose, supabase }: { onClose: () => void; supabase: any }) {
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location_name: '',
    category: 'archaeological' as ArchiveImage['category'],
    uploader_name: '',
    lat: '',
    lon: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) return;
    setUploading(true);

    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `archive-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('lithicearth-archive')
        .upload(filePath, imageFile);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('lithicearth-archive').getPublicUrl(filePath);

      const { error: dbError } = await supabase.from('archive_images').insert({
        title: formData.title,
        description: formData.description,
        location_name: formData.location_name,
        category: formData.category,
        uploader_name: formData.uploader_name,
        lat: parseFloat(formData.lat),
        lon: parseFloat(formData.lon),
        image_url: publicUrl,
        thumbnail_url: publicUrl,
        uploaded_at: new Date().toISOString(),
      });
      if (dbError) throw dbError;

      alert('Site documented successfully!');
      onClose();
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Error documenting site. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/85 backdrop-blur-lg p-6 overflow-y-auto">
      <div className="relative bg-black/90 backdrop-blur-2xl border-2 border-[#D4AF37]/25 p-10 max-w-3xl w-full my-8 shadow-2xl">
        <div className="absolute left-0 top-0 w-8 h-8 border-l-2 border-t-2 border-[#D4AF37]/50" />
        <div className="absolute right-0 top-0 w-8 h-8 border-r-2 border-t-2 border-[#D4AF37]/50" />
        <div className="absolute left-0 bottom-0 w-8 h-8 border-l-2 border-b-2 border-[#D4AF37]/50" />
        <div className="absolute right-0 bottom-0 w-8 h-8 border-r-2 border-b-2 border-[#D4AF37]/50" />

        <div className="flex items-center justify-between mb-10">
          <div className="text-xl font-light text-[#D4AF37] tracking-[0.18em] uppercase">
            Document Archaeological Site
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
              Photographic Evidence
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              required
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-[#D4AF37]/25 hover:border-[#D4AF37]/50 cursor-pointer transition-all bg-white/3 hover:bg-white/5"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-8">
                  <svg
                    className="w-12 h-12 mx-auto mb-4 text-[#D4AF37]/40"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-sm text-white/50 tracking-wide">Upload site photograph</p>
                </div>
              )}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
                Site Name
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/25 text-white placeholder-white/30 focus:border-[#D4AF37]/50 focus:outline-none transition-colors"
                placeholder="e.g., Temple Complex Ruins"
              />
            </div>
            <div>
              <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
                Location
              </label>
              <input
                type="text"
                required
                value={formData.location_name}
                onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/25 text-white placeholder-white/30 focus:border-[#D4AF37]/50 focus:outline-none transition-colors"
                placeholder="e.g., Valley of Kings, Egypt"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
              Field Notes
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/25 text-white placeholder-white/30 focus:border-[#D4AF37]/50 focus:outline-none transition-colors resize-none"
              placeholder="Describe your observations, historical context, notable features..."
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.lat}
                onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/25 text-white font-mono focus:border-[#D4AF37]/50 focus:outline-none transition-colors"
                placeholder="29.9792"
              />
            </div>
            <div>
              <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
                Longitude
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.lon}
                onChange={(e) => setFormData({ ...formData, lon: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/25 text-white font-mono focus:border-[#D4AF37]/50 focus:outline-none transition-colors"
                placeholder="31.1342"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
                Classification
              </label>
              <select
                required
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value as ArchiveImage['category'] })
                }
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/25 text-white focus:border-[#D4AF37]/50 focus:outline-none transition-colors"
              >
                <option value="archaeological">Archaeological</option>
                <option value="environmental">Environmental</option>
                <option value="geological">Geological</option>
                <option value="cultural">Cultural</option>
                <option value="wildlife">Wildlife</option>
                <option value="urban">Urban</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-light text-white/60 mb-3 tracking-[0.12em] uppercase">
                Explorer Name
              </label>
              <input
                type="text"
                required
                value={formData.uploader_name}
                onChange={(e) => setFormData({ ...formData, uploader_name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/25 text-white placeholder-white/30 focus:border-[#D4AF37]/50 focus:outline-none transition-colors"
                placeholder="Your name"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-4 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border-2 border-[#D4AF37]/40 hover:border-[#D4AF37]/60 text-[#D4AF37] font-light tracking-[0.15em] uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-lg"
          >
            {uploading ? 'Archiving Discovery...' : 'Archive Discovery'}
          </button>
        </form>
      </div>
    </div>
  );
}
