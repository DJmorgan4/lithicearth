 
 
'use client';

import { useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { AuthModal } from '@/components/AuthModal';
import { Upload, MapPin, X, Check } from 'lucide-react';

const CATEGORIES = ['Geology', 'Archaeology', 'Hydrology', 'Wildlife', 'Anomaly', 'Weather', 'Other'];

const STEPS = [
  { number: '01', title: 'Find a site', body: 'Ancient ruins, environmental anomalies, geological formations — anything worth documenting before it disappears.' },
  { number: '02', title: 'Document it', body: 'Photograph it. Note the coordinates. Record what you observe. Field notes belong here alongside satellite data.' },
  { number: '03', title: 'Pin it to the globe', body: 'Drop a pin on the LithicEarth globe and submit your record to the living archive.' },
];

export default function ContributePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) handleFile(f);
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setShowAuthModal(true);
        setLoading(false);
        return;
      }

      let imageUrl = '';
      let imagePath = '';

      // Upload image to R2 via API route
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        imageUrl = data.url;
        imagePath = data.path;
      }

      // ── ONE PHOTO PER DAY CHECK ──────────────────────────────────────
      const today = new Date().toISOString().split('T')[0];
      const { data: todayPost } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', today + 'T00:00:00')
        .limit(1)
        .single();
      if (todayPost) {
        throw new Error('You have already contributed a photo today. Come back tomorrow.');
      }

      // ── ASTRA AUTO-CAPTION ────────────────────────────────────────────────
      let astraCaption = '';
      try {
        const astraRes = await fetch('https://astarte-works.vercel.app/api/astra/core', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `Write a concise field observation note (2-3 sentences, scientific but accessible) for this archive entry:
Title: ${title.trim()}
Category: ${category || 'Unknown'}
Description: ${description.trim() || 'No description provided'}
Location: ${lat && lng ? lat + ', ' + lng : 'Location not specified'}

The note should read like a field researcher's observation — what is significant about this location or observation, what it tells us about the environment, and why it belongs in a permanent archive.`,
            source: 'lithicearth-archive',
            domain: 'conservation',
          }),
          signal: AbortSignal.timeout(20000),
        });
        const astraData = await astraRes.json();
        astraCaption = astraData.response || '';
      } catch { /* non-blocking */ }

      // Save metadata to Supabase
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim(),
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        category: category || null,
        image_url: imageUrl || null,
        image_path: imagePath || null,
        astra_caption: astraCaption || null,
        uploaded_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Award badges (non-blocking)
      fetch('/api/badges/award', { method: 'POST' }).catch(() => {})

      setStatus('success');
      setMessage('Submitted to the archive.');
      setFile(null); setPreview(null); setTitle('');
      setDescription(''); setLat(''); setLng(''); setCategory('');

    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <Navigation onSignInClick={() => setShowAuthModal(true)} />
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Hero */}
      <section className="relative pt-44 pb-28 px-10 border-b border-white/6">
        <div className="absolute left-10 top-32 w-6 h-6 border-l border-t border-[#D4AF37]/20" />
        <div className="absolute right-10 top-32 w-6 h-6 border-r border-t border-[#D4AF37]/20" />
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] text-[#D4AF37]/50 tracking-[0.45em] uppercase font-light mb-8">Contribute</p>
          <h1 className="text-3xl md:text-5xl md:text-4xl md:text-6xl font-light text-white leading-[1.1] mb-8"
            style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
            The earth is still<br />
            <span className="text-[#D4AF37]/80">transmitting.</span>
          </h1>
          <p className="text-base text-white/45 font-light leading-relaxed max-w-xl">
            LithicEarth is a living archive built by field researchers, conservationists,
            and anyone paying close enough attention. Your documentation belongs here.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="px-10 py-24 border-b border-white/6">
        <div className="max-w-5xl mx-auto">
          <p className="text-[9px] text-[#D4AF37]/40 tracking-[0.4em] uppercase font-light mb-16">How it works</p>
          <div className="grid grid-cols-1 md:grid-cols-1 md:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0">
            {STEPS.map((step, i) => (
              <div key={step.number} className={`py-10 pr-10 ${i > 0 ? 'md:pl-10 md:border-l border-white/8' : ''}`}>
                <p className="text-[40px] font-light text-[#D4AF37]/12 leading-none mb-6"
                  style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>{step.number}</p>
                <h3 className="text-base font-light text-white/90 tracking-wide mb-3">{step.title}</h3>
                <p className="text-[13px] text-white/35 font-light leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Upload form */}
      <section className="px-10 py-28 border-b border-white/6">
        <div className="max-w-3xl mx-auto">
          {!showForm ? (
            <div className="relative border border-[#D4AF37]/15 p-12">
              <div className="absolute left-0 top-0 w-5 h-5 border-l-2 border-t-2 border-[#D4AF37]/30" />
              <div className="absolute right-0 top-0 w-5 h-5 border-r-2 border-t-2 border-[#D4AF37]/30" />
              <div className="absolute left-0 bottom-0 w-5 h-5 border-l-2 border-b-2 border-[#D4AF37]/30" />
              <div className="absolute right-0 bottom-0 w-5 h-5 border-r-2 border-b-2 border-[#D4AF37]/30" />
              <p className="text-[10px] text-[#D4AF37]/45 tracking-[0.4em] uppercase font-light mb-6">Start contributing</p>
              <h2 className="text-3xl font-light text-white mb-4 leading-snug"
                style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
                Join the global network<br />documenting Earth.
              </h2>
              <p className="text-[13px] text-white/35 font-light leading-relaxed mb-10 max-w-md">
                One photograph, one set of coordinates, one field note at a time.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => setShowForm(true)}
                  className="px-8 py-3.5 text-[11px] font-light text-black bg-[#D4AF37] hover:bg-[#C9A22E] transition-colors tracking-[0.18em] uppercase">
                  Submit an Observation
                </button>
                <a href="/archive"
                  className="px-8 py-3.5 text-[11px] font-light text-[#D4AF37]/70 hover:text-[#D4AF37] border border-[#D4AF37]/20 hover:border-[#D4AF37]/45 transition-all tracking-[0.18em] uppercase text-center">
                  Browse Archive
                </a>
              </div>
            </div>
          ) : (
            <div className="border border-white/10 p-10">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <p className="text-[9px] text-[#D4AF37]/40 tracking-[0.4em] uppercase font-light mb-1">New Observation</p>
                  <h2 className="text-2xl font-light text-white"
                    style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
                    Submit to the archive
                  </h2>
                </div>
                <button onClick={() => setShowForm(false)} className="text-white/20 hover:text-white/60 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {status === 'success' ? (
                <div className="text-center py-16">
                  <div className="w-12 h-12 border border-[#D4AF37]/30 flex items-center justify-center mx-auto mb-6">
                    <Check size={20} className="text-[#D4AF37]" />
                  </div>
                  <p className="text-white/60 font-light mb-2">{message}</p>
                  <button onClick={() => { setStatus('idle'); setShowForm(false); }}
                    className="text-[#D4AF37]/50 text-xs tracking-widest hover:text-[#D4AF37] transition-colors mt-4">
                    Submit another →
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-7">

                  {/* Image drop zone */}
                  <div>
                    <label className="block text-[9px] text-white/30 tracking-[0.3em] uppercase font-light mb-3">
                      Field Image
                    </label>
                    {preview ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview} alt="" className="w-full h-48 object-cover opacity-80" />
                        <button type="button" onClick={() => { setFile(null); setPreview(null); }}
                          className="absolute top-2 right-2 bg-black/60 p-1 hover:bg-black/80 transition-colors">
                          <X size={14} className="text-white/70" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onDrop={onDrop}
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onClick={() => fileRef.current?.click()}
                        className={`border border-dashed p-10 text-center cursor-pointer transition-colors ${
                          dragging ? 'border-[#D4AF37]/40 bg-[#D4AF37]/5' : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <Upload size={20} className="text-white/20 mx-auto mb-3" />
                        <p className="text-white/30 text-xs font-light">Drop image or click to browse</p>
                        <p className="text-white/15 text-[10px] font-light mt-1">JPG, PNG, WEBP — max 20MB</p>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-[9px] text-white/30 tracking-[0.3em] uppercase font-light mb-2">Title</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Unexplained stone alignment, Llano Uplift"
                      className="w-full px-4 py-3 bg-transparent border border-white/10 text-white/80 font-light text-sm focus:outline-none focus:border-white/25 transition-colors placeholder:text-white/15"
                      required />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[9px] text-white/30 tracking-[0.3em] uppercase font-light mb-2">Field Notes</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="What did you observe? What's unusual or significant about this location?"
                      rows={4}
                      className="w-full px-4 py-3 bg-transparent border border-white/10 text-white/80 font-light text-sm focus:outline-none focus:border-white/25 transition-colors placeholder:text-white/15 resize-none" />
                  </div>

                  {/* Coordinates */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[9px] text-white/30 tracking-[0.3em] uppercase font-light">Coordinates</label>
                      <button type="button" onClick={useMyLocation}
                        className="flex items-center gap-1.5 text-[#D4AF37]/40 hover:text-[#D4AF37]/70 text-[10px] font-light tracking-wide transition-colors">
                        <MapPin size={10} />
                        Use my location
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)}
                        placeholder="Latitude"
                        className="px-4 py-3 bg-transparent border border-white/10 text-white/80 font-light text-sm focus:outline-none focus:border-white/25 transition-colors placeholder:text-white/15" />
                      <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)}
                        placeholder="Longitude"
                        className="px-4 py-3 bg-transparent border border-white/10 text-white/80 font-light text-sm focus:outline-none focus:border-white/25 transition-colors placeholder:text-white/15" />
                    </div>
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-[9px] text-white/30 tracking-[0.3em] uppercase font-light mb-2">Category</label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map(c => (
                        <button key={c} type="button" onClick={() => setCategory(category === c ? '' : c)}
                          className={`px-3 py-1.5 text-[10px] font-light tracking-wide transition-all ${
                            category === c
                              ? 'bg-[#D4AF37] text-black'
                              : 'border border-white/10 text-white/30 hover:border-white/25 hover:text-white/50'
                          }`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {message && status === 'error' && (
                    <p className="text-red-400/70 text-xs font-light">{message}</p>
                  )}

                  <button type="submit" disabled={loading || !title}
                    className="w-full py-4 bg-[#D4AF37] text-black text-[11px] font-light tracking-[0.2em] uppercase hover:bg-[#C9A22E] transition-colors disabled:opacity-40">
                    {loading ? 'SUBMITTING...' : 'SUBMIT TO ARCHIVE'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
