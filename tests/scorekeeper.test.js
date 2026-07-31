import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MULTIPLIERS,
  checkScoreConsistency,
  createDeal,
  createGame,
  getCumulativeSeries,
  getGameOutcome,
  getGameStats,
  getGameTotals,
  hasReachedEnd,
} from '../src/scorekeeper/model.js'
import {
  SCOREKEEPER_STORAGE_KEY,
  loadScorekeeperStore,
  normalizeStore,
  saveScorekeeperStore,
} from '../src/scorekeeper/storage.js'

const timestamp = '2026-07-31T12:00:00.000Z'

function gameWith(config = {}) {
  return createGame({ id: 'game-test', createdAt: timestamp, ...config })
}

function dealWith(input = {}) {
  return createDeal({
    id: `deal-${input.id ?? 'test'}`,
    attackingTeamId: 'team-a',
    contract: 80,
    suit: 'hearts',
    multiplier: MULTIPLIERS.NORMAL,
    result: 'made',
    scores: { 'team-a': 80, 'team-b': 82 },
    createdAt: timestamp,
    ...input,
  })
}

function scoreCheckWith(input = {}) {
  return checkScoreConsistency({
    attackingTeamId: 'team-a',
    contract: 80,
    multiplier: MULTIPLIERS.NORMAL,
    result: 'made',
    scores: { 'team-a': 160, 'team-b': 80 },
    ...input,
  })
}

test('le vérificateur accepte les contrats numériques réussis et leur arrondi indépendant', () => {
  assert.equal(scoreCheckWith().status, 'exact')
  assert.equal(scoreCheckWith({ scores: { 'team-a': 170, 'team-b': 80 } }).status, 'exact')

  assert.equal(scoreCheckWith({
    contract: 120,
    multiplier: MULTIPLIERS.COINCHE,
    scores: { 'team-a': 370, 'team-b': 30 },
  }).status, 'exact')

  assert.equal(scoreCheckWith({
    contract: 160,
    scores: { 'team-a': 320, 'team-b': 0 },
  }).status, 'exact')
})

test('le vérificateur applique les formules de chute des contrats numériques', () => {
  const cases = [
    [MULTIPLIERS.NORMAL, 0, 160],
    [MULTIPLIERS.COINCHE, 0, 360],
    [MULTIPLIERS.SURCOINCHE, 0, 560],
  ]

  for (const [multiplier, attackingScore, defendingScore] of cases) {
    assert.equal(scoreCheckWith({
      contract: 100,
      multiplier,
      result: 'failed',
      scores: { 'team-a': attackingScore, 'team-b': defendingScore },
    }).status, 'exact')
  }
})

test('le vérificateur tient compte implicitement de la belote-rebelote', () => {
  const attackingBelote = scoreCheckWith({
    contract: 100,
    result: 'failed',
    scores: { 'team-a': 20, 'team-b': 160 },
  })
  assert.equal(attackingBelote.status, 'exact')
  assert.deepEqual(attackingBelote.possibleBeloteOwners, ['team-a'])

  const defendingBelote = scoreCheckWith({
    contract: 100,
    result: 'failed',
    scores: { 'team-a': 0, 'team-b': 180 },
  })
  assert.equal(defendingBelote.status, 'exact')
  assert.deepEqual(defendingBelote.possibleBeloteOwners, ['team-b'])
})

test('le vérificateur applique les scores particuliers du capot', () => {
  const madeScores = [
    [MULTIPLIERS.NORMAL, 410],
    [MULTIPLIERS.COINCHE, 660],
    [MULTIPLIERS.SURCOINCHE, 1160],
  ]
  const failedScores = [
    [MULTIPLIERS.NORMAL, 160],
    [MULTIPLIERS.COINCHE, 320],
    [MULTIPLIERS.SURCOINCHE, 640],
  ]

  for (const [multiplier, attackingScore] of madeScores) {
    assert.equal(scoreCheckWith({
      contract: 'capot',
      multiplier,
      scores: { 'team-a': attackingScore, 'team-b': 0 },
    }).status, 'exact')
  }

  for (const [multiplier, defendingScore] of failedScores) {
    assert.equal(scoreCheckWith({
      contract: 'capot',
      multiplier,
      result: 'failed',
      scores: { 'team-a': 0, 'team-b': defendingScore },
    }).status, 'exact')
  }

  assert.equal(scoreCheckWith({
    contract: 'capot',
    scores: { 'team-a': 430, 'team-b': 0 },
  }).status, 'exact')
  assert.equal(scoreCheckWith({
    contract: 'capot',
    scores: { 'team-a': 410, 'team-b': 20 },
  }).status, 'exact')
})

