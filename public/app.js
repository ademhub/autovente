let cars = [];
let editingCarId = null;
let removedImages = new Set();

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const filterMarque = document.getElementById('filterMarque');
const filterStatut = document.getElementById('filterStatut');
const sort = document.getElementById('sort');

const addModal = document.getElementById('addModal');
const detailModal = document.getElementById('detailModal');
const addForm = document.getElementById('addForm');
const addError = document.getElementById('addError');
const addModalTitle = document.getElementById('addModalTitle');
const addSubmitBtn = document.getElementById('addSubmitBtn');
const existingImagesEl = document.getElementById('existingImages');
const imagesInput = document.getElementById('imagesInput');
const imagePreview = document.getElementById('imagePreview');
const scanBtn = document.getElementById('scanBtn');
const scanResult = document.getElementById('scanResult');

let previewUrls = [];

document.getElementById('btnOpenAdd').addEventListener('click', openAddForm);

imagesInput.addEventListener('change', () => {
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];

  const files = Array.from(imagesInput.files);
  if (!files.length) {
    imagePreview.classList.add('hidden');
    imagePreview.innerHTML = '';
    return;
  }

  previewUrls = files.map(f => URL.createObjectURL(f));
  imagePreview.classList.remove('hidden');
  imagePreview.innerHTML = previewUrls.map(url => `<img src="${url}">`).join('');
});

scanBtn.addEventListener('click', async () => {
  const files = Array.from(imagesInput.files);
  if (!files.length) {
    scanResult.className = 'scan-result scan-error';
    scanResult.textContent = "Choisissez d'abord une ou plusieurs photos ci-dessus.";
    return;
  }

  scanBtn.disabled = true;
  scanBtn.classList.add('ai-loading');
  imagePreview.classList.add('scanning');
  scanResult.className = 'scan-result';
  scanResult.innerHTML = '';

  try {
    const formData = new FormData();
    files.slice(0, 6).forEach(f => formData.append('images', f));
    const res = await fetch('/api/scan-car', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Erreur lors de l'analyse.");

    if (!data.marque && !data.modele) {
      scanResult.className = 'scan-result scan-error';
      scanResult.textContent = "Impossible d'identifier cette voiture, remplissez les champs manuellement.";
      return;
    }

    const filled = [];
    if (data.marque) { addForm.marque.value = data.marque; filled.push('Marque'); }
    if (data.modele) { addForm.modele.value = data.modele; filled.push('Modèle'); }
    if (data.annee && !addForm.annee.value) { addForm.annee.value = data.annee; filled.push('Année'); }
    if (data.carburant && !addForm.carburant.value) { addForm.carburant.value = data.carburant; filled.push('Carburant'); }
    if (data.transmission && !addForm.transmission.value) { addForm.transmission.value = data.transmission; filled.push('Transmission'); }
    if (data.description && !addForm.description.value) { addForm.description.value = data.description; filled.push('Caractéristiques'); }

    const confianceLabel = { haute: 'Confiance haute', moyenne: 'Confiance moyenne', basse: 'Confiance basse' }[data.confiance] || '';
    scanResult.className = 'scan-result scan-ok';
    scanResult.innerHTML = `
      <div class="scan-result-header">
        <span class="ai-icon">✨</span>
        <strong>${escapeHtml(data.marque)} ${escapeHtml(data.modele)}</strong>
        <span class="confidence-pill confidence-${data.confiance || 'basse'}">${confianceLabel}</span>
      </div>
      <div class="scan-result-fields">
        ${filled.map(f => `<span class="filled-field">${icon('check')}${f}</span>`).join('')}
      </div>
      <p class="scan-result-note">Vérifiez et corrigez les champs si besoin.</p>
    `;
  } catch (err) {
    scanResult.className = 'scan-result scan-error';
    scanResult.textContent = err.message;
  } finally {
    scanBtn.disabled = false;
    scanBtn.classList.remove('ai-loading');
    imagePreview.classList.remove('scanning');
  }
});
document.querySelectorAll('[data-close]').forEach(btn =>
  btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'))
);
[addModal, detailModal].forEach(modal =>
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); })
);

search.addEventListener('input', render);
filterMarque.addEventListener('change', render);
filterStatut.addEventListener('change', render);
sort.addEventListener('change', render);

function resetImagePreview() {
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  imagePreview.classList.add('hidden');
  imagePreview.innerHTML = '';
}

function openAddForm() {
  editingCarId = null;
  removedImages = new Set();
  addForm.reset();
  addModalTitle.textContent = 'Nouvelle annonce';
  addSubmitBtn.textContent = "Publier l'annonce";
  existingImagesEl.classList.add('hidden');
  existingImagesEl.innerHTML = '';
  resetImagePreview();
  addError.classList.add('hidden');
  scanResult.className = 'scan-result hidden';
  addModal.classList.remove('hidden');
}

