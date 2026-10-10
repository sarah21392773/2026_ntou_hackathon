// src/uiHelper.js
import { appState } from './state.js';
import { KEY_COASTLINES } from './config.js';
import { calculateDistanceKm, calculateVesselETA, RESPONSE_DEPOTS, OIL_PROFILES } from './api.js';

let toastTimer = null;

export function updateSystemStatus(text, state) {
  const badgeText = document.getElementById('system-status-text');
  const dot = document.querySelector('.status-dot');
  if (!badgeText) return;

  badgeText.innerText = text;
  if (state === 'running') {
    dot.style.backgroundColor = '#38bdf8';
    dot.style.boxShadow = '0 0 8px #38bdf8';
  } else if (state === 'error') {
    dot.style.backgroundColor = '#ef4444';
    dot.style.boxShadow = '0 0 8px #ef4444';
  } else {
    dot.style.backgroundColor = '#10b981';
    dot.style.boxShadow = '0 0 8px #10b981';
  }
}

export function updateOceanCompassHUD() {
  if (!appState.currentWindInfo) return;

  const windDeg = Number(appState.currentWindInfo.direction) || 45;
  const windSpeed = Number(appState.currentWindInfo.speed) || 5.0;

  const arrowWind = document.getElementById('hud-arrow-wind');
  if (arrowWind) arrowWind.style.transform = `rotate(${windDeg}deg)`;

  const driftHeading = (windDeg + 180 + 20) % 360;
  const arrowDrift = document.getElementById('hud-arrow-drift');
  if (arrowDrift) arrowDrift.style.transform = `rotate(${driftHeading.toFixed(0)}deg)`;

  const driftKnots = (windSpeed * 0.03 * 1.944 + 0.35).toFixed(2);

  document.getElementById('hud-wind-text').innerHTML = `風向: <b>${windDeg.toFixed(0)}°</b> (${appState.currentWindInfo.directionText || '東北風'}) <b>${windSpeed.toFixed(1)} m/s</b>`;
  document.getElementById('hud-drift-text').innerHTML = `航向: <b>${driftHeading.toFixed(0)}°</b> ｜ 漂速: <b>${driftKnots} 節</b>`;
}

export function updateMetrics(step) {
  const areaEl = document.getElementById('metric-area');
  const distEl = document.getElementById('metric-distance');
  const threatEl = document.getElementById('metric-threat');
  const beachedEl = document.getElementById('metric-beached');

  if (step.areaKm2 !== undefined) {
    const a = Number(step.areaKm2);
    if (a < 0.01) {
      // 換算公頃 (1 km² = 100 公頃)
      const ha = (a * 100).toFixed(2);
      areaEl.innerHTML = `${ha} <small>公頃 (${a.toFixed(4)} km²)</small>`;
    } else if (a < 1.0) {
      areaEl.innerHTML = `${a.toFixed(3)} <small>km²</small>`;
    } else {
      areaEl.innerHTML = `${a.toFixed(2)} <small>km²</small>`;
    }
  } else {
    areaEl.innerHTML = `-- <small>km²</small>`;
  }

  if (step.driftDistanceKm !== undefined) {
    distEl.innerHTML = `${step.driftDistanceKm.toFixed(1)} <small>km</small>`;
  } else {
    distEl.innerHTML = `-- <small>km</small>`;
  }

  if (step.beached) {
    beachedEl.innerHTML = `<span style="color:#ef4444; font-weight:bold;">🚨 沿岸擱淺受災</span>`;
  } else {
    beachedEl.innerHTML = `海面漂流中`;
  }

  if (step.beached) {
    threatEl.className = 'threat-badge threat-danger';
    threatEl.innerText = '🔴 嚴重海岸衝擊';
  } else {
    let minPortDist = Infinity;
    KEY_COASTLINES.forEach(port => {
      const d = calculateDistanceKm(step.center[0], step.center[1], port.lat, port.lng);
      if (d < minPortDist) minPortDist = d;
    });

    if (minPortDist <= 15) {
      threatEl.className = 'threat-badge threat-warning';
      threatEl.innerText = appState.isBoomDeployed ? '🛡️ 港口防禦防護中' : '🟡 港口警戒緩衝圈';
    } else {
      threatEl.className = 'threat-badge threat-normal';
      threatEl.innerText = '🟢 外海安全擴散';
    }
  }

  const weather = step.weathering || { evaporatedPct: 0, floatingPct: 100, beachedPct: 0 };
  const barFloat = document.getElementById('bar-floating');
  const barEvap = document.getElementById('bar-evap');
  const barBeach = document.getElementById('bar-beached');
  const summary = document.getElementById('weathering-summary');

  if (barFloat && barEvap && barBeach && summary) {
    barFloat.style.width = `${weather.floatingPct}%`;
    barEvap.style.width = `${weather.evaporatedPct}%`;
    barBeach.style.width = `${weather.beachedPct}%`;
    summary.innerText = `漂浮: ${weather.floatingPct}% | 蒸發: ${weather.evaporatedPct}% | 擱淺: ${weather.beachedPct}%`;
  }
}

