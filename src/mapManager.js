// src/mapManager.js
import { KEY_COASTLINES } from './config.js';
import { appState } from './state.js';
import { calculateDistanceKm, calculateVesselETA, RESPONSE_DEPOTS } from './api.js';

// 底圖圖層設定
const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri &mdash; Source: USGS, NOAA',
  maxZoom: 18
});

const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Labels &copy; Esri',
  maxZoom: 18
});

export const satelliteGroup = L.layerGroup([esriImagery, esriLabels]);

export const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
});

export function initMap(clickCallback) {
  appState.map = L.map('map', {
    center: [23.7, 120.7],
    zoom: 8,
    layers: [satelliteGroup],
    zoomControl: false
  });

  L.control.zoom({ position: 'topleft' }).addTo(appState.map);
  L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(appState.map);

  appState.spillLayerGroup = L.layerGroup().addTo(appState.map);
  appState.trajectoryLayerGroup = L.layerGroup().addTo(appState.map);
  appState.portLayersGroup = L.layerGroup().addTo(appState.map);
  appState.depotsLayerGroup = L.layerGroup().addTo(appState.map);
  appState.boomLayerGroup = L.layerGroup().addTo(appState.map);

  renderPortLayers();
  renderDepotLayers();

  appState.map.on('click', (e) => {
    clickCallback(e.latlng);
  });
}

export function renderPortLayers() {
  appState.portLayersGroup.clearLayers();

  KEY_COASTLINES.forEach(port => {
    const color = port.esi >= 9 ? '#ef4444' : (port.esi >= 7 ? '#f59e0b' : '#38bdf8');

    const portMarker = L.circleMarker([port.lat, port.lng], {
      radius: 6.5,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    }).bindPopup(`
      <div style="font-size:0.84rem; line-height:1.5;">
        <b style="color:${color}; font-size:0.95rem;">⚓ ${port.name}</b><br>
        海岸型態：<b>${port.type}</b><br>
        生態敏感度：<span style="color:${color}; font-weight:bold;">ESI 等級 ${port.esi} / 10</span><br>
        警戒半徑：<b>${port.radiusKm} km</b><br>
        <div style="margin-top:6px; padding:6px; background:rgba(255,255,255,0.08); border-radius:4px; font-size:0.76rem;">
          🛡️ <b>攔油索應變建議：</b><br>${port.boomAdvice}
        </div>
      </div>
    `);

    const alertCircle = L.circle([port.lat, port.lng], {
      radius: port.radiusKm * 1000,
      color: color,
      weight: 1.2,
      dashArray: '4, 6',
      fillColor: color,
      fillOpacity: 0.05,
      interactive: false
    });

    appState.portLayersGroup.addLayer(alertCircle);
    appState.portLayersGroup.addLayer(portMarker);
  });
}

export function renderDepotLayers() {
  appState.depotsLayerGroup.clearLayers();

  RESPONSE_DEPOTS.forEach(depot => {
    const depotIcon = L.divIcon({
      className: 'depot-div-icon',
      html: `
        <div style="background:#0284c7; color:#fff; border:2px solid #38bdf8; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 0 10px rgba(56,189,248,0.6);">
          🏪
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([depot.lat, depot.lng], { icon: depotIcon });
    
    marker.on('click', () => {
      let etaHtml = "<i>(請設定事故起點以計算救難船隊航程與 ETA)</i>";
      if (appState.selectedCoords) {
        const distKm = calculateDistanceKm(depot.lat, depot.lng, appState.selectedCoords.lat, appState.selectedCoords.lng);
        const eta = calculateVesselETA(distKm);
        etaHtml = `
          <div style="margin-top:6px; padding:6px; background:rgba(0,242,254,0.15); border:1px solid #00f2fe; border-radius:4px; font-size:0.76rem; color:#e0f2fe;">
            🚀 <b>應變船隊馳援估算 (航速 15 節)：</b><br>
            航行距離：<b>${eta.nauticalMiles} 海里</b> (${distKm.toFixed(1)} km)<br>
            預估抵達時間 (ETA)：<b style="color:#00f2fe;">${eta.timeText}</b>
          </div>
        `;
      }

      marker.bindPopup(`
        <div style="font-size:0.83rem; line-height:1.5;">
          <b style="color:#38bdf8; font-size:0.95rem;">🏪 ${depot.name}</b><br>
          主管所屬：<b>${depot.agency}</b><br>
          攔油索存量：<b>${depot.booms}</b><br>
          吸油棉庫存：<b>${depot.absorbents}</b><br>
          待命船隊：<b>${depot.skimmers}</b><br>
          24H 戰情電話：<code>${depot.phone}</code>
          ${etaHtml}
        </div>
      `).openPopup();
    });

    appState.depotsLayerGroup.addLayer(marker);
  });
}

export function drawBoomBarriers() {
  appState.boomLayerGroup.clearLayers();

  KEY_COASTLINES.forEach(port => {
    if (port.boomCoords) {
      const boomLine = L.polyline(port.boomCoords, {
        color: '#f97316',
        weight: 5,
        dashArray: '6, 8',
        opacity: 0.95
      }).bindPopup(`
        <b>🛡️ 戰術緊急攔油索</b><br>
        守護港口：<b>${port.name}</b><br>
        佈設規格：抗浪充氣型重防護攔油索<br>
        防護成效：預估阻截 85% 表面油污侵入
      `);

      const p1 = port.boomCoords[0];
      const p2 = port.boomCoords[1];
      const buoyIcon = L.divIcon({
        className: 'buoy-icon',
        html: `<div style="width:10px; height:10px; border-radius:50%; background:#f97316; border:2px solid #fff; box-shadow:0 0 6px #f97316;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      });

      const b1 = L.marker(p1, { icon: buoyIcon });
      const b2 = L.marker(p2, { icon: buoyIcon });

      appState.boomLayerGroup.addLayer(boomLine);
      appState.boomLayerGroup.addLayer(b1);
      appState.boomLayerGroup.addLayer(b2);
    }
  });
}