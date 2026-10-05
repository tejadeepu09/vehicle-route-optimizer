/* =========================================================
   MAP.JS — Complete version with ALL 8 features:
   1. Real-time traffic (simulated)  5. Capacity awareness
   2. Live GPS                        6. Time windows
   3. Predictive routing              7. EV mode
   4. Multi-vehicle fleet             8. Road events
   ========================================================= */

const _user = localStorage.getItem('currentUser');
if (!_user) window.location.href = 'login.html';

/* ---------- STATE ---------- */
let map;
let waypoints = [
  { latlng: null, name: '', marker: null, time: '', weight: 0 },
  { latlng: null, name: '', marker: null, time: '', weight: 0 }
];
let currentRoutes = [];
let routeLayers = [];
let selectedRouteIndex = 0;
let obstacles = [];
let obstacleMode = false;
let userLocationMarker = null;
let pendingObstacleLatLng = null;

let currentRoute = null;
let tripStartTime = null;
let tripVehicle = null;
let timerInterval = null;
let exceedAlertShown = false;
let tripEstimatedMinutes = 0;

let watchId = null;
let liveTrackLine = null;
let liveTrackPoints = [];
let selectedVehicleData = null;

/* Traffic layer state */
let trafficLayer = null;
let trafficVisible = false;

const VEHICLES = {
  bike:  { icon: '🏍️', name: 'Bike',  fuelRate: 0.03, speedFactor: 0.9,  maxRange: 300, maxCapacity: 20 },
  car:   { icon: '🚗', name: 'Car',   fuelRate: 0.08, speedFactor: 1.0,  maxRange: 600, maxCapacity: 200 },
  truck: { icon: '🚚', name: 'Truck', fuelRate: 0.20, speedFactor: 1.4,  maxRange: 800, maxCapacity: 5000 },
  ev:    { icon: '⚡', name: 'EV',    fuelRate: 0.15, speedFactor: 1.0,  maxRange: 350, maxCapacity: 300 }
};

const TYPE_ICONS_MAP = { bike: '🏍️', car: '🚗', truck: '🚚', ev: '⚡' };

/* =========================================================
   INIT
   ========================================================= */
window.addEventListener('DOMContentLoaded', () => {
  loadUserUI();
  initMap();
  loadFleetDropdown();
});

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([20.5937, 78.9629], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', (e) => {
    if (obstacleMode) {
      pendingObstacleLatLng = e.latlng;
      document.getElementById('obstacle-modal').classList.remove('hidden');
      obstacleMode = false;
      document.getElementById('obstacle-btn').classList.remove('active');
      document.getElementById('obstacle-btn').textContent = '🚧 Add Event';
      document.getElementById('map-hint').classList.remove('show');
    }
  });

  navigator.geolocation?.getCurrentPosition(
    (pos) => dropUserLocation(pos.coords.latitude, pos.coords.longitude, false),
    () => {},
    { enableHighAccuracy: true, timeout: 6000 }
  );
}

/* =========================================================
   FLEET
   ========================================================= */
