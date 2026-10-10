// src/main.js
import { appState } from './state.js';
import { WIND_LABELS } from './config.js';
import { initMap, satelliteGroup, osmLayer } from './mapManager.js';
import { 
  triggerSimulation, 
  renderStep, 
  stepDelta, 
  togglePlayback, 
  startAnimation, 
  stopAnimation, 
  setIncidentLocation, 
  resetSimulation, 
  setBoomDeploymentState, 
  downloadGeoJSONFile, 
  collapseSidebar, 
  expandSidebar, 
  showReportPanel, 
  hideReportPanel, 
  generateIncidentReportText 
} from './simulation.js';
import { isPointOnLand, HISTORICAL_INCIDENTS } from './api.js';

// 初始化地圖點擊處理 (含陸地防呆)
function handleMapClick(latlng) {
  const isLand = isPointOnLand(latlng.lat, latlng.lng);

  if (isLand) {
    alert("⚠️ 點選位置位於台灣陸地上，請點擊周邊海域設定海上事故源！");
    return;
  }

  setIncidentLocation(latlng.lat, latlng.lng);
}

// 初始化 UI 與鍵盤事件
function initEvents() {
  const baseMapSelect = document.getElementById('base-map-select');
  const hoursSlider = document.getElementById('hours-slider');
  const hoursVal = document.getElementById('hours-val');
  const windSlider = document.getElementById('wind-slider');
  const windVal = document.getElementById('wind-val');
  const timeSlider = document.getElementById('time-slider');
  const playBtn = document.getElementById('play-btn');
  const modeSelect = document.getElementById('mode-select');
  const oilSelect = document.getElementById('oil-select');
  const togglePortsCb = document.getElementById('toggle-coastlines-cb');
  const toggleDepotsCb = document.getElementById('toggle-depots-cb');
  const toggleBoomCb = document.getElementById('toggle-boom-cb');
  const clearBtn = document.getElementById('clear-btn');

  baseMapSelect?.addEventListener('change', (e) => {
    appState.map.removeLayer(satelliteGroup);
    appState.map.removeLayer(osmLayer);

    if (e.target.value === 'satellite') {
      appState.map.addLayer(satelliteGroup);
    } else {
      appState.map.addLayer(osmLayer);
    }
  });

  modeSelect?.addEventListener('change', () => {
    if (appState.selectedCoords) triggerSimulation();
  });

  oilSelect?.addEventListener('change', () => {
    if (appState.selectedCoords) triggerSimulation();
  });

  const spillSizeSelect = document.getElementById('spill-size-select');
  spillSizeSelect?.addEventListener('change', () => {
    if (appState.selectedCoords) triggerSimulation();
  });

  togglePortsCb?.addEventListener('change', (e) => {
    if (e.target.checked) {
      appState.map.addLayer(appState.portLayersGroup);
    } else {
      appState.map.removeLayer(appState.portLayersGroup);
    }
  });

  toggleDepotsCb?.addEventListener('change', (e) => {
    if (e.target.checked) {
      appState.map.addLayer(appState.depotsLayerGroup);
    } else {
      appState.map.removeLayer(appState.depotsLayerGroup);
    }
  });

  toggleBoomCb?.addEventListener('change', (e) => {
    setBoomDeploymentState(e.target.checked);
  });

  const handleBoomToggle = () => {
    const cb = document.getElementById('toggle-boom-cb');
    if (cb) {
      cb.checked = !cb.checked;
      setBoomDeploymentState(cb.checked);
    }
  };
  document.getElementById('btn-quick-boom')?.addEventListener('click', handleBoomToggle);
  document.getElementById('boom-status-box')?.addEventListener('click', handleBoomToggle);

  hoursSlider?.addEventListener('input', (e) => {
    hoursVal.innerText = e.target.value;
    if (appState.selectedCoords) triggerSimulation();
  });

  windSlider?.addEventListener('input', (e) => {
    const levelIndex = parseInt(e.target.value) - 1;
    windVal.innerText = WIND_LABELS[levelIndex] || WIND_LABELS[1];
    if (appState.selectedCoords) triggerSimulation();
  });

  const manualLatInput = document.getElementById('input-lat');
  const manualLngInput = document.getElementById('input-lng');
  const handleManualCoordChange = () => {
    const lat = parseFloat(manualLatInput?.value);
    const lng = parseFloat(manualLngInput?.value);
    if (!isNaN(lat) && !isNaN(lng) && !isPointOnLand(lat, lng)) {
      setIncidentLocation(lat, lng, "手動座標定位");
    }
  };
  manualLatInput?.addEventListener('change', handleManualCoordChange);
  manualLngInput?.addEventListener('change', handleManualCoordChange);

  let wasPlayingBeforeDrag = false;
  timeSlider?.addEventListener('mousedown', () => {
    if (appState.isPlaying) {
      wasPlayingBeforeDrag = true;
      stopAnimation();
    }
  });

  timeSlider?.addEventListener('input', (e) => {
    renderStep(parseInt(e.target.value));
  });

  timeSlider?.addEventListener('mouseup', () => {
    if (wasPlayingBeforeDrag) {
      startAnimation();
      wasPlayingBeforeDrag = false;
    }
  });

  const speedBtn = document.getElementById('btn-speed');
  speedBtn?.addEventListener('click', () => {
    const nextIdx = (appState.speedOptions.indexOf(appState.currentSpeedMultiplier) + 1) % appState.speedOptions.length;
    appState.currentSpeedMultiplier = appState.speedOptions[nextIdx];
    speedBtn.innerText = `${appState.currentSpeedMultiplier.toFixed(1)}x`;
    if (appState.isPlaying) {
      stopAnimation();
      startAnimation();
    }
  });

  const scenarioBar = document.getElementById('scenario-dropdown-bar');
  const scenarioDropdowns = scenarioBar ? scenarioBar.querySelectorAll('.dropdown') : [];

  function closeScenarioDropdowns(except) {
    scenarioDropdowns.forEach(dd => {
      if (dd === except) return;
      dd.classList.remove('open');
      dd.querySelector('.dropdown-trigger').setAttribute('aria-expanded', 'false');
    });
  }

  function resetScenarioLabels() {
    scenarioBar?.querySelectorAll('.dropdown-trigger').forEach(trigger => {
      trigger.querySelector('.dd-label').textContent = trigger.dataset.defaultLabel;
      trigger.classList.remove('has-selection');
    });
  }

  scenarioDropdowns.forEach(dd => {
    const trigger = dd.querySelector('.dropdown-trigger');
    trigger.addEventListener('click', () => {
      const willOpen = !dd.classList.contains('open');
      closeScenarioDropdowns(dd);
      dd.classList.toggle('open', willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
    });

    dd.querySelectorAll('.preset-btn, .history-card-btn').forEach(item => {
      item.addEventListener('click', () => {
        const titleEl = item.querySelector('.hist-title');
        const text = (titleEl ? titleEl.textContent : item.textContent).replace(/\s+/g, ' ').trim();
        resetScenarioLabels();
        trigger.querySelector('.dd-label').textContent = text;
        trigger.classList.add('has-selection');
        closeScenarioDropdowns();
      });
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#scenario-dropdown-bar')) closeScenarioDropdowns();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeScenarioDropdowns();
  });

  clearBtn?.addEventListener('click', resetScenarioLabels);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const name = btn.dataset.name;
      setIncidentLocation(lat, lng, name);
    });
  });

  document.querySelectorAll('.history-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const histId = btn.dataset.histId;
      const hist = HISTORICAL_INCIDENTS.find(h => h.id === histId);
      if (hist) {
        document.getElementById('oil-select').value = hist.oilType;
        document.getElementById('hours-slider').value = hist.hours;
        document.getElementById('hours-val').innerText = hist.hours;
        document.getElementById('wind-slider').value = hist.windLevel;
        document.getElementById('wind-val').innerText = WIND_LABELS[hist.windLevel - 1];
        if (hist.spillSize && document.getElementById('spill-size-select')) {
          document.getElementById('spill-size-select').value = hist.spillSize;
        }

        setIncidentLocation(hist.lat, hist.lng, hist.name);
      }
    });
  });

  document.getElementById('btn-download-geojson')?.addEventListener('click', downloadGeoJSONFile);
  clearBtn?.addEventListener('click', resetSimulation);

  document.getElementById('btn-reset-view')?.addEventListener('click', () => {
    appState.map.flyTo([23.7, 120.7], 8, { duration: 0.8 });
  });

  document.getElementById('btn-focus-spill')?.addEventListener('click', () => {
    if (appState.simulationSteps[appState.currentStepIndex]) {
      const center = appState.simulationSteps[appState.currentStepIndex].center;
      appState.map.flyTo(center, 11, { duration: 0.8 });
    }
  });

  document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen().catch(err => console.log(err));
    }
  });

  document.getElementById('btn-collapse-sidebar')?.addEventListener('click', collapseSidebar);
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', expandSidebar);

  document.getElementById('btn-close-report-panel')?.addEventListener('click', hideReportPanel);
  document.getElementById('btn-toggle-report')?.addEventListener('click', () => {
    const panel = document.getElementById('report-panel');
    if (panel.classList.contains('hidden')) {
      showReportPanel();
    } else {
      hideReportPanel();
    }
  });

  const legendEl = document.getElementById('map-legend');
  document.getElementById('btn-toggle-legend')?.addEventListener('click', () => {
    legendEl.classList.toggle('hidden');
  });
  document.getElementById('btn-close-legend')?.addEventListener('click', () => {
    legendEl.classList.add('hidden');
  });

  initModals();

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayback();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      stopAnimation();
      stepDelta(-1);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      stopAnimation();
      stepDelta(1);
    }
  });

  window.addEventListener('resize', () => {
    appState.map.invalidateSize();
  });
}

