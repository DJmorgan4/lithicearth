'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';

const GOLD = '#D4AF37';
const INK = '#0a0e0b';
const PARCH = '#e8e4da';
const MUTED = 'rgba(232,228,218,0.45)';
const BORDER = 'rgba(212,175,55,0.2)';
const SERIF = 'Cormorant Garamond, Georgia, serif';
const SANS = 'Jost, sans-serif';

/* ============================================================
   THE DIG — daily ancient-site atlas
   Atlas loads from Supabase `dig_sites`; falls back to the
   built-in list below if the table is missing or empty.
   ============================================================ */

interface Site {
  name: string; lat: number; lng: number;
  country: string; region: string; era: string; type: string; fact: string;
  archive_slug?: string | null;
}

const FALLBACK_SITES: Site[] = [
  { name: 'Göbekli Tepe', lat: 37.223, lng: 38.922, country: 'Turkey', region: 'Middle East', era: 'c. 9600 BCE', type: 'Hilltop sanctuary', fact: 'Predates Stonehenge by 6,000 years — raised by hunter-gatherers before agriculture existed.' },
  { name: 'Stonehenge', lat: 51.179, lng: -1.826, country: 'England', region: 'Europe', era: 'c. 3000 BCE', type: 'Megalithic circle', fact: 'Its bluestones were hauled roughly 150 miles from the Preseli Hills of Wales.' },
  { name: 'Great Pyramid of Giza', lat: 29.979, lng: 31.134, country: 'Egypt', region: 'Africa', era: 'c. 2560 BCE', type: 'Pyramid complex', fact: 'Held the title of tallest human-made structure on Earth for over 3,800 years.' },
  { name: 'Machu Picchu', lat: -13.163, lng: -72.545, country: 'Peru', region: 'South America', era: 'c. 1450 CE', type: 'Mountain citadel', fact: 'Built without mortar — stones cut so precisely a knife blade cannot slide between them.' },
  { name: 'Teotihuacan', lat: 19.692, lng: -98.844, country: 'Mexico', region: 'North America', era: 'c. 100 BCE', type: 'Pyramid city', fact: 'Its builders are unknown; the Aztecs found it abandoned and named it the birthplace of the gods.' },
  { name: 'Chichén Itzá', lat: 20.683, lng: -88.568, country: 'Mexico', region: 'North America', era: 'c. 600 CE', type: 'Maya city', fact: 'At the equinox, a serpent of shadow descends the staircase of El Castillo.' },
  { name: 'Angkor Wat', lat: 13.412, lng: 103.867, country: 'Cambodia', region: 'Asia', era: 'c. 1120 CE', type: 'Temple complex', fact: 'The largest religious monument on Earth, moated like an ocean around Mount Meru.' },
  { name: 'Petra', lat: 30.329, lng: 35.444, country: 'Jordan', region: 'Middle East', era: 'c. 300 BCE', type: 'Rock-cut city', fact: 'Carved from rose sandstone cliffs by the Nabataeans, hidden behind a slot canyon.' },
  { name: 'Newgrange', lat: 53.695, lng: -6.475, country: 'Ireland', region: 'Europe', era: 'c. 3200 BCE', type: 'Passage tomb', fact: 'Its roof-box aligns to the winter solstice sunrise — and it is older than the Giza pyramids.' },
  { name: 'Skara Brae', lat: 59.049, lng: -3.343, country: 'Scotland', region: 'Europe', era: 'c. 3180 BCE', type: 'Neolithic village', fact: 'A storm in 1850 stripped the dunes and revealed the most complete Neolithic village in Europe.' },
  { name: 'Carnac Stones', lat: 47.586, lng: -3.078, country: 'France', region: 'Europe', era: 'c. 3300 BCE', type: 'Stone alignments', fact: 'Over 3,000 standing stones march in rows for miles across Brittany.' },
  { name: 'Nan Madol', lat: 6.844, lng: 158.334, country: 'Micronesia', region: 'Oceania', era: 'c. 1200 CE', type: 'Basalt islet city', fact: 'Nearly 100 artificial islets of stacked basalt columns, built on a coral reef.' },
  { name: 'Rano Raraku (Easter Island)', lat: -27.122, lng: -109.288, country: 'Chile', region: 'Oceania', era: 'c. 1250 CE', type: 'Moai quarry', fact: 'Nearly half of the island moai still lie in the quarry where they were carved.' },
  { name: 'Great Zimbabwe', lat: -20.267, lng: 30.933, country: 'Zimbabwe', region: 'Africa', era: 'c. 1100 CE', type: 'Dry-stone city', fact: 'Its Great Enclosure is the largest ancient structure south of the Sahara.' },
  { name: 'Sacsayhuamán', lat: -13.509, lng: -71.982, country: 'Peru', region: 'South America', era: 'c. 1440 CE', type: 'Megalithic fortress', fact: 'Zigzag walls of stones weighing up to 200 tons, fitted like puzzle pieces.' },
  { name: 'Tiwanaku', lat: -16.554, lng: -68.673, country: 'Bolivia', region: 'South America', era: 'c. 500 CE', type: 'Ceremonial center', fact: 'Home of the Gateway of the Sun, cut from a single block of andesite at 12,600 feet.' },
  { name: 'Puma Punku', lat: -16.562, lng: -68.68, country: 'Bolivia', region: 'South America', era: 'c. 536 CE', type: 'Megalithic platform', fact: 'Its H-blocks are cut into interlocking modular forms with machine-like precision.' },
  { name: 'Baalbek', lat: 34.007, lng: 36.204, country: 'Lebanon', region: 'Middle East', era: 'c. 15 BCE', type: 'Temple platform', fact: 'The Trilithon stones here weigh roughly 800 tons each — among the largest ever moved.' },
  { name: 'Persepolis', lat: 29.935, lng: 52.891, country: 'Iran', region: 'Middle East', era: 'c. 518 BCE', type: 'Ceremonial capital', fact: 'Burned by Alexander the Great, allegedly in revenge for the burning of Athens.' },
  { name: 'Mohenjo-daro', lat: 27.324, lng: 68.136, country: 'Pakistan', region: 'Asia', era: 'c. 2500 BCE', type: 'Indus city', fact: 'Had gridded streets and covered drains 4,500 years ago — and no known palaces or temples.' },
  { name: 'Çatalhöyük', lat: 37.667, lng: 32.828, country: 'Turkey', region: 'Middle East', era: 'c. 7100 BCE', type: 'Proto-city', fact: 'Houses had no doors — residents entered through openings in the roof.' },
  { name: 'Poverty Point', lat: 32.637, lng: -91.406, country: 'USA', region: 'North America', era: 'c. 1700 BCE', type: 'Earthwork complex', fact: 'Concentric earthen ridges raised by hunter-gatherers in the Mississippi lowlands.' },
  { name: 'Cahokia', lat: 38.655, lng: -90.062, country: 'USA', region: 'North America', era: 'c. 1050 CE', type: 'Mound city', fact: 'Larger than London in 1250 CE; Monks Mound covers more ground than the Great Pyramid.' },
  { name: 'Serpent Mound', lat: 39.025, lng: -83.43, country: 'USA', region: 'North America', era: 'c. 300 BCE', type: 'Effigy mound', fact: 'A quarter-mile serpent whose head aligns to the summer solstice sunset.' },
  { name: 'Chaco Canyon', lat: 36.061, lng: -107.971, country: 'USA', region: 'North America', era: 'c. 850 CE', type: 'Great house complex', fact: 'Its great houses track lunar standstills — a cycle 18.6 years long.' },
  { name: 'Mesa Verde', lat: 37.184, lng: -108.489, country: 'USA', region: 'North America', era: 'c. 1190 CE', type: 'Cliff dwellings', fact: 'Cliff Palace holds 150 rooms tucked beneath a single sandstone overhang.' },
  { name: 'Caral', lat: -10.892, lng: -77.52, country: 'Peru', region: 'South America', era: 'c. 2600 BCE', type: 'Pyramid city', fact: 'The oldest known city in the Americas — contemporary with the pyramids of Egypt.' },
  { name: 'Nazca Lines', lat: -14.739, lng: -75.13, country: 'Peru', region: 'South America', era: 'c. 100 BCE', type: 'Geoglyphs', fact: 'Hummingbird, monkey, spider — hundreds of figures fully legible only from the air.' },
  { name: 'Derinkuyu', lat: 38.373, lng: 34.735, country: 'Turkey', region: 'Middle East', era: 'c. 700 BCE', type: 'Underground city', fact: 'Eighteen stories deep, it could shelter 20,000 people beneath Cappadocia.' },
  { name: 'Hattusa', lat: 40.019, lng: 34.615, country: 'Turkey', region: 'Middle East', era: 'c. 1600 BCE', type: 'Hittite capital', fact: 'Guarded by carved lion and sphinx gates, with a polished green stone of unknown purpose.' },
  { name: 'Knossos', lat: 35.298, lng: 25.163, country: 'Greece', region: 'Europe', era: 'c. 1950 BCE', type: 'Minoan palace', fact: 'The labyrinth of the Minotaur legend — and the oldest city in Europe.' },
  { name: 'Mycenae', lat: 37.731, lng: 22.756, country: 'Greece', region: 'Europe', era: 'c. 1350 BCE', type: 'Bronze Age citadel', fact: 'The lintel of its Lion Gate weighs around 18 tons; legendary seat of Agamemnon.' },
  { name: 'Delphi', lat: 38.482, lng: 22.501, country: 'Greece', region: 'Europe', era: 'c. 800 BCE', type: 'Oracle sanctuary', fact: 'The ancients called it the navel of the world, marked by the omphalos stone.' },
  { name: 'Ħaġar Qim', lat: 35.828, lng: 14.442, country: 'Malta', region: 'Europe', era: 'c. 3600 BCE', type: 'Megalithic temple', fact: 'The Maltese temples are among the oldest free-standing stone buildings on Earth.' },
  { name: 'Ġgantija', lat: 36.047, lng: 14.269, country: 'Malta', region: 'Europe', era: 'c. 3600 BCE', type: 'Megalithic temple', fact: 'Its name means giantess — locals believed only giants could have raised it.' },
  { name: 'Avebury', lat: 51.428, lng: -1.854, country: 'England', region: 'Europe', era: 'c. 2850 BCE', type: 'Henge', fact: 'The largest stone circle in the world — an entire village sits inside it.' },
  { name: 'Callanish Stones', lat: 58.198, lng: -6.745, country: 'Scotland', region: 'Europe', era: 'c. 2900 BCE', type: 'Standing stones', fact: 'A cross-shaped array on the Isle of Lewis, tied to the lunar standstill.' },
  { name: 'Ring of Brodgar', lat: 59.001, lng: -3.23, country: 'Scotland', region: 'Europe', era: 'c. 2500 BCE', type: 'Stone circle', fact: 'A near-perfect circle 104 meters across in the heart of Neolithic Orkney.' },
  { name: 'Dolmen de Menga', lat: 37.024, lng: -4.547, country: 'Spain', region: 'Europe', era: 'c. 3700 BCE', type: 'Dolmen', fact: 'One capstone weighs about 150 tons — among the heaviest stones moved in prehistoric Europe.' },
  { name: 'Borobudur', lat: -7.608, lng: 110.204, country: 'Indonesia', region: 'Asia', era: 'c. 825 CE', type: 'Buddhist stupa', fact: 'Nearly two million stone blocks form a walkable mandala of 504 Buddhas.' },
  { name: 'Sigiriya', lat: 7.957, lng: 80.76, country: 'Sri Lanka', region: 'Asia', era: 'c. 480 CE', type: 'Rock fortress', fact: 'A palace atop a 600-foot volcanic plug, once entered through a lion mouth of brick and stone.' },
  { name: 'Kailasa Temple (Ellora)', lat: 20.026, lng: 75.179, country: 'India', region: 'Asia', era: 'c. 760 CE', type: 'Rock-cut temple', fact: 'Carved top-down out of a single mountain cliff — an estimated 200,000 tons of rock removed.' },
  { name: 'Ur', lat: 30.963, lng: 46.103, country: 'Iraq', region: 'Middle East', era: 'c. 2100 BCE', type: 'Ziggurat city', fact: 'Its ziggurat honored the moon god Nanna; tradition names it the birthplace of Abraham.' },
  { name: 'Babylon', lat: 32.542, lng: 44.421, country: 'Iraq', region: 'Middle East', era: 'c. 1800 BCE', type: 'Imperial city', fact: 'Home of the Ishtar Gate and the legend of the Hanging Gardens.' },
  { name: 'Karnak', lat: 25.719, lng: 32.657, country: 'Egypt', region: 'Africa', era: 'c. 2000 BCE', type: 'Temple complex', fact: 'Its Great Hypostyle Hall holds 134 columns, some seventy feet tall.' },
  { name: 'Abu Simbel', lat: 22.337, lng: 31.626, country: 'Egypt', region: 'Africa', era: 'c. 1264 BCE', type: 'Rock temples', fact: 'The entire temple was cut apart and relocated in the 1960s to escape rising Lake Nasser.' },
  { name: 'Meroë', lat: 16.938, lng: 33.749, country: 'Sudan', region: 'Africa', era: 'c. 300 BCE', type: 'Pyramid field', fact: 'Sudan holds more pyramids than Egypt — most of them rise here.' },
  { name: 'Lalibela', lat: 12.031, lng: 39.041, country: 'Ethiopia', region: 'Africa', era: 'c. 1200 CE', type: 'Rock-hewn churches', fact: 'Eleven churches carved straight down into volcanic rock, still in use today.' },
  { name: 'Uxmal', lat: 20.36, lng: -89.771, country: 'Mexico', region: 'North America', era: 'c. 850 CE', type: 'Maya city', fact: 'The Pyramid of the Magician has rounded sides — said to be built overnight by a dwarf.' },
  { name: 'Palenque', lat: 17.484, lng: -92.046, country: 'Mexico', region: 'North America', era: 'c. 600 CE', type: 'Maya city', fact: 'The tomb of Pakal lay hidden beneath the Temple of the Inscriptions for 1,300 years.' },
  { name: 'Tikal', lat: 17.222, lng: -89.611, country: 'Guatemala', region: 'North America', era: 'c. 300 CE', type: 'Maya city', fact: 'Temple IV rises above the rainforest canopy — it stood in for a rebel base in Star Wars.' },
  { name: 'Copán', lat: 14.837, lng: -89.142, country: 'Honduras', region: 'North America', era: 'c. 550 CE', type: 'Maya city', fact: 'Its Hieroglyphic Stairway is the longest known Maya text — some 2,200 glyphs.' },
  { name: 'Monte Albán', lat: 17.044, lng: -96.768, country: 'Mexico', region: 'North America', era: 'c. 500 BCE', type: 'Zapotec capital', fact: 'A mountaintop was flattened to build one of the first cities in Mesoamerica.' },
  { name: 'Chan Chan', lat: -8.106, lng: -79.075, country: 'Peru', region: 'South America', era: 'c. 900 CE', type: 'Adobe city', fact: 'The largest adobe city ever built — capital of the Chimú empire.' },
  { name: 'Ollantaytambo', lat: -13.258, lng: -72.263, country: 'Peru', region: 'South America', era: 'c. 1450 CE', type: 'Inca fortress', fact: 'Its monoliths were hauled across a river and up the mountainside from a quarry miles away.' },
  { name: 'Diquís Spheres', lat: 8.909, lng: -83.478, country: 'Costa Rica', region: 'North America', era: 'c. 600 CE', type: 'Stone spheres', fact: 'Hundreds of near-perfect granodiorite spheres, some more than two meters across.' },
  { name: 'Plain of Jars', lat: 19.43, lng: 103.152, country: 'Laos', region: 'Asia', era: 'c. 500 BCE', type: 'Megalithic jars', fact: 'Thousands of giant stone jars scattered across the highlands — purpose still debated.' },
  { name: 'Yonaguni Monument', lat: 24.435, lng: 122.938, country: 'Japan', region: 'Asia', era: 'Debated', type: 'Submerged formation', fact: 'A terraced formation beneath the waves — natural or worked? Divers still argue.' },
  { name: 'Gunung Padang', lat: -6.994, lng: 107.056, country: 'Indonesia', region: 'Asia', era: 'Debated', type: 'Terraced hill', fact: 'A megalithic terrace hill whose deepest layers are claimed — controversially — to be far older than accepted.' },
  { name: 'Karahunj (Zorats Karer)', lat: 39.551, lng: 46.028, country: 'Armenia', region: 'Caucasus', era: 'c. 3300 BCE', type: 'Standing stones', fact: 'Dozens of its stones bear smooth angled holes, possibly bored for watching the sky.' },
  { name: 'Arkaim', lat: 52.649, lng: 59.572, country: 'Russia', region: 'Asia', era: 'c. 2000 BCE', type: 'Fortified settlement', fact: 'A ringed Bronze Age settlement on the steppe, laid out like a wheel.' },
  { name: 'Newark Earthworks', lat: 40.041, lng: -82.454, country: 'USA', region: 'North America', era: 'c. 100 CE', type: 'Geometric earthworks', fact: 'Its Octagon tracks the 18.6-year lunar cycle with astonishing precision.' },
  { name: 'Wassu Stone Circles', lat: 13.692, lng: -14.873, country: 'The Gambia', region: 'Africa', era: 'c. 750 CE', type: 'Stone circles', fact: 'Over a thousand laterite circles line the Gambia River — the densest concentration on Earth.' },
  { name: 'Bagan', lat: 21.172, lng: 94.86, country: 'Myanmar', region: 'Asia', era: 'c. 1050 CE', type: 'Temple plain', fact: 'More than 2,000 brick temples rise from a single river plain.' },
];

