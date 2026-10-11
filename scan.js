// scan.js – Vokabeln per Foto erkennen (Phase 3, Google Gemini)
const KEY_NAME = 'geminiKey';
// Mehrere Modelle als Reserve, falls Google eines umbenennt
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

const PROMPT = `Auf dem Foto ist eine Vokabelliste Deutsch-Englisch (z. B. aus einem Schulbuch).
Lies alle Vokabelpaare aus und gib sie als JSON-Liste zurück.
Regeln:
- "de" = deutsches Wort oder deutscher Ausdruck, "en" = englisches Wort oder englischer Ausdruck.
- Lautschrift, Beispielsätze, Seitenzahlen, Überschriften und Nummerierungen weglassen.
- Mehrere Bedeutungen in einem Feld mit ", " trennen.
- Artikel bei deutschen Nomen behalten (z. B. "der Hund"), bei englischen Verben "to" behalten, wenn es dasteht.
- Nichts erfinden: Nur übernehmen, was auf dem Foto steht. Fehlt eine Übersetzung, das Paar weglassen.`;

function getKey() { return localStorage.getItem(KEY_NAME) || ''; }
function stillScanning() { return history.state && history.state.scan; }

// Einstieg aus der Listenansicht
function startScan(listId) {
  if (stillScanning()) history.replaceState({ scan: listId }, '');
  else history.pushState({ scan: listId }, '');
  if (!getKey()) return showKeyForm(listId);
  showScanStart(listId, []);
}

// Schlüssel einmalig eintragen (wird nur auf dem Handy gespeichert)
function showKeyForm(listId) {
  setHeader('Google-Schlüssel', true);
  app.innerHTML = `
    <div class="tile">
      <b>Einmalig: Google-Schlüssel eintragen</b>
      <div class="meta">Füge den Schlüssel aus deiner Notiz ein (beginnt meist mit „AIza…“). Er wird nur auf diesem Handy gespeichert.</div>
      <input id="in-key" class="key-input" placeholder="AIza..." autocomplete="off" autocapitalize="off" spellcheck="false">
    </div>
    <button class="btn primary" id="btn-key-save">Speichern</button>`;
  const inp = document.getElementById('in-key');
  inp.value = getKey();
  document.getElementById('btn-key-save').onclick = () => {
    const k = inp.value.trim();
    if (k.length < 20) { alert('Der Schlüssel scheint zu kurz zu sein. Bitte komplett einfügen.'); return; }
    localStorage.setItem(KEY_NAME, k);
    showScanStart(listId, []);
  };
}

// Startbildschirm: Kamera oder Galerie
async function showScanStart(listId, pairs) {
  const list = await DB.getList(listId);
  setHeader('📸 ' + list.name, true);
  app.innerHTML = `
    <div class="tile">
      <b>Vokabelseite fotografieren</b>
      <div class="meta">Tipp: Seite gerade halten, gutes Licht, möglichst nur die Vokabeln ins Bild.</div>
    </div>
    <button class="btn primary" id="btn-cam">📷 Foto aufnehmen</button>
    <button class="btn secondary" id="btn-gal">🖼️ Aus Galerie wählen</button>
    ${pairs.length ? `<button class="btn secondary" id="btn-to-preview">← Zurück zur Vorschau (${pairs.length})</button>` : ''}
    <button class="btn secondary" id="btn-key">🔑 Schlüssel ändern</button>
    <input type="file" id="file-cam" accept="image/*" capture="environment" hidden>
    <input type="file" id="file-gal" accept="image/*" hidden>`;

  const cam = document.getElementById('file-cam');
  const gal = document.getElementById('file-gal');
  document.getElementById('btn-cam').onclick = () => cam.click();
  document.getElementById('btn-gal').onclick = () => gal.click();
  cam.onchange = () => cam.files[0] && scanFile(listId, cam.files[0], pairs);
  gal.onchange = () => gal.files[0] && scanFile(listId, gal.files[0], pairs);
  document.getElementById('btn-key').onclick = () => showKeyForm(listId);
  if (pairs.length) document.getElementById('btn-to-preview').onclick = () => showPreview(listId, pairs);
}

// Foto verkleinern (schneller und spart Kontingent)
function imageToBase64(file, maxSize = 2000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Bild konnte nicht gelesen werden.')); };
    img.src = url;
  });
}

