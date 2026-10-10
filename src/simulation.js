// src/simulation.js
import { appState } from './state.js';
import { fetchSpillSimulation, OIL_PROFILES } from './api.js';
import { drawBoomBarriers } from './mapManager.js';
import { 
  updateSystemStatus, 
  updateOceanCompassHUD, 
  updateLegendVisuals, 
  collapseSidebar, 
  showToast 
} from './uiHelper.js';
import { 
  renderStep, 
  renderTrendChart, 
  initTimeline, 
  stopAnimation 
} from './playback.js';
import { 
  showReportPanel, 
  hideReportPanel, 
  setReportState 
} from './reportManager.js';

// Re-export 為了相容所有外部調用與測試
export { 
  renderStep, 
  stepDelta, 
  togglePlayback, 
  startAnimation, 
  stopAnimation 
} from './playback.js';
export { 
  showReportPanel, 
  hideReportPanel, 
  setReportState, 
  generateIncidentReportText, 
  downloadGeoJSONFile 
} from './reportManager.js';
export { 
  updateSystemStatus, 
  updateOceanCompassHUD, 
  updateLegendVisuals, 
  collapseSidebar, 
  expandSidebar, 
  showToast, 
  hideToast, 
  generateCoastlineAlerts 
} from './uiHelper.js';

export async function triggerSimulation(options = {}) {
  if (!appState.selectedCoords) return;
  const { autoShowReport = false } = options;

  const mode = document.getElementById('mode-select').value;
  const oilType = document.getElementById('oil-select').value;
  const spillSize = document.getElementById('spill-size-select')?.value || 'medium';
  const hours = parseInt(document.getElementById('hours-slider').value);
  const windLevel = parseInt(document.getElementById('wind-slider').value);

  stopAnimation();
  updateSystemStatus("計算中...", "running");
  setReportState('loading');

  document.getElementById('alert-box').innerHTML = `
    <div class="alert-item alert-info">
      ⏳ 正在獲取環境海象並運算油污擴散軌跡 (${mode === 'API' ? 'Python API' : '前端高速模擬'})...
    </div>
  `;

  try {
    const result = await fetchSpillSimulation(mode, appState.selectedCoords, hours, windLevel, oilType, spillSize);
    
    appState.simulationSteps = Array.isArray(result) ? result : (result.timeSteps || []);
    appState.currentWindInfo = result.windInfo || null;
    appState.currentOilInfo = result.oilInfo || OIL_PROFILES[oilType] || OIL_PROFILES.HFO || OIL_PROFILES.crude;

    drawTrajectoryPath();
    updateOceanCompassHUD();
    updateLegendVisuals();
    renderTrendChart();
    initTimeline();
    
    // 即刻渲染初始油污 (T+0 初始狀態)
    renderStep(0);
    generateCoastlineAlerts();
    
    updateSystemStatus("模擬就緒", "ready");

    if (appState.isBoomDeployed) {
      drawBoomBarriers();
    }

    setReportState('ready');
    // 自動開啟衝擊報告面板
    showReportPanel();
  } catch (error) {
    console.error(error);
    updateSystemStatus("API 連線失敗", "error");
    setReportState('error');
    showReportPanel();
    document.getElementById('alert-box').innerHTML = `
      <div class="alert-item alert-danger">
        ❌ <b>無法連線至後端服務</b><br>
        原因：${error.message}<br><br>
        <span style="font-size:0.75rem; color:#fca5a5;">
          • 請確認已在終端機啟動：<code>python app.py</code><br>
          • 或直接點擊下方按鈕切換至「前端高速模擬」模式：
        </span><br>
        <button id="btn-fallback-mock" class="btn-switch-mode">
          🔄 一鍵切換為前端模擬模式
        </button>
      </div>`;

    document.getElementById('btn-fallback-mock')?.addEventListener('click', () => {
      document.getElementById('mode-select').value = 'MOCK';
      triggerSimulation();
    });
  }
}

export function drawTrajectoryPath() {
  appState.trajectoryLayerGroup.clearLayers();
  if (appState.simulationSteps.length < 2) return;

  const latlngs = appState.simulationSteps.map(step => step.center);

  const polyline = L.polyline(latlngs, {
    color: '#38bdf8',
    weight: 2.5,
    dashArray: '5, 8',
    opacity: 0.85
  });
  appState.trajectoryLayerGroup.addLayer(polyline);

  const endStep = appState.simulationSteps[appState.simulationSteps.length - 1];
  const endDot = L.circleMarker(endStep.center, {
    radius: 4,
    color: '#00f2fe',
    fillColor: '#00f2fe',
    fillOpacity: 1
  }).bindPopup(`<b>預測漂移終點</b><br>時間：${endStep.timeLabel}<br>距離：${endStep.driftDistanceKm ? endStep.driftDistanceKm.toFixed(1) + ' km' : '--'}`);

  appState.trajectoryLayerGroup.addLayer(endDot);
}

