// src/state.js

export const appState = {
  map: null,
  currentMarker: null,
  spillLayerGroup: null,
  trajectoryLayerGroup: null,
  portLayersGroup: null,
  depotsLayerGroup: null,
  boomLayerGroup: null,
  
  simulationSteps: [],
  isPlaying: false,
  timer: null,
  selectedCoords: null,
  currentWindInfo: null,
  currentOilInfo: null,
  currentSpeedMultiplier: 1.0,
  speedOptions: [1.0, 2.0, 4.0],
  currentStepIndex: 0,
  currentRenderStyle: 'realistic',
  isBoomDeployed: false
};