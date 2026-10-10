// src/api.js

// 指向 Python Flask 後端 (Port 5000)
const API_CONFIG = {
  baseUrl: typeof window !== 'undefined' && window.location.port === '5000'
    ? `${window.location.origin}/api/v1`
    : "http://127.0.0.1:5000/api/v1",
  endpoint: "/simulate-spill"
};

/**
  * 海難常見油品物化特性資料庫 (依據 NOAA ADIOS & 台灣海保署海難應變規範)
  */
export const OIL_PROFILES = {
  HFO: {
    id: "HFO",
    name: "船用燃料重油 (Heavy Fuel Oil / HFO 380)",
    category: "第5類殘渣重油 (企劃書首選)",
    spreadFactor: 0.76,
    windage: 0.02,
    density: "950 kg/m³ (0.95 g/cm³)",
    viscosity: "極高焦油狀 (Very High)",
    dispersantAllowed: false,
    boomRecommendation: "特重型深裙攔油索 (抗浪 1.8m) + 固態汲油刷",
    sheenColor: "#ef4444",
    coreColor: "#450a0a",
    thermalCore: "#a855f7",
    thermalSheen: "#ec4899"
  },
  MDO: {
    id: "MDO",
    name: "船用柴油 (Marine Diesel Oil)",
    category: "第2類輕質燃料油",
    spreadFactor: 1.25,
    windage: 0.03,
    density: "860 kg/m³ (0.86 g/cm³)",
    viscosity: "中低黏度 (Medium-Low)",
    dispersantAllowed: false,
    boomRecommendation: "快速圍堵型攔油索 + 強化吸油棉拖簾",
    sheenColor: "#f59e0b",
    coreColor: "#9a3412",
    thermalCore: "#f97316",
    thermalSheen: "#06b6d4"
  },
  MGO: {
    id: "MGO",
    name: "船用輕柴油 (Marine Gas Oil)",
    category: "第1類極輕質蒸餾油",
    spreadFactor: 1.45,
    windage: 0.03,
    density: "850 kg/m³ (0.85 g/cm³)",
    viscosity: "極低黏度 (Low Viscosity)",
    dispersantAllowed: false,
    boomRecommendation: "建立下風防爆警戒區 + 圍阻攔截",
    sheenColor: "#eab308",
    coreColor: "#a16207",
    thermalCore: "#eab308",
    thermalSheen: "#38bdf8"
  },
  crude: {
    id: "crude",
    name: "重質原油 (Heavy Crude)",
    category: "第4類原油",
    spreadFactor: 1.0,
    windage: 0.02,
    density: "890 kg/m³ (0.89 g/cm³)",
    viscosity: "高 (High Viscosity)",
    dispersantAllowed: true,
    boomRecommendation: "標準充氣式防波堤攔油索 (抗浪 1.2m)",
    sheenColor: "#f97316",
    coreColor: "#7f1d1d",
    thermalCore: "#ef4444",
    thermalSheen: "#38bdf8"
  },
  diesel: {
    id: "diesel",
    name: "輕柴油 (Marine Diesel)",
    category: "第2類輕質燃料油",
    spreadFactor: 1.38,
    windage: 0.03,
    density: "860 kg/m³ (0.86 g/cm³)",
    viscosity: "極低 (Low Viscosity)",
    dispersantAllowed: false,
    boomRecommendation: "快速圍堵型攔油索 + 強化吸油棉拖簾",
    sheenColor: "#eab308",
    coreColor: "#a16207",
    thermalCore: "#f59e0b",
    thermalSheen: "#06b6d4"
  },
  hfo: {
    id: "hfo",
    name: "船用燃料重油 (Heavy Fuel Oil / HFO 380)",
    category: "第5類殘渣重油",
    spreadFactor: 0.76,
    windage: 0.02,
    density: "950 kg/m³ (0.95 g/cm³)",
    viscosity: "極高焦油狀 (Very High)",
    dispersantAllowed: false,
    boomRecommendation: "特重型深裙攔油索 (抗浪 1.8m) + 固態汲油刷",
    sheenColor: "#ef4444",
    coreColor: "#450a0a",
    thermalCore: "#a855f7",
    thermalSheen: "#ec4899"
  },
  condensate: {
    id: "condensate",
    name: "輕質凝析油/化學品 (Light Condensate)",
    category: "第1類揮發輕油",
    spreadFactor: 1.62,
    windage: 0.03,
    density: "740 kg/m³ (0.74 g/cm³)",
    viscosity: "水狀極易擴散",
    dispersantAllowed: false,
    boomRecommendation: "建立下風防爆警戒區，嚴禁火源，監控自然逸散",
    sheenColor: "#38bdf8",
    coreColor: "#0284c7",
    thermalCore: "#3b82f6",
    thermalSheen: "#93c5fd"
  }
};

