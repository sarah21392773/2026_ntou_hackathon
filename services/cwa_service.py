import os
import json
import logging
import math
import requests

logger = logging.getLogger(__name__)

def get_cwa_api_key() -> str:
    """從環境變數或根目錄的 config.json 取得 CWA API Key"""
    api_key = os.environ.get("CWAR_API_KEY")
    if not api_key:
        # 優先搜尋專案根目錄，相容 src/config.json
        candidate_paths = [
            os.path.join(os.path.dirname(__file__), "..", "config.json"),
            os.path.join(os.path.dirname(__file__), "..", "src", "config.json")
        ]
        for config_path in candidate_paths:
            if os.path.exists(config_path):
                try:
                    with open(config_path, "r", encoding="utf-8") as f:
                        api_key = json.load(f).get("cwa_api_key")
                    if api_key:
                        break
                except Exception as e:
                    logger.error(f"讀取 {config_path} 失敗: {e}")
    return api_key


def fetch_cwa_weather(target_lat: float, target_lon: float):
    """從中央氣象署 API 取得最靠近目標經緯度的風速與風向，失敗時自動切換至季節氣候模型"""
    api_key = get_cwa_api_key()

    if api_key:
        try:
            url = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001"
            params = {"Authorization": api_key, "format": "JSON"}
            resp = requests.get(url, params=params, timeout=5, verify=False)

            if resp.status_code == 200:
                stations = resp.json().get("records", {}).get("Station", [])
                best_station = None
                min_dist = float("inf")

                for st in stations:
                    coords = st.get("GeoInfo", {}).get("Coordinates", [])
                    if not coords:
                        continue
                    target_coord = next((c for c in coords if c.get("CoordinateName") == "WGS84"), coords[0])
                    try:
                        st_lon = float(target_coord.get("StationLongitude", 0))
                        st_lat = float(target_coord.get("StationLatitude", 0))
                        ws = float(st.get("WeatherElement", {}).get("WindSpeed", -99))
                        wd = float(st.get("WeatherElement", {}).get("WindDirection", -99))
                    except (ValueError, TypeError):
                        continue

                    if ws >= 0 and wd >= 0:
                        dist = (st_lat - target_lat)**2 + (st_lon - target_lon)**2
                        if dist < min_dist:
                            min_dist = dist
                            best_station = {"name": st.get("StationName", "近岸測站"), "speed": ws, "direction": wd}

                if best_station:
                    speed = best_station["speed"]
                    deg = best_station["direction"]
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
            logger.warning(f"CWA API 連線失敗，改用季風模型: {e}")

    # 備援模型：東北季風環境場
    deg = 45.0
    speed = 5.0
    rad = math.radians(deg)
    return -speed * math.sin(rad), -speed * math.cos(rad), {
        "station": "季節氣候模型",
        "speed": speed,
        "direction": deg,
        "source": "台灣海峽東北季風環境場"
    }