function openEditForm(car) {
  editingCarId = car.id;
  removedImages = new Set();
  addForm.reset();
  addForm.vendeur.value = car.vendeur;
  addForm.marque.value = car.marque;
  addForm.modele.value = car.modele;
  addForm.annee.value = car.annee ?? '';
  addForm.kilometrage.value = car.kilometrage ?? '';
  addForm.carburant.value = car.carburant || '';
  addForm.transmission.value = car.transmission || '';
  addForm.prix.value = car.prix;
  addForm.statut.value = car.statut;
  addForm.description.value = car.description || '';
  addForm.note.value = car.note || '';
  addModalTitle.textContent = "Modifier l'annonce";
  addSubmitBtn.textContent = 'Enregistrer les modifications';
  renderExistingImages(car.images);
  resetImagePreview();
  addError.classList.add('hidden');
  scanResult.className = 'scan-result hidden';
  detailModal.classList.add('hidden');
  addModal.classList.remove('hidden');
}

function renderExistingImages(images) {
  if (!images.length) {
    existingImagesEl.classList.add('hidden');
    existingImagesEl.innerHTML = '';
    return;
  }
  existingImagesEl.classList.remove('hidden');
  existingImagesEl.innerHTML = `
    <span class="existing-images-label">Photos actuelles</span>
    <div class="existing-images-grid">
      ${images.map(src => `
        <div class="existing-thumb" data-src="${src}">
          <img src="${src}">
          <button type="button" class="remove-thumb" title="Supprimer cette photo">&times;</button>
        </div>
      `).join('')}
    </div>
  `;
  existingImagesEl.querySelectorAll('.existing-thumb').forEach(el => {
    el.querySelector('.remove-thumb').addEventListener('click', () => {
      removedImages.add(el.dataset.src);
      el.remove();
    });
  });
}

function populateMarqueFilter() {
  const current = filterMarque.value;
  const marques = Array.from(new Set(cars.map(c => c.marque))).sort((a, b) => a.localeCompare(b));
  filterMarque.innerHTML = '<option value="">Toutes les marques</option>' +
    marques.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  if (marques.includes(current)) filterMarque.value = current;
}

addForm.addEventListener('submit', async e => {
  e.preventDefault();
  addError.classList.add('hidden');
  const formData = new FormData(addForm);
  if (editingCarId && removedImages.size) {
    formData.append('removeImages', Array.from(removedImages).join(','));
  }

  const url = editingCarId ? '/api/cars/' + editingCarId : '/api/cars';
  const method = editingCarId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, { method, body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Erreur lors de l'enregistrement.");
    }
    addForm.reset();
    addModal.classList.add('hidden');
    editingCarId = null;
    await loadCars();
  } catch (err) {
    addError.textContent = err.message;
    addError.classList.remove('hidden');
  }
});

function formatPrice(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

const STATUT_LABELS = {
  disponible: 'Disponible',
  en_attente: 'En attente',
  vendu: 'Vendu'
};

function statutBadge(statut) {
  const key = STATUT_LABELS[statut] ? statut : 'disponible';
  return `<span class="badge badge-${key}">${STATUT_LABELS[key]}</span>`;
}

const ICONS = {
  calendar: '<path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
  gauge: '<path d="M12 14 15.5 10.5"/><path d="M3.5 19a9 9 0 1 1 17 0"/>',
  fuel: '<path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/><path d="M3 10h10"/><path d="M13 7h2.5l3 3v6.5a1.5 1.5 0 0 1-3 0V15a1 1 0 0 0-1-1h-1.5"/><path d="M2 22h12"/>',
  gearbox: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>'
};

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function matchesSearch(car, q) {
  if (!q) return true;
  const haystack = [car.vendeur, car.marque, car.modele, car.carburant, car.transmission]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q.toLowerCase());
}

function render() {
  const q = search.value.trim();
  const marque = filterMarque.value;
  const statut = filterStatut.value;
  let list = cars.filter(c =>
    matchesSearch(c, q) &&
    (!marque || c.marque === marque) &&
    (!statut || c.statut === statut)
  );

  if (sort.value === 'prix-asc') list.sort((a, b) => a.prix - b.prix);
  else if (sort.value === 'prix-desc') list.sort((a, b) => b.prix - a.prix);
  else list.sort((a, b) => b.dateAjout - a.dateAjout);

  grid.innerHTML = '';
  empty.classList.toggle('hidden', list.length > 0);

  for (const car of list) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-img" style="${car.images[0] ? `background-image:url('${car.images[0]}')` : ''}">
        ${car.images[0] ? '' : 'Pas de photo'}
        ${statutBadge(car.statut)}
        ${car.images.length > 1 ? `<span class="img-count">${car.images.length} photos</span>` : ''}
      </div>
      <div class="card-body">
        <p class="card-title">${escapeHtml(car.marque)} ${escapeHtml(car.modele)}</p>
        <p class="card-price">${formatPrice(car.prix)}</p>
        <div class="card-meta">
          ${car.annee ? `<span class="meta-item">${icon('calendar')}${car.annee}</span>` : ''}
          ${car.kilometrage ? `<span class="meta-item">${icon('gauge')}${car.kilometrage.toLocaleString('fr-FR')} km</span>` : ''}
          ${car.carburant ? `<span class="meta-item">${icon('fuel')}${escapeHtml(car.carburant)}</span>` : ''}
          ${car.transmission ? `<span class="meta-item">${icon('gearbox')}${escapeHtml(car.transmission)}</span>` : ''}
        </div>
        <div class="card-footer">
          <span class="meta-item">${icon('user')}${escapeHtml(car.vendeur)}</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openDetail(car));
    grid.appendChild(card);
  }
}

