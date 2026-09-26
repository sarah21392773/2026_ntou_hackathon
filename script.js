// 初始化地圖 (以高雄港外海為中心)
const map = L.map('map').setView([22.6100, 120.2600], 13);

// 使用 Dark 模式底圖以突顯油污視覺
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap, © CARTO'
}).addTo(map);

let simulationData = null;
let currentStep = 0;
let animationTimer = null;
let particleMarkers = [];

// 載入 JSON 資料 (預設為同目錄下的 oil_spill_data.json)
async function loadSimulationData() {
    try {
        const response = await fetch('oil_spill_data.json');
        simulationData = await response.json();
        initControls();
        renderStep(0);
    } catch (err) {
        console.warn("無法讀取油污檔，改用內建測試 Demo 數據", err);
        useFallbackData();
    }
}

function initControls() {
    const maxStep = simulationData.history.length - 1;
    const slider = document.getElementById('timeSlider');
    slider.max = maxStep;
    
    slider.addEventListener('input', (e) => {
        currentStep = parseInt(e.target.value);
        renderStep(currentStep);
    });

    document.getElementById('playBtn').addEventListener('click', startAnimation);
    document.getElementById('pauseBtn').addEventListener('click', stopAnimation);
}

function renderStep(stepIndex) {
    if (!simulationData || !simulationData.history[stepIndex]) return;

    // 清除上一影格的粒子
    particleMarkers.forEach(m => map.removeLayer(m));
    particleMarkers = [];

    const stepData = simulationData.history[stepIndex];
    
    // 繪製粒子
    stepData.particles.forEach(p => {
        const marker = L.circleMarker([p.lat, p.lon], {
            radius: 3,
            fillColor: "#ef4444",
            color: "#b91c1c",
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.6
        }).addTo(map);
        particleMarkers.push(marker);
    });

    // 更新 UI
    document.getElementById('currentTime').innerText = `T+${stepIndex * 30}分 (${stepData.time})`;
    document.getElementById('sliderLabel').innerText = `模擬時間軸: 第 ${stepIndex + 1} / ${simulationData.history.length} 步`;
    document.getElementById('timeSlider').value = stepIndex;
}

function startAnimation() {
    stopAnimation();
    animationTimer = setInterval(() => {
        if (currentStep < simulationData.history.length - 1) {
            currentStep++;
            renderStep(currentStep);
        } else {
            stopAnimation();
        }
    }, 600); // 每 600ms 切換一步
}

function stopAnimation() {
    if (animationTimer) clearInterval(animationTimer);
}

// 靜態內建 Fallback 數據機制 (確保直接點開 HTML 也能 Demo)
function useFallbackData() {
    const history = [];
    let lat = 22.6100, lon = 120.2600;
    for (let t = 0; t < 12; t++) {
        const particles = [];
        lat += 0.002; lon += 0.003;
        for (let i = 0; i < 150; i++) {
            particles.push({
                id: i,
                lat: lat + (Math.random() - 0.5) * 0.01,
                lon: lon + (Math.random() - 0.5) * 0.01
            });
        }
        history.push({ time: `${10+t}:00`, step: t, particles });
    }
    simulationData = { history };
    initControls();
    renderStep(0);
}

// 開始載入資料
loadSimulationData();