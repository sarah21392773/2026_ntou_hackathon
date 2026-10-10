// src/constants.js

export const API_CONFIG = {
    baseUrl: typeof window !== 'undefined' && window.location.hostname === '127.0.0.1'
        ? "http://127.0.0.1:5000/api/v1"
        : "https://two026-ntou-hackathon.onrender.com/api/v1",
    endpoint: "/simulate-spill"
};

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
};

export const SPILL_SIZES = {
  small: { id: "small", name: "小型 (0.1–0.3 公頃)", areaKm2: 0.002, range: "0.1–0.3 公頃", desc: "局部溢漏 (加油或小型管線微滲漏)" },
  medium: { id: "medium", name: "中型 (5–15 km²)", areaKm2: 10.0, range: "5–15 km²", desc: "中型海難 (貨輪破艙/擱淺外溢)" },
  large: { id: "large", name: "大型 (至少 1000 km²)", areaKm2: 1000.0, range: "至少 1000 km²", desc: "特大油輪浩劫 (巨量原油外洩)" }
};

export const HISTORICAL_INCIDENTS = [
  {
    id: "angel2023",
    name: "2023 高雄天使輪 (Angel) 沉船漏油事件",
    year: "2023",
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

export const RESPONSE_DEPOTS = [
  { id: "keelung", name: "交通部航港局北部應變中心 (基隆資材總庫)", lat: 25.138, lng: 121.745, agency: "交通部航港局北部航務中心 / 基隆港務分公司", booms: "3,800 公尺 (港灣重型)", absorbents: "18,000 片", skimmers: "汲油船 3 艘", phone: "02-2420-6100" },
  { id: "taipei", name: "海保署北區海洋保育應變站 (台北港八里基地)", lat: 25.155, lng: 121.378, agency: "海洋委員會海洋保育署八里站", booms: "2,600 公尺", absorbents: "12,000 片", skimmers: "多功能清污船 2 艘", phone: "02-2619-3388" },
  { id: "suao", name: "蘇澳港海洋污染應變應急站", lat: 24.595, lng: 121.865, agency: "海巡署第一巡防區指揮部 / 基隆港務蘇澳辦公處", booms: "2,200 公尺 (雙層充氣)", absorbents: "15,000 片", skimmers: "小型汲油艇 2 艘", phone: "03-969-9521" },
  { id: "taichung", name: "航港局中部航務中心 (台中港海難物資調度站)", lat: 24.262, lng: 120.528, agency: "交通部航港局中部航務中心 / 台中港務分公司", booms: "4,500 公尺 (抗浪外海型)", absorbents: "22,000 片", skimmers: "重型汲油船 4 艘", phone: "04-2657-3456" },
  { id: "mailiao", name: "雲林麥寮石化專區海污快速處置基地", lat: 23.792, lng: 120.162, agency: "台塑石化海洋污染緊急應變小組 / 中部海巡隊", booms: "3,200 公尺", absorbents: "25,000 片", skimmers: "真空汲油艇 3 艘", phone: "05-681-2345" },
  { id: "anping", name: "台南海事水體應變支援基地 (安平港)", lat: 22.985, lng: 120.165, agency: "海巡署第一一岸巡隊 / 高雄港務安平辦公處", booms: "2,400 公尺", absorbents: "16,000 片", skimmers: "港灣汲油器 2 組", phone: "06-261-2341" },
  { id: "kaohsiung", name: "海保署南區國家級應變基地 (高雄港總部)", lat: 22.598, lng: 120.302, agency: "海洋委員會海洋保育署南區總庫 / 高雄港務分公司", booms: "6,800 公尺 (雙層深裙抗浪)", absorbents: "35,000 片", skimmers: "遠洋大型汲油船 5 艘", phone: "07-562-2300" },
  { id: "hengchun", name: "恆春半島生態緊急應變防護站 (後壁湖)", lat: 21.942, lng: 120.745, agency: "海巡署第八巡防區 / 墾丁國家公園管理處", booms: "2,800 公尺 (珊瑚礁抗附著)", absorbents: "20,000 片", skimmers: "快速圍堵艇 2 艘", phone: "08-886-1321" },
  { id: "hualien", name: "海保署東區海洋保育物資庫 (花蓮港基地)", lat: 23.992, lng: 121.632, agency: "花蓮港務分公司 / 第九海巡隊", booms: "2,000 公尺", absorbents: "10,000 片", skimmers: "急流水體汲油器 2 組", phone: "03-832-5131" },
  { id: "penghu", name: "海巡署第十三巡防區海洋應變庫 (澎湖馬公)", lat: 23.565, lng: 119.575, agency: "海巡署第十三巡防區 / 澎湖縣環保局", booms: "2,500 公尺 (深海防浪型)", absorbents: "18,000 片", skimmers: "巡防汲油船 2 艘", phone: "06-927-1110" }
];

export const TAIWAN_MAINLAND_POLYGON = [
  [25.298, 121.538], [25.195, 121.650], [25.150, 121.780], [25.110, 121.910], [25.010, 121.995],
  [24.860, 121.830], [24.690, 121.840], [24.600, 121.870], [24.400, 121.780], [24.160, 121.640],
  [23.980, 121.620], [23.600, 121.520], [23.100, 121.380], [22.750, 121.150], [22.450, 120.970],
  [22.250, 120.890], [21.900, 120.850], [21.920, 120.730], [22.050, 120.690], [22.370, 120.590],
  [22.460, 120.440], [22.490, 120.380], [22.540, 120.330], [22.560, 120.300], [22.610, 120.265],
  [22.680, 120.245], [22.820, 120.210], [22.900, 120.170], [22.990, 120.150], [23.090, 120.080],
  [23.150, 120.030], [23.280, 120.080], [23.380, 120.130], [23.550, 120.140], [23.710, 120.160],
  [23.850, 120.250], [24.080, 120.380], [24.280, 120.510], [24.490, 120.660], [24.620, 120.760],
  [24.840, 120.910], [25.040, 121.030], [25.120, 121.280], [25.170, 121.400], [25.280, 121.480]
];
