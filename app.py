import logging
import math
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# 引入油污擴散核心模組
from oil_spill_area import (
    simulate_oil_spill_area,
    calculate_convex_hull_geo,
    OIL_TYPES as PARTICLE_OIL_TYPES,
    SPILL_SIZES as PARTICLE_SPILL_SIZES,
    REGION_DENSITY as PARTICLE_REGION_DENSITY
)

# 引入自訂模組與服務
from utils.geometry import is_on_land, haversine_distance, find_nearest_current_station
from utils.validators import (
    resolve_region, resolve_oil_type, parse_simulation_inputs, build_data_status
)
from services.cwa_service import fetch_cwa_weather
from services.nodass_service import fetch_nodass_ocean_currents

# ==================================================
# 0. 系統初始化與設定
# ==================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)


def build_simulation_providers(start_lat: float, start_lng: float, wind_level: int = 2, start_time: datetime = None):
    """建立風場與海流回呼函式（優先使用 NODASS 真實海流與 CWA 氣象，支援時序動態轉向）"""
    if start_time is None:
        start_time = datetime.now()
    u_wind, v_wind, wind_info = fetch_cwa_weather(start_lat, start_lng)
    observed_speed = float(wind_info.get("speed", 5.0))
    wind_multiplier = 0.7 + wind_level * 0.3
    base_speed = observed_speed * wind_multiplier
    base_dir = float(wind_info.get("direction", 45.0))
    
    wind_info = {
        **wind_info,
        "observedSpeed": observed_speed,
        "simulationSpeed": round(base_speed, 2),
        "windLevel": wind_level,
        "windMultiplier": round(wind_multiplier, 2),
    }

    nodass_result = fetch_nodass_ocean_currents(start_lat, start_lng)
    if nodass_result:
        u_curr, v_curr, current_info = nodass_result
    else:
        nearest_current = find_nearest_current_station(start_lat, start_lng)
        u_curr = nearest_current["u_current"]
        v_curr = nearest_current["v_current"]
        c_speed = round(math.hypot(u_curr, v_curr), 2)
        current_info = {
            "station": nearest_current["name"],
            "speed": c_speed,
            "speed_knots": round(c_speed * 1.944, 2),
            "u_current": u_curr,
            "v_current": v_curr,
            "source": f"備援海流觀測 ({nearest_current['name']})"
        }

    def wind_provider(lat, lng, obs_time):
        # 考慮大氣風場隨時間的微幅日夜變化與偏轉 (Diurnal variation & gust fluctuation)
        delta_hours = (obs_time - start_time).total_seconds() / 3600.0 if 'start_time' in locals() and start_time else 0.0
        # 每 12~24 小時存在氣壓場輕微偏角 (±15度) 與風速波動 (±15%)
        dir_shift = 14.0 * math.sin(delta_hours * math.pi / 12.0)
        speed_factor = 1.0 + 0.15 * math.cos(delta_hours * math.pi / 8.0)
        dynamic_speed = max(0.5, base_speed * speed_factor)
        dynamic_dir = (base_dir + dir_shift) % 360.0
        return {"wind_speed": dynamic_speed, "wind_direction": dynamic_dir, "measured_time": obs_time}

    def current_provider(lat, lng, obs_time):
        # 台灣海峽與周邊海域受半日潮 (M2 半日潮汐週期約 12.42 小時) 與黑潮支流交互影響
        delta_hours = (obs_time - start_time).total_seconds() / 3600.0 if 'start_time' in locals() and start_time else 0.0
        tide_phase = (delta_hours / 12.42) * 2 * math.pi
        # 潮流橢圓運動 (沿岸往復流分量)
        tide_u = 0.08 * math.sin(tide_phase)
        tide_v = 0.12 * math.cos(tide_phase)
        return {"u_current": u_curr + tide_u, "v_current": v_curr + tide_v}

    return wind_provider, current_provider, wind_info, current_info


# ==================================================
# 3. Flask API 路由 (Endpoints)
# ==================================================

@app.route('/api/simulate', methods=['POST'])
def simulate():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"status": "error", "message": "請求內容必須是 JSON 物件"}), 400
    
    try:
        start_lat, start_lon, hours, _, start_time = parse_simulation_inputs(
            data, default_hours=12, default_lat=22.6100, default_lng=120.2600
        )
        oil_type = resolve_oil_type(data.get('oil_type', 'HFO'))
        spill_size = data.get('spill_size', 'small')
        if spill_size not in PARTICLE_SPILL_SIZES:
            raise ValueError(f"不支援的洩漏規模：{spill_size}")
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400

    region = resolve_region(start_lat, start_lon, data.get('region'))
    wind_prov, curr_prov, wind_info, current_info = build_simulation_providers(start_lat, start_lon, 2, start_time)
    
    try:
        results = simulate_oil_spill_area(
            start_lat=start_lat, start_lng=start_lon, region=region,
            oil_type=oil_type, spill_size=spill_size, start_time=start_time,
            duration_hours=hours, dt_seconds=600, particle_count=300,
            current_provider=curr_prov, wind_provider=wind_prov
        )
    except Exception:
        logger.exception("/api/simulate 模擬失敗")
        return jsonify({"status": "error", "message": "油污模擬失敗，請檢查伺服器紀錄"}), 500

    return jsonify({
        "status": "success",
        "start_point": {"lat": start_lat, "lon": start_lon},
        "start_time": start_time.strftime("%Y-%m-%d %H:%M"),
        "total_steps": len(results),
        "wind_info": wind_info,
        "current_info": current_info,
        "data_status": build_data_status(wind_info, current_info),
        "history": results
    })