/**
 * 初始事故洩漏規模 (依據 oil_spill_area.py 數值基準)
 */
export const SPILL_SIZES = {
  small: {
    id: "small",
    name: "小型 (0.1–0.3 公頃)",
    areaKm2: 0.002,
    range: "0.1–0.3 公頃",
    desc: "局部溢漏 (加油或小型管線微滲漏)"
  },
  medium: {
    id: "medium",
    name: "中型 (5–15 km²)",
    areaKm2: 10.0,
    range: "5–15 km²",
    desc: "中型海難 (貨輪破艙/擱淺外溢)"
  },
  large: {
    id: "large",
    name: "大型 (至少 1000 km²)",
    areaKm2: 1000.0,
    range: "至少 1000 km²",
    desc: "特大油輪浩劫 (巨量原油外洩)"
  }
};

/**
 * 台灣歷史重大海難漏油事件檔案庫
 */
export const HISTORICAL_INCIDENTS = [
  {
    id: "angel2021",
    name: "2021 高雄天使輪 (Angel) 沉船漏油事件",
    year: "2021",
    lat: 22.5833,
    lng: 120.2500,
    oilType: "HFO",
    spillSize: "medium",
    windLevel: 2,
    hours: 36,
    locationLabel: "高雄港一港口南星外海",
    desc: "帛琉籍天使輪沉沒於高雄港外，機艙殘留近 500 噸重油與數百只貨櫃漂流，嚴重威脅旗津與小港中鋼取水口。"
  },
  {
    id: "tstaipei2016",
    name: "2016 新北石門德翔台北 (TS Taipei) 斷裂擱淺事件",
    year: "2016",
    lat: 25.3020,
    lng: 121.5620,
    oilType: "HFO",
    spillSize: "medium",
    windLevel: 3,
    hours: 24,
    locationLabel: "新北石門草里外海",
    desc: "德翔台北號貨輪觸礁斷成兩截，重質燃油外溢，富貴角周邊岩岸與藻礁生態遭受長達數月之嚴重污染。"
  },
  {
    id: "amorgos2001",
    name: "2001 墾丁龍坑阿瑪斯號 (Amorgos) 浩劫事件",
    year: "2001",
    lat: 21.9050,
    lng: 120.8550,
    oilType: "HFO",
    spillSize: "large",
    windLevel: 3,
    hours: 48,
    locationLabel: "墾丁鵝鑾鼻龍坑生態保護區外",
    desc: "希臘籍阿瑪斯號因舵機故障擱淺，上千噸殘渣重油覆蓋國寶級珊瑚礁，促成台灣制定海洋污染防治法。"
  }
];

/**
 * 台灣海難應變資材基地與待命港勤/海巡物資庫
 */
export const RESPONSE_DEPOTS = [
  {
    id: "keelung",
    name: "基隆港海事應變資材總庫",
    lat: 25.138,
    lng: 121.745,
    agency: "交通部航港局北部航務中心 / 基隆港務分公司",
    booms: "3,800 公尺 (港灣重型)",
    absorbents: "18,000 片",
    skimmers: "汲油船 3 艘",
    phone: "02-2420-6100"
  },
  {
    id: "taipei",
    name: "台北港海洋防護資材站",
    lat: 25.155,
    lng: 121.378,
    agency: "海洋委員會海洋保育署八里站",
    booms: "2,600 公尺",
    absorbents: "12,000 片",
    skimmers: "多功能清污船 2 艘",
    phone: "02-2619-3388"
  },
  {
    id: "taichung",
    name: "台中港海難物資調度中心",
    lat: 24.262,
    lng: 120.528,
    agency: "台中港務分公司港灣處",
    booms: "4,500 公尺 (抗浪外海型)",
    absorbents: "22,000 片",
    skimmers: "重型汲油船 4 艘",
    phone: "04-2657-3456"
  },
  {
    id: "mailiao",
    name: "麥寮工業港專業應變隊物資庫",
    lat: 23.792,
    lng: 120.162,
    agency: "台塑石化海洋污染緊急應變小組",
    booms: "3,200 公尺",
    absorbents: "25,000 片",
    skimmers: "真空汲油艇 3 艘",
    phone: "05-681-2345"
  },
  {
    id: "kaohsiung",
    name: "高雄港國家級海難應變資材基地",
    lat: 22.598,
    lng: 120.302,
    agency: "海保署南區應變指揮總庫 / 高雄港務分公司",
    booms: "6,800 公尺 (雙層深裙)",
    absorbents: "35,000 片",
    skimmers: "遠洋大型汲油船 5 艘",
    phone: "07-562-2300"
  },
  {
    id: "hualien",
    name: "花蓮港東部海洋保育物資庫",
    lat: 23.992,
    lng: 121.632,
    agency: "花蓮港務分公司 / 第九海巡隊",
    booms: "2,000 公尺",
    absorbents: "10,000 片",
    skimmers: "急流水體汲油器 2 組",
    phone: "03-832-5131"
  }
];