const MAX_GUESSES = 6;
const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];

function toRad(d: number) { return (d * Math.PI) / 180; }
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function arrowFor(deg: number) { return ARROWS[Math.round(deg / 45) % 8]; }
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
function proximitySquares(dist: number, correct: boolean) {
  if (correct) return '🟩🟩🟩🟩🟩';
  const pct = Math.max(0, 1 - dist / 20000);
  const g = Math.floor(pct * 5);
  const y = pct * 5 - g >= 0.5 ? 1 : 0;
  return '🟩'.repeat(g) + '🟨'.repeat(y) + '⬛'.repeat(5 - g - y);
}

interface DigGuess { name: string; dist: number; deg: number; correct: boolean; }
interface DigStats { played: number; wins: number; streak: number; best: number; lastDate: string; }

function useCountdown() {
  const [t, setT] = useState('—');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const ms = next.getTime() - now.getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setT(`${h}H ${String(m).padStart(2, '0')}M ${String(s).padStart(2, '0')}S`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

function TheDig() {
  const todayISO = useMemo(() => new Date().toISOString().split('T')[0], []);
  const digNumber = useMemo(() => Math.floor((Date.parse(todayISO) - Date.parse('2026-01-01')) / 86400000) + 1, [todayISO]);

  const [sites, setSites] = useState<Site[]>([]);
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [guesses, setGuesses] = useState<DigGuess[]>([]);
  const [done, setDone] = useState(false);
  const [won, setWon] = useState(false);
  const [input, setInput] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<DigStats>({ played: 0, wins: 0, streak: 0, best: 0, lastDate: '' });

  const supabase = createClient();
  const countdown = useCountdown();

  const answer = useMemo(
    () => (sites.length > 0 ? sites[hashStr(todayISO + 'dig') % sites.length] : null),
    [sites, todayISO]
  );
  const tomorrowRegion = useMemo(() => {
    if (sites.length === 0) return '';
    const t = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    return sites[hashStr(t + 'dig') % sites.length].region;
  }, [sites]);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (q.length < 2) return [];
    return sites
      .filter(s => !guesses.some(g => g.name === s.name))
      .filter(s => s.name.toLowerCase().includes(q) || s.country.toLowerCase().includes(q))
      .slice(0, 6);
  }, [input, guesses, sites]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    // 1) Atlas: Supabase first, hardcoded fallback
    let atlas: Site[] = FALLBACK_SITES;
    try {
      const { data } = await supabase
        .from('dig_sites')
        .select('name, lat, lng, country, region, era, type, fact, archive_slug')
        .eq('active', true)
        .order('name', { ascending: true });
      if (data && data.length >= 10) atlas = data as Site[];
    } catch { /* table not migrated yet — fallback stands */ }
    setSites(atlas);

    // 2) Today's game state + local stats
    let local: DigStats = { played: 0, wins: 0, streak: 0, best: 0, lastDate: '' };
    try {
      const saved = localStorage.getItem('le_dig_' + todayISO);
      if (saved) {
        const s = JSON.parse(saved);
        setGuesses(s.guesses || []);
        setDone(!!s.done);
        setWon(!!s.won);
      } else {
        setShowHelp(true);
      }
      const rawStats = localStorage.getItem('le_dig_stats');
      if (rawStats) local = JSON.parse(rawStats);
    } catch { /* first visit */ }

    // 3) Cross-device stats: take whichever record is newer
    let merged = local;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data: row } = await supabase
          .from('user_streaks')
          .select('dig_current_streak, dig_longest_streak, dig_played, dig_wins, dig_last_date')
          .eq('user_id', user.id)
          .single();
        if (row) {
          const db: DigStats = {
            played: row.dig_played || 0,
            wins: row.dig_wins || 0,
            streak: row.dig_current_streak || 0,
            best: row.dig_longest_streak || 0,
            lastDate: row.dig_last_date || '',
          };
          const dbNewer = db.lastDate > merged.lastDate || (db.lastDate === merged.lastDate && db.played > merged.played);
          if (dbNewer) {
            merged = db;
            localStorage.setItem('le_dig_stats', JSON.stringify(db));
          }
        }
      }
    } catch { /* stats sync is best-effort */ }
    setStats(merged);
    setReady(true);
  }

  async function syncToDb(s: DigStats, u: any) {
    if (!u) return;
    try {
      const digCols = {
        dig_current_streak: s.streak,
        dig_longest_streak: s.best,
        dig_played: s.played,
        dig_wins: s.wins,
        dig_last_date: s.lastDate,
        updated_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase
        .from('user_streaks')
        .select('user_id')
        .eq('user_id', u.id)
        .single();
      if (existing) {
        await supabase.from('user_streaks').update(digCols).eq('user_id', u.id);
      } else {
        await supabase.from('user_streaks').insert({
          user_id: u.id,
          current_streak: 0,
          longest_streak: 0,
          total_correct: 0,
          total_attempted: 0,
          total_photos: 0,
          ...digCols,
        });
      }
    } catch { /* non-blocking */ }
  }

  function finish(win: boolean, finalGuesses: DigGuess[]) {
    setDone(true);
    setWon(win);
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const streak = win ? (stats.lastDate === yesterday ? stats.streak + 1 : 1) : 0;
    const next: DigStats = {
      played: stats.played + 1,
      wins: stats.wins + (win ? 1 : 0),
      streak,
      best: Math.max(streak, stats.best),
      lastDate: todayISO,
    };
    localStorage.setItem('le_dig_stats', JSON.stringify(next));
    localStorage.setItem('le_dig_' + todayISO, JSON.stringify({ guesses: finalGuesses, done: true, won: win }));
    setStats(next);
    syncToDb(next, user);
  }

  function submitGuess(site: Site) {
    if (done || !answer || guesses.some(g => g.name === site.name)) return;
    const correct = site.name === answer.name;
    const g: DigGuess = { name: site.name, dist: haversineKm(site, answer), deg: bearingDeg(site, answer), correct };
    const next = [...guesses, g];
    setGuesses(next);
    setInput('');
    if (correct) finish(true, next);
    else if (next.length >= MAX_GUESSES) finish(false, next);
    else localStorage.setItem('le_dig_' + todayISO, JSON.stringify({ guesses: next, done: false, won: false }));
  }

  function shareText() {
    const lines = guesses.map(g => proximitySquares(g.dist, g.correct) + ' ' + (g.correct ? '🏛️' : arrowFor(g.deg)));
    return `LITHICEARTH · THE DIG #${digNumber}\n${lines.join('\n')}\n${won ? guesses.length : 'X'}/6 · lithicearth.com/challenge`;
  }
  function copyShare() {
    navigator.clipboard.writeText(shareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  if (!ready || !answer) return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div style={{ color: GOLD, fontFamily: SERIF, fontSize: 16, letterSpacing: '0.2em' }}>SURVEYING THE SITE...</div>
    </div>
  );

  const clues = [
    { label: 'TYPE', value: answer.type },
    { label: 'ERA', value: answer.era },
    { label: 'REGION', value: answer.region },
    { label: 'COUNTRY', value: answer.country },
    { label: 'FIELD NOTE', value: answer.fact },
    { label: 'FIRST LETTER', value: answer.name[0] },
  ];
  const unlocked = done ? clues.length : Math.min(guesses.length + 1, clues.length);
  const winPct = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  const archiveHref = answer.archive_slug ? `/archive?site=${answer.archive_slug}` : '/archive';

  return (
    <div>
      {/* Dig stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BORDER, marginBottom: 32, border: `1px solid ${BORDER}` }}>
        {[
          { label: 'DIGS', value: stats.played },
          { label: 'WIN %', value: `${winPct}%` },
          { label: 'STREAK', value: `${stats.streak}⛏️` },
          { label: 'BEST', value: stats.best },
        ].map(s => (
          <div key={s.label} style={{ background: INK, padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.2em', color: MUTED, fontFamily: SANS, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, color: GOLD, fontFamily: SERIF }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: `1px solid ${BORDER}`, background: INK, padding: 32 }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.2em', color: GOLD, fontFamily: SANS, padding: '3px 8px', border: `1px solid ${BORDER}` }}>THE DIG #{digNumber}</span>
            <span style={{ fontSize: 9, letterSpacing: '0.15em', color: MUTED, fontFamily: SANS }}>GUESS {Math.min(guesses.length + (done ? 0 : 1), MAX_GUESSES)} / {MAX_GUESSES}</span>
          </div>
          <button onClick={() => setShowHelp(h => !h)} style={{ fontSize: 9, letterSpacing: '0.2em', color: MUTED, fontFamily: SANS, background: 'transparent', border: 'none', cursor: 'pointer' }}>
            HOW TO PLAY {showHelp ? '−' : '+'}
          </button>
        </div>

        {showHelp && (
          <div style={{ marginBottom: 24, padding: '16px 20px', border: `1px solid ${BORDER}`, background: 'rgba(212,175,55,0.03)' }}>
            <p style={{ fontSize: 14, color: PARCH, fontFamily: SERIF, lineHeight: 1.7, margin: 0 }}>
              One lost place is buried each day. You have six guesses to find it. Every miss reports the distance and compass bearing from your guess to the site — and pulls one more clue from the field journal. Solve it, share your dig card, and return tomorrow.
            </p>
          </div>
        )}

        <p style={{ fontSize: 18, fontFamily: SERIF, color: PARCH, lineHeight: 1.6, marginBottom: 24 }}>
          Somewhere on Earth, one site waits to be identified. Follow the bearings.
        </p>

        {/* Clue ladder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {clues.map((c, i) => {
            const open = i < unlocked;
            return (
              <div key={c.label} style={{ display: 'flex', gap: 16, alignItems: 'baseline', padding: '10px 14px', border: `1px solid ${open ? BORDER : 'rgba(212,175,55,0.07)'}`, background: open ? 'rgba(212,175,55,0.03)' : 'transparent' }}>
                <span style={{ fontSize: 9, letterSpacing: '0.2em', color: open ? GOLD : 'rgba(212,175,55,0.25)', fontFamily: SANS, minWidth: 90 }}>{c.label}</span>
                <span style={{ fontSize: 14, color: open ? PARCH : 'rgba(232,228,218,0.15)', fontFamily: SERIF, lineHeight: 1.5 }}>
                  {open ? c.value : `Unlocks after guess ${i}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Guess log */}
        {guesses.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {guesses.map(g => (
              <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: `1px solid ${g.correct ? 'rgba(39,174,96,0.5)' : BORDER}`, background: g.correct ? 'rgba(39,174,96,0.1)' : 'transparent' }}>
                <span style={{ flex: 1, fontSize: 15, color: g.correct ? '#6fcf97' : PARCH, fontFamily: SERIF }}>{g.name}</span>
                {!g.correct && (
                  <>
                    <span style={{ fontSize: 12, color: MUTED, fontFamily: SANS, letterSpacing: '0.1em' }}>{g.dist.toLocaleString()} KM</span>
                    <span style={{ fontSize: 16 }}>{arrowFor(g.deg)}</span>
                  </>
                )}
                <span style={{ fontSize: 12, letterSpacing: 2 }}>{proximitySquares(g.dist, g.correct)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        {!done && (
          <div style={{ position: 'relative' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && suggestions.length > 0) submitGuess(suggestions[0]); }}
              placeholder="Name the site..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', background: 'transparent', border: `1px solid ${GOLD}`, color: PARCH, fontFamily: SERIF, fontSize: 16, outline: 'none' }}
            />
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#050705', border: `1px solid ${BORDER}`, borderTop: 'none' }}>
                {suggestions.map(s => (
                  <button key={s.name} onClick={() => submitGuess(s)}
                    style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: `1px solid rgba(212,175,55,0.08)`, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 15, color: PARCH, fontFamily: SERIF }}>{s.name}</span>
                    <span style={{ fontSize: 10, color: MUTED, fontFamily: SANS, letterSpacing: '0.15em' }}>{s.country.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {done && (
          <div style={{ marginTop: 4, padding: '20px 24px', background: won ? 'rgba(39,174,96,0.06)' : 'rgba(192,57,43,0.06)', border: `1px solid ${won ? 'rgba(39,174,96,0.3)' : 'rgba(192,57,43,0.3)'}` }}>
            <div style={{ fontSize: 13, color: won ? '#6fcf97' : '#eb5757', fontFamily: SANS, letterSpacing: '0.15em', marginBottom: 10 }}>
              {won ? `⛏️ SITE IDENTIFIED IN ${guesses.length} — ${answer.name.toUpperCase()}` : `SITE LOST — IT WAS ${answer.name.toUpperCase()}`}
              {won && stats.streak > 1 && <span style={{ marginLeft: 16, color: GOLD }}>{stats.streak} DAY STREAK</span>}
            </div>
            <p style={{ fontSize: 14, color: PARCH, fontFamily: SERIF, lineHeight: 1.7, margin: 0 }}>
              {answer.fact} <span style={{ color: MUTED }}>({answer.country}, {answer.era})</span>
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={copyShare} style={{ fontSize: 11, color: '#000', background: GOLD, fontFamily: SANS, letterSpacing: '0.15em', padding: '9px 18px', border: 'none', cursor: 'pointer' }}>
                {copied ? '✓ COPIED' : 'SHARE DIG CARD'}
              </button>
              <a href={archiveHref} style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 16px', border: `1px solid ${BORDER}` }}>
                {answer.archive_slug ? 'SEE IT ON THE GLOBE →' : 'EXPLORE ARCHIVE →'}
              </a>
              <a href="/contribute" style={{ fontSize: 11, color: MUTED, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 16px', border: `1px solid rgba(212,175,55,0.1)` }}>
                CONTRIBUTE A PHOTO
              </a>
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid rgba(212,175,55,0.1)`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 10, color: MUTED, fontFamily: SANS, letterSpacing: '0.2em' }}>NEXT DIG IN {countdown}</span>
              <span style={{ fontSize: 10, color: GOLD, fontFamily: SANS, letterSpacing: '0.2em' }}>TOMORROW THE TRAIL LEADS TO {tomorrowRegion.toUpperCase()}...</span>
            </div>
          </div>
        )}
      </div>

      {/* Sign-in nudge for cross-device streaks */}
      {!user && done && (
        <div style={{ marginTop: 24, padding: '16px 24px', border: `1px solid ${BORDER}`, background: INK, textAlign: 'center' }}>
          <span style={{ fontSize: 11, color: MUTED, fontFamily: SANS, letterSpacing: '0.15em' }}>SIGN IN TO CARRY YOUR DIG STREAK ACROSS DEVICES · </span>
          <a href="/auth/login" style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none' }}>SIGN IN →</a>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DAILY TRIVIA — existing Supabase challenge (unchanged logic)
   ============================================================ */

interface Challenge {
  id: string;
  challenge_date: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  category: string;
  difficulty: string;
}

interface Streak {
  current_streak: number;
  longest_streak: number;
  total_correct: number;
  total_attempted: number;
  total_photos: number;
}

function Trivia() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    const today = new Date().toISOString().split('T')[0];
    const { data: ch } = await supabase
      .from('daily_challenges')
      .select('*')
      .eq('challenge_date', today)
      .single();
    setChallenge(ch);

    if (user && ch) {
      const { data: resp } = await supabase
        .from('challenge_responses')
        .select('answer, correct')
        .eq('user_id', user.id)
        .eq('challenge_id', ch.id)
        .single();

      if (resp) {
        setSelected(resp.answer);
        setRevealed(true);
        setAlreadyAnswered(true);
      }

      const { data: st } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', user.id)
        .single();
      setStreak(st);
    }
    setLoading(false);
  }

  async function submitAnswer(answer: string) {
    if (revealed || submitting) return;
    setSelected(answer);
    setRevealed(true);

    if (!user || !challenge) return;
    setSubmitting(true);

    const correct = answer === challenge.correct_answer;
    const today = new Date().toISOString().split('T')[0];

    await supabase.from('challenge_responses').insert({
      user_id: user.id,
      challenge_id: challenge.id,
      answer,
      correct,
    });

    const { data: existing } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      const wasYesterday = existing.last_challenge_date === yStr;
      const newStreak = wasYesterday ? existing.current_streak + 1 : 1;
      await supabase.from('user_streaks').update({
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, existing.longest_streak),
        last_challenge_date: today,
        total_correct: existing.total_correct + (correct ? 1 : 0),
        total_attempted: existing.total_attempted + 1,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
      setStreak({
        current_streak: newStreak,
        longest_streak: Math.max(newStreak, existing.longest_streak),
        total_correct: existing.total_correct + (correct ? 1 : 0),
        total_attempted: existing.total_attempted + 1,
        total_photos: existing.total_photos,
      });
    } else {
      await supabase.from('user_streaks').insert({
        user_id: user.id,
        current_streak: 1,
        longest_streak: 1,
        last_challenge_date: today,
        total_correct: correct ? 1 : 0,
        total_attempted: 1,
        total_photos: 0,
      });
      setStreak({ current_streak: 1, longest_streak: 1, total_correct: correct ? 1 : 0, total_attempted: 1, total_photos: 0 });
    }
    fetch('/api/badges/award', { method: 'POST' }).catch(() => {});
    setSubmitting(false);
  }

  const options = challenge ? [
    { key: 'A', text: challenge.option_a },
    { key: 'B', text: challenge.option_b },
    { key: 'C', text: challenge.option_c },
    { key: 'D', text: challenge.option_d },
  ] : [];

  const correct = challenge?.correct_answer;
  const isCorrect = selected === correct;

  if (loading) return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div style={{ color: GOLD, fontFamily: SERIF, fontSize: 16, letterSpacing: '0.2em' }}>LOADING...</div>
    </div>
  );

  return (
    <div>
      {user && streak && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BORDER, marginBottom: 32, border: `1px solid ${BORDER}` }}>
          {[
            { label: 'STREAK', value: `${streak.current_streak}🔥` },
            { label: 'BEST', value: streak.longest_streak },
            { label: 'CORRECT', value: `${streak.total_correct}/${streak.total_attempted}` },
            { label: 'PHOTOS', value: streak.total_photos },
          ].map(s => (
            <div key={s.label} style={{ background: INK, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: MUTED, fontFamily: SANS, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, color: GOLD, fontFamily: SERIF }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {challenge ? (
        <div style={{ border: `1px solid ${BORDER}`, background: INK, padding: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.2em', color: GOLD, fontFamily: SANS, padding: '3px 8px', border: `1px solid ${BORDER}` }}>{challenge.category.toUpperCase()}</span>
            <span style={{ fontSize: 9, letterSpacing: '0.15em', color: MUTED, fontFamily: SANS }}>{challenge.difficulty.toUpperCase()}</span>
          </div>

          <p style={{ fontSize: 18, fontFamily: SERIF, color: PARCH, lineHeight: 1.6, marginBottom: 32 }}>
            {challenge.question}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {options.map(opt => {
              const isSelected = selected === opt.key;
              const isCorrectOpt = opt.key === correct;
              let bg = 'transparent';
              let borderColor = 'rgba(212,175,55,0.2)';
              let textColor = PARCH;

              if (revealed) {
                if (isCorrectOpt) { bg = 'rgba(39,174,96,0.12)'; borderColor = 'rgba(39,174,96,0.5)'; textColor = '#6fcf97'; }
                else if (isSelected && !isCorrectOpt) { bg = 'rgba(192,57,43,0.12)'; borderColor = 'rgba(192,57,43,0.4)'; textColor = '#eb5757'; }
                else { textColor = MUTED; }
              } else if (isSelected) {
                bg = 'rgba(212,175,55,0.08)'; borderColor = GOLD;
              }

              return (
                <button key={opt.key} onClick={() => submitAnswer(opt.key)} disabled={revealed}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 18px', background: bg, border: `1px solid ${borderColor}`, cursor: revealed ? 'default' : 'pointer', textAlign: 'left', transition: 'all 0.2s' }}>
                  <span style={{ fontSize: 11, color: revealed && isCorrectOpt ? '#6fcf97' : GOLD, fontFamily: SANS, letterSpacing: '0.15em', minWidth: 20, marginTop: 2 }}>{opt.key}</span>
                  <span style={{ fontSize: 15, color: textColor, fontFamily: SERIF, lineHeight: 1.5 }}>{opt.text}</span>
                </button>
              );
            })}
          </div>

          {revealed && (
            <div style={{ marginTop: 28, padding: '20px 24px', background: isCorrect ? 'rgba(39,174,96,0.06)' : 'rgba(192,57,43,0.06)', border: `1px solid ${isCorrect ? 'rgba(39,174,96,0.3)' : 'rgba(192,57,43,0.3)'}` }}>
              <div style={{ fontSize: 13, color: isCorrect ? '#6fcf97' : '#eb5757', fontFamily: SANS, letterSpacing: '0.15em', marginBottom: 10 }}>
                {alreadyAnswered ? 'ALREADY ANSWERED TODAY' : isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}
                {!alreadyAnswered && streak && <span style={{ marginLeft: 16, color: GOLD }}>{streak.current_streak} DAY STREAK 🔥</span>}
              </div>
              <p style={{ fontSize: 14, color: PARCH, fontFamily: SERIF, lineHeight: 1.7, margin: 0 }}>
                {challenge.explanation}
              </p>
              <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
                <a href="/contribute" style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 16px', border: `1px solid ${BORDER}` }}>
                  CONTRIBUTE A PHOTO →
                </a>
                <a href="/archive" style={{ fontSize: 11, color: MUTED, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 16px', border: `1px solid rgba(212,175,55,0.1)` }}>
                  EXPLORE ARCHIVE
                </a>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: `1px solid ${BORDER}`, background: INK, padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, color: MUTED, fontFamily: SERIF }}>No trivia today. The Dig is still open in the other tab.</div>
        </div>
      )}

      {!user && (
        <div style={{ marginTop: 24, padding: '20px 24px', border: `1px solid ${BORDER}`, background: INK, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS, letterSpacing: '0.1em', marginBottom: 12 }}>SIGN IN TO TRACK YOUR STREAK</div>
          <a href="/auth/login" style={{ fontSize: 11, color: GOLD, fontFamily: SANS, letterSpacing: '0.15em', textDecoration: 'none', padding: '8px 20px', border: `1px solid ${BORDER}` }}>
            SIGN IN →
          </a>
        </div>
      )}

      {alreadyAnswered && (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: SANS, letterSpacing: '0.2em' }}>
            NEXT CHALLENGE IN {24 - new Date().getHours()} HOURS · CONTRIBUTE A PHOTO TO KEEP YOUR ARCHIVE ALIVE
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function ChallengePage() {
  const [tab, setTab] = useState<'dig' | 'trivia'>('dig');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: GOLD, fontFamily: SERIF, fontSize: 18, letterSpacing: '0.2em' }}>LOADING...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: PARCH }}>
      <Navigation />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '80px 24px 60px' }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: GOLD, fontFamily: SANS, marginBottom: 12 }}>
            DAILY CHALLENGE · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </div>
          <h1 style={{ fontSize: 32, fontFamily: SERIF, fontWeight: 400, color: PARCH, lineHeight: 1.3, margin: 0 }}>
            Test your knowledge.<br />Archive the planet.
          </h1>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 36, borderBottom: `1px solid ${BORDER}` }}>
          {([
            { key: 'dig', label: '⛏ THE DIG' },
            { key: 'trivia', label: '◈ DAILY TRIVIA' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                fontSize: 11, letterSpacing: '0.25em', fontFamily: SANS, padding: '12px 24px', cursor: 'pointer',
                background: 'transparent', border: 'none',
                color: tab === t.key ? GOLD : MUTED,
                borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent',
                marginBottom: -1,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'dig' ? <TheDig /> : <Trivia />}

      </div>
      <Footer />
    </div>
  );
}