@app.route('/api/v1/simulate-spill', methods=['POST'])
def simulate_spill():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"status": "error", "message": "請求內容必須是 JSON 物件"}), 400
        
    try:
        start_lat, start_lng, hours, wind_level, start_time = parse_simulation_inputs(
            data, default_hours=24, default_lat=23.7, default_lng=120.8, with_wind_level=True
        )
        oil_type = resolve_oil_type(data.get('oilType', 'HFO'))
        spill_size = str(data.get('spillSize', 'small')).strip().lower()
        if spill_size not in PARTICLE_SPILL_SIZES:
            raise ValueError(f"不支援的洩漏規模：{spill_size}；可用值為 small、medium、large")
        region = resolve_region(start_lat, start_lng, data.get('region'))
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 400

    wind_prov, curr_prov, wind_info, current_info = build_simulation_providers(
        start_lat, start_lng, wind_level, start_time
    )
    
    try:
        results = simulate_oil_spill_area(
            start_lat=start_lat, start_lng=start_lng, region=region,
            oil_type=oil_type, spill_size=spill_size, start_time=start_time,
            duration_hours=hours, dt_seconds=600, particle_count=300,
            current_provider=curr_prov, wind_provider=wind_prov, random_seed=42
        )
    except Exception:
        logger.exception("/api/v1/simulate-spill 模擬失敗")
        return jsonify({"status": "error", "message": "油污模擬失敗，請檢查伺服器紀錄"}), 500

    time_steps = []
    is_beached = False
    for item in results:
        h_idx = int(item["hourIndex"])
        c_lat = round(item["center"]["lat"], 6)
        c_lng = round(item["center"]["lng"], 6)

        if is_on_land(c_lat, c_lng):
            is_beached = True

        drift_dist = round(haversine_distance(start_lat, start_lng, c_lat, c_lng), 2)
        hull_coords = calculate_convex_hull_geo(item["particles"])
        if not hull_coords or len(hull_coords) < 4:
            r_deg = max(0.001, math.sqrt(max(0.0001, item["areaKm2"]) / math.pi) / 111.0)
            hull_coords = [
                [round(c_lng + r_deg * math.cos(j * math.pi / 8), 6),
                 round(c_lat + r_deg * math.sin(j * math.pi / 8), 6)]
                for j in range(16)
            ]
            hull_coords.append(hull_coords[0])

        core_coords = [
            [round(c_lng + (pt[0] - c_lng) * 0.42, 6),
             round(c_lat + (pt[1] - c_lat) * 0.42, 6)]
            for pt in hull_coords
        ]

        time_steps.append({
            "hourIndex": h_idx,
            "timeLabel": f"T + {str(h_idx).zfill(2)}:00",
            "center": [c_lat, c_lng],
            "areaKm2": round(float(item["areaKm2"]), 4),
            "driftDistanceKm": drift_dist,
            "beached": is_beached,
            "dataStatus": item.get("dataStatus"),
            "particles": [
                {"lat": round(p["lat"], 5), "lng": round(p.get("lng", p.get("lon")), 5)}
                for p in item["particles"]
            ],
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "properties": {"layerType": "sheen"},
                     "geometry": {"type": "Polygon", "coordinates": [hull_coords]}},
                    {"type": "Feature", "properties": {"layerType": "core"},
                     "geometry": {"type": "Polygon", "coordinates": [core_coords]}}
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
        "seawaterDensity": PARTICLE_REGION_DENSITY[region]["density"],
        "parameterSource": PARTICLE_OIL_TYPES[oil_type].get("parameter_source", "UNKNOWN")
    }
    data_status = build_data_status(wind_info, current_info)

    logger.info(
        "模擬成功：位置=(%.4f, %.4f)，油品=%s，步數=%d，風場=%s，海流=%s",
        start_lat, start_lng, oil_info['name'], len(time_steps),
        data_status['windSource'], data_status['currentSource']
    )

    return jsonify({
        "status": "success",
        "wind_info": wind_info,
        "current_info": current_info,
        "oil_info": oil_info,
        "data_status": data_status,
        "timeSteps": time_steps
    })


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_proxy(path):
    normalized = path.replace("\\", "/")
    parts = normalized.split("/")
    filename = parts[-1].lower()
    blocked_names = {"config.json", ".env", "app.py", "oil_spill_area.py"}
    if any(part.startswith(".") for part in parts) or filename in blocked_names or filename.endswith((".py", ".pyc")):
        return jsonify({"status": "error", "message": "找不到資源"}), 404
    return send_from_directory('.', normalized)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)