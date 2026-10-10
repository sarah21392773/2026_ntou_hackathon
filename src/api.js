// src/api.js
import { 
  API_CONFIG, 
  OIL_PROFILES, 
  SPILL_SIZES, 
  TAIWAN_MAINLAND_POLYGON 
} from './constants.js';

// 重新匯出常數供其他元件使用
export { OIL_PROFILES, SPILL_SIZES, HISTORICAL_INCIDENTS, RESPONSE_DEPOTS } from './constants.js';

/**
 * 射線演算法 (Ray-Casting) 判斷指定座標是否在台灣本島陸地內
 */
export function isPointOnLand(lat, lng) {
  let inside = false;
  const poly = TAIWAN_MAINLAND_POLYGON;
  const n = poly.length;
  let p1 = poly[0];
  
  for (let i = 1; i <= n; i++) {
    const p2 = poly[i % n];
    const [p1Lat, p1Lng] = p1;
    const [p2Lat, p2Lng] = p2;

    if (Math.min(p1Lat, p2Lat) < lat && lat <= Math.max(p1Lat, p2Lat)) {
      if (lng <= Math.max(p1Lng, p2Lng)) {
        if (p1Lat !== p2Lat) {
          const lngIntersect = (lat - p1Lat) * (p2Lng - p1Lng) / (p2Lat - p1Lat) + p1Lng;
          if (p1Lng === p2Lng || lng <= lngIntersect) {
            inside = !inside;
          }
        }
      }
    }
    p1 = p2;
  }
  return inside;
}

/**
 * 計算兩點大地距離 (公里, Haversine formula)
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 計算海難救難船隊從資材庫抵達事故現場之航程與預估抵達時間 (ETA)
 */
export function calculateVesselETA(distKm, speedKnots = 15) {
  const distNM = distKm / 1.852; // 換算海里
  const hours = distNM / speedKnots;
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return {
    nauticalMiles: Number(distNM.toFixed(1)),
    totalMinutes,
    timeText: h > 0 ? `${h} 小時 ${m} 分` : `${m} 分鐘`
  };
}

/**
 * 將風向角度 (0~360度) 轉換為繁體中文八方位描述
 */
export function getWindCompassText(deg) {
  const directions = [
    { label: "北風 (N)", min: 337.5, max: 360 },
    { label: "北風 (N)", min: 0, max: 22.5 },
    { label: "東北風 (NE)", min: 22.5, max: 67.5 },
    { label: "東風 (E)", min: 67.5, max: 112.5 },
    { label: "東南風 (SE)", min: 112.5, max: 157.5 },
    { label: "南風 (S)", min: 157.5, max: 202.5 },
    { label: "西南風 (SW)", min: 202.5, max: 247.5 },
    { label: "西風 (W)", min: 247.5, max: 292.5 },
    { label: "西北風 (NW)", min: 292.5, max: 337.5 }
  ];
  const d = (deg % 360 + 360) % 360;
  const match = directions.find(item => d >= item.min && d < item.max);
  return match ? match.label : `${d}°`;
}

/**
 * 請求油污擴散模擬資料 (支援 MOCK 模式與真實 Flask 後端 API 對接)
 */