export function generateCoastlineAlerts() {
  const alertBox = document.getElementById('alert-box');
  alertBox.innerHTML = '';

  if (appState.currentWindInfo) {
    const windDiv = document.createElement('div');
    windDiv.className = 'alert-item alert-info';
    windDiv.innerHTML = `
      💨 <b>${appState.currentWindInfo.source || '氣象署即時觀測風場'}</b><br>
      觀測測站：<b>${appState.currentWindInfo.station}</b><br>
      實測風速：<b>${Number(appState.currentWindInfo.speed).toFixed(1)} m/s</b> ｜ 風向：<b>${appState.currentWindInfo.directionText || appState.currentWindInfo.direction + '°'}</b><br>
      油種特性：<b>${appState.currentOilInfo?.name || '重質原油'}</b> (黏度: ${appState.currentOilInfo?.viscosity || '高'})
    `;
    alertBox.appendChild(windDiv);
  }

  const beachedStep = appState.simulationSteps.find(step => step.beached);
  if (beachedStep) {
    const beachAlert = document.createElement('div');
    beachAlert.className = 'alert-item alert-danger';
    beachAlert.innerHTML = `
      🚨 <b>海岸擱淺警報！</b><br>
      油污預計於 <b>${beachedStep.timeLabel}</b> (第 ${beachedStep.hourIndex} 小時) 抵達台灣海岸線並發生擱淺受害！
    `;
    alertBox.appendChild(beachAlert);
  }

  let impactedCoasts = [];

  appState.simulationSteps.forEach(step => {
    const [cLat, cLng] = step.center;
    KEY_COASTLINES.forEach(coast => {
      const dist = calculateDistanceKm(cLat, cLng, coast.lat, coast.lng);
      
      if (dist <= coast.radiusKm) {
        if (!impactedCoasts.some(item => item.name === coast.name)) {
          impactedCoasts.push({
            name: coast.name,
            esi: coast.esi,
            type: coast.type,
            boomAdvice: coast.boomAdvice,
            impactHour: step.hourIndex,
            timeLabel: step.timeLabel,
            minDistance: dist
          });
        }
      }
    });
  });

  if (impactedCoasts.length === 0) {
    const safeDiv = document.createElement('div');
    safeDiv.className = 'alert-item alert-safe';
    safeDiv.innerHTML = `
      🟢 <b>港口與生態防線評估：</b><br>
      預測油污主要向外海漂移或未逼近既定重點防線 (15km 緩衝圈)，暫無直接衝擊港區或生態保護區之虞。
    `;
    alertBox.appendChild(safeDiv);
  } else {
    impactedCoasts.forEach(coast => {
      const dangerDiv = document.createElement('div');
      dangerDiv.className = coast.esi >= 9 ? 'alert-item alert-danger' : 'alert-item alert-warning';
      dangerDiv.innerHTML = `
        ⚠️ <b>衝擊預警：${coast.name}</b> <span class="esi-badge">ESI ${coast.esi}</span><br>
        預估進入時間：<b>${coast.timeLabel} (第 ${coast.impactHour} 小時)</b> ｜ 最近距離: <b>${coast.minDistance.toFixed(1)} km</b><br>
        ${appState.isBoomDeployed ? `<div style="color:#34d399; font-weight:bold; margin-top:4px;">🛡️ 港口攔油索防禦網已建立：攔截效率 85%！</div>` : ''}
        <div class="boom-advice-box">
          🛡️ <b>應變對策：</b>${coast.boomAdvice}
        </div>
      `;
      alertBox.appendChild(dangerDiv);
    });
  }

  // 緊鄰事故與最新漂移點之最近兩個責任應變處理署卡片
  if (appState.selectedCoords && RESPONSE_DEPOTS.length > 0) {
    const latestStep = appState.simulationSteps[appState.simulationSteps.length - 1];
    const targetLat = latestStep ? latestStep.center[0] : appState.selectedCoords.lat;
    const targetLng = latestStep ? latestStep.center[1] : appState.selectedCoords.lng;

    const rankedDepots = RESPONSE_DEPOTS.map(d => {
      const dist = calculateDistanceKm(targetLat, targetLng, d.lat, d.lng);
      const eta = calculateVesselETA(dist);
      return { ...d, dist, eta };
    }).sort((a, b) => a.dist - b.dist).slice(0, 2);

    const depotBox = document.createElement('div');
    depotBox.className = 'alert-item alert-info';
    depotBox.innerHTML = `
      🚨 <b>即時通報距離最近責任處理署 (派遣建議)：</b>
      ${rankedDepots.map((d, i) => `
        <div style="margin-top:6px; padding:6px; background:rgba(255,255,255,0.06); border-radius:4px; font-size:0.76rem;">
          <b>[優先署 ${i + 1}] ${d.name}</b><br>
          主管：${d.agency}<br>
          距離：<b>${d.dist.toFixed(1)} km</b> (${d.eta.nauticalMiles} 浬) ｜ 預估馳援時間：<b style="color:#38bdf8;">${d.eta.timeText}</b><br>
          攔油能量：${d.booms} ｜ 汲油船隊：${d.skimmers}<br>
          24H 戰情電話：<code>${d.phone}</code>
        </div>
      `).join('')}
    `;
    alertBox.appendChild(depotBox);
  }
}

