export const SCOREKEEPER_STORE_VERSION = 1
export const SCOREKEEPER_STORAGE_KEY = 'coinche.scorekeeper.v1'

const emptyStore = () => ({
  version: SCOREKEEPER_STORE_VERSION,
  activeGame: null,
  archivedGames: [],
})

let memoryStore = emptyStore()

function copy(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

function isGame(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && typeof value.id === 'string'
      && Array.isArray(value.teams)
      && Array.isArray(value.deals),
  )
}

/**
 * Ramène toute valeur au schéma de stockage V1 sans conserver de référence
 * mutable vers l'objet fourni.
 */
export function normalizeStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyStore()
  if (value.version !== undefined && value.version !== SCOREKEEPER_STORE_VERSION) {
    return emptyStore()
  }

  return {
    version: SCOREKEEPER_STORE_VERSION,
    activeGame: isGame(value.activeGame) ? copy(value.activeGame) : null,
    archivedGames: Array.isArray(value.archivedGames)
      ? value.archivedGames.filter(isGame).map(copy)
      : [],
  }
}

/**
 * Lit la sauvegarde du téléphone. Si l'accès au stockage est bloqué, la copie
 * en mémoire du module permet à la partie courante de continuer.
 */
export function loadScorekeeperStore() {
  try {
    const raw = globalThis.localStorage?.getItem(SCOREKEEPER_STORAGE_KEY)
    if (raw) {
      const stored = normalizeStore(JSON.parse(raw))
      memoryStore = stored
      return copy(stored)
    }
  } catch {
    // Le mode mémoire est volontairement silencieux ; l'appelant peut afficher
    // un avertissement lorsque saveScorekeeperStore renvoie false.
  }

  return copy(memoryStore)
}

/**
 * Sauvegarde toujours une copie en mémoire et renvoie true uniquement lorsque
 * la persistance localStorage a réussi.
 */
export function saveScorekeeperStore(state) {
  const normalized = normalizeStore(state)
  memoryStore = normalized

  try {
    if (!globalThis.localStorage) return false
    globalThis.localStorage.setItem(SCOREKEEPER_STORAGE_KEY, JSON.stringify(normalized))
    return true
  } catch {
    return false
  }
}
