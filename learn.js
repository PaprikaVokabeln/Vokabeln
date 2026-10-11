// learn.js – Lernmodus mit Leitner-Fächern (Phase 2)

// Wartezeit in Tagen je Fach
const INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 30 };
const MAX_BOX = 5;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Startbildschirm des Lernmodus
async function startLearn(listId, practice) {
  const list = await DB.getList(listId);
  const all = await DB.getCards(listId);
  const cards = practice ? all : all.filter(c => c.due <= DB.today());

  history.pushState({ learn: listId }, '');
  setHeader((practice ? 'Üben: ' : 'Lernen: ') + list.name, true);

  if (cards.length === 0) {
    app.innerHTML = `
      <div class="tile summary">
        <div class="big-number">🎉</div>
        <div>${practice ? 'Diese Liste hat noch keine Karten.' : 'Heute ist nichts mehr fällig!'}</div>
        <div class="meta">${practice ? '' : 'Komm morgen wieder oder übe alle Karten ohne Wertung.'}</div>
      </div>
      <button class="btn secondary" id="btn-done">← Zurück zur Liste</button>`;
    document.getElementById('btn-done').onclick = () => history.back();
    return;
  }

  app.innerHTML = `
    <div class="tile summary">
      <div class="big-number">${cards.length}</div>
      <div class="meta">${practice ? 'Karten zum Üben (ohne Wertung)' : 'Karten heute fällig'}</div>
    </div>
    <h2>Richtung wählen</h2>
    <button class="btn primary" data-dir="de">Deutsch → Englisch</button>
    <button class="btn primary" data-dir="en">Englisch → Deutsch</button>
    <button class="btn secondary" data-dir="mix">🔀 Gemischt</button>`;

  app.querySelectorAll('[data-dir]').forEach(b =>
    b.onclick = () => runSession(cards, b.dataset.dir, practice));
}

// Die eigentliche Lernrunde
function runSession(cards, dir, practice) {
  const queue = shuffle([...cards]);
  const wrongOnce = new Set();   // Karten, die in dieser Runde schon falsch waren
  const total = queue.length;
  let done = 0;
  let right = 0;

  function showNext() {
    if (queue.length === 0) return showResult();
    const card = queue[0];
    const fromDe = dir === 'de' || (dir === 'mix' && Math.random() < 0.5);
    const question = fromDe ? card.de : card.en;
    const answer = fromDe ? card.en : card.de;

    app.innerHTML = `
      <div class="progress"><div class="progress-bar" style="width:${Math.round(done / total * 100)}%"></div></div>
      <div class="meta center">${done} von ${total} geschafft · Fach ${card.box}</div>
      <div class="flashcard" id="flashcard">
        <div class="lang">${fromDe ? 'Deutsch' : 'Englisch'}</div>
        <div class="word">${esc(question)}</div>
        <div class="answer" id="answer" hidden>
          <div class="lang">${fromDe ? 'Englisch' : 'Deutsch'}</div>
          <div class="word">${esc(answer)}</div>
        </div>
        <div class="hint" id="hint">👆 Tippen zum Aufdecken</div>
      </div>
      <div class="row" id="rate" hidden>
        <button class="btn danger" id="btn-wrong">✗ Nicht gewusst</button>
        <button class="btn success" id="btn-right">✓ Gewusst</button>
      </div>`;

    document.getElementById('flashcard').onclick = () => {
      document.getElementById('answer').hidden = false;
      document.getElementById('hint').hidden = true;
      document.getElementById('rate').hidden = false;
    };
    document.getElementById('btn-right').onclick = () => rate(card, true);
    document.getElementById('btn-wrong').onclick = () => rate(card, false);
  }

  async function rate(card, correct) {
    // Doppeltippen verhindern
    document.querySelectorAll('#rate button').forEach(b => b.disabled = true);
    queue.shift();

    if (correct) {
      done++;
      if (!wrongOnce.has(card.id)) right++;
      if (!practice) {
        // Heute schon falsch gewesen? Dann bleibt sie in Fach 1
        const box = wrongOnce.has(card.id) ? 1 : Math.min(card.box + 1, MAX_BOX);
        await DB.updateCard(card.id, { box, due: DB.addDays(INTERVALS[box]) });
      }
    } else {
      wrongOnce.add(card.id);
      if (!practice) {
        await DB.updateCard(card.id, { box: 1, due: DB.today() });
        card.box = 1;
      }
      queue.push(card);   // kommt am Ende nochmal dran
    }
    showNext();
  }

  function showResult() {
    const pct = Math.round(right / total * 100);
    app.innerHTML = `
      <div class="tile summary">
        <div class="big-number">${pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'}</div>
        <div><b>${right} von ${total}</b> beim ersten Versuch gewusst (${pct} %)</div>
        <div class="meta">${practice
          ? 'Übungsrunde: Die Fächer wurden nicht verändert.'
          : 'Gewusste Karten sind ein Fach aufgestiegen.'}</div>
      </div>
      <button class="btn primary" id="btn-done">← Zurück zur Liste</button>`;
    document.getElementById('btn-done').onclick = () => history.back();
  }

  showNext();
}