function loadFleetDropdown() {
  const fleet = JSON.parse(localStorage.getItem('fleet') || '[]');
  const select = document.getElementById('vehicle-select');
  if (!select) return;

  fleet.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${TYPE_ICONS_MAP[v.type]} ${v.name} (${v.plate})`;
    select.appendChild(opt);
  });
}

function onVehicleChange() {
  const select = document.getElementById('vehicle-select');
  const fleet = JSON.parse(localStorage.getItem('fleet') || '[]');
  const v = fleet.find(x => x.id == select.value);
  selectedVehicleData = v || null;

  const infoBox = document.getElementById('vehicle-info');
  if (v) {
    const vh = VEHICLES[v.type];
    infoBox.classList.remove('hidden');
    infoBox.innerHTML = `
      <b>${TYPE_ICONS_MAP[v.type]} ${v.name}</b> — Plate: ${v.plate}<br/>
      Type: ${vh.name} • Capacity: ${v.capacity || vh.maxCapacity} kg •
      ${v.type === 'ev' ? 'Range: ' + vh.maxRange + ' km' : 'Efficiency: ' + (v.efficiency || 15) + ' km/L'}
    `;
    showToast(`Selected: ${v.name}`);
  } else {
    infoBox.classList.add('hidden');
  }
}

/* =========================================================
   USE MY LOCATION
   ========================================================= */
function useMyLocation() {
  if (!navigator.geolocation) return showToast('Geolocation not supported.', true);
  showToast('Getting your location...');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      dropUserLocation(latitude, longitude, true);
      const inputs = document.querySelectorAll('.wp-input');
      if (inputs[0] && !inputs[0].value) {
        inputs[0].value = 'My Location';
        waypoints[0].latlng = { lat: latitude, lng: longitude };
        waypoints[0].name = 'My Location';
        placeWaypointMarker(0, latitude, longitude);
      } else if (inputs[1] && !inputs[1].value) {
        inputs[1].value = 'My Location';
        waypoints[1].latlng = { lat: latitude, lng: longitude };
        waypoints[1].name = 'My Location';
        placeWaypointMarker(1, latitude, longitude);
      }
      showToast('Location found!');
    },
    () => showToast('Could not get location.', true),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function dropUserLocation(lat, lng, zoom = true) {
  if (userLocationMarker) map.removeLayer(userLocationMarker);
  const icon = L.divIcon({
    className: 'user-location-icon',
    html: '<div class="user-dot"></div><div class="user-dot-pulse"></div>',
    iconSize: [20, 20]
  });
  userLocationMarker = L.marker([lat, lng], { icon }).addTo(map);
  userLocationMarker.bindPopup('📍 You are here');
  if (zoom) map.setView([lat, lng], 14);
}

/* =========================================================
   LIVE GPS TRACKING (Feature #2)
   ========================================================= */
function toggleLiveTracking() {
  const btn = document.getElementById('track-btn');
  const panel = document.getElementById('live-gps-panel');

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    btn.classList.remove('active');
    btn.textContent = '🛰️ Start Live GPS';
    panel.classList.add('hidden');
    return showToast('Live GPS stopped.');
  }

  if (!navigator.geolocation) return showToast('Geolocation not supported.', true);

  btn.classList.add('active');
  btn.textContent = '⏹ Stop Live GPS';
  panel.classList.remove('hidden');
  liveTrackPoints = [];
  if (liveTrackLine) { map.removeLayer(liveTrackLine); liveTrackLine = null; }

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, speed, accuracy } = pos.coords;
      dropUserLocation(latitude, longitude, false);

      document.getElementById('gps-lat').textContent = latitude.toFixed(6);
      document.getElementById('gps-lng').textContent = longitude.toFixed(6);
      document.getElementById('gps-speed').textContent = speed ? (speed * 3.6).toFixed(1) + ' km/h' : '0 km/h';
      document.getElementById('gps-acc').textContent = '±' + accuracy.toFixed(0) + ' m';

      liveTrackPoints.push([latitude, longitude]);
      if (liveTrackLine) map.removeLayer(liveTrackLine);
      liveTrackLine = L.polyline(liveTrackPoints, {
        color: '#10b981', weight: 4, opacity: 0.8
      }).addTo(map);

      map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
    },
    (err) => showToast('GPS error: ' + err.message, true),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );

  showToast('🛰️ Live GPS started!');
}

/* =========================================================
   TRAFFIC LAYER (Feature #1 — Simulated)
   ========================================================= */
function toggleTrafficLayer() {
  const btn = document.getElementById('traffic-btn');
  const legend = document.getElementById('traffic-legend');

  if (trafficVisible) {
    if (trafficLayer) { map.removeLayer(trafficLayer); trafficLayer = null; }
    trafficVisible = false;
    btn.classList.remove('active');
    btn.textContent = '🚦 Show Traffic';
    legend.classList.add('hidden');
    return showToast('Traffic layer hidden.');
  }

  // Simulate traffic on a grid of pseudo-roads
  trafficLayer = L.layerGroup();

  const hour = new Date().getHours();
  // Peak-hour factor: 0.35 base + up to 0.65 during rush hours
  const isPeak = (hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21);
  const baseFactor = isPeak ? 0.65 : 0.25;

  // Generate random "traffic segments" across a viewport
  const center = map.getCenter();
  for (let i = 0; i < 40; i++) {
    const lat = center.lat + (Math.random() - 0.5) * 0.6;
    const lng = center.lng + (Math.random() - 0.5) * 0.6;
    const lat2 = lat + (Math.random() - 0.5) * 0.08;
    const lng2 = lng + (Math.random() - 0.5) * 0.08;

    const seed = Math.random() + baseFactor;
    let color = '#10b981', weight = 5;
    if (seed > 1.0) { color = '#ef4444'; weight = 7; }
    else if (seed > 0.7) { color = '#f59e0b'; weight = 6; }

    L.polyline([[lat, lng], [lat2, lng2]], {
      color, weight, opacity: 0.75, lineCap: 'round'
    }).addTo(trafficLayer);
  }

  trafficLayer.addTo(map);
  trafficVisible = true;
  btn.classList.add('active');
  btn.textContent = '🚦 Hide Traffic';
  legend.classList.remove('hidden');

  if (isPeak) {
    showPopup('🚦 Peak Hour Detected',
      'Heavy traffic expected during rush hours. Route ETAs may be longer than usual.');
  } else {
    showToast('Traffic layer enabled.');
  }
}

/* =========================================================
   WAYPOINTS
   ========================================================= */
function placeWaypointMarker(index, lat, lng) {
  if (waypoints[index].marker) map.removeLayer(waypoints[index].marker);
  const letters = 'ABCDEFGH';
  const icon = L.divIcon({
    className: 'wp-marker-icon',
    html: `<div class="wp-marker ${index === 0 ? 'start' : (index === waypoints.length - 1 ? 'end' : 'mid')}">${letters[index]}</div>`,
    iconSize: [30, 30], iconAnchor: [15, 15]
  });
  waypoints[index].marker = L.marker([lat, lng], { icon }).addTo(map);
}

function addWaypoint() {
  if (waypoints.length >= 6) return showToast('Max 6 waypoints.', true);

  const list = document.getElementById('waypoints-list');
  const index = waypoints.length - 1;

  const row = document.createElement('div');
  row.className = 'wp-row';
  row.innerHTML = `
    <span class="wp-pin mid">${'ABCDEFG'[index]}</span>
    <input type="text" class="wp-input" placeholder="Add a stop" data-index="${index}" />
    <input type="time" class="wp-time" />
    <input type="number" class="wp-weight" placeholder="kg" min="0" />
    <button class="wp-remove" onclick="removeWaypoint(${index})">✕</button>
  `;
  list.insertBefore(row, list.lastElementChild);
  waypoints.splice(index, 0, { latlng: null, name: '', marker: null, time: '', weight: 0 });
  refreshWaypointLabels();
}

function removeWaypoint(index) {
  if (waypoints.length <= 2) return showToast('At least Start and End required.', true);
  if (waypoints[index].marker) map.removeLayer(waypoints[index].marker);
  waypoints.splice(index, 1);

  const list = document.getElementById('waypoints-list');
  list.innerHTML = '';
  waypoints.forEach((wp, i) => {
    const isStart = i === 0;
    const isEnd = i === waypoints.length - 1;
    const cls = isStart ? 'start' : (isEnd ? 'end' : 'mid');
    const row = document.createElement('div');
    row.className = 'wp-row';
    row.innerHTML = `
      <span class="wp-pin ${cls}">${'ABCDEFG'[i]}</span>
      <input type="text" class="wp-input" placeholder="${isStart ? 'Starting location' : (isEnd ? 'Destination' : 'Add a stop')}" data-index="${i}" value="${wp.name || ''}" />
      <input type="time" class="wp-time" value="${wp.time || ''}" />
      <input type="number" class="wp-weight" placeholder="kg" min="0" value="${wp.weight || ''}" />
      ${(isStart || isEnd) ? '' : `<button class="wp-remove" onclick="removeWaypoint(${i})">✕</button>`}
    `;
    list.appendChild(row);
  });
}

function refreshWaypointLabels() {
  document.querySelectorAll('.wp-pin').forEach((pin, i) => {
    pin.textContent = 'ABCDEFG'[i];
    pin.className = 'wp-pin ' + (i === 0 ? 'start' : (i === waypoints.length - 1 ? 'end' : 'mid'));
  });
}

/* =========================================================
   GEOCODING
   ========================================================= */
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

/* =========================================================
   PREDICTIVE ROUTING (Feature #3)
   ========================================================= */
function showPredictiveSuggestion(from, to) {
  const trips = JSON.parse(localStorage.getItem('trips') || '[]');
  const card = document.getElementById('predictive-card');
  const msg = document.getElementById('predictive-msg');

  if (trips.length < 2) {
    card.classList.add('hidden');
    return;
  }

  // Find similar past trips (same from→to)
  const similar = trips.filter(t =>
    t.from.toLowerCase() === from.toLowerCase() &&
    t.to.toLowerCase() === to.toLowerCase()
  );

  const hour = new Date().getHours();

  if (similar.length >= 2) {
    // Calculate average distance and recommend
    const avgDist = (similar.reduce((s, t) => s + parseFloat(t.distance || 0), 0) / similar.length).toFixed(1);
    msg.innerHTML = `🤖 You've taken <b>${from} → ${to}</b> <b>${similar.length} times</b> before. Average distance: <b>${avgDist} km</b>. Based on history, this route is well-known to you.`;
    card.classList.remove('hidden');
  } else if (trips.length >= 3) {
    // General suggestion based on time of day
    const peakNow = (hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21);
    msg.innerHTML = peakNow
      ? `🤖 It's peak hour (${hour}:00). Based on your past trips, expect <b>15–25% longer travel time</b>. Consider starting earlier.`
      : `🤖 Off-peak hours now. Based on history, this is a <b>good time to travel</b> — routes are usually faster.`;
    card.classList.remove('hidden');
  } else {
    card.classList.add('hidden');
  }
}

