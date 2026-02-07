"use client";

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { createClient } from '@supabase/supabase-js';

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
  const [archiveImages, setArchiveImages] = useState<ArchiveImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<ArchiveImage | null>(null);
  const [cameraHeight, setCameraHeight] = useState(20000000);
  const [stats, setStats] = useState({
    totalImages: 0,
    todayUploads: 0,
    activeContributors: 0,
    coords: '--',
    localTime: '--'
  });

  const [siteStats, setSiteStats] = useState<any[]>([]);

  useEffect(() => {
    loadArchiveImages();
    loadStats();
    
    const channel = supabase
      .channel('archive_images_changes')
      .on('postgres_changes', 
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
    
    const uniqueContributors = new Set(contributors?.map((c: { uploader_name: string }) => c.uploader_name) || []).size;

    setStats(prev => ({
      ...prev,
      totalImages: totalCount || 0,
      todayUploads: todayCount || 0,
      activeContributors: uniqueContributors
    }));
  };

  const aggregateSiteStats = (images: ArchiveImage[]) => {
    const siteMap = new Map<string, {
      name: string;
      lat: number;
      lon: number;
      images: number;
      category: string;
      lastUpload: string;
    }>();

    images.forEach(img => {
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
          lastUpload: img.uploaded_at
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

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  const createGeometricMarker = (category: string, imageCount: number) => {
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    const colors: { [key: string]: string } = {
      archaeological: '#D4AF37',  // Gold
      environmental: '#4A5F4D',    // Forest green (muted)
      geological: '#8B6F47',       // Earth brown
      cultural: '#6B7F99',         // Steel blue (muted)
      wildlife: '#5A7355',         // Sage green
      urban: '#73767A'             // Slate gray
    };
    
    const color = colors[category] || '#D4AF37';
    const center = size / 2;
    
    // Glow intensity based on image count (data density)
    const glowIntensity = Math.min(imageCount / 20, 1);
    const glowSize = 20 + (glowIntensity * 10);
    
    // Outer glow
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, glowSize);
    gradient.addColorStop(0, `${color}${Math.floor(glowIntensity * 40).toString(16).padStart(2, '0')}`);
    gradient.addColorStop(0.5, `${color}${Math.floor(glowIntensity * 20).toString(16).padStart(2, '0')}`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Sacred geometry - hexagon
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const x = center + Math.cos(angle) * 12;
      const y = center + Math.sin(angle) * 12;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    
    // Inner circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(center, center, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Corner accent marks (astrolabe-inspired)
    ctx.strokeStyle = `${color}40`;
    ctx.lineWidth = 1;
    [0, 90, 180, 270].forEach(deg => {
      const angle = (deg * Math.PI) / 180;
      const dist = 24;
      const x = center + Math.cos(angle) * dist;
      const y = center + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.stroke();
    });
    
    return canvas.toDataURL();
  };

  const initializeCesium = async () => {
    if (!window.Cesium || !cesiumContainerRef.current) return;

    const Cesium = window.Cesium;
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjMGRjY2MwNC1hZjEyLTQzNzktOTJiOS0zN2ZkZGMyMTdlMWEiLCJpZCI6Mzg0NTg4LCJpYXQiOjE3Njk2NDE5ODh9.UGCST0fw1fP3bbzxSwNMKxkerweXJKeVrnRhfPYHAD8';

    try {
      const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        terrainProvider: await Cesium.createWorldTerrainAsync({
          requestWaterMask: true,
          requestVertexNormals: true
        }),
        imageryProvider: new Cesium.IonImageryProvider({ assetId: 2 }),
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
        shouldAnimate: true
      });

      viewerRef.current = viewer;

      // REAL-TIME DAY/NIGHT CYCLE
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
      
      // Atmospheric aesthetics - subtle, not dramatic
      viewer.scene.skyAtmosphere.hueShift = -0.1;
      viewer.scene.skyAtmosphere.saturationShift = -0.1;
      viewer.scene.skyAtmosphere.brightnessShift = -0.05;
      
      // Fog for depth
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.0001;
      viewer.scene.fog.minimumBrightness = 0.03;
      
      // Camera controls - smooth, deliberate
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 40000000;
      viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
      viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;
      viewer.scene.screenSpaceCameraController.inertiaZoom = 0.8;
      
      // Hide Cesium branding
      viewer.cesiumWidget.creditContainer.style.display = 'none';

      // Camera movement tracking
      viewer.camera.moveEnd.addEventListener(() => {
        const cameraPosition = viewer.camera.positionCartographic;
        const height = cameraPosition.height;
        const lat = Cesium.Math.toDegrees(cameraPosition.latitude).toFixed(4);
        const lon = Cesium.Math.toDegrees(cameraPosition.longitude).toFixed(4);
        
        setCameraHeight(height);
        
        // Calculate local solar time at camera position
        const cartographic = viewer.camera.positionCartographic;
        const julianDate = viewer.clock.currentTime;
        const sunPosition = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(julianDate);
        
        setStats(prev => ({
          ...prev,
          coords: `${lat}°, ${lon}°`,
          localTime: new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          })
        }));
      });

      // Gentle initial view - space, looking at Earth
      await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-60),
          roll: 0
        },
        duration: 0
      });

      // Slow rotation in space
      let rotating = true;
      viewer.clock.onTick.addEventListener(() => {
        if (rotating && viewer.camera.positionCartographic.height > 5000000) {
          viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, Cesium.Math.toRadians(0.01));
        }
      });

      // Stop rotation when user interacts
      viewer.camera.moveStart.addEventListener(() => {
        rotating = false;
      });

      // Fade in
      setTimeout(() => {
        setShowLoading(false);
      }, 1500);

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

    // Only show markers when zoomed in enough (zoom-based revelation)
    const showMarkers = cameraHeight < 5000000;

    if (!showMarkers) return;

    // Group images by location to show density
    const locationGroups = new Map<string, ArchiveImage[]>();
    archiveImages.forEach(img => {
      const key = `${img.lat.toFixed(3)},${img.lon.toFixed(3)}`;
      if (!locationGroups.has(key)) {
        locationGroups.set(key, []);
      }
      locationGroups.get(key)!.push(img);
    });

    locationGroups.forEach((images, key) => {
      const firstImage = images[0];
      const markerImage = createGeometricMarker(firstImage.category, images.length);
      
      viewer.entities.add({
        id: `site_${key}`,
        position: Cesium.Cartesian3.fromDegrees(firstImage.lon, firstImage.lat, 0),
        name: firstImage.location_name,
        description: `
          <div style="font-family: system-ui, sans-serif; padding: 20px; max-width: 400px; background: #0a0a0a; color: #d4cfc0;">
            <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #3a3a3a;">
              <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 400; color: #D4AF37; letter-spacing: 0.02em;">${firstImage.location_name}</h3>
              <div style="font-size: 11px; color: #888; letter-spacing: 0.05em; text-transform: uppercase;">${firstImage.category} • ${images.length} image${images.length > 1 ? 's' : ''}</div>
            </div>
            ${images.slice(0, 3).map(img => `
              <div style="margin-bottom: 16px;">
                <img src="${img.image_url}" style="width: 100%; height: 200px; object-fit: cover; margin-bottom: 10px; border: 1px solid #2a2a2a;" />
                <div style="font-size: 13px; color: #d4cfc0; margin-bottom: 4px;">${img.title}</div>
                <div style="font-size: 11px; color: #888;">
                  ${img.uploader_name} • ${new Date(img.uploaded_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
                ${img.description ? `<div style="font-size: 12px; color: #999; margin-top: 6px; line-height: 1.4;">${img.description}</div>` : ''}
              </div>
            `).join('')}
            ${images.length > 3 ? `<div style="font-size: 12px; color: #666; margin-top: 8px;">+ ${images.length - 3} more images at this location</div>` : ''}
          </div>
        `,
        billboard: {
          image: markerImage,
          scale: 1.0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          pixelOffset: new Cesium.Cartesian2(0, 0)
        }
      });
    });
  };

  const flyToSite = (lat: number, lon: number) => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 3000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0
      },
      duration: 2.5
    });
  };

  const flyToImage = (image: ArchiveImage) => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    
    setSelectedImage(image);
    
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(image.lon, image.lat, 800),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0
      },
      duration: 2.5
    });
  };

  const returnToSpace = () => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-60),
        roll: 0
      },
      duration: 4
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
        {/* Silent fade-in loading */}
        {showLoading && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black">
            <div className="w-1 h-1 bg-white/20 rounded-full animate-pulse" />
          </div>
        )}

        {showUploadModal && (
          <UploadModal 
            onClose={() => setShowUploadModal(false)}
            supabase={supabase}
          />
        )}

        <div ref={cesiumContainerRef} className="absolute inset-0 bg-black" />

        <div className="fixed inset-0 pointer-events-none z-[1000]">
          {/* Top bar with geometric frame accents */}
          <div className="absolute top-0 left-0 right-0 p-6">
            <div className="relative">
              {/* Corner accents - astrolabe inspired */}
              <div className="absolute -left-2 -top-2 w-4 h-4 border-l border-t border-[#D4AF37]/30" />
              <div className="absolute -right-2 -top-2 w-4 h-4 border-r border-t border-[#D4AF37]/30" />
              
              <div className="flex justify-between items-center px-4">
                <div className="text-base font-light text-[#D4AF37]/90 tracking-[0.15em] uppercase">
                  Archive
                </div>
                
                <div className="flex items-center gap-6 pointer-events-auto">
                  <button
                    onClick={returnToSpace}
                    className="text-xs font-light text-white/50 hover:text-white/80 transition-colors tracking-[0.1em] uppercase"
                  >
                    Return to Space
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-4 py-2 text-xs font-light text-[#D4AF37]/80 hover:text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/40 transition-colors tracking-[0.1em] uppercase"
                  >
                    Propose Site
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sites panel - left */}
          {cameraHeight < 10000000 && (
            <div className="absolute left-6 top-24 w-[280px] max-h-[calc(100vh-200px)] overflow-y-auto pointer-events-auto custom-scrollbar">
              <div className="relative bg-black/60 backdrop-blur-xl border border-[#D4AF37]/10 p-5">
                {/* Corner geometric accents */}
                <div className="absolute left-0 top-0 w-3 h-3 border-l border-t border-[#D4AF37]/20" />
                <div className="absolute right-0 top-0 w-3 h-3 border-r border-t border-[#D4AF37]/20" />
                <div className="absolute left-0 bottom-0 w-3 h-3 border-l border-b border-[#D4AF37]/20" />
                <div className="absolute right-0 bottom-0 w-3 h-3 border-r border-b border-[#D4AF37]/20" />
                
                <div className="text-xs font-light text-white/40 mb-4 tracking-[0.1em] uppercase">
                  {siteStats.length} Sites • {stats.totalImages} Records
                </div>

                <div className="space-y-2">
                  {siteStats.slice(0, 20).map((site, idx) => (
                    <button
                      key={idx}
                      onClick={() => flyToSite(site.lat, site.lon)}
                      className="w-full p-3 bg-white/5 hover:bg-[#D4AF37]/10 border border-white/5 hover:border-[#D4AF37]/20 transition-all text-left group"
                    >
                      <div className="text-sm font-light text-white/90 mb-1 group-hover:text-[#D4AF37]/90 transition-colors">
                        {site.name}
                      </div>
                      <div className="flex items-center justify-between text-xs text-white/40">
                        <span>{site.images} images</span>
                        <span>{getTimeAgo(site.lastUpload)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent uploads - right */}
          {cameraHeight < 10000000 && (
            <div className="absolute right-6 top-24 w-[280px] max-h-[calc(100vh-200px)] overflow-y-auto pointer-events-auto custom-scrollbar">
              <div className="relative bg-black/60 backdrop-blur-xl border border-[#D4AF37]/10 p-5">
                <div className="absolute left-0 top-0 w-3 h-3 border-l border-t border-[#D4AF37]/20" />
                <div className="absolute right-0 top-0 w-3 h-3 border-r border-t border-[#D4AF37]/20" />
                <div className="absolute left-0 bottom-0 w-3 h-3 border-l border-b border-[#D4AF37]/20" />
                <div className="absolute right-0 bottom-0 w-3 h-3 border-r border-b border-[#D4AF37]/20" />
                
                <div className="text-xs font-light text-white/40 mb-4 tracking-[0.1em] uppercase">
                  Recent Observations
                </div>

                <div className="space-y-2">
                  {archiveImages.slice(0, 15).map((image) => (
                    <button
                      key={image.id}
                      onClick={() => flyToImage(image)}
                      className="w-full p-2 bg-white/5 hover:bg-[#D4AF37]/10 border border-white/5 hover:border-[#D4AF37]/20 transition-all text-left group"
                    >
                      <div className="flex gap-3">
                        <img 
                          src={image.thumbnail_url || image.image_url} 
                          alt={image.title}
                          className="w-12 h-12 object-cover border border-white/10"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-light text-white/90 truncate group-hover:text-[#D4AF37]/90 transition-colors">
                            {image.title}
                          </div>
                          <div className="text-xs text-white/40 mt-1">
                            {getTimeAgo(image.uploaded_at)}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bottom status bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="relative bg-black/60 backdrop-blur-xl border border-[#D4AF37]/10 px-8 py-3">
              <div className="absolute left-2 top-2 w-2 h-2 border-l border-t border-[#D4AF37]/30" />
              <div className="absolute right-2 top-2 w-2 h-2 border-r border-t border-[#D4AF37]/30" />
              <div className="absolute left-2 bottom-2 w-2 h-2 border-l border-b border-[#D4AF37]/30" />
              <div className="absolute right-2 bottom-2 w-2 h-2 border-r border-b border-[#D4AF37]/30" />
              
              <div className="flex items-center gap-8 text-xs">
                <div>
                  <span className="text-white/40 tracking-[0.1em] uppercase">Today </span>
                  <span className="text-[#D4AF37]/80 font-mono">+{stats.todayUploads}</span>
                </div>
                <div className="w-px h-4 bg-[#D4AF37]/20" />
                <div>
                  <span className="text-white/40 tracking-[0.1em] uppercase">Time </span>
                  <span className="text-white/60 font-mono">{stats.localTime}</span>
                </div>
                <div className="w-px h-4 bg-[#D4AF37]/20" />
                <div>
                  <span className="text-white/40 tracking-[0.1em] uppercase">Position </span>
                  <span className="text-white/60 font-mono text-[10px]">{stats.coords}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx global>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
          }

          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }

          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(212, 175, 55, 0.2);
            border-radius: 2px;
          }

          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(212, 175, 55, 0.3);
          }
        `}</style>
      </div>
    </>
  );
}

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
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
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

      const { data: { publicUrl } } = supabase.storage
        .from('lithicearth-archive')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('archive_images')
        .insert({
          title: formData.title,
          description: formData.description,
          location_name: formData.location_name,
          category: formData.category,
          uploader_name: formData.uploader_name,
          lat: parseFloat(formData.lat),
          lon: parseFloat(formData.lon),
          image_url: publicUrl,
          thumbnail_url: publicUrl,
          uploaded_at: new Date().toISOString()
        });

      if (dbError) throw dbError;

      alert('Site proposed successfully. Awaiting review.');
      onClose();
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Error submitting proposal. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6">
      <div className="relative bg-black/80 backdrop-blur-xl border border-[#D4AF37]/20 p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Geometric corner accents */}
        <div className="absolute left-0 top-0 w-6 h-6 border-l-2 border-t-2 border-[#D4AF37]/40" />
        <div className="absolute right-0 top-0 w-6 h-6 border-r-2 border-t-2 border-[#D4AF37]/40" />
        <div className="absolute left-0 bottom-0 w-6 h-6 border-l-2 border-b-2 border-[#D4AF37]/40" />
        <div className="absolute right-0 bottom-0 w-6 h-6 border-r-2 border-b-2 border-[#D4AF37]/40" />
        
        <div className="flex items-center justify-between mb-8">
          <div className="text-lg font-light text-[#D4AF37] tracking-[0.15em] uppercase">
            Propose Site
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Image</label>
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
              className="flex flex-col items-center justify-center w-full h-48 border border-[#D4AF37]/20 cursor-pointer hover:border-[#D4AF37]/40 transition-colors bg-white/5"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center">
                  <p className="text-sm text-white/40">Select image</p>
                </div>
              )}
            </label>
          </div>

          <div>
            <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 text-white placeholder-white/30 focus:border-[#D4AF37]/40 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 text-white placeholder-white/30 focus:border-[#D4AF37]/40 focus:outline-none transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Location Name</label>
            <input
              type="text"
              required
              value={formData.location_name}
              onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 text-white placeholder-white/30 focus:border-[#D4AF37]/40 focus:outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Latitude</label>
              <input
                type="number"
                step="any"
                required
                value={formData.lat}
                onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 text-white placeholder-white/30 focus:border-[#D4AF37]/40 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Longitude</label>
              <input
                type="number"
                step="any"
                required
                value={formData.lon}
                onChange={(e) => setFormData({ ...formData, lon: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 text-white placeholder-white/30 focus:border-[#D4AF37]/40 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Category</label>
            <select
              required
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 text-white focus:border-[#D4AF37]/40 focus:outline-none transition-colors"
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
            <label className="block text-xs font-light text-white/60 mb-2 tracking-[0.1em] uppercase">Your Name</label>
            <input
              type="text"
              required
              value={formData.uploader_name}
              onChange={(e) => setFormData({ ...formData, uploader_name: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 text-white placeholder-white/30 focus:border-[#D4AF37]/40 focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-4 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 hover:border-[#D4AF37]/50 text-[#D4AF37] font-light tracking-[0.1em] uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {uploading ? 'Submitting Proposal...' : 'Propose Site for Review'}
          </button>
        </form>
      </div>
    </div>
  );
}