export async function fetchSpillSimulation(mode, coords, hours, windLevel, oilType = 'HFO', spillSize = 'medium') {
  const normOilKey = String(oilType).toUpperCase();
  const oilProfile = OIL_PROFILES[normOilKey] || OIL_PROFILES[oilType] || OIL_PROFILES.HFO;

  if (mode === 'MOCK') {
    const mockSteps = generateMockDiffusionData(coords.lat, coords.lng, hours, windLevel, oilProfile, spillSize);
    mockSteps.windInfo = {
      source: "前端環境場模型 (東北季風+黑潮支流)",
      station: "模擬風海流推算測站",
      speed: (windLevel * 3.8).toFixed(1),
      direction: 45,
      directionText: "東北風 (吹向西南)",
      currentSpeed: 0.35
    };
    
    const isNorth = coords.lat > 24.5;
    const isSouth = coords.lng < 120.5 && coords.lat < 23.5;
    mockSteps.currentInfo = isNorth
      ? { station: "龜山島浮標測站 (東北角海域)", speed: 0.34, speed_knots: 0.66, u: 0.12, v: 0.32, source: "海象測站表層流 (龜山島浮標)" }
      : (isSouth
          ? { station: "小琉球浮標測站 (西南外海)", speed: 0.21, speed_knots: 0.41, u: -0.06, v: 0.20, source: "海象測站表層流 (小琉球浮標)" }
          : { station: "台中港浮標測站 (台灣海峽中段)", speed: 0.15, speed_knots: 0.29, u: 0.04, v: 0.14, source: "海象測站表層流 (台中港浮標)" });

    mockSteps.oilInfo = {
      name: oilProfile.name,
      oilType: normOilKey,
      windage: oilProfile.windage || 0.02,
      spillSize: spillSize,
      initialAreaKm2: SPILL_SIZES[spillSize]?.areaKm2 || 10.0,
      region: coords.lat > 24.5 ? "north_northeast" : (coords.lng < 120.5 ? "south" : "west"),
      regionName: coords.lat > 24.5 ? "台灣北部與東北部" : (coords.lng < 120.5 ? "台灣南部外海" : "台灣海峽西側"),
      seawaterDensity: 1024.0
    };
    mockSteps.data_status = { currentAvailable: true, windAvailable: true };
    return mockSteps;
  }

  // 對接真實後端 API
  const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: coords.lat,
      lng: coords.lng,
      simulationHours: hours,
      windForce: windLevel,
      oilType: normOilKey,
      spillSize: spillSize
    })
  });

  if (!response.ok) {
    throw new Error(`後端 API 回應異常 (HTTP ${response.status})`);
  }

  const data = await response.json();
  const steps = data.timeSteps || [];
  
  if (data.wind_info) {
    data.wind_info.directionText = getWindCompassText(data.wind_info.direction || 0);
  }
  steps.windInfo = data.wind_info;
  steps.currentInfo = data.current_info;
  steps.oilInfo = data.oil_info || oilProfile;
  steps.data_status = data.data_status || { currentAvailable: true, windAvailable: true };
  
  steps.forEach(step => {
    if (!step.driftDistanceKm) {
      step.driftDistanceKm = calculateDistanceKm(coords.lat, coords.lng, step.center[0], step.center[1]);
    }
    if (!step.areaKm2) {
      const radiusKm = (0.004 + 0.002 * Math.pow(step.hourIndex, 0.85)) * (oilProfile.spreadFactor || 1) * 111;
      step.areaKm2 = Math.PI * radiusKm * radiusKm;
    }
  });

  return steps;
}

/**
 * 前端精緻模擬擴散演算法 (Mock Data 內部實作)
 */
