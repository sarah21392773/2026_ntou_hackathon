// src/main.js
import { 
  fetchSpillSimulation, 
  isPointOnLand, 
  calculateDistanceKm, 
  getWindCompassText,
  calculateVesselETA,
  OIL_PROFILES,
  HISTORICAL_INCIDENTS,
  RESPONSE_DEPOTS
} from './api.js';

// 風浪等級對照文字
const WIND_LABELS = [
  "輕微風浪 (1~2級)",
  "中等風浪 (3~4級)",
  "強烈風浪 (5~7級)"
];

// 台灣重要海岸線防線與港口（含 ESI 環境生態敏感度等級 1~10 與攔油索佈設建議）
const keyCoastlines = [
  { 
    name: "基隆港與北海岸", 
    lat: 25.15, 
    lng: 121.74, 
    radiusKm: 15, 
    esi: 7, 
    type: "岩岸/深水商港航道", 
    boomAdvice: "建議於港口狹窄航道防波堤佈放 800m 充氣型重防護攔油索，封閉港內水域",
    boomCoords: [[25.158, 121.738], [25.148, 121.758]]
  },
  { 
    name: "台北港與淡水河口", 
    lat: 25.15, 
    lng: 121.37, 
    radiusKm: 15, 
    esi: 8, 
    type: "河口濕地/淡水紅樹林生態", 
    boomAdvice: "🚨 優先守護淡水河口紅樹林保護區！於河口南岸佈放 1200m 攔油索與吸油棉拖簾",
    boomCoords: [[25.168, 121.365], [25.145, 121.395]]
  },
  { 
    name: "桃園觀音海岸", 
    lat: 25.04, 
    lng: 121.08, 
    radiusKm: 15, 
    esi: 9, 
    type: "觀新藻礁生態保護區", 
    boomAdvice: "⚠️ 藻礁極高敏感區！嚴禁化學除油劑！緊急佈設 1000m 淺灘攔油索阻絕岸際附著",
    boomCoords: [[25.050, 121.065], [25.030, 121.095]]
  },
  { 
    name: "台中港海岸", 
    lat: 24.25, 
    lng: 120.51, 
    radiusKm: 15, 
    esi: 6, 
    type: "工業港/台電發電廠進水口", 
    boomAdvice: "防堵發電廠冷卻水取水口，於外防波堤佈放 1500m 海域重型抗浪攔油索",
    boomCoords: [[24.275, 120.495], [24.240, 120.525]]
  },
  { 
    name: "雲林麥寮工業港", 
    lat: 23.78, 
    lng: 120.15, 
    radiusKm: 15, 
    esi: 8, 
    type: "石化港埠/沿岸牡蠣蚵棚養殖區", 
    boomAdvice: "保護沿海蚵棚養殖區，調派 2 艘海事汲油船配合 900m 快速圍堵攔油索",
    boomCoords: [[23.800, 120.135], [23.765, 120.165]]
  },
  { 
    name: "高雄港海岸", 
    lat: 22.61, 
    lng: 120.27, 
    radiusKm: 15, 
    esi: 5, 
    type: "國際大型樞紐港", 
    boomAdvice: "封閉一港口與二港口水閘，調派港勤拖船佈設 1800m 港灣型雙層攔油索",
    boomCoords: [[22.628, 120.252], [22.595, 120.285]]
  },
  { 
    name: "墾丁國家公園海岸", 
    lat: 21.94, 
    lng: 120.78, 
    radiusKm: 15, 
    esi: 10, 
    type: "珊瑚礁國家公園 (國寶級最高敏感)", 
    boomAdvice: "🚨 國寶級珊瑚礁生態！全面嚴禁除油化學劑！動員人工吸油棉氈與離岸水體截流",
    boomCoords: [[21.960, 120.760], [21.925, 120.795]]
  },
  { 
    name: "花蓮港海岸", 
    lat: 23.98, 
    lng: 121.62, 
    radiusKm: 15, 
    esi: 7, 
    type: "東部深水港/賞鯨黑潮水域", 
    boomAdvice: "保護港內停泊船席與賞鯨碼頭，佈設 600m 抗強浪深裙攔油索",
    boomCoords: [[23.995, 121.610], [23.970, 121.635]]
  }
];

// 地圖底圖圖層設定
const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri &mdash; Source: USGS, NOAA',
  maxZoom: 18
});

const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Labels &copy; Esri',
  maxZoom: 18
});

const satelliteGroup = L.layerGroup([esriImagery, esriLabels]);

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
});

// 全域狀態管理
let map = null;
let currentMarker = null;
let spillLayerGroup = null;
let trajectoryLayerGroup = null;
let portLayersGroup = null;
let depotsLayerGroup = null;
let boomLayerGroup = null;

let simulationSteps = [];
let isPlaying = false;
let timer = null;
let selectedCoords = null;
let currentWindInfo = null;
let currentOilInfo = null;
let currentSpeedMultiplier = 1.0;
const speedOptions = [1.0, 2.0, 4.0];
let currentStepIndex = 0;
let currentRenderStyle = 'realistic'; // 'realistic' | 'thermal'
let isBoomDeployed = false;
let isSoundEnabled = true;


// 這裡可以拿掉
// Web Audio API 警報音效合成器 (免除外部音訊載入問題)
let audioCtx = null;
function playSoundAlert(type = 'beep') {
  if (!isSoundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'alarm') {
      // 警報高頻提示音
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'boom') {
      // 攔油索佈署防禦短音
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } else {
      // 一般提示音
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    }
  } catch (e) {
    console.log("Audio not allowed yet", e);
  }
}
// 改


