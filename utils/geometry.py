import math
from config import TAIWAN_MAINLAND_POLYGON, CURRENT_STATIONS

def is_on_land(lat: float, lon: float) -> bool:
    """使用射線法 (Ray-casting Algorithm) 判斷點是否落入台灣陸地多邊形"""
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


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """大圓距離計算公式 (Haversine Formula)，回傳單位：公里"""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return 6371.0 * c


def find_nearest_current_station(lat: float, lon: float) -> dict:
    """尋找距離目標最近的備援表層海流測站"""
    best = CURRENT_STATIONS[0]
    min_dist = float('inf')
    for st in CURRENT_STATIONS:
        d = math.hypot(lat - st["lat"], lon - st["lon"])
        if d < min_dist:
            min_dist = d
            best = st
    return best