from datetime import datetime
import math
from oil_spill_area import REGION_DENSITY as PARTICLE_REGION_DENSITY

def resolve_region(lat: float, lng: float, req_region: str = None) -> str:
    """依經緯度自動判斷所屬台灣周邊海域"""
    if req_region and req_region in PARTICLE_REGION_DENSITY:
        return req_region
    if lng < 120.5:
        return "south" if lat < 23.0 else "west"
    elif lng >= 121.2:
        return "north_northeast" if lat > 24.5 else "east"
    else:
        return "north_northeast" if lat > 24.5 else "west"


def resolve_oil_type(req_oil_type: str) -> str:
    """將前端油品代碼映射至核心模型支援的代碼"""
    mapping = {"hfo": "HFO", "mdo": "MDO", "mgo": "MGO"}
    key = str(req_oil_type or "HFO").strip().lower()
    if key not in mapping:
        raise ValueError(f"不支援的油品代碼：{req_oil_type}")
    return mapping[key]


def parse_time(time_str: str) -> datetime:
    """解析 ISO 8601 或常見格式的起始時間字串"""
    if not time_str:
        return datetime.now()
    if not isinstance(time_str, str):
        raise ValueError("time 必須是日期時間字串")

    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(time_str, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(time_str)
    except ValueError as exc:
        raise ValueError("時間格式錯誤，請使用 ISO 8601 格式") from exc


def parse_simulation_inputs(data: dict, *, default_hours: int, default_lat: float, default_lng: float, with_wind_level: bool = False):
    """集中驗證 API 輸入參數"""
    try:
        lat = float(data.get("lat", default_lat))
        lng = float(data.get("lng", data.get("lon", default_lng)))
    except (TypeError, ValueError) as exc:
        raise ValueError("經緯度必須是數字") from exc

    if not math.isfinite(lat) or not -90 <= lat <= 90:
        raise ValueError("緯度必須介於 -90 至 90")
    if not math.isfinite(lng) or not -180 <= lng <= 180:
        raise ValueError("經度必須介於 -180 至 180")

    raw_hours = data.get("simulationHours", data.get("hours", default_hours))
    try:
        hours_float = float(raw_hours)
    except (TypeError, ValueError) as exc:
        raise ValueError("模擬時數必須是整數") from exc
    if not math.isfinite(hours_float) or not hours_float.is_integer():
        raise ValueError("模擬時數必須是整數")
    hours = int(hours_float)
    if not 1 <= hours <= 120:
        raise ValueError("模擬時數必須介於 1 至 120 小時")

    wind_level = None
    if with_wind_level:
        raw_wind = data.get("windForce", 2)
        try:
            wind_float = float(raw_wind)
        except (TypeError, ValueError) as exc:
            raise ValueError("風力等級必須是 1、2 或 3") from exc
        if not math.isfinite(wind_float) or not wind_float.is_integer() or int(wind_float) not in (1, 2, 3):
            raise ValueError("風力等級必須是 1、2 或 3")
        wind_level = int(wind_float)

    start_time = parse_time(data.get("time") or data.get("start_time"))
    return lat, lng, hours, wind_level, start_time


def build_data_status(wind_info: dict, current_info: dict) -> dict:
    """回報真實觀測與備援資料狀態"""
    wind_source = str((wind_info or {}).get("source", ""))
    current_source = str((current_info or {}).get("source", ""))
    wind_live = "氣象署實測" in wind_source
    current_live = "NODASS 即時觀測" in current_source
    return {
        "windAvailable": bool(wind_source),
        "currentAvailable": bool(current_source),
        "windIsLive": wind_live,
        "currentIsLive": current_live,
        "windSource": wind_source or "未知",
        "currentSource": current_source or "未知",
        "windUsingFallback": bool(wind_source) and not wind_live,
        "currentUsingFallback": bool(current_source) and not current_live,
    }