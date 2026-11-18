/* Storage: thin wrapper around localStorage. Everything is saved under one key. */
const Store = {
  key: 'cadence.v1',
  load() { try { return JSON.parse(localStorage.getItem(this.key)); } catch { return null; } },
  save(state) { try { localStorage.setItem(this.key, JSON.stringify(state)); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(this.key); } catch { /* storage unavailable */ } }
};
