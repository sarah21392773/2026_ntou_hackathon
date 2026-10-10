import os
import math
import json
import random
import requests
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import urllib3


# ==================================================
# 1. 直接引入 oil_spill_area 的函式
# ==================================================
from oil_spill_area import (
    simulate_oil_spill_area,
    calculate_convex_hull_geo,
    OIL_TYPES as PARTICLE_OIL_TYPES,
    SPILL_SIZES as PARTICLE_SPILL_SIZES,
    REGION_DENSITY as PARTICLE_REGION_DENSITY
)

# 忽略 ssl 憑證跳出的警告訊息
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
# 建立 flask，且可以直接讀取根目錄下的所有靜態檔案
app = Flask(__name__, static_folder='.', static_url_path='')
# 允許跨網域請求
CORS(app)


# ==================================================
# 2. 台灣海岸線，避免油汙跑進本島
# ==================================================
# 座標順序：由北端順時針繞行台灣本島一圈 (緯度, 經度)
TAIWAN_MAINLAND_POLYGON = [
    # 北部
    (25.298, 121.538), # 富貴角
    (25.195, 121.650), # 萬里
    (25.150, 121.780), # 基隆
    (25.110, 121.910), # 鼻頭角
    (25.010, 121.995), # 三貂角
    # 東部
    (24.860, 121.830), # 頭城
    (24.690, 121.840), # 宜蘭五結
    (24.600, 121.870), # 蘇澳
    (24.400, 121.780), # 南澳
    (24.160, 121.640), # 新城
    (23.980, 121.620), # 花蓮
    (23.600, 121.520), # 豐濱
    (23.100, 121.380), # 成功
    (22.750, 121.150), # 台東
    (22.450, 120.970), # 大武
    (22.250, 120.890), # 達仁
    (21.900, 120.850), # 鵝鑾鼻
    (21.920, 120.730), # 貓鼻頭
    # 西南部 (高屏/台南/嘉義 關鍵重點海岸)
    (22.050, 120.690), # 車城
    (22.370, 120.590), # 枋寮
    (22.460, 120.440), # 東港
    (22.490, 120.380), # 林園高屏溪口
    (22.540, 120.330), # 小港
    (22.560, 120.300), # 前鎮
    (22.610, 120.265), # 旗津/西子灣/高雄港外側
    (22.680, 120.245), # 左營/梓官
    (22.820, 120.210), # 永安
    (22.900, 120.170), # 茄萣
    (22.990, 120.150), # 台南安平
    (23.090, 120.080), # 七股
    (23.150, 120.030), # 國聖燈塔 (台灣本島極西點)
    (23.280, 120.080), # 北門
    (23.380, 120.130), # 布袋
    # 西部中北段
    (23.550, 120.140), # 東石
    (23.710, 120.160), # 台西
    (23.850, 120.250), # 麥寮
    (24.080, 120.380), # 鹿港
    (24.280, 120.510), # 台中港
    (24.490, 120.660), # 通霄
    (24.620, 120.760), # 後龍
    (24.840, 120.910), # 新竹南寮
    (25.040, 121.030), # 觀音
    (25.120, 121.280), # 蘆竹
    (25.170, 121.400), # 八里
    (25.280, 121.480), # 石門
]
# 用射線法判斷是否進到台灣內
def is_on_land(lat, lon):
    """
    射線法 (Ray-casting Algorithm) 判斷點是否落入台灣陸地多邊形
    True: 在陸地上 (需擱淺)
    False: 在海洋中
    """
    inside = False
    n = len(TAIWAN_MAINLAND_POLYGON)
    p1_lat, p1_lon = TAIWAN_MAINLAND_POLYGON[0]
    for i in range(1, n + 1):
        p2_lat, p2_lon = TAIWAN_MAINLAND_POLYGON[i % n]
        if min(p1_lat, p2_lat) < lat <= max(p1_lat, p2_lat):
            if lon <= max(p1_lon, p2_lon):
                if p1_lat != p2_lat:
                    lon_intersect = (lat - p1_lat) * (p2_lon - p1_lon) / (p2_lat - p1_lat) + p1_lon
                    if p1_lon == p2_lon or lon <= lon_intersect:
                        inside = not inside
        p1_lat, p1_lon = p2_lat, p2_lon
    return inside

# ==================================================
# 3. 取得氣象署 CWA API 和 Nodass 真實資料
# ==================================================
# 要有 測站經度、測站緯度、平均風速、風向角度、測站名稱、洋流流速
# 這裡要改：目前還沒有 nodass 的洋流資料（先從 CWA 拿固定測站資料）