function initModals() {
  const modalCoords = document.getElementById('modal-coords');
  document.getElementById('btn-open-coords-modal')?.addEventListener('click', () => {
    modalCoords.classList.remove('hidden');
  });
  document.getElementById('btn-close-coords-modal')?.addEventListener('click', () => {
    modalCoords.classList.add('hidden');
  });
  document.getElementById('btn-cancel-coords')?.addEventListener('click', () => {
    modalCoords.classList.add('hidden');
  });

  document.querySelectorAll('.chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('input-lat').value = chip.dataset.lat;
      document.getElementById('input-lng').value = chip.dataset.lng;
    });
  });

  document.getElementById('btn-submit-coords')?.addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('input-lat').value);
    const lng = parseFloat(document.getElementById('input-lng').value);

    if (isNaN(lat) || isNaN(lng)) {
      alert("請輸入有效的經緯度數值！");
      return;
    }

    if (isPointOnLand(lat, lng)) {
      alert("⚠️ 此坐標位於台灣本島陸地上，請輸入周圍海面經緯度！");
      return;
    }

    modalCoords.classList.add('hidden');
    setIncidentLocation(lat, lng, "手動定位事故點");
  });

  const modalReport = document.getElementById('modal-report');
  document.getElementById('btn-open-report-modal')?.addEventListener('click', () => {
    generateIncidentReportText();
    modalReport.classList.remove('hidden');
  });
  document.getElementById('btn-close-report-modal')?.addEventListener('click', () => {
    modalReport.classList.add('hidden');
  });

  document.getElementById('btn-copy-report')?.addEventListener('click', () => {
    const text = document.getElementById('report-text-container').innerText;
    navigator.clipboard.writeText(text).then(() => {
      alert("✅ 已成功複製通報單全文至剪貼簿！");
    });
  });

  document.getElementById('btn-print-report')?.addEventListener('click', () => {
    window.print();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap(handleMapClick);
  initEvents();
});