test('un surplus est signalé comme une pénalité manuelle possible', () => {
  const onePointPenalty = scoreCheckWith({
    scores: { 'team-a': 171, 'team-b': 80 },
  })
  assert.equal(onePointPenalty.status, 'penalty-required')
  assert.deepEqual(onePointPenalty.baseScores, { 'team-a': 170, 'team-b': 80 })
  assert.deepEqual(onePointPenalty.penalties, { 'team-a': 1, 'team-b': 0 })
  assert.equal(onePointPenalty.totalPenalty, 1)

  const apparentDoubleBelote = scoreCheckWith({
    contract: 100,
    result: 'failed',
    scores: { 'team-a': 20, 'team-b': 180 },
  })
  assert.equal(apparentDoubleBelote.status, 'penalty-required')
  assert.equal(apparentDoubleBelote.totalPenalty, 20)
  assert.deepEqual(
    new Set(apparentDoubleBelote.possibleBeloteOwners),
    new Set(['team-a', 'team-b']),
  )
})

test('un score inférieur à toute formule réglementaire est incohérent', () => {
  const numeric = scoreCheckWith({ scores: { 'team-a': 150, 'team-b': 100 } })
  assert.equal(numeric.status, 'inconsistent')
  assert.ok(numeric.totalShortfall > 0)

  assert.equal(scoreCheckWith({
    contract: 'capot',
    scores: { 'team-a': 400, 'team-b': 0 },
  }).status, 'inconsistent')
})

test("le vérificateur respecte l'identité de l'équipe attaquante", () => {
  const result = scoreCheckWith({
    attackingTeamId: 'team-b',
    result: 'failed',
    scores: { 'team-a': 160, 'team-b': 0 },
  })

  assert.equal(result.status, 'exact')
  assert.equal(result.attackingTeamId, 'team-b')
  assert.equal(result.defendingTeamId, 'team-a')
})

test('le vérificateur distingue saisie incomplète et saisie invalide', () => {
  assert.equal(scoreCheckWith({ scores: { 'team-a': '', 'team-b': 80 } }).status, 'incomplete')
  assert.equal(scoreCheckWith({ scores: { 'team-a': -1, 'team-b': 80 } }).status, 'invalid-input')
  assert.equal(scoreCheckWith({ scores: { 'team-a': 160.5, 'team-b': 80 } }).status, 'invalid-input')
  assert.equal(scoreCheckWith({ multiplier: 3 }).status, 'invalid-input')
  assert.equal(scoreCheckWith({ attackingTeamId: 'équipe-inconnue' }).status, 'invalid-input')
})

test('les cumuls utilisent exclusivement les scores manuels', () => {
  const game = gameWith()
  game.deals = [
    dealWith({ id: '1', scores: { 'team-a': 137, 'team-b': 25 } }),
    dealWith({
      id: '2',
      attackingTeamId: 'team-b',
      contract: 'capot',
      multiplier: MULTIPLIERS.SURCOINCHE,
      result: 'failed',
      scores: { 'team-a': 641, 'team-b': 3 },
    }),
  ]

  assert.deepEqual(getGameTotals(game), { 'team-a': 778, 'team-b': 28 })
})

test('la série cumulée commence à zéro et contient un point par donne', () => {
  const game = gameWith()
  game.deals = [
    dealWith({ id: '1', scores: { 'team-a': 80, 'team-b': 82 } }),
    dealWith({ id: '2', scores: { 'team-a': 0, 'team-b': 260 } }),
  ]

  assert.deepEqual(getCumulativeSeries(game), [
    { dealNumber: 0, scores: { 'team-a': 0, 'team-b': 0 } },
    { dealNumber: 1, scores: { 'team-a': 80, 'team-b': 82 } },
    { dealNumber: 2, scores: { 'team-a': 80, 'team-b': 342 } },
  ])
})