# 取得我的 api
def get_my_api():
    api_key = os.getenv("CWA_API_KEY")
    if not api_key:
        config_path = os.path.join(os.path.dirname(__file__), "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    api_key = json.load(f).get("cwa_api_key")
            except Exception as e:
                print(f"讀取 config.json 失敗: {e}")
    return api_key

def fetch_cwa(target_lat, target_lon):
    """
    從中央氣象署 API (O-A0001-001) 自動尋找最靠近事故海域的測站風速與風向
    先暫時從 中央氣象署 API (O-A0018-001) 取得固定測點的洋流資料，去推估周圍洋流流速????
    """
    # 取得我的 api key
    api_key = get_my_api()

    # 從中央氣象署 API (O-A0001-001) 自動尋找最靠近事故海域的測站風速與風向
    if api_key:
        try:
            url = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001"
            params = {"Authorization": api_key, "format": "JSON"}
            resp = requests.get(url, params=params, timeout=5, verify=False)
            if resp.status_code == 200:
                data = resp.json()
                stations = data.get("records", {}).get("Station", [])
                
                best_station = None
                min_dist = float("inf")
                
                for st in stations:
                    coords = st.get("GeoInfo", {}).get("Coordinates", [])
                    if not coords:
                        continue
                    # 優先使用 WGS84 座標，若無則退回第一組
                    target_coord = next((c for c in coords if c.get("CoordinateName") == "WGS84"), coords[0])
                    try:
                        st_lon = float(target_coord.get("StationLongitude", 0))
                        st_lat = float(target_coord.get("StationLatitude", 0))
                    except (ValueError, TypeError):
                        continue
                    
                    weather = st.get("WeatherElement", {})
                    try:
                        ws = float(weather.get("WindSpeed", -99))
                        wd = float(weather.get("WindDirection", -99))
                    except (ValueError, TypeError):
                        continue
                    
                    if ws >= 0 and wd >= 0:
                        dist = (st_lat - target_lat)**2 + (st_lon - target_lon)**2
                        if dist < min_dist:
                            min_dist = dist
                            best_station = {
                                "name": st.get("StationName", "近岸測站"),
                                "speed": ws,
                                "direction": wd,
                                "lat": st_lat,
                                "lon": st_lon
                            }
                
                if best_station:
                    speed = best_station["speed"]
                    deg = best_station["direction"]
                    # 氣象風向 (從哪裡來) 轉為向量位移去向: U(東向), V(北向)
                    rad = math.radians(deg)
                    u_wind = -speed * math.sin(rad)
                    v_wind = -speed * math.cos(rad)
                    return u_wind, v_wind, {
                        "station": best_station["name"],
                        "speed": speed,
                        "direction": deg,
                        "source": f"氣象署實測 ({best_station['name']})"
                    }
        except Exception as e:
            print(f"CWA API 連線失敗或逾時，使用氣候模型: {e}")

    # 備援模型：台灣秋冬以東北季風為主 (風向 45 度，吹向西南)
    # 不會讓油污無故朝內陸吹
    deg = 45.0
    speed = 5.0
    rad = math.radians(deg)
    u_wind = -speed * math.sin(rad)  # 向西 (<0)
    v_wind = -speed * math.cos(rad)  # 向南 (<0)
    return u_wind, v_wind, {
        "station": "季節氣候模型",
        "speed": speed,
        "direction": deg,
        "source": "台灣海峽東北季風環境場"
    }

# 海流資料
def fetch_cwa_ocean_currents(target_lat, target_lon):
    """
    從中央氣象署 API O-A0018-001 取得即時浮標海流，
    並使用反距離加權法 (IDW) 推估事故地點 (target_lat, target_lon) 的海流向量 (u_current, v_current)
    """
    # 取得我的 api key
    api_key = get_my_api()

    stations_data = []

    if api_key:
        try:
            url = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0018-001"
            params = {"Authorization": api_key, "format": "JSON"}
            resp = requests.get(url, params=params, timeout=5, verify=False)

            if resp.status_code == 200:
                data = resp.json()
                station_list = data.get("records", {}).get("Station", [])

                for st in station_list:
                    # 取得經緯度
                    geo = st.get("GeoInfo", {})
                    st_lat = float(geo.get("StationLatitude", 0))
                    st_lon = float(geo.get("StationLongitude", 0))
                    st_name = st.get("StationName", "未知海域測站")

                    # 解析海流元素
                    weather = st.get("WeatherElement", {})
                    # 注意：CWA 欄位可能為 CurrentSpeed (cm/s 或 m/s) 與 CurrentDirection
                    curr_speed_raw = float(weather.get("CurrentSpeed", -99))
                    curr_dir_raw = float(weather.get("CurrentDirection", -99))

                    # 排除無效值 (-99)
                    if curr_speed_raw >= 0 and curr_dir_raw >= 0:
                        # 若氣象署單位為 cm/s，轉成 m/s
                        curr_speed = curr_speed_raw / 100.0 if curr_speed_raw > 10 else curr_speed_raw
                        
                        # 極座標轉成分量向量 (U: 東向, V: 北向)
                        rad = math.radians(curr_dir_raw)
                        u = curr_speed * math.sin(rad)
                        v = curr_speed * math.cos(rad)

                        stations_data.append({
                            "name": st_name,
                            "lat": st_lat,
                            "lon": st_lon,
                            "speed": curr_speed,
                            "direction": curr_dir_raw,
                            "u": u,
                            "v": v
                        })
        except Exception as e:
            print(f"[Warn] CWA O-A0018-001 海流 API 連線失敗: {e}")

    # 空間插值：反距離加權法 (IDW) 推估目標點海流
    if stations_data:
        total_weight = 0.0
        weighted_u = 0.0
        weighted_v = 0.0
        nearest_st = None
        min_dist = float("inf")

        for st in stations_data:
            # 計算球面大圓近似距離 (度數)
            dist = math.hypot(st["lat"] - target_lat, st["lon"] - target_lon)
            
            if dist < min_dist:
                min_dist = dist
                nearest_st = st

            # 避免距離為零除以零
            if dist < 0.0001:
                return st["u"], st["v"], f"即時觀測 ({st['name']})"

            # 反距離平方加權 p = 2
            weight = 1.0 / (dist ** 2)
            total_weight += weight
            weighted_u += st["u"] * weight
            weighted_v += st["v"] * weight

        u_target = weighted_u / total_weight
        v_target = weighted_v / total_weight
        
        return u_target, v_target, f"CWA 測站空間插值推估 (最近站: {nearest_st['name']})"

    # 備援機制：無 API 資料時退回預設區域背景海流 (如黑潮支流)
    u_fallback = 0.05
    v_fallback = 0.20  # 預設西北向/北向表層流
    return u_fallback, v_fallback, "海峽區域背景海流估算 (備援模式)"

# ==================================================
# 4. 粒子擴散模擬，調用 oil_spill_area.py
# ==================================================

# 台灣主要海象表層海流測站 (依據實際浮標與測站，如龜山島、小琉球等)
CURRENT_STATIONS = [
    {
        "id": "guishan",
        "name": "龜山島浮標測站 (東北角海域)",
        "lat": 24.84,
        "lon": 121.95,
        "u_current": 0.12,  # 東向速度 (m/s)
        "v_current": 0.32,  # 北向速度 (黑潮主流, m/s)
        "desc": "東北部外海黑潮支流表層流"
    },
    {
        "id": "liuqiu",
        "name": "小琉球浮標測站 (西南外海)",
        "lat": 22.34,
        "lon": 120.36,
        "u_current": -0.06, # 偏西北速度 (m/s)
        "v_current": 0.20,  # 北向速度 (m/s)
        "desc": "南部台灣海峽入口表層流"
    },
    {
        "id": "keelung",
        "name": "基隆嶼浮標測站 (北部海域)",
        "lat": 25.18,
        "lon": 121.78,
        "u_current": 0.08,
        "v_current": 0.16,
        "desc": "台灣北部沿岸表層流"
    },
    {
        "id": "taichung",
        "name": "台中港浮標測站 (台灣海峽中段)",
        "lat": 24.28,
        "lon": 120.48,
        "u_current": 0.04,
        "v_current": 0.14,
        "desc": "台灣海峽表層沿岸流"
    },
    {
        "id": "chenggong",
        "name": "台東成功浮標測站 (東部外海)",
        "lat": 23.10,
        "lon": 121.40,
        "u_current": 0.15,
        "v_current": 0.45,
        "desc": "東部黑潮強流表層流"
    }
]

# 找到最接近的測站
def find_nearest_current_station(lat, lon):
    best = CURRENT_STATIONS[0]
    min_dist = float('inf')
    for st in CURRENT_STATIONS:
        d = math.hypot(lat - st["lat"], lon - st["lon"])
        if d < min_dist:
            min_dist = d
            best = st
    return best

# 取得風場、洋流資訊（建立模擬環境）
def build_providers(start_lat, start_lng, wind_level=2):
    """
    建立風場與洋流的時空提供者函式，結合中央氣象署即時測站與台灣海象浮標表層流速
    """
    u_wind, v_wind, wind_info = fetch_cwa(start_lat, start_lng)
    base_speed = float(wind_info.get("speed", 5.0)) * (0.7 + wind_level * 0.3)
    base_dir = float(wind_info.get("direction", 45.0))

    # 依事故位置自動匹配最近之海象表層海流測站 (如龜山島、小琉球等)
    nearest_current = find_nearest_current_station(start_lat, start_lng)
    u_curr = nearest_current["u_current"]
    v_curr = nearest_current["v_current"]
    c_speed = round(math.hypot(u_curr, v_curr), 2)
    c_knots = round(c_speed * 1.944, 2)

    current_info = {
        "station": nearest_current["name"],
        "speed": c_speed,
        "speed_knots": c_knots,
        "u_current": u_curr,
        "v_current": v_curr,
        "source": f"表層海流觀測 ({nearest_current['name']})"
    }

    def wind_provider(lat, lng, obs_time):
        return {
            "wind_speed": base_speed,
            "wind_direction": base_dir,
            "measured_time": obs_time
        }

    def current_provider(lat, lng, obs_time):
        return {
            "u_current": u_curr,
            "v_current": v_curr
        }

    return wind_provider, current_provider, wind_info, current_info


## 判斷台灣哪邊海域
def resolve_region(lat, lng, req_region=None):
    """依經緯度自動判斷所屬台灣周邊海域 (west / north_northeast / east / south)"""
    if req_region and req_region in PARTICLE_REGION_DENSITY:
        return req_region
    if lng < 120.5:
        return "south" if lat < 23.0 else "west"
    elif lng >= 121.2:
        return "north_northeast" if lat > 24.5 else "east"
    else:
        return "north_northeast" if lat > 24.5 else "west"

# 改
# 這裡應該只有三種油 HFO/MDO/MGO
def resolve_oil_type(req_oil_type):
    """油品名稱對應 (相容 HFO/MDO/MGO 與 crude/diesel/hfo/condensate)"""
    mapping = {
        "HFO": "HFO",
        "MDO": "MDO",
        "MGO": "MGO",
        "crude": "HFO",
        "diesel": "MDO",
        "mdo": "MDO",
        "mgo": "MGO",
        "hfo": "HFO",
        "condensate": "MGO"
    }
    return mapping.get(str(req_oil_type).strip(), "HFO")


# 取得時間，如果崩掉就用現在時間
def parse_time(time_str):
    """時間字串容錯解析"""
    if not time_str:
        return datetime.now()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(time_str, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(time_str)
    except Exception:
        return datetime.now()

# ==================================================
# 5. 開後端網頁模擬，用POST
# ==================================================
@app.route('/api/simulate', methods=['POST'])
def simulate():
    data = request.get_json(silent=True) or {}

    try:
        start_lat = float(data.get('lat', 22.6100))
        start_lon = float(data.get('lon', data.get('lng', 120.2600)))
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "經緯度格式錯誤"}), 400

    hours = int(data.get('hours', 12))
    oil_type = resolve_oil_type(data.get('oil_type', 'HFO'))
    spill_size = data.get('spill_size', 'small')
    if spill_size not in PARTICLE_SPILL_SIZES:
        spill_size = 'small'
    region = resolve_region(start_lat, start_lon, data.get('region'))
    # 設定開始時間
    start_time_str = data.get('time') or data.get('start_time')
    start_time = parse_time(start_time_str)
    # 建立風場
    wind_prov, curr_prov, wind_info, current_info = build_providers(start_lat, start_lon)
    # 用 oil_spill_area 的函式
    results = simulate_oil_spill_area(
        start_lat=start_lat,
        start_lng=start_lon,
        region=region,
        oil_type=oil_type,
        spill_size=spill_size,
        start_time=start_time,
        duration_hours=hours,
        dt_seconds=600,
        particle_count=300,
        current_provider=curr_prov,
        wind_provider=wind_prov
    )
    # 回傳結果
    return jsonify({
        "status": "success",
        "start_point": {"lat": start_lat, "lon": start_lon},
        "start_time": start_time.strftime("%Y-%m-%d %H:%M"),
        "total_steps": len(results),
        "wind_info": wind_info,
        "current_info": current_info,
        "history": results
    })