export function updateLegendVisuals() {
  const coreBox = document.getElementById('legend-core-box');
  const sheenBox = document.getElementById('legend-sheen-box');
  const oilProf = appState.currentOilInfo || OIL_PROFILES.HFO || OIL_PROFILES.crude;

  if (appState.currentRenderStyle === 'thermal') {
    if (coreBox) coreBox.style.background = oilProf.thermalCore || '#ef4444';
    if (sheenBox) sheenBox.style.background = oilProf.thermalSheen || '#38bdf8';
  } else {
    if (coreBox) coreBox.style.background = oilProf.coreColor || '#7f1d1d';
    if (sheenBox) sheenBox.style.background = oilProf.sheenColor || '#f97316';
  }
}

export function collapseSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (!sidebar || sidebar.classList.contains('collapsed')) return;
  sidebar.classList.add('collapsed');
  if (toggleBtn) toggleBtn.style.display = 'flex';
  setTimeout(() => appState.map?.invalidateSize(), 320);
}

export function expandSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (!sidebar) return;
  sidebar.classList.remove('collapsed');
  if (toggleBtn) toggleBtn.style.display = 'none';
  setTimeout(() => appState.map?.invalidateSize(), 320);
}

export function showToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  if (!toast || !msgEl) return;

  msgEl.innerText = msg;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

export function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.add('hidden');
  if (toastTimer) clearTimeout(toastTimer);
}