function openDetail(car) {
  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div class="detail-layout">
      <div class="detail-gallery">
        <div class="detail-main-img" style="${car.images[0] ? `background-image:url('${car.images[0]}')` : ''}">
          ${car.images[0] ? '' : 'Aucune photo'}
        </div>
        ${car.images.length > 1 ? `
          <div class="detail-thumbs">
            ${car.images.map((src, i) => `<img src="${src}" class="thumb${i === 0 ? ' active' : ''}" data-src="${src}">`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="detail-info">
        <div class="detail-title-row">
          <h2>${escapeHtml(car.marque)} ${escapeHtml(car.modele)}${car.annee ? ' (' + car.annee + ')' : ''}</h2>
          ${statutBadge(car.statut)}
        </div>
        <p class="detail-price">${formatPrice(car.prix)}</p>
        <div class="card-meta detail-meta">
          ${car.annee ? `<span class="meta-item">${icon('calendar')}${car.annee}</span>` : ''}
          ${car.kilometrage ? `<span class="meta-item">${icon('gauge')}${car.kilometrage.toLocaleString('fr-FR')} km</span>` : ''}
          ${car.carburant ? `<span class="meta-item">${icon('fuel')}${escapeHtml(car.carburant)}</span>` : ''}
          ${car.transmission ? `<span class="meta-item">${icon('gearbox')}${escapeHtml(car.transmission)}</span>` : ''}
        </div>
        <div class="detail-section">
          <h4>Vendeur</h4>
          <p class="meta-item">${icon('user')}${escapeHtml(car.vendeur)}</p>
        </div>
        ${car.description ? `<div class="detail-section"><h4>Caractéristiques</h4><p>${escapeHtml(car.description)}</p></div>` : ''}
        ${car.note ? `<div class="detail-section"><h4>Note</h4><p>${escapeHtml(car.note)}</p></div>` : ''}
        <div class="detail-section">
          <h4>Changer le statut</h4>
          <select class="statut-select">
            <option value="disponible" ${car.statut === 'disponible' ? 'selected' : ''}>Disponible</option>
            <option value="en_attente" ${car.statut === 'en_attente' ? 'selected' : ''}>En attente</option>
            <option value="vendu" ${car.statut === 'vendu' ? 'selected' : ''}>Vendu</option>
          </select>
        </div>
        <div class="detail-actions">
          <button class="btn-secondary btn-edit" data-id="${car.id}">Modifier l'annonce</button>
          <button class="btn-danger" data-id="${car.id}">Supprimer l'annonce</button>
        </div>
      </div>
    </div>
  `;
  body.querySelectorAll('.thumb').forEach(t =>
    t.addEventListener('click', () => {
      body.querySelector('.detail-main-img').style.backgroundImage = `url('${t.dataset.src}')`;
      body.querySelectorAll('.thumb').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    })
  );
  body.querySelector('.statut-select').addEventListener('change', e => updateStatut(car.id, e.target.value));
  body.querySelector('.btn-edit').addEventListener('click', () => openEditForm(car));
  body.querySelector('.btn-danger').addEventListener('click', () => deleteCar(car.id));
  detailModal.classList.remove('hidden');
}

async function updateStatut(id, statut) {
  const res = await fetch('/api/cars/' + id + '/statut', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statut })
  });
  if (res.ok) {
    await loadCars();
  } else {
    alert('Erreur lors de la mise à jour du statut.');
  }
}

async function deleteCar(id) {
  if (!confirm('Supprimer définitivement cette annonce ?')) return;
  const res = await fetch('/api/cars/' + id, { method: 'DELETE' });
  if (res.ok) {
    detailModal.classList.add('hidden');
    await loadCars();
  } else {
    alert('Erreur lors de la suppression.');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function loadCars() {
  const res = await fetch('/api/cars');
  cars = await res.json();
  populateMarqueFilter();
  render();
}

loadCars();