@app.route('/api/v1/simulate-spill', methods=['POST'])
def simulate_spill():
    data = request.get_json(silent=True) or {}
    try:
        start_lat = float(data.get('lat', 23.7))
        start_lng = float(data.get('lng', data.get('lon', 120.8)))
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "經緯度格式錯誤"}), 400

    hours = int(data.get('simulationHours', data.get('hours', 24)))
    wind_level = int(data.get('windForce', 2))
    oil_type = resolve_oil_type(data.get('oilType', 'HFO'))
    spill_size = data.get('spillSize', 'small')
    if spill_size not in PARTICLE_SPILL_SIZES:
        spill_size = 'small'
    region = resolve_region(start_lat, start_lng, data.get('region'))

    start_time_str = data.get('time') or data.get('start_time')
    start_time = parse_time(start_time_str)

    wind_prov, curr_prov, wind_info, current_info = build_providers(start_lat, start_lng, wind_level)

    # 執行油污粒子擴散與凸包計算 (oil_spill_area.py)
    results = simulate_oil_spill_area(
        start_lat=start_lat,
        start_lng=start_lng,
        region=region,
        oil_type=oil_type,
        spill_size=spill_size,
        start_time=start_time,
        duration_hours=hours,
        dt_seconds=600,
        particle_count=300,
        current_provider=curr_prov,
        wind_provider=wind_prov,
        random_seed=42
    )

    time_steps = []
    is_beached = False

    for item in results:
        h_idx = int(item["hourIndex"])
        c_lat = round(item["center"]["lat"], 6)
        c_lng = round(item["center"]["lng"], 6)

        # 海岸線防穿透與擱淺判定
        if is_on_land(c_lat, c_lng):
            is_beached = True

        lat_diff = (c_lat - start_lat) * 111.0
        lng_diff = (c_lng - start_lng) * 111.0 * math.cos(math.radians(start_lat))
        drift_dist = round(math.sqrt(lat_diff**2 + lng_diff**2), 2)

        # 計算粒子外凸包 GeoJSON 多邊形
        hull_coords = calculate_convex_hull_geo(item["particles"])
        if not hull_coords or len(hull_coords) < 3:
            r_deg = max(0.001, math.sqrt(max(0.0001, item["areaKm2"]) / math.pi) / 111.0)
            hull_coords = []
            for j in range(16):
                ang = (j / 16) * math.pi * 2
                hull_coords.append([round(c_lng + r_deg * math.cos(ang), 6), round(c_lat + r_deg * math.sin(ang), 6)])
            hull_coords.append(hull_coords[0])

        core_coords = [
            [round(c_lng + (pt[0] - c_lng) * 0.42, 6), round(c_lat + (pt[1] - c_lat) * 0.42, 6)]
            for pt in hull_coords
        ]

        time_steps.append({
            "hourIndex": h_idx,
            "timeLabel": f"T + {str(h_idx).zfill(2)}:00",
            "center": [c_lat, c_lng],
            "areaKm2": round(item["areaKm2"], 4),
            "driftDistanceKm": drift_dist,
            "beached": is_beached,
            "particles": [{"lat": round(p["lat"], 5), "lng": round(p["lng"], 5)} for p in item["particles"]],
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"layerType": "sheen"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [hull_coords]
                        }
                    },
                    {
                        "type": "Feature",
                        "properties": {"layerType": "core"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [core_coords]
                        }
                    }
                ]
            }
        })

    oil_info = {
        "name": PARTICLE_OIL_TYPES[oil_type]["name"],
        "oilType": oil_type,
        "windage": PARTICLE_OIL_TYPES[oil_type]["windage"],
        "spillSize": spill_size,
        "initialAreaKm2": PARTICLE_SPILL_SIZES[spill_size]["area_km2"],
        "region": region,
        "regionName": PARTICLE_REGION_DENSITY[region]["name"],
        "seawaterDensity": PARTICLE_REGION_DENSITY[region]["density"]
    }

    print(f"[API] 粒子擴散引擎 (oil_spill_area) 運算成功: ({start_lat}, {start_lng}), 油品={oil_info['name']}, 規模={spill_size}, 海域={oil_info['regionName']}, 步數={len(time_steps)}")

    return jsonify({
        "status": "success",
        "wind_info": wind_info,
        "current_info": current_info,
        "oil_info": oil_info,
        "data_status": results[-1]["dataStatus"] if results else None,
        "timeSteps": time_steps
    })

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)