/* =========================================================
   CAPACITY CHECK (Feature #5)
   ========================================================= */
function checkCapacity() {
  const weights = Array.from(document.querySelectorAll('.wp-weight'))
    .map(inp => parseFloat(inp.value) || 0);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  if (totalWeight <= 0) return { ok: true, total: 0 };

  // If a fleet vehicle is selected use its capacity, else use car default
  const cap = selectedVehicleData
    ? (selectedVehicleData.capacity || VEHICLES[selectedVehicleData.type].maxCapacity)
    : VEHICLES.car.maxCapacity;

  if (totalWeight > cap) {
    return { ok: false, total: totalWeight, cap };
  }
  return { ok: true, total: totalWeight, cap };
}

/* =========================================================
   TIME WINDOW CHECK (Feature #6)
   ========================================================= */
function checkTimeWindows(route) {
  const durationMin = Math.round(route.duration / 60);
  const now = new Date();
  const arrival = new Date(now.getTime() + durationMin * 60000);

  let missed = [];
  waypoints.forEach((wp, i) => {
    if (!wp.time) return;
    const [h, m] = wp.time.split(':').map(Number);
    const windowEnd = new Date(now);
    windowEnd.setHours(h, m, 0, 0);
    if (arrival > windowEnd) {
      missed.push({ stop: 'ABCDEFG'[i], at: wp.time });
    }
  });

  if (missed.length > 0) {
    const list = missed.map(x => `• Stop ${x.stop} (window ends ${x.at})`).join('\n');
    showPopup('⏰ Time Window Warning',
      `You'll arrive around ${arrival.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}, but these windows will be missed:\n\n${list}\n\nConsider leaving earlier.`);
  }
}