export function resetSimulation() {
  stopAnimation();
  appState.selectedCoords = null;
  appState.simulationSteps = [];
  appState.currentStepIndex = 0;

  if (appState.currentMarker) {
    appState.map.removeLayer(appState.currentMarker);
    appState.currentMarker = null;
  }
  appState.spillLayerGroup.clearLayers();
  appState.trajectoryLayerGroup.clearLayers();
  appState.boomLayerGroup.clearLayers();

  document.getElementById('play-btn').disabled = true;
  document.getElementById('btn-step-start').disabled = true;
  document.getElementById('btn-step-prev').disabled = true;
  document.getElementById('btn-step-next').disabled = true;
  
  const slider = document.getElementById('time-slider');
  slider.disabled = true;
  slider.value = 0;
  slider.max = 0;

  document.getElementById('time-display').innerText = 'T + 00:00';
  document.getElementById('metric-area').innerHTML = '-- <small>km²</small>';
  document.getElementById('metric-distance').innerHTML = '-- <small>km</small>';
  
  const threatEl = document.getElementById('metric-threat');
  threatEl.className = 'threat-badge threat-normal';
  threatEl.innerText = '待命中';
  document.getElementById('metric-beached').innerText = '海面漂流中';

  document.getElementById('btn-focus-spill').disabled = true;

  document.getElementById('trend-chart-container').innerHTML = `
    <div class="chart-placeholder">等待事故點選定後繪製趨勢圖...</div>
  `;

  document.getElementById('alert-box').innerHTML = `
    <div class="alert-item alert-info">
      💡 請點擊地圖海域、手動輸入坐標，或點選左側「情境」開始動態模擬與分析。
    </div>
  `;
  hideReportPanel();
  setReportState('idle');

  updateSystemStatus("系統就緒", "ready");
}

export function setIncidentLocation(lat, lng, locationName = "") {
  appState.selectedCoords = { lat, lng };

  const pulseIcon = L.divIcon({
    className: 'spill-pulse-icon',
    html: `
      <div class="spill-pulse-marker">
        <div class="spill-pulse-wave"></div>
        <div class="spill-pulse-core"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  if (appState.currentMarker) appState.map.removeLayer(appState.currentMarker);
  appState.currentMarker = L.marker([lat, lng], { icon: pulseIcon }).addTo(appState.map)
    .bindPopup(`
      <div style="font-size:0.85rem;">
        <b style="color:#ef4444;">🚨 事故發生源 (起點)</b><br>
        ${locationName ? `地點：<b>${locationName}</b><br>` : ''}
        緯度: ${lat.toFixed(4)}°N<br>
        經度: ${lng.toFixed(4)}°E
      </div>
    `)
    .openPopup();

  document.getElementById('btn-focus-spill').disabled = false;

  // 同步更新左側欄經緯度輸入框數值
  const inputLat = document.getElementById('input-lat');
  const inputLng = document.getElementById('input-lng');
  if (inputLat) inputLat.value = lat.toFixed(4);
  if (inputLng) inputLng.value = lng.toFixed(4);

  triggerSimulation({ autoShowReport: false });
}

export function setBoomDeploymentState(enabled) {
  appState.isBoomDeployed = enabled;
  const cb = document.getElementById('toggle-boom-cb');
  if (cb && cb.checked !== enabled) cb.checked = enabled;

  const statusBox = document.getElementById('boom-status-box');
  const legendItemBoom = document.getElementById('legend-item-boom');

  if (appState.isBoomDeployed) {
    statusBox.classList.add('active');
    statusBox.innerHTML = `🛡️ 港口攔油索防禦網：<b>防禦佈署中 (攔截效率 85%)</b>`;
    if (legendItemBoom) legendItemBoom.style.display = 'flex';
    showToast("🛡️ 港口緊急戰術攔油索已佈設就位！");
    drawBoomBarriers();
  } else {
    statusBox.classList.remove('active');
    statusBox.innerHTML = `🛡️ 港口攔油索防禦網：<b>未啟動 (點擊啟動)</b>`;
    if (legendItemBoom) legendItemBoom.style.display = 'none';
    appState.boomLayerGroup.clearLayers();
  }

  if (appState.simulationSteps.length > 0) {
    generateCoastlineAlerts();
    const currStep = appState.simulationSteps[appState.currentStepIndex];
    if (currStep) updateMetrics(currStep);
  }
}