/* =========================================================
   FLEET.JS — Multi-vehicle fleet management
   ========================================================= */

const _u = localStorage.getItem('currentUser');
if (!_u) window.location.href = 'login.html';

const TYPE_ICONS = {
  bike: '🏍️',
  car: '🚗',
  truck: '🚚',
  ev: '⚡'
};

const TYPE_NAMES = {
  bike: 'Bike',
  car: 'Car',
  truck: 'Truck',
  ev: 'Electric'
};

window.addEventListener('DOMContentLoaded', () => {
  loadUserUI();
  renderFleet();
});

function addVehicle() {
  const name = document.getElementById('f-name').value.trim();
  const plate = document.getElementById('f-plate').value.trim();
  const type = document.getElementById('f-type').value;
  const capacity = parseFloat(document.getElementById('f-capacity').value) || 500;
  const efficiency = parseFloat(document.getElementById('f-efficiency').value) || 15;
  const status = document.getElementById('f-status').value;

  if (!name) return showToast('Please enter a vehicle name', true);
  if (!plate) return showToast('Please enter a plate number', true);

  const fleet = JSON.parse(localStorage.getItem('fleet') || '[]');
  if (fleet.some(v => v.plate === plate)) return showToast('Plate already exists', true);

  fleet.push({
    id: Date.now(),
    name, plate, type, capacity, efficiency, status,
    createdAt: new Date().toISOString()
  });

  localStorage.setItem('fleet', JSON.stringify(fleet));
  showToast(`${TYPE_ICONS[type]} ${name} added to fleet!`);

  // Clear form
  document.getElementById('f-name').value = '';
  document.getElementById('f-plate').value = '';
  document.getElementById('f-capacity').value = 500;
  document.getElementById('f-efficiency').value = 15;

  renderFleet();
}

function renderFleet() {
  const fleet = JSON.parse(localStorage.getItem('fleet') || '[]');
  const list = document.getElementById('fleet-list');
  const count = document.getElementById('fleet-count');
  if (count) count.textContent = fleet.length;

  if (fleet.length === 0) {
    list.innerHTML = `<p class="empty-row">No vehicles yet. Add one above.</p>`;
    return;
  }

  list.innerHTML = fleet.map(v => `
    <div class="fleet-item">
      <div class="fi-left">
        <span class="fi-icon">${TYPE_ICONS[v.type]}</span>
        <div>
          <div class="fi-name">${v.name}</div>
          <div class="fi-meta">
            ${v.plate} • ${TYPE_NAMES[v.type]} •
            ${v.capacity} kg • ${v.efficiency} km/L
          </div>
        </div>
      </div>
      <div class="fi-right">
        <span class="fi-badge ${v.status}">${
          v.status === 'active' ? '✅ Active' :
          v.status === 'idle' ? '⏸️ Idle' : '🔧 Maintenance'
        }</span>
        <button class="del-btn" onclick="removeVehicle(${v.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

function removeVehicle(id) {
  if (!confirm('Remove this vehicle from fleet?')) return;
  const fleet = JSON.parse(localStorage.getItem('fleet') || '[]');
  const filtered = fleet.filter(v => v.id !== id);
  localStorage.setItem('fleet', JSON.stringify(filtered));
  showToast('Vehicle removed.');
  renderFleet();
}