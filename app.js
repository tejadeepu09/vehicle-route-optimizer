/* =========================================================
   APP.JS — Shared helpers
   ========================================================= */

function requireAuth() {
  const user = localStorage.getItem('currentUser');
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  return JSON.parse(user);
}

function loadUserUI() {
  const user = requireAuth();
  if (!user) return;

  const nameEl = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = user.name || 'User';
  if (avatarEl) avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
}

function handleLogout() {
  if (!confirm('Logout from Route Optimizer?')) return;
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatTime(date) {
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

/* ---------- DASHBOARD ---------- */
function refreshDashboard() {
  const trips = JSON.parse(localStorage.getItem('trips') || '[]');
  const fleet = JSON.parse(localStorage.getItem('fleet') || '[]');

  const statTrips = document.getElementById('stat-trips');
  const statDist  = document.getElementById('stat-distance');
  const statFleet = document.getElementById('stat-fleet');

  if (statTrips) statTrips.textContent = trips.length;

  let totalKm = 0;
  trips.forEach(t => { totalKm += parseFloat(t.distance) || 0; });
  if (statDist) statDist.textContent = totalKm.toFixed(1) + ' km';
  if (statFleet) statFleet.textContent = fleet.length;
}

/* ---------- HISTORY ---------- */
function renderHistory() {
  const trips = JSON.parse(localStorage.getItem('trips') || '[]');
  const search = (document.getElementById('history-search')?.value || '').toLowerCase();

  const filtered = trips.filter(t => {
    if (!search) return true;
    return (
      t.from.toLowerCase().includes(search) ||
      t.to.toLowerCase().includes(search) ||
      (t.vehicle || '').toLowerCase().includes(search)
    );
  });

  const tbody = document.getElementById('history-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-row">No trips found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${t.from}</td>
      <td>${t.to}</td>
      <td>${t.vehicleIcon || '🚗'} ${t.vehicle || 'Car'}</td>
      <td>${t.startTime}</td>
      <td>${t.endTime}</td>
      <td>${t.duration}</td>
      <td>${t.distance}</td>
      <td><button class="del-btn" onclick="deleteTrip(${trips.indexOf(t)})">🗑</button></td>
    </tr>
  `).join('');
}

function deleteTrip(index) {
  const trips = JSON.parse(localStorage.getItem('trips') || '[]');
  trips.splice(index, 1);
  localStorage.setItem('trips', JSON.stringify(trips));
  renderHistory();
  showToast('Trip deleted.');
}

function clearHistory() {
  if (!confirm('Clear all trip history?')) return;
  localStorage.removeItem('trips');
  renderHistory();
  showToast('History cleared!');
}

/* ---------- SETTINGS ---------- */
function loadSettings() {
  const user = requireAuth();
  if (!user) return;
  const input = document.getElementById('settings-name');
  if (input) input.value = user.name || '';
}

function saveName() {
  const input = document.getElementById('settings-name');
  const newName = input.value.trim();
  if (!newName) return showToast('Please enter a name!', true);

  const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
  user.name = newName;
  localStorage.setItem('currentUser', JSON.stringify(user));
  showToast('Name updated!');
}

function resetAllData() {
  if (!confirm('This will erase ALL trip data and fleet. Continue?')) return;
  localStorage.removeItem('trips');
  localStorage.removeItem('fleet');
  showToast('All data reset.');
}