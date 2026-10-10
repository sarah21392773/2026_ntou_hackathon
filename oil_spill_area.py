# oil_spill_area.py
# 台灣周圍海域簡易油污面積與中心估算
#
# 只計算：
# 1. 油污中心 latitude / longitude
# 2. 油污面積 areaKm2
#
# 不計算：
# 蒸發、乳化、溶解、海岸線碰撞及其他油污變化。
#
# 尚未取得的資料會保留接入口：
# - 海流東向速度 u_current (m/s)
# - 海流北向速度 v_current (m/s)
# - 風速與風向的時空查詢函式
#
# 若海流或風場尚未接入，該項漂移暫時設為 0，
# 並在輸出中標記資料狀態。此時結果不是完整預測。

import math
import random
from datetime import timedelta


# ==================================================
# 1. 基本參數
# ==================================================

EARTH_RADIUS_M = 6_371_000.0

# 使用者指定的水平擴散係數。
# 假設值，單位 m^2/s，尚未經實測校正。
HORIZONTAL_DIFFUSION_COEFFICIENT = 1.0

# 海水密度基準值：使用者指定。
DEFAULT_SEAWATER_DENSITY = 1025.0  # kg/m^3

# 以下四區密度是不同的測試估計值，不是實測資料。
# 本簡化版不使用海水密度直接計算水平油污面積。
REGION_DENSITY = {
    "west": {
        "name": "台灣海峽西側",
        "density": 1023.5,
        "source": "ESTIMATED_TEST"
    },
    "north_northeast": {
        "name": "台灣北部與東北部",
        "density": 1024.0,
        "source": "ESTIMATED_TEST"
    },
    "east": {
        "name": "台灣東部外海",
        "density": 1024.5,
        "source": "ESTIMATED_TEST"
    },
    "south": {
        "name": "台灣南部外海",
        "density": 1024.2,
        "source": "ESTIMATED_TEST"
    }
}


# ==================================================
# 2. 油品設定
# ==================================================

# 風漂移係數是暫定測試值。
# 正式使用前，應依油品與研究文獻校正。
OIL_TYPES = {
    "HFO": {
        "name": "重油／重燃料油",
        "oil_density_kg_m3": 950.0,
        "windage": 0.02,
        "parameter_source": "ESTIMATED_TEST"
    },
    "MDO": {
        "name": "船用柴油",
        "oil_density_kg_m3": 860.0,
        "windage": 0.03,
        "parameter_source": "ESTIMATED_TEST"
    },
    "MGO": {
        "name": "船用輕柴油",
        "oil_density_kg_m3": 850.0,
        "windage": 0.03,
        "parameter_source": "ESTIMATED_TEST"
    }
}


# ==================================================
# 3. 初始油污面積
# ==================================================

# 小型：0.1–0.3 公頃
# 1 公頃 = 0.01 km^2
#
# 中型：5–15 km^2
# 大型：至少 1000 km^2
#
# 各規模預設採用一個代表值。
# 這些數值是初始海面油污面積，不是溢油體積。

SPILL_SIZES = {
    "small": {
        "name": "小型",
        "area_km2": 0.002,
        "range": "0.1–0.3 公頃"
    },
    "medium": {
        "name": "中型",
        "area_km2": 10.0,
        "range": "5–15 km^2"
    },
    "large": {
        "name": "大型",
        "area_km2": 1000.0,
        "range": "至少 1000 km^2"
    }
}


# ==================================================
# 4. 尚未取得資料的接入口
# ==================================================

def get_current_velocity(lat, lng, observation_time):
    """
    TODO：接入海流 NetCDF 資料。

    預期回傳：
    {
        "u_current": 東向速度，m/s,
        "v_current": 北向速度，m/s
    }

    目前回傳 None，代表尚未接入。
    """

    # TODO：依經緯度與時間對海流格點進行插值。
    return None


def get_wind_velocity(lat, lng, observation_time):
    """
    TODO：接入風測站資料。

    預期回傳：
    {
        "wind_speed": 風速，m/s,
        "wind_direction": 氣象風向，度,
        "measured_time": datetime
    }

    wind_direction 使用氣象慣例：
    0 度為北風，90 度為東風，
    表示風從哪個方向吹來。

    目前回傳 None，代表尚未接入。
    """

    # TODO：依位置、模擬時間取得合適的測站觀測。
    return None


