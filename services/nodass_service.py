from datetime import datetime
import logging
import requests
from utils.geometry import haversine_distance

logger = logging.getLogger(__name__)

def fetch_nodass_ocean_currents(target_lat: float, target_lon: float):
    """從 NODASS 自動尋找最近測站，取得即時海流並轉換為 U/V 向向量分量"""
    stations_url = "https://nodass.namr.gov.tw/noapi/namr/v1/obs/stations"
    try:
        resp = requests.get(stations_url, timeout=5)
        if resp.status_code != 200:
            logger.warning("無法取得 NODASS 測站清單")
            return None

        stations = resp.json()
        closest_station = None
        min_distance = float("inf")

        for station in stations:
            s_lat = station.get("Latitude") or station.get("lat")
            s_lon = station.get("Longitude") or station.get("lon")
            if s_lat is None or s_lon is None:
                continue

            dist = haversine_distance(target_lat, target_lon, float(s_lat), float(s_lon))
            if dist < min_distance:
                min_distance = dist
                closest_station = station

        if not closest_station:
            return None

        station_id = closest_station.get("Id")
        station_name = closest_station.get("Title") or closest_station.get("name", "未知測站")

        today = datetime.now().strftime("%Y-%m-%d")
        data_url = f"https://nodass.namr.gov.tw/noapi/namr/v1/obs/{station_id}/data"
        params = {"date1": today, "date2": today}

        data_resp = requests.get(data_url, params=params, timeout=5)
        if data_resp.status_code != 200:
            logger.warning(f"取得測站 {station_id} 資料失敗")
            return None

        data = data_resp.json()
        if not isinstance(data, list) or len(data) == 0:
            return None

        latest_record = data[-1]
        speed_raw = latest_record.get("CurrentSpeed") or latest_record.get("speed") or latest_record.get("currentSpeed", -99)
        dir_raw = latest_record.get("CurrentDirection") or latest_record.get("direction") or latest_record.get("currentDirection", -99)

        import math
        speed = float(speed_raw)
        direction = float(dir_raw)

        if speed < 0 or direction < 0:
            return None

        current_speed_ms = speed / 100.0 if speed > 10 else speed
        rad = math.radians(direction)
        u_current = current_speed_ms * math.sin(rad)
        v_current = current_speed_ms * math.cos(rad)

        current_info = {
            "station": f"{station_name} (距離 {min_distance:.1f}km)",
            "speed": round(current_speed_ms, 2),
            "speed_knots": round(current_speed_ms * 1.944, 2),
            "u_current": u_current,
            "v_current": v_current,
            "source": f"NODASS 即時觀測 ({station_name})"
        }
        return u_current, v_current, current_info

    except Exception as e:
        logger.error(f"讀取 NODASS 發生異常: {e}")
        return None