/**
 * 台灣本島海岸線多邊形座標（依順時針繞行台灣一圈，與後端 app.py 對齊）
 */
export const TAIWAN_MAINLAND_POLYGON = [
  // 北部
  [25.298, 121.538], // 富貴角
  [25.195, 121.650], // 萬里
  [25.150, 121.780], // 基隆
  [25.110, 121.910], // 鼻頭角
  [25.010, 121.995], // 三貂角
  // 東部
  [24.860, 121.830], // 頭城
  [24.690, 121.840], // 宜蘭五結
  [24.600, 121.870], // 蘇澳
  [24.400, 121.780], // 南澳
  [24.160, 121.640], // 新城
  [23.980, 121.620], // 花蓮
  [23.600, 121.520], // 豐濱
  [23.100, 121.380], // 成功
  [22.750, 121.150], // 台東
  [22.450, 120.970], // 大武
  [22.250, 120.890], // 達仁
  [21.900, 120.850], // 鵝鑾鼻
  [21.920, 120.730], // 貓鼻頭
  // 西南部
  [22.050, 120.690], // 車城
  [22.370, 120.590], // 枋寮
  [22.460, 120.440], // 東港
  [22.490, 120.380], // 林園高屏溪口
  [22.540, 120.330], // 小港
  [22.560, 120.300], // 前鎮
  [22.610, 120.265], // 旗津/西子灣/高雄港外側
  [22.680, 120.245], // 左營/梓官
  [22.820, 120.210], // 永安
  [22.900, 120.170], // 茄萣
  [22.990, 120.150], // 台南安平
  [23.090, 120.080], // 七股
  [23.150, 120.030], // 國聖燈塔 (極西點)
  [23.280, 120.080], // 北門
  [23.380, 120.130], // 布袋
  // 西部中北段
  [23.550, 120.140], // 東石
  [23.710, 120.160], // 台西
  [23.850, 120.250], // 麥寮
  [24.080, 120.380], // 鹿港
  [24.280, 120.510], // 台中港
  [24.490, 120.660], // 通霄
  [24.620, 120.760], // 後龍
  [24.840, 120.910], // 新竹南寮
  [25.040, 121.030], // 觀音
  [25.120, 121.280], // 蘆竹
  [25.170, 121.400], // 八里
  [25.280, 121.480]  // 石門
];

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
 * @param {number} distKm 大地距離 (公里)
 * @param {number} speedKnots 船隊航速 (節, 預設 15 節)
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
 * 請求油污擴散模擬資料
 */
export async function fetchSpillSimulation(mode, coords, hours, windLevel, oilType = 'HFO', spillSize = 'medium') {
  const normOilKey = String(oilType).toUpperCase();
  const oilProfile = OIL_PROFILES[normOilKey] || OIL_PROFILES[oilType] || OIL_PROFILES.HFO || OIL_PROFILES.crude;

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
    const mockCurrentStation = isNorth
      ? { station: "龜山島浮標測站 (東北角海域)", speed: 0.34, speed_knots: 0.66, u: 0.12, v: 0.32, source: "海象測站表層流 (龜山島浮標)" }
      : (isSouth
          ? { station: "小琉球浮標測站 (西南外海)", speed: 0.21, speed_knots: 0.41, u: -0.06, v: 0.20, source: "海象測站表層流 (小琉球浮標)" }
          : { station: "台中港浮標測站 (台灣海峽中段)", speed: 0.15, speed_knots: 0.29, u: 0.04, v: 0.14, source: "海象測站表層流 (台中港浮標)" });

    mockSteps.currentInfo = mockCurrentStation;
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
    mockSteps.data_status = {
      currentAvailable: true,
      windAvailable: true
    };
    return mockSteps;
  }

  // 對接真實後端 API (oil_spill_area.py 數值模擬引擎)
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
 * 前端精緻模擬擴散演算法 (Mock Data, 支援粒子隨機遊走與凸包面積)
 */