# ==================================================
# 5. 風向風速轉成東向與北向分量
# ==================================================

def wind_to_components(wind_speed, wind_direction):
    if wind_speed < 0:
        raise ValueError("風速不能小於 0")

    theta = math.radians(wind_direction)

    # 向東為正，向北為正
    u_wind = -wind_speed * math.sin(theta)
    v_wind = -wind_speed * math.cos(theta)

    return u_wind, v_wind


# ==================================================
# 6. 計算油污中心
# ==================================================

def calculate_center(particles):
    """
    使用粒子質量權重計算中心。
    mass 在此代表相對權重。
    """

    total_mass = sum(p["mass"] for p in particles)

    if total_mass <= 0:
        return None

    lat = sum(
        p["lat"] * p["mass"] for p in particles
    ) / total_mass

    lng = sum(
        p["lng"] * p["mass"] for p in particles
    ) / total_mass

    return {
        "lat": lat,
        "lng": lng
    }


# ==================================================
# 7. 建立初始粒子
# ==================================================

def create_initial_particles(
    center_lat,
    center_lng,
    area_km2,
    particle_count=300,
    random_seed=42
):
    """
    在初始圓形範圍內建立粒子。
    初始幾何面積由 area_km2 指定。
    """

    if area_km2 <= 0:
        raise ValueError("初始面積必須大於 0")

    if particle_count < 3:
        raise ValueError("粒子數至少為 3")

    rng = random.Random(random_seed)

    radius_m = math.sqrt(
        area_km2 * 1_000_000.0 / math.pi
    )

    particles = []

    for _ in range(particle_count):
        r = radius_m * math.sqrt(rng.random())
        theta = rng.uniform(0, 2 * math.pi)

        east_m = r * math.cos(theta)
        north_m = r * math.sin(theta)

        lat = center_lat + math.degrees(
            north_m / EARTH_RADIUS_M
        )

        cos_lat = max(
            0.01, abs(math.cos(math.radians(center_lat)))
        )

        lng = center_lng + math.degrees(
            east_m / (EARTH_RADIUS_M * cos_lat)
        )

        particles.append({
            "lat": lat,
            "lng": lng,
            "mass": 1.0
        })

    return particles