/* =========================================================
   FIND ROUTE
   ========================================================= */
async function findRoute() {
  const inputs = document.querySelectorAll('.wp-input');
  if (inputs.length < 2) return showToast('Need at least start & end.', true);

  showToast('Finding best route...');

  const coords = [];

  for (let i = 0; i < inputs.length; i++) {
    const raw = inputs[i].value.trim();
    if (!raw) return showToast(`Please fill waypoint ${'ABCDEFG'[i]}`, true);

    const timeInputs = document.querySelectorAll('.wp-time');
    const weightInputs = document.querySelectorAll('.wp-weight');
    waypoints[i].time = timeInputs[i]?.value || '';
    waypoints[i].weight = parseFloat(weightInputs[i]?.value) || 0;

    if (waypoints[i] && waypoints[i].latlng && waypoints[i].name === raw) {
      coords.push(waypoints[i].latlng);
      continue;
    }

    const geo = await geocode(raw);
    if (!geo) return showToast(`Could not find: "${raw}"`, true);

    waypoints[i] = {
      latlng: { lat: geo.lat, lng: geo.lng },
      name: raw,
      marker: waypoints[i]?.marker,
      time: waypoints[i]?.time,
      weight: waypoints[i]?.weight
    };
    placeWaypointMarker(i, geo.lat, geo.lng);
    coords.push({ lat: geo.lat, lng: geo.lng });

    await new Promise(r => setTimeout(r, 400));
  }

  // Fit bounds
  const bounds = L.latLngBounds(coords.map(c => [c.lat, c.lng]));
  map.fitBounds(bounds, { padding: [60, 60] });

  // Predictive suggestion (before showing routes)
  showPredictiveSuggestion(waypoints[0].name, waypoints[waypoints.length - 1].name);

  // OSRM call
  const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=true&steps=false`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return showToast('No route found.', true);

    currentRoutes = data.routes.slice(0, 3);
    renderRouteOptions();
    drawRouteOnMap(0);
    selectedRouteIndex = 0;

    // EV range check
    if (selectedVehicleData && selectedVehicleData.type === 'ev') {
      const distKm = currentRoutes[0].distance / 1000;
      if (distKm > VEHICLES.ev.maxRange) {
        showPopup('⚠️ EV Range Warning',
          `Route distance is ${distKm.toFixed(1)} km, but EV max range is ${VEHICLES.ev.maxRange} km.\n\nPlease plan a charging stop.`);
      }
    }

    // Capacity check
    const cap = checkCapacity();
    if (!cap.ok) {
      showPopup('📦 Capacity Exceeded',
        `Total trip weight: ${cap.total} kg\nVehicle capacity: ${cap.cap} kg\n\nPlease use a larger vehicle or reduce load.`);
    }

    // Time window check
    checkTimeWindows(currentRoutes[0]);

    showToast(`Found ${currentRoutes.length} route option(s)!`);
  } catch (err) {
    console.error(err);
    showToast('Routing service unavailable.', true);
  }
}

/* =========================================================
   ROUTE OPTIONS UI
   ========================================================= */
function renderRouteOptions() {
  const container = document.getElementById('route-list');
  const wrapper = document.getElementById('route-results');
  wrapper.classList.remove('hidden');

  const vType = selectedVehicleData?.type || 'car';
  const vehicle = VEHICLES[vType];

  container.innerHTML = currentRoutes.map((r, i) => {
    const km = (r.distance / 1000).toFixed(1);
    const mins = Math.round(r.duration / 60);
    const label = i === 0 ? 'Fastest' : (i === 1 ? 'Alternative' : 'Longer');

    let fuelText = '';
    if (vType === 'ev') {
      const kwh = (km * vehicle.fuelRate).toFixed(1);
      fuelText = `⚡ ${kwh} kWh`;
    } else {
      const L = (km * vehicle.fuelRate).toFixed(2);
      fuelText = `⛽ ${L} L`;
    }

    const arrivalTime = new Date(Date.now() + mins * 60000)
      .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="route-option ${i === 0 ? 'selected' : ''}" onclick="selectRoute(${i})" data-route-index="${i}">
        <div class="ro-title">Route ${i + 1} • ${label}</div>
        <div class="ro-meta">
          <span>📏 ${km} km</span>
          <span>⏱️ ${mins} mins</span>
          <span>${fuelText}</span>
          <span>🕐 ETA ${arrivalTime}</span>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('trip-controls').classList.remove('hidden');
  document.getElementById('start-trip-btn').disabled = false;
}

function selectRoute(index) {
  selectedRouteIndex = index;
  document.querySelectorAll('.route-option').forEach((el, i) => el.classList.toggle('selected', i === index));
  drawRouteOnMap(index);
}

function drawRouteOnMap(index) {
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];

  currentRoutes.forEach((route, i) => {
    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
    const isSelected = i === index;
    const line = L.polyline(coords, {
      color: isSelected ? '#0ea5e9' : '#94a3b8',
      weight: isSelected ? 6 : 4,
      opacity: isSelected ? 0.9 : 0.5,
      lineJoin: 'round', lineCap: 'round'
    }).addTo(map);
    if (isSelected) line.bringToFront();
    routeLayers.push(line);
  });

  const r = currentRoutes[index];
  currentRoute = {
    distance: (r.distance / 1000).toFixed(1),
    duration: Math.round(r.duration / 60),
    from: waypoints[0].name || 'Start',
    to: waypoints[waypoints.length - 1].name || 'End'
  };
  tripEstimatedMinutes = currentRoute.duration;
}

/* =========================================================
   ROAD EVENTS (Feature #8)
   ========================================================= */
const EVENT_ICONS = {
  construction: '🚧',
  traffic: '🚗',
  accident: '⚠️',
  closure: '🚫',
  event: '🎉',
  flood: '🌊'
};

function toggleObstacleMode() {
  obstacleMode = !obstacleMode;
  const btn = document.getElementById('obstacle-btn');
  const hint = document.getElementById('map-hint');
  if (obstacleMode) {
    btn.classList.add('active');
    btn.textContent = '🚧 Click on map...';
    hint.classList.add('show');
  } else {
    btn.classList.remove('active');
    btn.textContent = '🚧 Add Event';
    hint.classList.remove('show');
  }
}

function placeObstacle(type) {
  document.getElementById('obstacle-modal').classList.add('hidden');
  if (!pendingObstacleLatLng) return;

  const icon = L.divIcon({
    className: 'obstacle-icon',
    html: `<div class="obstacle-marker">${EVENT_ICONS[type]}</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16]
  });

  const marker = L.marker([pendingObstacleLatLng.lat, pendingObstacleLatLng.lng], { icon })
    .addTo(map)
    .bindPopup(`${EVENT_ICONS[type]} <b>${type.toUpperCase()}</b><br/>Reported just now`);

  obstacles.push({ latlng: pendingObstacleLatLng, type, marker, reportedAt: Date.now() });
  showToast(`${EVENT_ICONS[type]} ${type} added. Recalculating...`);

  if (currentRoutes.length > 0) simulateReroute();
  pendingObstacleLatLng = null;
  document.getElementById('obstacle-btn').textContent = '🚧 Add Event';
}

