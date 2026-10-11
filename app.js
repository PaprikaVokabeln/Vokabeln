// app.js – Logik der App (Phase 1)
const app = document.getElementById('app');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('btn-back');

// ---------- Hilfsfunktionen ----------
function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function setHeader(title, showBack) {
  titleEl.textContent = title;
  backBtn.hidden = !showBack;
}

// Zurück-Pfeil oben und Zurück-Taste vom Handy
backBtn.addEventListener('click', () => history.back());
window.addEventListener('popstate', e =>
  e.state && e.state.listId ? showList(e.state.listId) : showHome());


function openList(id) {
  history.pushState({ listId: id }, '');
  showList(id);
}

// Eingabefenster: fields = [{ label: '...', value: '...' }]
function askForm(title, fields) {
  return new Promise(resolve => {
    const dlg = document.getElementById('dlg');
    const form = document.getElementById('dlg-form');
    const cancel = document.getElementById('dlg-cancel');
    document.getElementById('dlg-title').textContent = title;
    document.getElementById('dlg-fields').innerHTML = fields.map((f, i) =>
      `<label>${esc(f.label)}
         <input name="f${i}" value="${esc(f.value || '')}" autocomplete="off" required>
       </label>`).join('');

    form.onsubmit = (e) => {
      e.preventDefault();
      const values = fields.map((f, i) => form.elements['f' + i].value.trim());
      if (values.some(v => !v)) return;
      dlg.close();
      resolve(values);
    };
    cancel.onclick = () => { dlg.close(); resolve(null); };
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
  });
}

// ---------- Startseite ----------
async function showHome() {
  setHeader('Vokabeltrainer', false);
  const lists = await DB.getLists();
  const cards = await DB.getAllCards();
  const today = DB.today();
  const dueTotal = cards.filter(c => c.due <= today).length;
  lists.sort((a, b) => a.created - b.created);

  let html = `
    <div class="tile summary">
      <div class="big-number">${dueTotal}</div>
      <div class="meta">Karten noch offen</div>
    </div>
    <button class="btn primary" id="btn-new-list">+ Neue Liste</button>
    <h2>Meine Listen</h2>`;

  if (lists.length === 0) {
    html += `<p class="empty">Noch keine Listen. Tippe auf „+ Neue Liste“, um anzufangen.</p>`;
  }

  for (const list of lists) {
    const lc = cards.filter(c => c.listId === list.id);
    const due = lc.filter(c => c.due <= today).length;
    html += `
      <button class="tile list-tile" data-list="${list.id}">
        <div>
          <div class="list-name">${esc(list.name)}</div>
            ${progressHtml(lc)
        </div>
        <div class="due">
          <span class="badge ${due === 0 ? 'zero' : ''}">${due}</span>
          <div class="meta">offen</div>
        </div>
      </button>`;
  }
  app.innerHTML = html;

  document.getElementById('btn-new-list').onclick = async () => {
    const r = await askForm('Neue Liste', [{ label: 'Name der Liste (z. B. „Unit 3“)' }]);
    if (!r) return;
    const id = await DB.addList(r[0]);
    openList(id);
  };
  app.querySelectorAll('[data-list]').forEach(b => {
    b.onclick = () => openList(Number(b.dataset.list));
  });
}

// ---------- Listenansicht ----------
async function showList(listId, focusInput) {
  const list = await DB.getList(listId);
  if (!list) return showHome();
  setHeader(list.name, true);

  const cards = (await DB.getCards(listId)).sort((a, b) => a.created - b.created);
  const due = cards.filter(c => c.due <= DB.today()).length;

  app.innerHTML = `
    <div class="tile summary">
      <div class="big-number">${due}</div>
      <div class="meta">von ${cards.length} Karten noch offen</div>
    </div>
        <button class="btn primary" id="btn-learn">▶️ Lernen (${due} noch offen)</button>
    <button class="btn secondary" id="btn-practice">🔁 Alle Karten wiederholen</button>
        <button class="btn primary" id="btn-scan">📸 Vokabeln per Foto hinzufügen</button>



    <div class="tile">
      <h2>Neue Karte</h2>
      <form id="add-form">
        <label>Deutsch <input id="in-de" autocomplete="off" required></label>
        <label>Englisch <input id="in-en" autocomplete="off" required></label>
        <button class="btn primary" type="submit">+ Karte hinzufügen</button>
      </form>
    </div>

    <h2>Karten (${cards.length})</h2>
    ${cards.length ? cards.map(c => `
      <div class="tile card-tile">
        <div class="card-text">
          <div class="de">${esc(c.de)}</div>
          <div class="en">${esc(c.en)}</div>
          <div class="meta">Schublade ${c.box}</div>
        </div>
        <div class="card-actions">
          <button class="small-btn" data-edit="${c.id}" aria-label="Bearbeiten">✏️</button>
          <button class="small-btn" data-del="${c.id}" aria-label="Löschen">🗑️</button>
        </div>
      </div>`).join('')
    : '<p class="empty">Noch keine Karten. Füge oben die erste hinzu!</p>'}

    <h2>Liste verwalten</h2>
    <div class="row">
      <button class="btn secondary" id="btn-rename">✏️ Umbenennen</button>
      <button class="btn danger" id="btn-delete">🗑️ Löschen</button>
    </div>`;

  // Karte hinzufügen
  document.getElementById('add-form').onsubmit = async (e) => {
    e.preventDefault();
    const de = document.getElementById('in-de').value.trim();
    const en = document.getElementById('in-en').value.trim();
    if (!de || !en) return;
    await DB.addCard(listId, de, en);
    showList(listId, true);
  };
  if (focusInput) document.getElementById('in-de').focus();
  document.getElementById('btn-learn').onclick = () => startLearn(listId, false);
  document.getElementById('btn-practice').onclick = () => startLearn(listId, true);
    document.getElementById('btn-scan').onclick = () => startScan(listId);


  // Karte bearbeiten
  app.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
    const card = cards.find(c => c.id === Number(b.dataset.edit));
    const r = await askForm('Karte bearbeiten', [
      { label: 'Deutsch', value: card.de },
      { label: 'Englisch', value: card.en }
    ]);
    if (!r) return;
    await DB.updateCard(card.id, { de: r[0], en: r[1] });
    showList(listId);
  });

  // Karte löschen
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const card = cards.find(c => c.id === Number(b.dataset.del));
    if (!confirm(`„${card.de}“ wirklich löschen?`)) return;
    await DB.deleteCard(card.id);
    showList(listId);
  });

  // Liste umbenennen
  document.getElementById('btn-rename').onclick = async () => {
    const r = await askForm('Liste umbenennen', [{ label: 'Neuer Name', value: list.name }]);
    if (!r) return;
    await DB.renameList(listId, r[0]);
    showList(listId);
  };

  // Liste löschen
  document.getElementById('btn-delete').onclick = async () => {
    if (!confirm(`Liste „${list.name}“ mit allen ${cards.length} Karten löschen? Das kann man nicht rückgängig machen.`)) return;
    await DB.deleteList(listId);
    history.back();
  };
}

// ---------- Start ----------
showHome();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
// Bittet Android, die Daten nicht automatisch zu löschen
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}