// 初始化地圖
function initMap() {
  map = L.map('map', {
    center: [23.7, 120.7],
    zoom: 8,
    layers: [satelliteGroup],
    zoomControl: false
  });

  L.control.zoom({ position: 'topleft' }).addTo(map);

  // 海事比例尺 (海里與公里)
  L.control.scale({
    imperial: false,
    metric: true,
    position: 'bottomleft'
  }).addTo(map);

  spillLayerGroup = L.layerGroup().addTo(map);
  trajectoryLayerGroup = L.layerGroup().addTo(map);
  portLayersGroup = L.layerGroup().addTo(map);
  depotsLayerGroup = L.layerGroup().addTo(map);
  boomLayerGroup = L.layerGroup().addTo(map);

  // 初始化各靜態圖層
  renderPortLayers();
  renderDepotLayers();

  // 地圖點擊：選定油污事故點
  map.on('click', (e) => {
    handleMapClick(e.latlng);
  });
}

// 渲染重點港口與海岸防線標記及警戒圈
function renderPortLayers() {
  portLayersGroup.clearLayers();

  keyCoastlines.forEach(port => {
    const color = port.esi >= 9 ? '#ef4444' : (port.esi >= 7 ? '#f59e0b' : '#38bdf8');

    const portMarker = L.circleMarker([port.lat, port.lng], {
      radius: 6.5,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    }).bindPopup(`
      <div style="font-size:0.84rem; line-height:1.5;">
        <b style="color:${color}; font-size:0.95rem;">⚓ ${port.name}</b><br>
        海岸型態：<b>${port.type}</b><br>
        生態敏感度：<span style="color:${color}; font-weight:bold;">ESI 等級 ${port.esi} / 10</span><br>
        警戒半徑：<b>${port.radiusKm} km</b><br>
        <div style="margin-top:6px; padding:6px; background:rgba(255,255,255,0.08); border-radius:4px; font-size:0.76rem;">
          🛡️ <b>攔油索應變建議：</b><br>${port.boomAdvice}
        </div>
      </div>
    `);

    const alertCircle = L.circle([port.lat, port.lng], {
      radius: port.radiusKm * 1000,
      color: color,
      weight: 1.2,
      dashArray: '4, 6',
      fillColor: color,
      fillOpacity: 0.05,
      interactive: false
    });

    portLayersGroup.addLayer(alertCircle);
    portLayersGroup.addLayer(portMarker);
  });
}

