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
  const [stats, setStats] = useState({
    totalImages: 0,
    todayUploads: 0,
    activeContributors: 0,
    coords: '--'
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
  }, [archiveImages]);

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

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const createImageMarker = (category: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    const colors: { [key: string]: string } = {
      archaeological: '#D4AF37',
      environmental: '#2E8B57',
      geological: '#8B4513',
      cultural: '#4682B4',
      wildlife: '#228B22',
      urban: '#708090'
    };
    
    const color = colors[category] || '#FFFFFF';
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(16, 16, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(16, 16, 10, 0, Math.PI * 2);
    ctx.stroke();
    
    return canvas.toDataURL();
  };

  const initializeCesium = async () => {
    if (!window.Cesium || !cesiumContainerRef.current) return;

    const Cesium = window.Cesium;
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjMGRjY2MwNC1hZjEyLTQzNzktOTJiOS0zN2ZkZGMyMTdlMWEiLCJpZCI6Mzg0NTg4LCJpYXQiOjE3Njk2NDE5ODh9.UGCST0fw1fP3bbzxSwNMKxkerweXJKeVrnRhfPYHAD8';

    try {
      const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
        terrainProvider: await Cesium.createWorldTerrainAsync(),
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
        shadows: false,
        shouldAnimate: true
      });

      viewerRef.current = viewer;

      viewer.scene.globe.enableLighting = false;
      viewer.scene.skyAtmosphere.hueShift = 0;
      viewer.scene.skyAtmosphere.saturationShift = 0;
      viewer.scene.skyAtmosphere.brightnessShift = 0;

      viewer.cesiumWidget.creditContainer.style.display = 'none';

      viewer.camera.moveEnd.addEventListener(() => {
        const cameraPosition = viewer.camera.positionCartographic;
        const lat = Cesium.Math.toDegrees(cameraPosition.latitude).toFixed(4);
        const lon = Cesium.Math.toDegrees(cameraPosition.longitude).toFixed(4);
        
        setStats(prev => ({
          ...prev,
          coords: `${lat}°, ${lon}°`
        }));
      });

      await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0
        },
        duration: 0
      });

      setTimeout(() => setShowLoading(false), 2000);

    } catch (error) {
      console.error('Error initializing Cesium:', error);
    }
  };

  const addImageMarkers = () => {
    if (!viewerRef.current || !window.Cesium) return;
    
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;

    viewer.entities.removeAll();

    archiveImages.forEach(image => {
      const markerImage = createImageMarker(image.category);
      
      viewer.entities.add({
        id: image.id,
        position: Cesium.Cartesian3.fromDegrees(image.lon, image.lat, image.elevation || 100),
        name: image.title,
        description: `
          <div style="font-family: system-ui, sans-serif; padding: 20px; max-width: 400px;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 500; color: #000;">${image.title}</h3>
            <img src="${image.image_url}" style="width: 100%; height: 250px; object-fit: cover; margin-bottom: 15px;" />
            <p style="margin: 8px 0; color: #666; font-size: 14px;"><strong>Location:</strong> ${image.location_name}</p>
            <p style="margin: 8px 0; color: #666; font-size: 14px;"><strong>Category:</strong> ${image.category}</p>
            <p style="margin: 8px 0; color: #666; font-size: 14px;"><strong>By:</strong> ${image.uploader_name}</p>
            <p style="margin: 8px 0; color: #666; font-size: 14px;"><strong>Date:</strong> ${new Date(image.uploaded_at).toLocaleDateString()}</p>
            ${image.description ? `<p style="margin: 12px 0 0 0; color: #444; font-size: 14px; line-height: 1.5;">${image.description}</p>` : ''}
          </div>
        `,
        billboard: {
          image: markerImage,
          scale: 1.0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        }
      });
    });
  };

  const flyToSite = (lat: number, lon: number) => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 5000),
      duration: 2
    });
  };

  const flyToImage = (image: ArchiveImage) => {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    
    setSelectedImage(image);
    
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(image.lon, image.lat, 1000),
      duration: 2
    });

    const entity = viewerRef.current.entities.getById(image.id);
    if (entity) {
      viewerRef.current.selectedEntity = entity;
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

      <div className="relative w-full h-screen overflow-hidden bg-black">
        {showLoading && (
          <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black">
            <div className="text-3xl font-light text-white/90 mb-4 tracking-tight">
              Loading Archive
            </div>
            <div className="w-48 h-px bg-white/20">
              <div className="h-full bg-white/60 animate-pulse" style={{ width: '40%' }} />
            </div>
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
          <div className="absolute top-0 left-0 right-0 p-6">
            <div className="flex justify-between items-center">
              <div className="text-xl font-light text-white/90 tracking-tight">
                Archive
              </div>
              
              <div className="flex gap-4 pointer-events-auto">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-5 py-2 text-sm font-light text-white/70 hover:text-white transition-colors tracking-wide"
                >
                  Contribute
                </button>
              </div>
            </div>
          </div>

          <div className="absolute left-6 top-24 w-[280px] max-h-[calc(100vh-200px)] overflow-y-auto pointer-events-auto">
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-lg p-5">
              <div className="text-sm font-light text-white/60 mb-4">
                {siteStats.length} Sites • {stats.totalImages} Images
              </div>

              <div className="space-y-2">
                {siteStats.slice(0, 20).map((site, idx) => (
                  <button
                    key={idx}
                    onClick={() => flyToSite(site.lat, site.lon)}
                    className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded transition-all text-left"
                  >
                    <div className="text-sm font-light text-white mb-1">
                      {site.name}
                    </div>
                    <div className="flex items-center justify-between text-xs text-white/50">
                      <span>{site.images} images</span>
                      <span>{getTimeAgo(site.lastUpload)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute right-6 top-24 w-[280px] max-h-[calc(100vh-200px)] overflow-y-auto pointer-events-auto">
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-lg p-5">
              <div className="text-sm font-light text-white/60 mb-4">
                Recent Uploads
              </div>

              <div className="space-y-2">
                {archiveImages.slice(0, 15).map((image) => (
                  <button
                    key={image.id}
                    onClick={() => flyToImage(image)}
                    className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded transition-all text-left"
                  >
                    <div className="flex gap-3">
                      <img 
                        src={image.thumbnail_url || image.image_url} 
                        alt={image.title}
                        className="w-12 h-12 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-light text-white truncate">
                          {image.title}
                        </div>
                        <div className="text-xs text-white/50 mt-1">
                          {getTimeAgo(image.uploaded_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-8 py-3">
              <div className="flex items-center gap-8 text-sm">
                <div>
                  <span className="text-white/50">Today: </span>
                  <span className="text-white font-light">+{stats.todayUploads}</span>
                </div>
                <div className="w-px h-4 bg-white/20" />
                <div>
                  <span className="text-white/50">Position: </span>
                  <span className="text-white font-mono text-xs">{stats.coords}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
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
    category: 'environmental' as ArchiveImage['category'],
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

      alert('Image uploaded successfully');
      onClose();
    } catch (error) {
      console.error('Error uploading:', error);
      alert('Error uploading. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="bg-black/60 backdrop-blur-xl border border-white/20 rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="text-xl font-light text-white tracking-tight">
            Contribute to Archive
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-light text-white/70 mb-2">Image</label>
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
              className="flex flex-col items-center justify-center w-full h-48 border border-white/20 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-white/5"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <div className="text-center">
                  <p className="text-sm text-white/60">Click to select image</p>
                </div>
              )}
            </label>
          </div>

          <div>
            <label className="block text-sm font-light text-white/70 mb-2">Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:border-white/40 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-light text-white/70 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:border-white/40 focus:outline-none transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-light text-white/70 mb-2">Location Name</label>
            <input
              type="text"
              required
              value={formData.location_name}
              onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:border-white/40 focus:outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-light text-white/70 mb-2">Latitude</label>
              <input
                type="number"
                step="any"
                required
                value={formData.lat}
                onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:border-white/40 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-light text-white/70 mb-2">Longitude</label>
              <input
                type="number"
                step="any"
                required
                value={formData.lon}
                onChange={(e) => setFormData({ ...formData, lon: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:border-white/40 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-light text-white/70 mb-2">Category</label>
            <select
              required
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:border-white/40 focus:outline-none transition-colors"
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
            <label className="block text-sm font-light text-white/70 mb-2">Your Name</label>
            <input
              type="text"
              required
              value={formData.uploader_name}
              onChange={(e) => setFormData({ ...formData, uploader_name: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:border-white/40 focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-4 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 rounded-lg text-white font-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload to Archive'}
          </button>
        </form>
      </div>
    </div>
  );
}