function generateMockDiffusionData(startLat, startLng, totalHours, windLevel, oilProfile, spillSize = 'medium') {
  const steps = [];
  const dtSeconds = 3600;

  const windDirDeg = 45;
  const windSpeedMs = windLevel * 3.8;
  const windage = oilProfile.windage || 0.02;
  
  const windRad = (windDirDeg * Math.PI) / 180;
  const uWind = -windSpeedMs * Math.sin(windRad);
  const vWind = -windSpeedMs * Math.cos(windRad);

  const uCurrent = 0.05;
  const vCurrent = 0.15;

  const uTotal = uCurrent + (uWind * windage);
  const vTotal = vCurrent + (vWind * windage);

  const initAreaKm2 = SPILL_SIZES[spillSize]?.areaKm2 || 10.0;
  let currentLat = startLat;
  let currentLng = startLng;
  let isBeached = false;

  for (let i = 0; i <= totalHours; i++) {
    if (!isBeached && i > 0) {
      const deltaLat = (vTotal * dtSeconds) / 111000.0;
      const latRad = (currentLat * Math.PI) / 180;
      const deltaLng = (uTotal * dtSeconds) / (111000.0 * Math.cos(latRad));

      const nextLat = currentLat + deltaLat;
      const nextLng = currentLng + deltaLng;

      if (isPointOnLand(nextLat, nextLng)) {
        isBeached = true;
      } else {
        currentLat = nextLat;
        currentLng = nextLng;
      }
    }

    // 計算半徑與幾何面積 (依據初始面積擴展)
    const initRadiusM = Math.sqrt((initAreaKm2 * 1_000_000.0) / Math.PI);
    // 水平擴散係數 1.0 m^2/s 隨機擴展
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

      const pOuterLat = currentLat + (outerRadiusDeg + jitterOuter) * Math.cos(angle);
      const pOuterLng = currentLng + ((outerRadiusDeg + jitterOuter) * Math.cos(angle)) / cosLat;
      outerCoords.push([Number(pOuterLng.toFixed(6)), Number(pOuterLat.toFixed(6))]);

      const pCoreLat = currentLat + (coreRadiusDeg + jitterCore) * Math.sin(angle);
      const pCoreLng = currentLng + ((coreRadiusDeg + jitterCore) * Math.cos(angle)) / cosLat;
      coreCoords.push([Number(pCoreLng.toFixed(6)), Number(pCoreLat.toFixed(6))]);
    }
    outerCoords.push(outerCoords[0]);
    coreCoords.push(coreCoords[0]);

    // 生成 120 顆隨機粒子模擬微觀遊走
    const particles = [];
    const particleCount = 120;
    for (let p = 0; p < particleCount; p++) {
      const r_m = totalRadiusM * Math.sqrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      const ptLat = currentLat + (r_m * Math.sin(th)) / 111000.0;
      const ptLng = currentLng + (r_m * Math.cos(th)) / (111000.0 * cosLat);
      particles.push({
        lat: Number(ptLat.toFixed(5)),
        lng: Number(ptLng.toFixed(5))
      });
    }

    const driftDist = calculateDistanceKm(startLat, startLng, currentLat, currentLng);
    const areaKm2 = (Math.PI * totalRadiusM * totalRadiusM) / 1_000_000.0;

    steps.push({
      hourIndex: i,
      timeLabel: `T + ${String(i).padStart(2, '0')}:00`,
      center: [Number(currentLat.toFixed(6)), Number(currentLng.toFixed(6))],
      beached: isBeached,
      driftDistanceKm: driftDist,
      areaKm2: areaKm2,
      particles: particles,
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { 
              layerType: "sheen", 
              color: oilProfile.sheenColor,
              thermalColor: oilProfile.thermalSheen
            },
            geometry: {
              type: "Polygon",
              coordinates: [outerCoords]
            }
          },
          {
            type: "Feature",
            properties: { 
              layerType: "core", 
              color: oilProfile.coreColor,
              thermalColor: oilProfile.thermalCore
            },
            geometry: {
              type: "Polygon",
              coordinates: [coreCoords]
            }
          }
        ]
      }
    });
  }

  return steps;
}