test('une donne éditée recalcule les cumuls et toute la série', () => {
  const game = gameWith()
  game.deals = [
    dealWith({ id: '1', scores: { 'team-a': 80, 'team-b': 82 } }),
    dealWith({ id: '2', scores: { 'team-a': 100, 'team-b': 60 } }),
  ]

  const edited = {
    ...game,
    deals: game.deals.map((deal, index) => (
      index === 0
        ? { ...deal, scores: { 'team-a': 0, 'team-b': 240 } }
        : deal
    )),
  }

  assert.deepEqual(getGameTotals(edited), { 'team-a': 100, 'team-b': 300 })
  assert.deepEqual(getCumulativeSeries(edited).at(-1), {
    dealNumber: 2,
    scores: { 'team-a': 100, 'team-b': 300 },
  })
})

test("si les deux équipes atteignent la cible, le total le plus élevé l'emporte", () => {
  const game = gameWith({ targetScore: 1000 })
  game.deals = [
    dealWith({ id: '1', scores: { 'team-a': 1010, 'team-b': 1040 } }),
  ]

  assert.equal(hasReachedEnd(game), true)
  assert.deepEqual(getGameOutcome(game), {
    status: 'won',
    winnerTeamId: 'team-b',
    totals: { 'team-a': 1010, 'team-b': 1040 },
  })
})

test('une partie terminée à égalité conserve une issue ex æquo', () => {
  const game = gameWith({ targetScore: 1000 })
  game.deals = [dealWith({ id: '1', scores: { 'team-a': 1000, 'team-b': 1000 } })]

  assert.deepEqual(getGameOutcome(game), {
    status: 'tie',
    winnerTeamId: null,
    totals: { 'team-a': 1000, 'team-b': 1000 },
  })
})

test('une fin au nombre de donnes se déclenche au compte configuré', () => {
  const game = gameWith({ endMode: 'deals', dealLimit: 2 })
  game.deals = [dealWith({ id: '1' })]
  assert.equal(hasReachedEnd(game), false)

  game.deals.push(dealWith({ id: '2' }))
  assert.equal(hasReachedEnd(game), true)
  assert.equal(getGameOutcome(game).status, 'won')
})

test('les statistiques résument contrats, coinches, grosse donne et avance maximale', () => {
  const game = gameWith()
  game.deals = [
    dealWith({
      id: '1',
      attackingTeamId: 'team-a',
      multiplier: MULTIPLIERS.COINCHE,
      result: 'made',
      scores: { 'team-a': 220, 'team-b': 20 },
    }),
    dealWith({
      id: '2',
      attackingTeamId: 'team-b',
      multiplier: MULTIPLIERS.SURCOINCHE,
      result: 'failed',
      scores: { 'team-a': 320, 'team-b': 0 },
    }),
    dealWith({
      id: '3',
      attackingTeamId: 'team-b',
      multiplier: MULTIPLIERS.NORMAL,
      result: 'made',
      scores: { 'team-a': 0, 'team-b': 650 },
    }),
  ]

  assert.deepEqual(getGameStats(game), {
    dealsPlayed: 3,
    totals: { 'team-a': 540, 'team-b': 670 },
    byTeam: {
      'team-a': { made: 1, failed: 0, points: 540 },
      'team-b': { made: 1, failed: 1, points: 670 },
    },
    coined: 1,
    surcoined: 1,
    biggestDeal: {
      dealId: '3',
      dealNumber: 3,
      teamId: 'team-b',
      score: 650,
    },
    maxLead: {
      amount: 520,
      teamId: 'team-a',
      dealNumber: 2,
    },
  })
})

test('le stockage normalise le schéma V1 et persiste une copie indépendante', () => {
  const values = new Map()
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  })

  try {
    const activeGame = gameWith()
    const state = normalizeStore({ activeGame, archivedGames: [] })
    assert.equal(saveScorekeeperStore(state), true)
    activeGame.teams[0].name = 'Nom modifié après sauvegarde'

    const loaded = loadScorekeeperStore()
    assert.equal(loaded.version, 1)
    assert.equal(loaded.activeGame.teams[0].name, 'Équipe A')
    assert.ok(values.has(SCOREKEEPER_STORAGE_KEY))
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
    } else {
      delete globalThis.localStorage
    }
  }
})

test("le mode mémoire reste disponible si localStorage refuse l'écriture", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('stockage indisponible')
      },
      setItem: () => {
        throw new Error('stockage indisponible')
      },
    },
  })

  try {
    const state = normalizeStore({ activeGame: gameWith({ id: 'memory-game' }) })
    assert.equal(saveScorekeeperStore(state), false)
    assert.equal(loadScorekeeperStore().activeGame.id, 'memory-game')
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
    } else {
      delete globalThis.localStorage
    }
  }
})