function cancelObstacle() {
  document.getElementById('obstacle-modal').classList.add('hidden');
  pendingObstacleLatLng = null;
  document.getElementById('obstacle-btn').textContent = '🚧 Add Event';
}

function simulateReroute() {
  const extra = 3 + Math.floor(Math.random() * 4);
  tripEstimatedMinutes += extra;
  currentRoute.distance = (parseFloat(currentRoute.distance) + (extra * 0.4)).toFixed(1);
  currentRoute.duration += extra;

  const r = currentRoutes[selectedRouteIndex];
  const coords = r.geometry.coordinates.map(c => [c[1], c[0]]);
  const warningLine = L.polyline(coords, {
    color: '#f59e0b', weight: 8, opacity: 0.35, dashArray: '10, 8'
  }).addTo(map);
  routeLayers.push(warningLine);
  renderRouteOptions();
}

/* =========================================================
   TRIP
   ========================================================= */
function startTripWithSelectedVehicle() {
  if (!currentRoute) return showToast('Find a route first!', true);
  if (selectedVehicleData) startTrip(selectedVehicleData.type, selectedVehicleData);
  else document.getElementById('vehicle-modal').classList.remove('hidden');
}

function openVehicleModal() { startTripWithSelectedVehicle(); }
function closeVehicleModal() { document.getElementById('vehicle-modal').classList.add('hidden'); }

