// db.js – speichert alle Daten direkt im Handy (IndexedDB)
const DB = (() => {
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('vokabeltrainer', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('lists', { keyPath: 'id', autoIncrement: true });
          const cards = db.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
          cards.createIndex('listId', 'listId');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(storeNames, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      let result;
      const req = action(tx);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function dateString(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function today() { return dateString(new Date()); }
  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return dateString(d);
  }

  function update(store, id, changes) {
    return run(store, 'readwrite', tx => {
      const s = tx.objectStore(store);
      const g = s.get(id);
      g.onsuccess = () => {
        if (g.result) s.put({ ...g.result, ...changes });
      };
    });
  }

  return {
    today,
    addDays,

    // ----- Listen -----
    getLists: () => run('lists', 'readonly', tx => tx.objectStore('lists').getAll()),
    getList: (id) => run('lists', 'readonly', tx => tx.objectStore('lists').get(id)),
    addList: (name) => run('lists', 'readwrite', tx =>
      tx.objectStore('lists').add({ name, created: Date.now() })),
    renameList: (id, name) => update('lists', id, { name }),
    deleteList: (id) => run(['lists', 'cards'], 'readwrite', tx => {
      tx.objectStore('lists').delete(id);
      const cursorReq = tx.objectStore('cards').index('listId').openCursor(IDBKeyRange.only(id));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
    }),

    // ----- Karten -----
    getCards: (listId) => run('cards', 'readonly', tx =>
      tx.objectStore('cards').index('listId').getAll(listId)),
    getAllCards: () => run('cards', 'readonly', tx => tx.objectStore('cards').getAll()),
    getCard: (id) => run('cards', 'readonly', tx => tx.objectStore('cards').get(id)),
    addCard: (listId, de, en) => run('cards', 'readwrite', tx =>
      tx.objectStore('cards').add({
        listId, de, en,
        box: 1,
        due: today(),
        created: Date.now()
      })),
    addCards: (listId, pairs) => run('cards', 'readwrite', tx => {
      const s = tx.objectStore('cards');
      const now = Date.now();
      pairs.forEach((p, i) => s.add({
        listId, de: p.de, en: p.en,
        box: 1, due: today(), created: now + i
      }));
    }),
    updateCard: (id, changes) => update('cards', id, changes),
    deleteCard: (id) => run('cards', 'readwrite', tx => tx.objectStore('cards').delete(id))
  };
})();