// 渲染海保署應變資材基地與待命船隊圖層
function renderDepotLayers() {
  depotsLayerGroup.clearLayers();

  RESPONSE_DEPOTS.forEach(depot => {
    const depotIcon = L.divIcon({
      className: 'depot-div-icon',
      html: `
        <div style="background:#0284c7; color:#fff; border:2px solid #38bdf8; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 0 10px rgba(56,189,248,0.6);">
          🏪
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([depot.lat, depot.lng], { icon: depotIcon });
    
    marker.on('click', () => {
      let etaHtml = "<i>(請設定事故起點以計算救難船隊航程與 ETA)</i>";
      if (selectedCoords) {
        const distKm = calculateDistanceKm(depot.lat, depot.lng, selectedCoords.lat, selectedCoords.lng);
        const eta = calculateVesselETA(distKm);
        etaHtml = `
          <div style="margin-top:6px; padding:6px; background:rgba(0,242,254,0.15); border:1px solid #00f2fe; border-radius:4px; font-size:0.76rem; color:#e0f2fe;">
            🚀 <b>應變船隊馳援估算 (航速 15 節)：</b><br>
            航行距離：<b>${eta.nauticalMiles} 海里</b> (${distKm.toFixed(1)} km)<br>
            預估抵達時間 (ETA)：<b style="color:#00f2fe;">${eta.timeText}</b>
          </div>
        `;
      }

      marker.bindPopup(`
        <div style="font-size:0.83rem; line-height:1.5;">
          <b style="color:#38bdf8; font-size:0.95rem;">🏪 ${depot.name}</b><br>
          主管所屬：<b>${depot.agency}</b><br>
          攔油索存量：<b>${depot.booms}</b><br>
          吸油棉庫存：<b>${depot.absorbents}</b><br>
          待命船隊：<b>${depot.skimmers}</b><br>
          24H 戰情電話：<code>${depot.phone}</code>
          ${etaHtml}
        </div>
      `).openPopup();
    });

    depotsLayerGroup.addLayer(marker);
  });
}

// 點擊地圖處理 (包含陸地防呆)
function handleMapClick(latlng) {
  const isLand = isPointOnLand(latlng.lat, latlng.lng);

  if (isLand) {
    showToast("⚠️ 點選位置位於台灣陸地上，請點擊周邊海域設定海上事故源！");
    playSoundAlert('alarm');
    return;
  }

  hideToast();
  playSoundAlert('beep');
  setIncidentLocation(latlng.lat, latlng.lng);
}

// 收合 / 展開左側控制面板
function collapseSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (!sidebar || sidebar.classList.contains('collapsed')) return;
  sidebar.classList.add('collapsed');
  if (toggleBtn) toggleBtn.style.display = 'flex';
  setTimeout(() => map.invalidateSize(), 320);
}

function expandSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (!sidebar) return;
  sidebar.classList.remove('collapsed');
  if (toggleBtn) toggleBtn.style.display = 'none';
  setTimeout(() => map.invalidateSize(), 320);
}

// 地圖上的浮動報告面板 (海岸衝擊與應變處置報告)
function showReportPanel() {
  document.getElementById('report-panel')?.classList.remove('hidden');
  document.getElementById('map-container')?.classList.add('report-open');
}

function hideReportPanel() {
  document.getElementById('report-panel')?.classList.add('hidden');
  document.getElementById('map-container')?.classList.remove('report-open');
}

// state: 'idle' | 'loading' | 'ready' | 'error' (只有 ready 才顯示匯出按鈕)
function setReportState(state) {
  const panel = document.getElementById('report-panel');
  if (panel) panel.dataset.state = state;
  const toggleBtn = document.getElementById('btn-toggle-report');
  if (toggleBtn) toggleBtn.disabled = (state === 'idle');
}

// 設定事故地點並啟動模擬
function setIncidentLocation(lat, lng, locationName = "") {
  selectedCoords = { lat, lng };

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

  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lng], { icon: pulseIcon }).addTo(map)
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

  // 選定情境 / 事故點後收起側邊欄，讓出整個地圖畫面
  collapseSidebar();
  triggerSimulation({ autoShowReport: true });
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
  const renderStyleSelect = document.getElementById('render-style-select');
  const togglePortsCb = document.getElementById('toggle-coastlines-cb');
  const toggleDepotsCb = document.getElementById('toggle-depots-cb');
  const toggleBoomCb = document.getElementById('toggle-boom-cb');
  const clearBtn = document.getElementById('clear-btn');

  // 底圖切換
  baseMapSelect?.addEventListener('change', (e) => {
    map.removeLayer(satelliteGroup);
    map.removeLayer(osmLayer);

    if (e.target.value === 'satellite') {
      map.addLayer(satelliteGroup);
    } else {
      map.addLayer(osmLayer);
    }
  });

  // 模式切換
  modeSelect?.addEventListener('change', () => {
    if (selectedCoords) triggerSimulation();
  });

  // 油品種類切換
  oilSelect?.addEventListener('change', () => {
    if (selectedCoords) triggerSimulation();
  });


  // 拿掉
  // 遙測可視化風格切換 (擬真 vs 遙測熱區)
  renderStyleSelect?.addEventListener('change', (e) => {
    currentRenderStyle = e.target.value;
    updateLegendVisuals();
    if (simulationSteps.length) {
      renderStep(currentStepIndex);
    }
  });
  // 改


  // 切換港口防線顯示
  togglePortsCb?.addEventListener('change', (e) => {
    if (e.target.checked) {
      map.addLayer(portLayersGroup);
    } else {
      map.removeLayer(portLayersGroup);
    }
  });

  // 切換資材基地顯示
  toggleDepotsCb?.addEventListener('change', (e) => {
    if (e.target.checked) {
      map.addLayer(depotsLayerGroup);
    } else {
      map.removeLayer(depotsLayerGroup);
    }
  });

  // 戰術攔油索防禦開關
  toggleBoomCb?.addEventListener('change', (e) => {
    setBoomDeploymentState(e.target.checked);
  });

  document.getElementById('btn-quick-boom')?.addEventListener('click', () => {
    const cb = document.getElementById('toggle-boom-cb');
    cb.checked = !cb.checked;
    setBoomDeploymentState(cb.checked);
  });


  // 拿掉
  // 音效切換
  document.getElementById('btn-toggle-sound')?.addEventListener('click', (e) => {
    isSoundEnabled = !isSoundEnabled;
    e.target.innerText = isSoundEnabled ? '🔊' : '🔇';
    showToast(isSoundEnabled ? '🔊 警報音效已開啟' : '🔇 警報音效已靜音');
  });
  // 改

  // 模擬時數 Slider
  hoursSlider?.addEventListener('input', (e) => {
    hoursVal.innerText = e.target.value;
    if (selectedCoords) triggerSimulation();
  });

  // 風速 Slider
  windSlider?.addEventListener('input', (e) => {
    const levelIndex = parseInt(e.target.value) - 1;
    windVal.innerText = WIND_LABELS[levelIndex] || WIND_LABELS[1];
    if (selectedCoords) triggerSimulation();
  });

  // 時間軸 Slider 互動
  let wasPlayingBeforeDrag = false;
  timeSlider?.addEventListener('mousedown', () => {
    if (isPlaying) {
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

  // 播放器控制按鈕
  playBtn?.addEventListener('click', togglePlayback);

  document.getElementById('btn-step-start')?.addEventListener('click', () => {
    stopAnimation();
    renderStep(0);
  });

  document.getElementById('btn-step-prev')?.addEventListener('click', () => {
    stopAnimation();
    stepDelta(-1);
  });

  document.getElementById('btn-step-next')?.addEventListener('click', () => {
    stopAnimation();
    stepDelta(1);
  });

  // 播放倍速切換
  const speedBtn = document.getElementById('btn-speed');
  speedBtn?.addEventListener('click', () => {
    const nextIdx = (speedOptions.indexOf(currentSpeedMultiplier) + 1) % speedOptions.length;
    currentSpeedMultiplier = speedOptions[nextIdx];
    speedBtn.innerText = `${currentSpeedMultiplier.toFixed(1)}x`;
    if (isPlaying) {
      stopAnimation();
      startAnimation();
    }
  });

  // 演練情境下拉選單 (常見演練 / 歷史重大海難)
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

    // 選取任一選項後：更新按鈕文字並收合選單 (實際模擬邏輯由下方各按鈕處理)
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

  // 點選選單外部或按 Esc 收合
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#scenario-dropdown-bar')) closeScenarioDropdowns();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeScenarioDropdowns();
  });

  // 「清空重設」時還原下拉按鈕文字
  clearBtn?.addEventListener('click', resetScenarioLabels);

  // 典型情境按鈕 (快速演練)
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const name = btn.dataset.name;
      setIncidentLocation(lat, lng, name);
    });
  });

  // 歷史海難事件卡片點擊
  document.querySelectorAll('.history-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const histId = btn.dataset.histId;
      const hist = HISTORICAL_INCIDENTS.find(h => h.id === histId);
      if (hist) {
        // 同步 UI 參數
        document.getElementById('oil-select').value = hist.oilType;
        document.getElementById('hours-slider').value = hist.hours;
        document.getElementById('hours-val').innerText = hist.hours;
        document.getElementById('wind-slider').value = hist.windLevel;
        document.getElementById('wind-val').innerText = WIND_LABELS[hist.windLevel - 1];

        showToast(`🏛️ 載入歷史海難：${hist.name}`);
        setIncidentLocation(hist.lat, hist.lng, hist.name);
      }
    });
  });

  // 下載標準 GeoJSON
  document.getElementById('btn-download-geojson')?.addEventListener('click', downloadGeoJSONFile);

  // 清除按鈕
  clearBtn?.addEventListener('click', resetSimulation);

  // 地圖工具按鈕
  document.getElementById('btn-reset-view')?.addEventListener('click', () => {
    map.flyTo([23.7, 120.7], 8, { duration: 0.8 });
  });

  document.getElementById('btn-focus-spill')?.addEventListener('click', () => {
    if (simulationSteps[currentStepIndex]) {
      const center = simulationSteps[currentStepIndex].center;
      map.flyTo(center, 11, { duration: 0.8 });
    }
  });

  // 全螢幕切換
  document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen().catch(err => console.log(err));
    }
  });

  // 側邊欄折疊 / 展開
  const sidebar = document.getElementById('sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');

  btnCollapseSidebar?.addEventListener('click', collapseSidebar);
  btnToggleSidebar?.addEventListener('click', expandSidebar);

  // 報告面板：關閉鈕與工具列開關
  document.getElementById('btn-close-report-panel')?.addEventListener('click', hideReportPanel);
  document.getElementById('btn-toggle-report')?.addEventListener('click', () => {
    const panel = document.getElementById('report-panel');
    if (panel.classList.contains('hidden')) {
      showReportPanel();
    } else {
      hideReportPanel();
    }
  });

  // 圖例開關
  const legendEl = document.getElementById('map-legend');
  document.getElementById('btn-toggle-legend')?.addEventListener('click', () => {
    legendEl.classList.toggle('hidden');
  });
  document.getElementById('btn-close-legend')?.addEventListener('click', () => {
    legendEl.classList.add('hidden');
  });

  // 彈跳視窗事件綁定
  initModals();

  // 鍵盤快捷鍵支援
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
    map.invalidateSize();
  });
}

// 設置戰術攔油索狀態
function setBoomDeploymentState(enabled) {
  isBoomDeployed = enabled;
  const statusBox = document.getElementById('boom-status-box');
  const legendItemBoom = document.getElementById('legend-item-boom');

  if (isBoomDeployed) {
    statusBox.classList.add('active');
    statusBox.innerHTML = `🛡️ 港口攔油索防禦網：<b>防禦佈署中 (攔截效率 85%)</b>`;
    if (legendItemBoom) legendItemBoom.style.display = 'flex';
    showToast("🛡️ 港口緊急戰術攔油索已佈設就位！");
    playSoundAlert('boom');
    drawBoomBarriers();
  } else {
    statusBox.classList.remove('active');
    statusBox.innerHTML = `🛡️ 港口攔油索防禦網：<b>未啟動</b>`;
    if (legendItemBoom) legendItemBoom.style.display = 'none';
    boomLayerGroup.clearLayers();
  }
}

// 繪製戰術攔油索阻絕線
function drawBoomBarriers() {
  boomLayerGroup.clearLayers();

  // 尋找離事故起點或目前位置最近的港口防線佈放
  keyCoastlines.forEach(port => {
    if (port.boomCoords) {
      const boomLine = L.polyline(port.boomCoords, {
        color: '#f97316',
        weight: 5,
        dashArray: '6, 8',
        opacity: 0.95
      }).bindPopup(`
        <b>🛡️ 戰術緊急攔油索</b><br>
        守護港口：<b>${port.name}</b><br>
        佈設規格：抗浪充氣型重防護攔油索<br>
        防護成效：預估阻截 85% 表面油污侵入
      `);

      // 攔油索浮筒標記
      const p1 = port.boomCoords[0];
      const p2 = port.boomCoords[1];
      const buoyIcon = L.divIcon({
        className: 'buoy-icon',
        html: `<div style="width:10px; height:10px; border-radius:50%; background:#f97316; border:2px solid #fff; box-shadow:0 0 6px #f97316;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      });

      const b1 = L.marker(p1, { icon: buoyIcon });
      const b2 = L.marker(p2, { icon: buoyIcon });

      boomLayerGroup.addLayer(boomLine);
      boomLayerGroup.addLayer(b1);
      boomLayerGroup.addLayer(b2);
    }
  });
}

// 動態更新圖例色卡 (擬真 vs 遙測)
function updateLegendVisuals() {
  const coreBox = document.getElementById('legend-core-box');
  const sheenBox = document.getElementById('legend-sheen-box');
  const oilProf = currentOilInfo || OIL_PROFILES.crude;

  if (currentRenderStyle === 'thermal') {
    if (coreBox) coreBox.style.background = oilProf.thermalCore || '#ef4444';
    if (sheenBox) sheenBox.style.background = oilProf.thermalSheen || '#38bdf8';
  } else {
    if (coreBox) coreBox.style.background = oilProf.coreColor || '#7f1d1d';
    if (sheenBox) sheenBox.style.background = oilProf.sheenColor || '#f97316';
  }
}

// 下載標準 GeoJSON 向量檔案
function downloadGeoJSONFile() {
  if (!simulationSteps.length) {
    showToast("⚠️ 請先進行模擬後再匯出 GeoJSON 資料！");
    return;
  }

  const features = [];

  // 1. 事故源點
  if (selectedCoords) {
    features.push({
      type: "Feature",
      properties: {
        eventType: "IncidentOrigin",
        description: "海上油污洩漏起點",
        timestamp: "T+00:00"
      },
      geometry: {
        type: "Point",
        coordinates: [Number(selectedCoords.lng.toFixed(6)), Number(selectedCoords.lat.toFixed(6))]
      }
    });
  }

  // 2. 漂移航跡線
  features.push({
    type: "Feature",
    properties: {
      eventType: "DriftTrajectory",
      totalHours: simulationSteps.length - 1
    },
    geometry: {
      type: "LineString",
      coordinates: simulationSteps.map(s => [s.center[1], s.center[0]])
    }
  });

  // 3. 各小時擴散多邊形
  simulationSteps.forEach(s => {
    if (s.geojson && s.geojson.features) {
      s.geojson.features.forEach(f => {
        features.push({
          type: "Feature",
          properties: {
            hourIndex: s.hourIndex,
            timeLabel: s.timeLabel,
            areaKm2: s.areaKm2,
            driftDistanceKm: s.driftDistanceKm,
            beached: s.beached,
            layerType: f.properties?.layerType,
            weathering: s.weathering
          },
          geometry: f.geometry
        });
      });
    }
  });

  const geojson = {
    type: "FeatureCollection",
    metadata: {
      title: "Taiwan Coastal Oil Spill Simulation GeoJSON",
      generator: "Taiwan Marine Oil Spill Early Warning System",
      oilType: currentOilInfo?.name,
      exportTime: new Date().toISOString()
    },
    features
  };

  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oil-spill-simulation-${Date.now()}.geojson`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("💾 已成功下載標準 GIS GeoJSON 航跡資料！");
}

// 初始化彈跳視窗 (坐標輸入 & 通報單)
function initModals() {
  // 1. 坐標輸入彈窗
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

  // 快速晶片點選
  document.querySelectorAll('.chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('input-lat').value = chip.dataset.lat;
      document.getElementById('input-lng').value = chip.dataset.lng;
    });
  });

  // 提交手動坐標
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

  // 2. 應變通報單彈窗
  const modalReport = document.getElementById('modal-report');
  document.getElementById('btn-open-report-modal')?.addEventListener('click', () => {
    generateIncidentReportText();
    modalReport.classList.remove('hidden');
  });
  document.getElementById('btn-close-report-modal')?.addEventListener('click', () => {
    modalReport.classList.add('hidden');
  });

  // 複製通報單
  document.getElementById('btn-copy-report')?.addEventListener('click', () => {
    const text = document.getElementById('report-text-container').innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast("✅ 已成功複製通報單全文至剪貼簿！");
    });
  });

  // 列印通報單
  document.getElementById('btn-print-report')?.addEventListener('click', () => {
    window.print();
  });
}

// 步進微調
function stepDelta(delta) {
  if (!simulationSteps.length) return;
  const slider = document.getElementById('time-slider');
  let target = parseInt(slider.value) + delta;
  if (target < 0) target = 0;
  if (target >= simulationSteps.length) target = simulationSteps.length - 1;
  renderStep(target);
}

// 觸發模擬計算
async function triggerSimulation(options = {}) {
  if (!selectedCoords) return;
  const { autoShowReport = false } = options;

  const mode = document.getElementById('mode-select').value;
  const oilType = document.getElementById('oil-select').value;
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
    const result = await fetchSpillSimulation(mode, selectedCoords, hours, windLevel, oilType);
    
    simulationSteps = Array.isArray(result) ? result : (result.timeSteps || []);
    currentWindInfo = result.windInfo || null;
    currentOilInfo = result.oilInfo || OIL_PROFILES[oilType] || OIL_PROFILES.crude;

    drawTrajectoryPath();
    updateOceanCompassHUD();
    updateLegendVisuals();
    renderTrendChart();
    initTimeline();
    updateSystemStatus("模擬就緒", "ready");

    if (isBoomDeployed) {
      drawBoomBarriers();
    }

    // 報告已由 initTimeline() 產生；新事故模擬完成時自動彈出，調整參數重算時維持使用者目前的開關狀態
    setReportState('ready');
    if (autoShowReport) showReportPanel();
  } catch (error) {
    console.error(error);
    updateSystemStatus("API 連線失敗", "error");
    setReportState('error');
    showReportPanel(); // 錯誤訊息含「一鍵切換」按鈕，必須讓使用者看到
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

// 更新頂部系統狀態指示
function updateSystemStatus(text, state) {
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

// 繪製中心漂移路徑航跡線
function drawTrajectoryPath() {
  trajectoryLayerGroup.clearLayers();
  if (simulationSteps.length < 2) return;

  const latlngs = simulationSteps.map(step => step.center);

  const polyline = L.polyline(latlngs, {
    color: '#38bdf8',
    weight: 2.5,
    dashArray: '5, 8',
    opacity: 0.85
  });
  trajectoryLayerGroup.addLayer(polyline);

  const endStep = simulationSteps[simulationSteps.length - 1];
  const endDot = L.circleMarker(endStep.center, {
    radius: 4,
    color: '#00f2fe',
    fillColor: '#00f2fe',
    fillOpacity: 1
  }).bindPopup(`<b>預測漂移終點</b><br>時間：${endStep.timeLabel}<br>距離：${endStep.driftDistanceKm ? endStep.driftDistanceKm.toFixed(1) + ' km' : '--'}`);

  trajectoryLayerGroup.addLayer(endDot);
}

// 更新海洋羅盤 HUD (風向與合成漂移航向)
function updateOceanCompassHUD() {
  if (!currentWindInfo) return;

  const windDeg = Number(currentWindInfo.direction) || 45;
  const windSpeed = Number(currentWindInfo.speed) || 5.0;

  const arrowWind = document.getElementById('hud-arrow-wind');
  if (arrowWind) arrowWind.style.transform = `rotate(${windDeg}deg)`;

  const driftHeading = (windDeg + 180 + 20) % 360;
  const arrowDrift = document.getElementById('hud-arrow-drift');
  if (arrowDrift) arrowDrift.style.transform = `rotate(${driftHeading.toFixed(0)}deg)`;

  const driftKnots = (windSpeed * 0.03 * 1.944 + 0.35).toFixed(2);

  document.getElementById('hud-wind-text').innerHTML = `風向: <b>${windDeg.toFixed(0)}°</b> (${currentWindInfo.directionText || '東北風'}) <b>${windSpeed.toFixed(1)} m/s</b>`;
  document.getElementById('hud-drift-text').innerHTML = `航向: <b>${driftHeading.toFixed(0)}°</b> ｜ 漂速: <b>${driftKnots} 節</b>`;
}

// 繪製 24H 擴散成長微圖 (SVG Sparkline)
function renderTrendChart() {
  const container = document.getElementById('trend-chart-container');
  if (!simulationSteps.length || !container) return;

  const w = container.clientWidth || 380;
  const h = container.clientHeight || 90;
  const pad = { top: 12, right: 15, bottom: 18, left: 35 };

  const maxArea = Math.max(...simulationSteps.map(s => s.areaKm2 || 1), 10);
  const n = simulationSteps.length - 1;

  const points = simulationSteps.map((step, idx) => {
    const x = pad.left + (idx / n) * (w - pad.left - pad.right);
    const y = pad.top + (1 - (step.areaKm2 || 0) / maxArea) * (h - pad.top - pad.bottom);
    return { x, y, idx, step };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(h - pad.bottom)} L ${points[0].x.toFixed(1)} ${(h - pad.bottom)} Z`;

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

      <line id="chart-indicator-line" x1="${points[currentStepIndex]?.x || pad.left}" y1="${pad.top}" x2="${points[currentStepIndex]?.x || pad.left}" y2="${h - pad.bottom}" class="chart-curr-indicator" />
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

// 初始化時間軸與播放器按鈕狀態
function initTimeline() {
  const slider = document.getElementById('time-slider');
  const playBtn = document.getElementById('play-btn');
  const btnStart = document.getElementById('btn-step-start');
  const btnPrev = document.getElementById('btn-step-prev');
  const btnNext = document.getElementById('btn-step-next');

  slider.max = simulationSteps.length - 1;
  slider.value = 0;
  slider.disabled = false;

  playBtn.disabled = false;
  btnStart.disabled = false;
  btnPrev.disabled = false;
  btnNext.disabled = false;

  renderStep(0);
  generateCoastlineAlerts();
}

// 渲染特定影格圖層與指標數據
function renderStep(index) {
  const step = simulationSteps[index];
  if (!step) return;

  currentStepIndex = index;
  spillLayerGroup.clearLayers();

  // 渲染雙層 GeoJSON (依擬真 vs 遙測風格渲染)
  if (step.geojson) {
    const geoLayer = L.geoJSON(step.geojson, {
      style: (feature) => {
        const layerType = feature?.properties?.layerType;
        const oilProf = currentOilInfo || OIL_PROFILES.crude;

        if (currentRenderStyle === 'thermal') {
          // SAR / 光學厚度假色光譜模式
          if (layerType === 'core') {
            return {
              color: oilProf.thermalCore || '#ef4444',
              weight: 2,
              fillColor: oilProf.thermalCore || '#dc2626',
              fillOpacity: 0.92
            };
          } else {
            return {
              color: oilProf.thermalSheen || '#38bdf8',
              weight: 1.5,
              fillColor: oilProf.thermalSheen || '#06b6d4',
              fillOpacity: 0.5
            };
          }
        } else {
          // 擬真自然海面油膜模式
          if (layerType === 'core') {
            return {
              color: oilProf.coreColor || '#7f1d1d',
              weight: 2,
              fillColor: oilProf.coreColor || '#991b1b',
              fillOpacity: 0.88
            };
          } else {
            return {
              color: oilProf.sheenColor || '#ea580c',
              weight: 1.5,
              fillColor: oilProf.sheenColor || '#f97316',
              fillOpacity: 0.45
            };
          }
        }
      }
    });
    spillLayerGroup.addLayer(geoLayer);
  }

  // 更新時間軸 UI
  document.getElementById('time-display').innerText = step.timeLabel;
  document.getElementById('time-slider').value = index;

  // 更新圖表指示線
  updateChartIndicator(index);

  // 更新即時情資卡片與風化質量平衡
  updateMetrics(step);

  // 若觸及陸地且剛發生擱淺，發出警報音
  if (step.beached && !isPlaying) {
    playSoundAlert('alarm');
  }
}

// 更新趨勢圖上的垂直指示線位置
function updateChartIndicator(idx) {
  const line = document.getElementById('chart-indicator-line');
  const container = document.getElementById('trend-chart-container');
  if (!line || !container || !simulationSteps.length) return;

  const w = container.clientWidth || 380;
  const pad = { left: 35, right: 15 };
  const n = simulationSteps.length - 1;
  const x = pad.left + (idx / n) * (w - pad.left - pad.right);

  line.setAttribute('x1', x.toFixed(1));
  line.setAttribute('x2', x.toFixed(1));
}

// 更新即時監控卡片數值與風化進度條
function updateMetrics(step) {
  const areaEl = document.getElementById('metric-area');
  const distEl = document.getElementById('metric-distance');
  const threatEl = document.getElementById('metric-threat');
  const beachedEl = document.getElementById('metric-beached');

  if (step.areaKm2 !== undefined) {
    areaEl.innerHTML = `${step.areaKm2.toFixed(1)} <small>km²</small>`;
  } else {
    areaEl.innerHTML = `-- <small>km²</small>`;
  }

  if (step.driftDistanceKm !== undefined) {
    distEl.innerHTML = `${step.driftDistanceKm.toFixed(1)} <small>km</small>`;
  } else {
    distEl.innerHTML = `-- <small>km</small>`;
  }

  // 擱淺狀態
  if (step.beached) {
    beachedEl.innerHTML = `<span style="color:#ef4444; font-weight:bold;">🚨 沿岸擱淺受災</span>`;
  } else {
    beachedEl.innerHTML = `海面漂流中`;
  }

  // 威脅等級評估
  if (step.beached) {
    threatEl.className = 'threat-badge threat-danger';
    threatEl.innerText = '🔴 嚴重海岸衝擊';
  } else {
    let minPortDist = Infinity;
    keyCoastlines.forEach(port => {
      const d = calculateDistanceKm(step.center[0], step.center[1], port.lat, port.lng);
      if (d < minPortDist) minPortDist = d;
    });

    if (minPortDist <= 15) {
      threatEl.className = 'threat-badge threat-warning';
      threatEl.innerText = isBoomDeployed ? '🛡️ 港口防禦防護中' : '🟡 港口警戒緩衝圈';
    } else {
      threatEl.className = 'threat-badge threat-normal';
      threatEl.innerText = '🟢 外海安全擴散';
    }
  }

  // 風化質量平衡 (Mass Balance)
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

// 播放控制引擎
function togglePlayback() {
  if (isPlaying) {
    stopAnimation();
  } else {
    startAnimation();
  }
}

function startAnimation() {
  if (!simulationSteps.length) return;
  isPlaying = true;
  document.getElementById('play-btn').innerText = '⏸';

  const baseIntervalMs = 450;
  const currentInterval = Math.max(100, baseIntervalMs / currentSpeedMultiplier);

  timer = setInterval(() => {
    const slider = document.getElementById('time-slider');
    let nextIndex = parseInt(slider.value) + 1;
    if (nextIndex >= simulationSteps.length) {
      nextIndex = 0;
    }
    renderStep(nextIndex);
  }, currentInterval);
}

function stopAnimation() {
  isPlaying = false;
  document.getElementById('play-btn').innerText = '▶';
  if (timer) clearInterval(timer);
}

// 產生海岸預警與港口衝擊報告
function generateCoastlineAlerts() {
  const alertBox = document.getElementById('alert-box');
  alertBox.innerHTML = '';

  // 1. 氣象署即時海象風場卡片
  if (currentWindInfo) {
    const windDiv = document.createElement('div');
    windDiv.className = 'alert-item alert-info';
    windDiv.innerHTML = `
      💨 <b>${currentWindInfo.source || '氣象署即時觀測風場'}</b><br>
      觀測測站：<b>${currentWindInfo.station}</b><br>
      實測風速：<b>${Number(currentWindInfo.speed).toFixed(1)} m/s</b> ｜ 風向：<b>${currentWindInfo.directionText || currentWindInfo.direction + '°'}</b><br>
      油種特性：<b>${currentOilInfo?.name || '重質原油'}</b> (黏度: ${currentOilInfo?.viscosity || '高'})
    `;
    alertBox.appendChild(windDiv);
  }

  // 2. 檢測是否有觸及陸地/擱淺
  const beachedStep = simulationSteps.find(step => step.beached);
  if (beachedStep) {
    const beachAlert = document.createElement('div');
    beachAlert.className = 'alert-item alert-danger';
    beachAlert.innerHTML = `
      🚨 <b>海岸擱淺警報！</b><br>
      油污預計於 <b>${beachedStep.timeLabel}</b> (第 ${beachedStep.hourIndex} 小時) 抵達台灣海岸線並發生擱淺受害！
    `;
    alertBox.appendChild(beachAlert);
  }

  // 3. 重點港口海岸防線碰撞預警
  let impactedCoasts = [];

  simulationSteps.forEach(step => {
    const [cLat, cLng] = step.center;
    keyCoastlines.forEach(coast => {
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
        ${isBoomDeployed ? `<div style="color:#34d399; font-weight:bold; margin-top:4px;">🛡️ 港口攔油索防禦網已建立：攔截效率 85%！</div>` : ''}
        <div class="boom-advice-box">
          🛡️ <b>應變對策：</b>${coast.boomAdvice}
        </div>
      `;
      alertBox.appendChild(dangerDiv);
    });
  }
}

// 產生正式事故應變通報單 (公文格式)
function generateIncidentReportText() {
  const container = document.getElementById('report-text-container');
  if (!container) return;

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  
  const lat = selectedCoords ? selectedCoords.lat.toFixed(4) : "未設定";
  const lng = selectedCoords ? selectedCoords.lng.toFixed(4) : "未設定";
  const oilName = currentOilInfo?.name || "重質原油 (Heavy Crude)";
  const maxArea = simulationSteps.length ? Math.max(...simulationSteps.map(s => s.areaKm2 || 0)).toFixed(1) : "--";
  const maxDist = simulationSteps.length ? Math.max(...simulationSteps.map(s => s.driftDistanceKm || 0)).toFixed(1) : "--";
  
  const beachedStep = simulationSteps.find(s => s.beached);
  const beachedText = beachedStep ? `預計於 ${beachedStep.timeLabel} 抵達台灣海岸線擱淺` : "預測期內無直接擱淺觸陸危險";

  let alertListText = "無重大港口進入預警";
  const impacted = [];
  simulationSteps.forEach(step => {
    keyCoastlines.forEach(c => {
      const d = calculateDistanceKm(step.center[0], step.center[1], c.lat, c.lng);
      if (d <= c.radiusKm && !impacted.some(x => x.name === c.name)) {
        impacted.push({ name: c.name, time: step.timeLabel, esi: c.esi, advice: c.boomAdvice });
      }
    });
  });

  if (impacted.length > 0) {
    alertListText = impacted.map((item, idx) => 
      `  [${idx+1}] ${item.name} (ESI敏感度: ${item.esi}/10)\n      預計抵達：${item.time}\n      建議處置：${item.advice}`
    ).join("\n\n");
  }

  const report = `======================================================================
🌊 台灣海域油污擴散緊急應變處置通報單 (Official Incident Briefing)
======================================================================
通報時間戳記：${timeStr}
系統檔案編號：TW-MARPOL-${Date.now().toString().slice(-8)}
通報主管機關：海洋委員會海洋保育署 / 交通部航港局應變指揮中心

【一、 事故源基本資料】
• 事故地理坐標：緯度 ${lat}°N，經度 ${lng}°E (WGS84)
• 洩漏油品類別：${oilName}
• 油品物理特性：黏度 ${currentOilInfo?.viscosity || '高'} ｜ 比重 ${currentOilInfo?.density || '0.89 g/cm³'}
• 數值預測時長：${simulationSteps.length - 1} 小時

【二、 即時環境海象場 (氣象署測站)】
• 觀測參考測站：${currentWindInfo?.station || '台灣海峽觀測浮標'}
• 實測風向風速：${currentWindInfo?.directionText || '東北風'} ｜ 風速 ${Number(currentWindInfo?.speed || 5).toFixed(1)} m/s
• 背景洋流分量：黑潮支流 / 沿岸流向東北 (流速約 0.35 m/s)

【三、 擴散衝擊與受災範圍預測】
• 預估最大影響面積：${maxArea} 平方公里 (km²)
• 最大預測漂移距離：${maxDist} 公里 (km)
• 海岸擱淺觸陸判別：${beachedText}

【四、 重點防線威脅與生態敏感區 (ESI) 預警】
${alertListText}

【五、 現場應變指揮處置建議 (Countermeasures)】
• 攔油索佈設狀態：${isBoomDeployed ? '🛡️ 戰術攔油索防禦網已實境佈設就位 (預估攔截效率 85%)' : currentOilInfo?.boomRecommendation || '標準充氣式防波堤攔油索'}
• 化學除油劑使用：${currentOilInfo?.dispersantAllowed ? '✅ 水深 > 20m 且離岸 > 3 海浬時經海保署同意可酌量施灑；接近珊瑚礁/養殖區嚴禁使用' : '❌ 嚴禁施灑化學除油劑 (易加劇水體毒性或油品黏度過高無法乳化)'}
• 應變資材動員能量：調派所屬責任海巡艇與港勤汲油船進駐待命。
======================================================================`;

  container.innerText = report;
}

// 重設所有模擬狀態
function resetSimulation() {
  stopAnimation();
  selectedCoords = null;
  simulationSteps = [];
  currentStepIndex = 0;

  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
  spillLayerGroup.clearLayers();
  trajectoryLayerGroup.clearLayers();
  boomLayerGroup.clearLayers();

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

// 提示 Toast
let toastTimer = null;
function showToast(msg) {
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

function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) toast.classList.add('hidden');
  if (toastTimer) clearTimeout(toastTimer);
}

// DOM 加載完成後統一初始化
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initEvents();
});