def _cross_product(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


# ==================================================
# 8. 計算粒子分布的估算面積
# ==================================================

def calculate_area_km2(particles):
    """
    用粒子凸包估算覆蓋面積。

    注意：
    - 這是幾何估算，不是衛星觀測面積。
    - 凸包可能包含粒子之間沒有油污的空白區域。
    - 初始時間的面積直接使用使用者設定值。
    """

    if len(particles) < 3:
        return 0.0

    center = calculate_center(particles)

    if center is None:
        return 0.0

    lat0 = math.radians(center["lat"])
    xy = []

    for p in particles:
        x = (
            math.radians(p["lng"] - center["lng"])
            * EARTH_RADIUS_M * math.cos(lat0)
        )

        y = (
            math.radians(p["lat"] - center["lat"])
            * EARTH_RADIUS_M
        )

        xy.append((x, y))

    # 用單調鏈演算法計算二維凸包。
    points = sorted(set(xy))

    if len(points) < 3:
        return 0.0

    lower = []
    for p in points:
        while (
            len(lower) >= 2
            and _cross_product(lower[-2], lower[-1], p) <= 0
        ):
            lower.pop()
        lower.append(p)

    upper = []
    for p in reversed(points):
        while (
            len(upper) >= 2
            and _cross_product(upper[-2], upper[-1], p) <= 0
        ):
            upper.pop()
        upper.append(p)

    hull = lower[:-1] + upper[:-1]

    if len(hull) < 3:
        return 0.0

    # Shoelace formula：多邊形面積，單位 m^2。
    area_m2 = 0.0

    for i in range(len(hull)):
        x1, y1 = hull[i]
        x2, y2 = hull[(i + 1) % len(hull)]

        area_m2 += x1 * y2 - x2 * y1

    area_m2 = abs(area_m2) / 2.0

    return area_m2 / 1_000_000.0


def calculate_convex_hull_geo(particles):
    """
    輔助函式：計算粒子凸包並轉為 WGS84 經緯度座標清單 [[lng, lat], ...]
    供前端 Leaflet GeoJSON 渲染多邊形使用
    """
    if len(particles) < 3:
        return []

    center = calculate_center(particles)
    if center is None:
        return []

    lat0 = math.radians(center["lat"])
    xy = []
    for p in particles:
        x = (math.radians(p["lng"] - center["lng"]) * EARTH_RADIUS_M * math.cos(lat0))
        y = (math.radians(p["lat"] - center["lat"]) * EARTH_RADIUS_M)
        xy.append((x, y))

    points = sorted(set(xy))
    if len(points) < 3:
        return []

    lower = []
    for p in points:
        while len(lower) >= 2 and _cross_product(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)

    upper = []
    for p in reversed(points):
        while len(upper) >= 2 and _cross_product(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)

    hull = lower[:-1] + upper[:-1]
    if len(hull) < 3:
        return []

    geo_coords = []
    cos_lat = max(0.01, math.cos(lat0))
    for x_m, y_m in hull:
        p_lat = center["lat"] + math.degrees(y_m / EARTH_RADIUS_M)
        p_lng = center["lng"] + math.degrees(x_m / (EARTH_RADIUS_M * cos_lat))
        geo_coords.append([round(p_lng, 6), round(p_lat, 6)])

    if geo_coords:
        geo_coords.append(geo_coords[0])  # 閉合多邊形

    return geo_coords


# ==================================================
# 9. 移動一個時間步
# ==================================================

def move_particles(
    particles,
    observation_time,
    dt_seconds,
    oil_type,
    current_provider=None,
    wind_provider=None
):
    """
    平流 + 水平隨機擴散。

    缺少海流時，海流速度暫設 0。
    缺少風場時，風漂移暫設 0。
    資料狀態會回傳，提醒結果並非完整預測。
    """

    oil = OIL_TYPES[oil_type]
    windage = oil["windage"]

    new_particles = []

    current_available = current_provider is not None
    wind_available = wind_provider is not None

    for p in particles:
        lat = p["lat"]
        lng = p["lng"]

        # ------------------------------------------
        # 海流：尚未取得時使用 0，並在結果註記
        # ------------------------------------------
        current = None

        if current_provider is not None:
            current = current_provider(
                lat, lng, observation_time
            )

        if current is None:
            u_current = 0.0
            v_current = 0.0
            current_available = False
        else:
            u_current = float(current["u_current"])
            v_current = float(current["v_current"])

        # ------------------------------------------
        # 風場：尚未取得時使用 0，並在結果註記
        # ------------------------------------------
        wind = None

        if wind_provider is not None:
            wind = wind_provider(
                lat, lng, observation_time
            )

        if wind is None:
            u_wind = 0.0
            v_wind = 0.0
            wind_available = False
        else:
            u_wind, v_wind = wind_to_components(
                float(wind["wind_speed"]),
                float(wind["wind_direction"])
            )

        # ------------------------------------------
        # 平流：海流 + 風漂移
        # ------------------------------------------
        east_velocity = u_current + windage * u_wind
        north_velocity = v_current + windage * v_wind

        east_m = east_velocity * dt_seconds
        north_m = north_velocity * dt_seconds

        # ------------------------------------------
        # 水平隨機擴散
        # D = 1 m^2/s（暫定假設）
        # 每一方向標準差 sqrt(2 * D * dt)
        # ------------------------------------------
        sigma_m = math.sqrt(
            2.0
            * HORIZONTAL_DIFFUSION_COEFFICIENT
            * dt_seconds
        )

        east_m += random.gauss(0.0, sigma_m)
        north_m += random.gauss(0.0, sigma_m)

        new_lat = lat + math.degrees(
            north_m / EARTH_RADIUS_M
        )

        cos_lat = max(
            0.01, abs(math.cos(math.radians(lat)))
        )

        new_lng = lng + math.degrees(
            east_m / (EARTH_RADIUS_M * cos_lat)
        )

        new_particles.append({
            "lat": new_lat,
            "lng": new_lng,
            "mass": p["mass"]
        })

    data_status = {
        "currentAvailable": current_available,
        "windAvailable": wind_available
    }

    return new_particles, data_status


# ==================================================
# 10. 主模擬函式
# ==================================================

def simulate_oil_spill_area(
    start_lat,
    start_lng,
    region,
    oil_type,
    spill_size,
    start_time,
    duration_hours=24,
    dt_seconds=600,
    particle_count=300,
    current_provider=None,
    wind_provider=None,
    random_seed=42
):
    """
    回傳每個時間點的：
    hourIndex、center、areaKm2、particles。

    region:
      west / north_northeast / east / south

    oil_type:
      HFO / MDO / MGO

    spill_size:
      small / medium / large

    start_time:
      datetime 物件，表示油污開始時間。

    current_provider:
      尚未取得時可以不傳入。
      接入後應回傳 u_current、v_current（m/s）。

    wind_provider:
      尚未接入時可以不傳入。
      接入後應回傳 wind_speed、wind_direction。

    不計算蒸發、不處理海岸線。
    """

    if oil_type not in OIL_TYPES:
        raise ValueError(
            f"油品必須選擇 {list(OIL_TYPES.keys())}"
        )

    if spill_size not in SPILL_SIZES:
        raise ValueError(
            f"規模必須選擇 {list(SPILL_SIZES.keys())}"
        )

    if region not in REGION_DENSITY:
        raise ValueError(
            f"海域必須選擇 {list(REGION_DENSITY.keys())}"
        )

    if duration_hours <= 0 or dt_seconds <= 0:
        raise ValueError("模擬時間與時間步長必須大於 0")

    if particle_count < 3:
        raise ValueError("粒子數至少為 3")

    random.seed(random_seed)

    spill = SPILL_SIZES[spill_size]
    oil = OIL_TYPES[oil_type]
    seawater = REGION_DENSITY[region]

    initial_area_km2 = spill["area_km2"]

    particles = create_initial_particles(
        start_lat,
        start_lng,
        initial_area_km2,
        particle_count=particle_count,
        random_seed=random_seed
    )

    results = []

    # 初始狀態使用指定的初始面積，
    # 避免因粒子數有限而讓初始凸包面積偏小。
    results.append({
        "hourIndex": 0,
        "time": start_time.isoformat(),
        "center": {
            "lat": start_lat,
            "lng": start_lng
        },
        "areaKm2": initial_area_km2,
        "particles": [p.copy() for p in particles],
        "oilType": oil_type,
        "oilName": oil["name"],
        "oilParameterSource": oil["parameter_source"],
        "spillSize": spill_size,
        "spillSizeName": spill["name"],
        "initialAreaKm2": initial_area_km2,
        "seawaterDensityKgM3": seawater["density"],
        "seawaterDensitySource": seawater["source"],
        "defaultSeawaterDensityKgM3":
            DEFAULT_SEAWATER_DENSITY,
        "diffusionCoefficientM2S":
            HORIZONTAL_DIFFUSION_COEFFICIENT,
        "dataStatus": {
            "currentAvailable": current_provider is not None,
            "windAvailable": wind_provider is not None
        }
    })

    total_seconds = int(duration_hours * 3600)
    elapsed_seconds = 0

    while elapsed_seconds < total_seconds:
        step = min(dt_seconds, total_seconds - elapsed_seconds)

        observation_time = start_time + timedelta(
            seconds=elapsed_seconds
        )

        particles, data_status = move_particles(
            particles,
            observation_time,
            step,
            oil_type,
            current_provider=current_provider,
            wind_provider=wind_provider
        )

        elapsed_seconds += step

        # 每小時輸出一次，最後不足一小時也輸出。
        if (
            elapsed_seconds % 3600 == 0
            or elapsed_seconds >= total_seconds
        ):
            results.append({
                "hourIndex": int(elapsed_seconds / 3600),
                "time": (
                    start_time
                    + timedelta(seconds=elapsed_seconds)
                ).isoformat(),
                "center": calculate_center(particles),
                "areaKm2": calculate_area_km2(particles),
                "particles": [p.copy() for p in particles],
                "oilType": oil_type,
                "oilName": oil["name"],
                "oilParameterSource": oil["parameter_source"],
                "spillSize": spill_size,
                "spillSizeName": spill["name"],
                "initialAreaKm2": initial_area_km2,
                "seawaterDensityKgM3": seawater["density"],
                "seawaterDensitySource": seawater["source"],
                "defaultSeawaterDensityKgM3":
                    DEFAULT_SEAWATER_DENSITY,
                "diffusionCoefficientM2S":
                    HORIZONTAL_DIFFUSION_COEFFICIENT,
                "dataStatus": data_status
            })

    return results