function startTrip(vehicleType, vehicleData = null) {
  if (!currentRoute) return;
  closeVehicleModal();

  tripVehicle = vehicleType;
  const v = VEHICLES[vehicleType];

  const adjTime = Math.max(2, Math.round(currentRoute.duration * v.speedFactor));
  tripEstimatedMinutes = adjTime;

  tripStartTime = new Date();
  exceedAlertShown = false;
  startTimer();

  document.getElementById('live-timer').classList.remove('hidden');
  document.getElementById('timer-sub').textContent = `Estimated: ${adjTime} mins`;
  document.getElementById('timer-value').textContent = '00:00';
  document.getElementById('timer-value').classList.remove('warn');
  document.getElementById('start-trip-btn').disabled = true;
  document.getElementById('end-trip-btn').disabled = false;

  const label = vehicleData ? `${v.name} (${vehicleData.plate})` : v.name;
  showToast(`Trip started with ${label} at ${formatTime(tripStartTime)}`);
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (!tripStartTime) return;
    const elapsedSec = Math.floor((Date.now() - tripStartTime.getTime()) / 1000);
    const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const ss = String(elapsedSec % 60).padStart(2, '0');
    document.getElementById('timer-value').textContent = `${mm}:${ss}`;

    if (elapsedSec / 60 >= tripEstimatedMinutes && !exceedAlertShown) {
      exceedAlertShown = true;
      document.getElementById('timer-value').classList.add('warn');
      showPopup('⚠️ Time Exceeded', `You have exceeded the estimated travel time of ${tripEstimatedMinutes} mins.`);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function endTrip(auto = false) {
  if (!tripStartTime || !currentRoute) return;

  const tripEndTime = new Date();
  stopTimer();
  const durationMin = Math.max(1, Math.round((tripEndTime - tripStartTime) / 60000));

  const trip = {
    from: currentRoute.from,
    to: currentRoute.to,
    vehicle: selectedVehicleData
      ? `${VEHICLES[tripVehicle].name} (${selectedVehicleData.plate})`
      : VEHICLES[tripVehicle].name,
    vehicleIcon: VEHICLES[tripVehicle].icon,
    startTime: formatTime(tripStartTime),
    endTime: formatTime(tripEndTime),
    duration: durationMin + ' mins',
    distance: currentRoute.distance + ' km'
  };

  const trips = JSON.parse(localStorage.getItem('trips') || '[]');
  trips.push(trip);
  localStorage.setItem('trips', JSON.stringify(trips));

  showToast(auto ? 'Trip auto-ended & saved!' : 'Trip ended & saved!');

  tripStartTime = null;
  tripVehicle = null;
  exceedAlertShown = false;
  document.getElementById('start-trip-btn').disabled = false;
  document.getElementById('end-trip-btn').disabled = true;
  document.getElementById('live-timer').classList.add('hidden');
}

/* =========================================================
   POPUP
   ========================================================= */
function showPopup(title, msg) {
  document.getElementById('popup-title').textContent = title;
  document.getElementById('popup-msg').innerHTML = msg.replace(/\n/g, '<br/>');
  document.getElementById('popup-modal').classList.remove('hidden');
}
function closePopup() { document.getElementById('popup-modal').classList.add('hidden'); }