import React from 'react';

export const GlobeViewer: React.FC = () => {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '2rem',
    }}>
      🌍 Globe loading... (Cesium integration coming next!)
    </div>
  );
};
