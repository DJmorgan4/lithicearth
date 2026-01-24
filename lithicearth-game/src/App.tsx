import React, { useEffect, useState } from 'react';
import { HeroSelection } from './components/HeroSelection';
import { GlobeViewer } from './components/GlobeViewer';
import { UIControls } from './components/UIControls';
import { useGameStore } from './hooks/useGameStore';
import './App.css';
import { BootSplash } from './components/BootSplash';

function App() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem('lithic_booted');
    if (seen) setBooted(true);
  }, []);

  const { selectedHero } = useGameStore();

  if (!booted) {
    return <BootSplash onDone={() => { sessionStorage.setItem('lithic_booted', '1'); setBooted(true); }} />;
  }

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
