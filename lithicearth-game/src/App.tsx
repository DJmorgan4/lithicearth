import React from 'react';
import { HeroSelection } from './components/HeroSelection';
import { GlobeViewer } from './components/GlobeViewer';
import { UIControls } from './components/UIControls';
import { useGameStore } from './hooks/useGameStore';
import './App.css';

function App() {
  const { selectedHero } = useGameStore();

  return (
    <div className="app">
      {!selectedHero ? (
        <HeroSelection />
      ) : (
        <>
          <GlobeViewer />
          <UIControls />
        </>
      )}
    </div>
  );
}

export default App;
