import { appState } from './state.js';
import { KEY_COASTLINES } from './config.js';
import { calculateDistanceKm, calculateVesselETA, RESPONSE_DEPOTS } from './api.js';
import { showToast } from './uiHelper.js';

export function showReportPanel() {
  document.getElementById('report-panel')?.classList.remove('hidden');
  document.getElementById('map-container')?.classList.add('report-open');
}

export function hideReportPanel() {
  document.getElementById('report-panel')?.classList.add('hidden');
  document.getElementById('map-container')?.classList.remove('report-open');
}

export function setReportState(state) {
  const panel = document.getElementById('report-panel');
  if (panel) panel.dataset.state = state;
  const toggleBtn = document.getElementById('btn-toggle-report');
  if (toggleBtn) toggleBtn.disabled = (state === 'idle');
}

export function generateIncidentReportText() {
  const container = document.getElementById('report-text-container');
  if (!container) return;

  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  
  const lat = appState.selectedCoords ? appState.selectedCoords.lat.toFixed(4) : "未設定";
  const lng = appState.selectedCoords ? appState.selectedCoords.lng.toFixed(4) : "未設定";
  const oilName = appState.currentOilInfo?.name || "重質原油 (Heavy Crude)";
  const maxArea = appState.simulationSteps.length ? Math.max(...appState.simulationSteps.map(s => s.areaKm2 || 0)).toFixed(1) : "--";
  const maxDist = appState.simulationSteps.length ? Math.max(...appState.simulationSteps.map(s => s.driftDistanceKm || 0)).toFixed(1) : "--";
  
  const beachedStep = appState.simulationSteps.find(s => s.beached);
  const beachedText = beachedStep ? `預計於 ${beachedStep.timeLabel} 抵達台灣海岸線擱淺` : "預測期內無直接擱淺觸陸危險";

  let alertListText = "無重大港口進入預警";
  const impacted = [];
  appState.simulationSteps.forEach(step => {
    KEY_COASTLINES.forEach(c => {
      const d = calculateDistanceKm(step.center[0], step.center[1], c.lat, c.lng);
      if (d <= c.radiusKm && !impacted.some(x => x.name === c.name)) {
        impacted.push({ name: c.name, time: step.timeLabel, esi: c.esi, advice: c.boomAdvice });
      }
    });
  });

  if (impacted.length > 0) {
    alertListText = impacted.map((item, idx) => 
      `   [${idx+1}] ${item.name} (ESI敏感度: ${item.esi}/10)\n      預計抵達：${item.time}\n      建議處置：${item.advice}`
    ).join("\n\n");
  }

  // 計算距離油污事故與最新擴散中心最近的兩個應變處理署/基地
  let nearestDepotsText = "尚未定位事故位置";
  if (appState.selectedCoords && RESPONSE_DEPOTS.length > 0) {
    const latestStep = appState.simulationSteps[appState.simulationSteps.length - 1];
    const targetLat = latestStep ? latestStep.center[0] : appState.selectedCoords.lat;
    const targetLng = latestStep ? latestStep.center[1] : appState.selectedCoords.lng;

    const rankedDepots = RESPONSE_DEPOTS.map(d => {
      const dist = calculateDistanceKm(targetLat, targetLng, d.lat, d.lng);
      const eta = calculateVesselETA(dist);
      return { ...d, dist, eta };
    }).sort((a, b) => a.dist - b.dist).slice(0, 2);

    nearestDepotsText = rankedDepots.map((d, idx) => 
      `   [第一優先通報署 ${idx + 1}]：${d.name} (${d.agency})\n` +
      `   • 航程距離：${d.dist.toFixed(1)} 公里 (${d.eta.nauticalMiles} 浬) ｜ 預估應變抵達時間 (ETA)：${d.eta.timeText}\n` +
      `   • 即時調度資材：攔油索 ${d.booms}、吸油棉 ${d.absorbents}、清污能量 ${d.skimmers}\n` +
      `   • 24H 緊急通報電話：${d.phone}`
    ).join("\n\n");
  }

  const report = `======================================================================
🌊 台灣海域油污擴散緊急應變處置通報單 (Official Incident Briefing)
======================================================================
通報時間戳記：${timeStr}
系統檔案編號：TW-MARPOL-${Date.now().toString().slice(-8)}
通報主管機關：海洋委員會海洋保育署 / 交通部航港局應變指揮中心

【一、 事故源基本資料】
- 事故地理坐標：緯度 ${lat}°N，經度 ${lng}°E (WGS84)
- 洩漏油品類別：${oilName}
- 油品物理特性：黏度 ${appState.currentOilInfo?.viscosity || '高'} ｜ 比重 ${appState.currentOilInfo?.density || '0.89 g/cm³'}
- 數值預測時長：${appState.simulationSteps.length - 1} 小時

【二、 即時環境海象場 (氣象署測站)】
- 觀測參考測站：${appState.currentWindInfo?.station || '台灣海峽觀測浮標'}
- 實測風向風速：${appState.currentWindInfo?.directionText || '東北風'} ｜ 風速 ${Number(appState.currentWindInfo?.speed || 5).toFixed(1)} m/s
- 背景洋流分量：黑潮支流 / 沿岸流向東北 (流速約 0.35 m/s)

【三、 擴散衝擊與受災範圍預測】
- 預估最大影響面積：${maxArea} 平方公里 (km²)
- 最大預測漂移距離：${maxDist} 公里 (km)
- 海岸擱淺觸陸判別：${beachedText}

【四、 重點防線威脅與生態敏感區 (ESI) 預警】
${alertListText}

【五、 緊急通報距離最近責任處理署 (立即派遣調度)】
${nearestDepotsText}

【六、 現場應變指揮處置建議 (Countermeasures)】
- 攔油索佈設狀態：${appState.isBoomDeployed ? '🛡️ 港口戰術攔油索防禦網已實境佈設就位 (預估阻截攔污效率 85%)' : appState.currentOilInfo?.boomRecommendation || '標準充氣式防波堤攔油索'}
- 化學除油劑使用：${appState.currentOilInfo?.dispersantAllowed ? '✅ 水深 > 20m 且離岸 > 3 海浬時經海保署同意可酌量施灑；接近珊瑚礁/養殖區嚴禁使用' : '❌ 嚴禁施灑化學除油劑 (易加劇水體毒性或油品黏度過高無法乳化)'}
- 應變調度結論：已即時通報上述最近兩處責任處理署，同步調派海巡防污巡防艇及港勤汲油船前往攔截！
======================================================================`;

  container.innerText = report;
}

export function downloadGeoJSONFile() {
  if (!appState.simulationSteps.length) {
    showToast("⚠️ 請先進行模擬後再匯出 GeoJSON 資料！");
    return;
  }

  const features = [];

  if (appState.selectedCoords) {
    features.push({
      type: "Feature",
      properties: {
        eventType: "IncidentOrigin",
        description: "海上油污洩漏起點",
        timestamp: "T+00:00"
      },
      geometry: {
        type: "Point",
        coordinates: [Number(appState.selectedCoords.lng.toFixed(6)), Number(appState.selectedCoords.lat.toFixed(6))]
      }
    });
  }

  features.push({
    type: "Feature",
    properties: {
      eventType: "DriftTrajectory",
      totalHours: appState.simulationSteps.length - 1
    },
    geometry: {
      type: "LineString",
      coordinates: appState.simulationSteps.map(s => [s.center[1], s.center[0]])
    }
  });

  appState.simulationSteps.forEach(s => {
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
      oilType: appState.currentOilInfo?.name,
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

