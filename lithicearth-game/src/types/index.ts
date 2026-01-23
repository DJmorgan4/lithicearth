export type HeroType = 'zeus' | 'hercules' | 'quetzalcoatl';

export interface Hero {
  id: HeroType;
  name: string;
  title: string;
  description: string;
  culture: string;
  abilities: {
    primary: string;
    secondary: string;
    special: string;
  };
  stats: {
    wisdom: number;
    strength: number;
    mysticism: number;
  };
  colors: {
    primary: string;
    secondary: string;
  };
}

export interface AncientSite {
  id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  era: string;
  type: 'temple' | 'pyramid' | 'megalith' | 'earthwork' | 'underwater' | 'unknown';
  culture: string;
  discovered?: string;
  description: string;
  mysteries: string[];
  unlocked: boolean;
}

export type GlobeMode = 'stylized' | 'realistic';

export interface GameState {
  selectedHero: HeroType | null;
  globeMode: GlobeMode;
  unlockedSites: string[];
  currentSite: string | null;
}
