import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HeroType, GlobeMode, GameState } from '../types';

interface GameStore extends GameState {
  selectHero: (hero: HeroType) => void;
  clearHero: () => void;
  toggleGlobeMode: () => void;
  setCurrentSite: (siteId: string | null) => void;
  backToSites: () => void;
}

const initialState: GameState = {
  selectedHero: null,
  globeMode: 'realistic',
  unlockedSites: ['gobekli-tepe', 'giza', 'stonehenge'],
  currentSite: null,
};

export const useGameStore = create<GameStore>()(persist((set) => ({
  ...initialState,
  selectHero: (hero) => set({ selectedHero: hero }),
  clearHero: () => set({ selectedHero: null, currentSite: null }),
  toggleGlobeMode: () =>
    set((state) => ({
      globeMode: state.globeMode === 'stylized' ? 'realistic' : 'stylized',
    })),
  setCurrentSite: (siteId) => set({ currentSite: siteId }),
}), {
  name: 'lithic-earth-save-v1',
  partialize: (s) => ({
    selectedHero: s.selectedHero,
    globeMode: s.globeMode,
    unlockedSites: s.unlockedSites,
    currentSite: s.currentSite,
  }),
}));
