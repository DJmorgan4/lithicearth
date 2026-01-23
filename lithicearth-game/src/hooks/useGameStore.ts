import { create } from 'zustand';
import { HeroType, GlobeMode, GameState } from '../types';

interface GameStore extends GameState {
  selectHero: (hero: HeroType) => void;
  toggleGlobeMode: () => void;
  setCurrentSite: (siteId: string | null) => void;
}

const initialState: GameState = {
  selectedHero: null,
  globeMode: 'realistic',
  unlockedSites: ['gobekli-tepe', 'giza', 'stonehenge'],
  currentSite: null,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  selectHero: (hero) => set({ selectedHero: hero }),
  toggleGlobeMode: () =>
    set((state) => ({
      globeMode: state.globeMode === 'stylized' ? 'realistic' : 'stylized',
    })),
  setCurrentSite: (siteId) => set({ currentSite: siteId }),
}));