function generateMockDiffusionData(startLat, startLng, totalHours, windLevel, oilProfile, spillSize = 'medium') {
  const steps = [];
  const dtSeconds = 3600;
  const windSpeedMs = windLevel * 3.8;
  const windage = oilProfile.windage || 0.02;
  
  const windRad = (45 * Math.PI) / 180;
  const uWind = -windSpeedMs * Math.sin(windRad);
  const vWind = -windSpeedMs * Math.cos(windRad);

  const uTotal = 0.05 + (uWind * windage);
  const vTotal = 0.15 + (vWind * windage);

  const initAreaKm2 = SPILL_SIZES[spillSize]?.areaKm2 || 10.0;
  let currentLat = startLat;
  let currentLng = startLng;
  let isBeached = false;

  for (let i = 0; i <= totalHours; i++) {
    if (!isBeached && i > 0) {
      // 潮汐橢圓迴旋與風場時序轉向 (M2 半日潮 12.42 小時週期)
      const tidePhase = (i / 12.42) * 2 * Math.PI;
      const tideU = 0.08 * Math.sin(tidePhase);
      const tideV = 0.11 * Math.cos(tidePhase);
      
      const windShiftRad = (12 * Math.sin((i / 12.0) * Math.PI) * Math.PI) / 180;
      const stepUWind = -windSpeedMs * Math.sin(windRad + windShiftRad);
      const stepVWind = -windSpeedMs * Math.cos(windRad + windShiftRad);

      const stepUTotal = 0.05 + tideU + (stepUWind * windage);
      const stepVTotal = 0.15 + tideV + (stepVWind * windage);

      const deltaLat = (stepVTotal * dtSeconds) / 111000.0;
      const latRad = (currentLat * Math.PI) / 180;
      const deltaLng = (stepUTotal * dtSeconds) / (111000.0 * Math.cos(latRad));

      const nextLat = currentLat + deltaLat;
      const nextLng = currentLng + deltaLng;

      if (isPointOnLand(nextLat, nextLng)) {
        isBeached = true;
      } else {
        currentLat = nextLat;
        currentLng = nextLng;
      }
    }

    const initRadiusM = Math.sqrt((initAreaKm2 * 1_000_000.0) / Math.PI);
    const diffRadiusM = Math.sqrt(2 * 1.0 * (i * 3600));
    const totalRadiusM = Math.max(initRadiusM, Math.sqrt(initRadiusM * initRadiusM + diffRadiusM * diffRadiusM));
    const outerRadiusDeg = totalRadiusM / 111000.0;
    const coreRadiusDeg = outerRadiusDeg * 0.42;

    const latRad = (currentLat * Math.PI) / 180;
    const cosLat = Math.max(0.01, Math.cos(latRad));

    const outerCoords = [];
    const coreCoords = [];
    const sides = 16;
    
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const jitterOuter = Math.sin(j * 3 + i * 1.5) * 0.0004;
      const jitterCore = Math.sin(j * 2 + i) * 0.0002;

      const pOuterLat = currentLat + (outerRadiusDeg + jitterOuter) * Math.sin(angle);
      const pOuterLng = currentLng + ((outerRadiusDeg + jitterOuter) * Math.cos(angle)) / cosLat;
      outerCoords.push([Number(pOuterLng.toFixed(6)), Number(pOuterLat.toFixed(6))]);

      const pCoreLat = currentLat + (coreRadiusDeg + jitterCore) * Math.sin(angle);
      const pCoreLng = currentLng + ((coreRadiusDeg + jitterCore) * Math.cos(angle)) / cosLat;
      coreCoords.push([Number(pCoreLng.toFixed(6)), Number(pCoreLat.toFixed(6))]);
    }
    outerCoords.push(outerCoords[0]);
    coreCoords.push(coreCoords[0]);

    const particles = [];
    for (let p = 0; p < 120; p++) {
      const r_m = totalRadiusM * Math.sqrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      particles.push({
        lat: Number((currentLat + (r_m * Math.sin(th)) / 111000.0).toFixed(5)),
        lng: Number((currentLng + (r_m * Math.cos(th)) / (111000.0 * cosLat)).toFixed(5))
      });
    }

    steps.push({
      hourIndex: i,
      timeLabel: `T + ${String(i).padStart(2, '0')}:00`,
      center: [Number(currentLat.toFixed(6)), Number(currentLng.toFixed(6))],
      beached: isBeached,
      driftDistanceKm: calculateDistanceKm(startLat, startLng, currentLat, currentLng),
      areaKm2: (Math.PI * totalRadiusM * totalRadiusM) / 1_000_000.0,
      particles: particles,
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { layerType: "sheen", color: oilProfile.sheenColor, thermalColor: oilProfile.thermalSheen },
            geometry: { type: "Polygon", coordinates: [outerCoords] }
          },
          {
            type: "Feature",
            properties: { layerType: "core", color: oilProfile.coreColor, thermalColor: oilProfile.thermalCore },
            geometry: { type: "Polygon", coordinates: [coreCoords] }
          }
        ]
      }
    });
  }

  return steps;
}