// Foto an Google Gemini schicken
async function askGemini(base64) {
  const body = {
    contents: [{ parts: [
      { inline_data: { mime_type: 'image/jpeg', data: base64 } },
      { text: PROMPT }
    ]}],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { de: { type: 'STRING' }, en: { type: 'STRING' } },
          required: ['de', 'en']
        }
      }
    }
  };

  let lastError = '';
  for (const model of MODELS) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('Keine Internetverbindung. Zum Scannen brauchst du Internet.');
    }
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content
        && data.candidates[0].content.parts) || [];
      const text = parts.map(p => p.text || '').join('').replace(/```json|```/g, '').trim();
      if (!text) throw new Error('Die KI hat keine Antwort geliefert. Bitte nochmal versuchen.');
      let list;
      try { list = JSON.parse(text); }
      catch (e) { throw new Error('Die Antwort der KI war unlesbar. Bitte nochmal versuchen.'); }
      return list
        .map(p => ({ de: String(p.de || '').trim(), en: String(p.en || '').trim() }))
        .filter(p => p.de && p.en);
    }

    const msg = (data.error && data.error.message) || ('HTTP ' + res.status);
    if (res.status === 404 || res.status === 503) { lastError = msg; continue; } // nächstes Modell probieren
    if (res.status === 400 && /api key/i.test(msg)) throw new Error('Der Google-Schlüssel ist ungültig. Tippe auf „🔑 Schlüssel ändern“.');
    if (res.status === 403) throw new Error('Zugriff verweigert. Prüfe den Schlüssel („🔑 Schlüssel ändern“).');
    if (res.status === 429) throw new Error('Das Gratis-Kontingent ist gerade aufgebraucht. Warte ein bis zwei Minuten und versuch es nochmal.');
    throw new Error('Google meldet: ' + msg);
  }
  throw new Error('Google ist gerade nicht erreichbar oder kein Modell passt: ' + lastError);
}

// Foto verarbeiten: Ladeanzeige → KI → Vorschau
async function scanFile(listId, file, pairs) {
  app.innerHTML = `
    <div class="tile summary">
      <div class="spinner"></div>
      <div><b>KI liest das Foto …</b></div>
      <div class="meta">Das dauert meist 5–20 Sekunden.</div>
    </div>`;
  try {
    const base64 = await imageToBase64(file);
    const found = await askGemini(base64);
    if (!stillScanning()) return; // Nutzer ist inzwischen zurückgegangen
    if (found.length === 0) {
      alert('Auf dem Foto wurden keine Vokabeln erkannt. Versuch es mit einem schärferen Foto.');
      return showScanStart(listId, pairs);
    }
    showPreview(listId, pairs.concat(found));
  } catch (e) {
    if (!stillScanning()) return;
    alert(e.message);
    showScanStart(listId, pairs);
  }
}

// Vorschau: prüfen, korrigieren, speichern
async function showPreview(listId, pairs) {
  const existing = await DB.getCards(listId);
  const keyOf = p => (p.de + '|' + p.en).toLowerCase();
  const known = new Set(existing.map(keyOf));

  setHeader('Vorschau prüfen', true);
  app.innerHTML = `
    <div class="tile">
      <b><span id="cnt">0</span> Vokabeln erkannt</b>
      <div class="meta">Tippe zum Korrigieren direkt ins Feld. 🗑️ entfernt eine Zeile.</div>
    </div>
    <div class="scan-head"><span>Deutsch</span><span>Englisch</span><span></span></div>
    <div id="rows"></div>
    <button class="btn secondary" id="btn-add-row">+ Zeile hinzufügen</button>
    <button class="btn secondary" id="btn-more">📸 Weitere Seite scannen</button>
    <button class="btn primary" id="btn-save">✅ Speichern</button>`;

  const rows = document.getElementById('rows');
  const cnt = document.getElementById('cnt');
  const saveBtn = document.getElementById('btn-save');

  function collect() {
    return [...rows.querySelectorAll('.scan-row')].map(r => {
      const [de, en] = r.querySelectorAll('input');
      return { de: de.value.trim(), en: en.value.trim() };
    }).filter(p => p.de && p.en);
  }
  function update() {
    const n = collect().length;
    cnt.textContent = n;
    saveBtn.textContent = `✅ ${n} Karten speichern`;
  }
  function addRow(p) {
    const row = document.createElement('div');
    row.className = 'scan-row';
    const de = document.createElement('input');
    de.value = p.de; de.placeholder = 'Deutsch'; de.oninput = update;
    const en = document.createElement('input');
    en.value = p.en; en.placeholder = 'Englisch'; en.oninput = update;
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'scan-del'; del.textContent = '🗑️';
    del.onclick = () => { row.remove(); update(); };
    row.append(de, en, del);
    rows.append(row);
    return de;
  }

  pairs.forEach(addRow);
  update();

  document.getElementById('btn-add-row').onclick = () => { addRow({ de: '', en: '' }).focus(); };
  document.getElementById('btn-more').onclick = () => showScanStart(listId, collect());

  saveBtn.onclick = async () => {
    const list = collect();
    if (list.length === 0) { alert('Keine vollständigen Paare zum Speichern.'); return; }
    saveBtn.disabled = true;
    const seen = new Set(known);
    const fresh = [];
    let skipped = 0;
    list.forEach(p => {
      const k = keyOf(p);
      if (seen.has(k)) skipped++;
      else { seen.add(k); fresh.push(p); }
    });
    if (fresh.length) await DB.addCards(listId, fresh);
    alert(`🎉 ${fresh.length} Karten gespeichert` + (skipped ? ` (${skipped} doppelte übersprungen)` : '') + '.');
    history.back(); // zurück zur Liste
  };
}
