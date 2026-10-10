// src/playback.js
import { appState } from './state.js';
import { OIL_PROFILES } from './api.js';
import { updateMetrics } from './uiHelper.js';

export function renderStep(index) {
  const step = appState.simulationSteps[index];
  if (!step) return;

  appState.currentStepIndex = index;
  appState.spillLayerGroup.clearLayers();

  if (step.geojson) {
    const geoLayer = L.geoJSON(step.geojson, {
      style: (feature) => {
        const layerType = feature?.properties?.layerType;
        const oilProf = appState.currentOilInfo || OIL_PROFILES.HFO || OIL_PROFILES.crude;

        if (appState.currentRenderStyle === 'thermal') {
          if (layerType === 'core') {
            return { color: oilProf.thermalCore || '#ef4444', weight: 2, fillColor: oilProf.thermalCore || '#dc2626', fillOpacity: 0.92 };
          } else {
            return { color: oilProf.thermalSheen || '#38bdf8', weight: 1.5, fillColor: oilProf.thermalSheen || '#06b6d4', fillOpacity: 0.5 };
          }
        } else {
          if (layerType === 'core') {
            return { color: oilProf.coreColor || '#7f1d1d', weight: 2, fillColor: oilProf.coreColor || '#991b1b', fillOpacity: 0.88 };
          } else {
            return { color: oilProf.sheenColor || '#ea580c', weight: 1.5, fillColor: oilProf.sheenColor || '#f97316', fillOpacity: 0.45 };
          }
        }
      }
    });
    appState.spillLayerGroup.addLayer(geoLayer);
  }

  document.getElementById('time-display').innerText = step.timeLabel;
  document.getElementById('time-slider').value = index;

  updateChartIndicator(index);
  updateMetrics(step);
}

export function updateChartIndicator(idx) {
  const line = document.getElementById('chart-indicator-line');
  const container = document.getElementById('trend-chart-container');
  if (!line || !container || !appState.simulationSteps.length) return;

  const w = container.clientWidth || 380;
  const pad = { left: 35, right: 15 };
  const n = appState.simulationSteps.length - 1;
  const x = pad.left + (idx / n) * (w - pad.left - pad.right);

  line.setAttribute('x1', x.toFixed(1));
  line.setAttribute('x2', x.toFixed(1));
}

export function renderTrendChart() {
  const container = document.getElementById('trend-chart-container');
  if (!appState.simulationSteps.length || !container) return;

  const w = container.clientWidth || 380;
  const h = container.clientHeight || 90;
  const pad = { top: 12, right: 15, bottom: 18, left: 35 };

  const maxArea = Math.max(...appState.simulationSteps.map(s => s.areaKm2 || 1), 10);
  const n = appState.simulationSteps.length - 1;

  const points = appState.simulationSteps.map((step, idx) => {
    const x = pad.left + (idx / n) * (w - pad.left - pad.right);
    const y = pad.top + (1 - (step.areaKm2 || 0) / maxArea) * (h - pad.top - pad.bottom);
    return { x, y, idx, step };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${h - pad.bottom} L ${points[0].x.toFixed(1)} ${h - pad.bottom} Z`;

  container.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#00f2fe" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <line x1="${pad.left}" y1="${pad.top}" x2="${w - pad.right}" y2="${pad.top}" class="chart-tick-line" />
      <line x1="${pad.left}" y1="${h - pad.bottom}" x2="${w - pad.right}" y2="${h - pad.bottom}" stroke="rgba(255,255,255,0.2)" />
      
      <text x="${pad.left - 4}" y="${pad.top + 4}" fill="#64748b" font-size="9" text-anchor="end">${maxArea.toFixed(0)}</text>
      <text x="${pad.left - 4}" y="${h - pad.bottom}" fill="#64748b" font-size="9" text-anchor="end">0</text>
      <text x="${pad.left}" y="${h - 4}" fill="#64748b" font-size="9">T+0</text>
      <text x="${w - pad.right}" y="${h - 4}" fill="#64748b" font-size="9" text-anchor="end">T+${n}</text>

      <path d="${areaD}" class="trend-line-area" />
      <path d="${pathD}" class="trend-line-path" />

      <line id="chart-indicator-line" x1="${points[appState.currentStepIndex]?.x || pad.left}" y1="${pad.top}" x2="${points[appState.currentStepIndex]?.x || pad.left}" y2="${h - pad.bottom}" class="chart-curr-indicator" />
    </svg>
  `;

  container.onclick = (e) => {
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (clickX - pad.left) / (w - pad.left - pad.right)));
    const targetIdx = Math.round(ratio * n);
    stopAnimation();
    renderStep(targetIdx);
  };
}

export function initTimeline() {
  const slider = document.getElementById('time-slider');
  const playBtn = document.getElementById('play-btn');
  const btnStart = document.getElementById('btn-step-start');
  const btnPrev = document.getElementById('btn-step-prev');
  const btnNext = document.getElementById('btn-step-next');

  slider.max = appState.simulationSteps.length - 1;
  slider.value = 0;
  slider.disabled = false;

  playBtn.disabled = false;
  btnStart.disabled = false;
  btnPrev.disabled = false;
  btnNext.disabled = false;

  slider.oninput = (e) => {
    stopAnimation();
    renderStep(parseInt(e.target.value));
  };

  playBtn.onclick = togglePlayback;
  btnStart.onclick = () => { stopAnimation(); renderStep(0); };
  btnPrev.onclick = () => stepDelta(-1);
  btnNext.onclick = () => stepDelta(1);
}

export function togglePlayback() {
  if (appState.isPlaying) {
    stopAnimation();
  } else {
    startAnimation();
  }
}

export function startAnimation() {
  if (!appState.simulationSteps.length) return;
  appState.isPlaying = true;
  const playBtn = document.getElementById('play-btn');
  if (playBtn) playBtn.innerText = '⏸';

  const baseIntervalMs = 450;
  const currentInterval = Math.max(100, baseIntervalMs / (appState.currentSpeedMultiplier || 1.0));

  if (appState.timer) clearInterval(appState.timer);

  // 若當前已經在最後一小時，點擊播放時從頭循環開始
  if (appState.currentStepIndex >= appState.simulationSteps.length - 1) {
    renderStep(0);
  }

  appState.timer = setInterval(() => {
    let nextIndex = appState.currentStepIndex + 1;
    if (nextIndex >= appState.simulationSteps.length) {
      nextIndex = 0; // 循環播放
    }
    renderStep(nextIndex);
  }, currentInterval);
}

export function stopAnimation() {
  appState.isPlaying = false;
  const playBtn = document.getElementById('play-btn');
  if (playBtn) playBtn.innerText = '▶';
  if (appState.timer) {
    clearInterval(appState.timer);
    appState.timer = null;
  }
}

export function stepDelta(delta) {
  if (!appState.simulationSteps.length) return;
  const slider = document.getElementById('time-slider');
  let target = parseInt(slider.value) + delta;
  if (target < 0) target = 0;
  if (target >= appState.simulationSteps.length) target = appState.simulationSteps.length - 1;
  renderStep(target);
}

