// learn.js – Lernmodus mit 5 Schubladen
// Start = Schublade 3, Ziel = Schublade 1 (gelernt), tiefster Punkt = Schublade 5
const START_BOX = 3;
const DONE_BOX = 1;
const MAX_BOX = 5;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Karten in Schublade 1 gelten als "fertig" und zählen nicht mehr als offen
function dueFor(box) {
  return box === DONE_BOX ? DB.addDays(36500) : DB.today();
}

// Übersicht: die 5 Schubladen übereinander
function drawersHtml(cards) {
  let html = '<div class="drawers">';
  for (let b = 1; b <= MAX_BOX; b++) {
    const n = cards.filter(c => c.box === b).length;
    const extra = b === DONE_BOX ? ' ✅' : b === START_BOX ? ' ⭐' : '';
    html += `<div class="drawer${b === DONE_BOX ? ' done' : ''}">
      <span>Schublade ${b}${extra}</span><b>${n}</b></div>`;
  }
  return html + '</div>';
}

async function startLearn(listId, all) {
  const list = await DB.getList(listId);
  const cards = await DB.getCards(listId);
  const todo = all ? cards : cards.filter(c => c.box !== DONE_BOX);

  // Kein doppelter Verlauf, wenn man im Lernmodus neu startet
  if (history.state && history.state.learn) history.replaceState({ learn: listId }, '');
  else history.pushState({ learn: listId }, '');
  setHeader('Lernen: ' + list.name, true);

  if (cards.length === 0) {
    app.innerHTML = `
      <div class="tile summary"><div>Diese Liste hat noch keine Karten.</div></div>
      <button class="btn secondary" id="btn-done">← Zurück zur Liste</button>`;
    document.getElementById('btn-done').onclick = () => history.back();
    return;
  }

  if (todo.length === 0) {
    app.innerHTML = `
      <div class="tile summary">
        <div class="big-number">🏆</div>
        <div><b>Alle Karten sind in Schublade 1!</b></div>
        <div class="meta">Diese Liste ist fertig gelernt.</div>
      </div>
      ${drawersHtml(cards)}
      <button class="btn secondary" id="btn-again">🔁 Trotzdem alle wiederholen</button>
      <button class="btn secondary" id="btn-done">← Zurück zur Liste</button>`;
    document.getElementById('btn-again').onclick = () => startLearn(listId, true);
    document.getElementById('btn-done').onclick = () => history.back();
    return;
  }

  app.innerHTML = `
    ${drawersHtml(cards)}
    <div class="meta center">${todo.length} Karten in dieser Runde</div>
    <h2>Richtung wählen</h2>
    <button class="btn primary" data-dir="de">Deutsch → Englisch</button>
    <button class="btn secondary" data-dir="en">Englisch → Deutsch</button>
    <button class="btn secondary" data-dir="mix">🔀 Gemischt</button>`;

  app.querySelectorAll('[data-dir]').forEach(b =>
    b.onclick = () => runSession(todo, b.dataset.dir, listId));
}

function runSession(cards, dir, listId) {
  const queue = shuffle([...cards]);
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
      <div class="meta center">${done} von ${total} · Schublade ${card.box}</div>
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
    document.querySelectorAll('#rate button').forEach(b => b.disabled = true);
    queue.shift();
    done++;
    if (correct) right++;
    // Gewusst: 1 rauf (Richtung 1), nicht gewusst: 1 runter (Richtung 5)
    const box = correct ? Math.max(card.box - 1, DONE_BOX) : Math.min(card.box + 1, MAX_BOX);
    await DB.updateCard(card.id, { box, due: dueFor(box) });
    showNext();
  }

  async function showResult() {
    const all = await DB.getCards(listId);
    const finished = all.every(c => c.box === DONE_BOX);
    app.innerHTML = `
      <div class="tile summary">
        <div class="big-number">${finished ? '🏆' : right === total ? '🌟' : '💪'}</div>
        <div><b>${right} von ${total}</b> gewusst</div>
        <div class="meta">${finished ? 'Alle Karten sind in Schublade 1. Liste gelernt!' : 'Wiederhole so oft du willst, bis alle oben sind.'}</div>
      </div>
      ${drawersHtml(all)}
      ${finished ? '' : '<button class="btn primary" id="btn-again">🔁 Nochmal lernen</button>'}
      <button class="btn secondary" id="btn-done">← Zurück zur Liste</button>`;
    if (!finished) document.getElementById('btn-again').onclick = () => startLearn(listId, false);
    document.getElementById('btn-done').onclick = () => history.back();
  }

  showNext();
}
