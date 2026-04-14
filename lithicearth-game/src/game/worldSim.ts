export type Ghost = {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  emoteUntil: number;
  chat?: string;
  chatUntil?: number;
};

const NAMES = [
  "Explorer_281","GlyphHunter","StoneSeeker","AtlasKid","SkyMapper","RuneRunner",
  "TempleDiver","Sandscript","AuroraPings","ObsidianOps","Timewalk3r","NeolithicNinja",
  "MythDecoder","QuartzQuest","SignalChaser","RelicRider","EchoScout","MoonDial"
];

export function makeGhosts(count = 12): Ghost[] {
  const used = new Set<string>();
  const pick = () => {
    let n = NAMES[Math.floor(Math.random()*NAMES.length)];
    while (used.has(n)) n = NAMES[Math.floor(Math.random()*NAMES.length)];
    used.add(n);
    return n;
  };

  return Array.from({ length: count }).map((_, i) => ({
    id: `g${i}`,
    name: pick(),
    x: (Math.random()*600 - 300),
    y: (Math.random()*420 - 210),
    vx: (Math.random()*2 - 1) * 0.35,
    vy: (Math.random()*2 - 1) * 0.35,
    emoteUntil: 0,
  }));
}

const CHAT_LINES = [
  "yo… giza feels weird.",
  "anyone else see the glyphs?",
  "found shards near stonehenge",
  "this map is LIVE 👀",
  "portal? portal??",
  "bro… type lithic.",
];

export function stepGhosts(gs: Ghost[], dtMs: number, now: number) {
  for (const g of gs) {
    // wander
    g.x += g.vx * (dtMs/16);
    g.y += g.vy * (dtMs/16);

    // soft bounds
    const bx = 420, by = 260;
    if (g.x < -bx || g.x > bx) g.vx *= -1;
    if (g.y < -by || g.y > by) g.vy *= -1;

    // random direction change
    if (Math.random() < 0.01) {
      g.vx = (Math.random()*2 - 1) * 0.45;
      g.vy = (Math.random()*2 - 1) * 0.45;
    }

    // occasional chat
    if ((!g.chatUntil || now > g.chatUntil) && Math.random() < 0.0025) {
      g.chat = CHAT_LINES[Math.floor(Math.random()*CHAT_LINES.length)];
      g.chatUntil = now + 1800 + Math.random()*1600;
    }
  }
}
