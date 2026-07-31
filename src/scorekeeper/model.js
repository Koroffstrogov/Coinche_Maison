export const CONTRACT_AMOUNTS = Object.freeze([
  80,
  90,
  100,
  110,
  120,
  130,
  140,
  150,
  160,
])

export const SUITS = Object.freeze(['hearts', 'diamonds', 'clubs', 'spades'])

export const MULTIPLIERS = Object.freeze({
  NORMAL: 1,
  COINCHE: 2,
  SURCOINCHE: 4,
})

const TEAM_IDS = Object.freeze(['team-a', 'team-b'])
const VALID_RESULTS = new Set(['made', 'failed'])

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${prefix}-${uuid}`

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function asIsoDate(value) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value
  return new Date().toISOString()
}

function teamName(value, fallback) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

function positiveInteger(value, fallback, label) {
  const parsed = Number(value ?? fallback)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${label} doit être un entier strictement positif.`)
  }
  return parsed
}

function manualScore(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new RangeError(`${label} doit être un entier positif ou nul.`)
  }
  return parsed
}

function safeScore(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function normalizeContract(value) {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'capot') {
    return 'capot'
  }

  const amount = Number(value)
  if (!CONTRACT_AMOUNTS.includes(amount)) {
    throw new RangeError('Le contrat doit être compris entre 80 et 160, ou être un capot.')
  }
  return amount
}

function normalizeSuit(value) {
  const aliases = {
    coeur: 'hearts',
    coeurs: 'hearts',
    'cœur': 'hearts',
    'cœurs': 'hearts',
    heart: 'hearts',
    hearts: 'hearts',
    carreau: 'diamonds',
    carreaux: 'diamonds',
    diamond: 'diamonds',
    diamonds: 'diamonds',
    trefle: 'clubs',
    trefles: 'clubs',
    'trèfle': 'clubs',
    'trèfles': 'clubs',
    club: 'clubs',
    clubs: 'clubs',
    pique: 'spades',
    piques: 'spades',
    spade: 'spades',
    spades: 'spades',
  }
  const normalized = aliases[String(value ?? '').trim().toLowerCase()]
  if (!normalized) throw new RangeError('La couleur du contrat est invalide.')
  return normalized
}

function normalizeMultiplier(value) {
  if (value === undefined || value === null || value === '') return MULTIPLIERS.NORMAL
  if (Object.values(MULTIPLIERS).includes(Number(value))) return Number(value)

  const aliases = {
    normal: MULTIPLIERS.NORMAL,
    coinche: MULTIPLIERS.COINCHE,
    coined: MULTIPLIERS.COINCHE,
    surcoinche: MULTIPLIERS.SURCOINCHE,
    surcoined: MULTIPLIERS.SURCOINCHE,
  }
  const normalized = aliases[String(value).trim().toLowerCase()]
  if (!normalized) throw new RangeError('Le multiplicateur doit être normal, coinché ou surcoinché.')
  return normalized
}

function normalizeResult(input) {
  if (typeof input.success === 'boolean') return input.success ? 'made' : 'failed'

  const aliases = {
    made: 'made',
    success: 'made',
    succeeded: 'made',
    reussi: 'made',
    'réussi': 'made',
    failed: 'failed',
    failure: 'failed',
    chute: 'failed',
    'chuté': 'failed',
  }
  const normalized = aliases[String(input.result ?? input.outcome ?? '').trim().toLowerCase()]
  if (!VALID_RESULTS.has(normalized)) {
    throw new RangeError('Le résultat doit être « made » ou « failed ».')
  }
  return normalized
}

function scoreInput(input, teamId) {
  const scores = input.scores ?? {}
  if (teamId === 'team-a') {
    return scores[teamId] ?? scores.teamA ?? input.teamAScore ?? input.scoreA
  }
  return scores[teamId] ?? scores.teamB ?? input.teamBScore ?? input.scoreB
}

function gameTeamIds(game) {
  const ids = Array.isArray(game?.teams)
    ? game.teams.map((team) => team?.id).filter((id) => typeof id === 'string')
    : []

  return ids.length === 2 ? ids : [...TEAM_IDS]
}

function gameDeals(game) {
  return Array.isArray(game?.deals) ? game.deals : []
}

function isGameExplicitlyFinished(game) {
  return game?.status === 'completed' || game?.status === 'archived'
}

/**
 * Crée une partie vide. Les identifiants d'équipe restent stables afin que les
 * donnes archivées ne dépendent jamais d'un changement de nom d'équipe.
 */
export function createGame(config = {}) {
  const teamAInput = Array.isArray(config.teams) ? config.teams[0]?.name : config.teamAName
  const teamBInput = Array.isArray(config.teams) ? config.teams[1]?.name : config.teamBName
  const endInput = config.endCondition ?? {}
  const endType = endInput.type ?? config.endType ?? config.endMode ?? 'score'

  if (endType !== 'score' && endType !== 'deals') {
    throw new RangeError('La fin de partie doit être définie par un score ou un nombre de donnes.')
  }

  const endCondition = endType === 'score'
    ? {
        type: 'score',
        target: positiveInteger(
          endInput.target ?? config.targetScore,
          1000,
          'Le score cible',
        ),
      }
    : {
        type: 'deals',
        count: positiveInteger(
          endInput.count ?? config.dealLimit,
          10,
          'Le nombre de donnes',
        ),
      }

  const createdAt = asIsoDate(config.createdAt)

  return {
    id: typeof config.id === 'string' && config.id ? config.id : makeId('game'),
    teams: [
      { id: TEAM_IDS[0], name: teamName(teamAInput, 'Équipe A') },
      { id: TEAM_IDS[1], name: teamName(teamBInput, 'Équipe B') },
    ],
    endCondition,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    deals: [],
  }
}

/**
 * Normalise une saisie de donne. Les scores restent totalement manuels : le
 * contrat, son résultat et son multiplicateur ne les recalculent jamais.
 */
export function createDeal(input = {}) {
  const attackingTeamId = input.attackingTeamId ?? input.attackerTeamId ?? input.attacker
  if (!TEAM_IDS.includes(attackingTeamId)) {
    throw new RangeError("L'équipe attaquante doit être « team-a » ou « team-b ».")
  }

  const createdAt = asIsoDate(input.createdAt)

  return {
    id: typeof input.id === 'string' && input.id ? input.id : makeId('deal'),
    attackingTeamId,
    contract: normalizeContract(input.contract ?? input.amount),
    suit: normalizeSuit(input.suit),
    multiplier: normalizeMultiplier(input.multiplier ?? input.coinche),
    result: normalizeResult(input),
    scores: {
      [TEAM_IDS[0]]: manualScore(scoreInput(input, TEAM_IDS[0]), "Le score de l'équipe A"),
      [TEAM_IDS[1]]: manualScore(scoreInput(input, TEAM_IDS[1]), "Le score de l'équipe B"),
    },
    createdAt,
    updatedAt: asIsoDate(input.updatedAt ?? createdAt),
  }
}

export function getGameTotals(game) {
  const teamIds = gameTeamIds(game)
  const totals = Object.fromEntries(teamIds.map((teamId) => [teamId, 0]))

  for (const deal of gameDeals(game)) {
    for (const teamId of teamIds) {
      totals[teamId] += safeScore(deal?.scores?.[teamId])
    }
  }

  return totals
}

export function getCumulativeSeries(game) {
  const teamIds = gameTeamIds(game)
  const running = Object.fromEntries(teamIds.map((teamId) => [teamId, 0]))
  const series = [{ dealNumber: 0, scores: { ...running } }]

  gameDeals(game).forEach((deal, index) => {
    for (const teamId of teamIds) {
      running[teamId] += safeScore(deal?.scores?.[teamId])
    }
    series.push({ dealNumber: index + 1, scores: { ...running } })
  })

  return series
}

export function hasReachedEnd(game) {
  if (isGameExplicitlyFinished(game)) return true

  const endCondition = game?.endCondition
  if (endCondition?.type === 'deals') {
    return gameDeals(game).length >= positiveInteger(endCondition.count, 1, 'Le nombre de donnes')
  }

  if (endCondition?.type === 'score') {
    const target = positiveInteger(endCondition.target, 1000, 'Le score cible')
    return Object.values(getGameTotals(game)).some((total) => total >= target)
  }

  return false
}

export function getGameOutcome(game) {
  const totals = getGameTotals(game)
  const [teamAId, teamBId] = gameTeamIds(game)

  if (!hasReachedEnd(game)) {
    return {
      status: 'in-progress',
      winnerTeamId: null,
      totals,
    }
  }

  if (totals[teamAId] === totals[teamBId]) {
    return {
      status: 'tie',
      winnerTeamId: null,
      totals,
    }
  }

  return {
    status: 'won',
    winnerTeamId: totals[teamAId] > totals[teamBId] ? teamAId : teamBId,
    totals,
  }
}

export function getGameStats(game) {
  const teamIds = gameTeamIds(game)
  const totals = getGameTotals(game)
  const byTeam = Object.fromEntries(
    teamIds.map((teamId) => [
      teamId,
      {
        made: 0,
        failed: 0,
        points: totals[teamId],
      },
    ]),
  )

  let coined = 0
  let surcoined = 0
  let biggestDeal = null
  let maxLead = { amount: 0, teamId: null, dealNumber: 0 }
  const running = Object.fromEntries(teamIds.map((teamId) => [teamId, 0]))

  gameDeals(game).forEach((deal, index) => {
    const dealNumber = index + 1
    const attackerStats = byTeam[deal?.attackingTeamId]
    if (attackerStats && VALID_RESULTS.has(deal?.result)) {
      attackerStats[deal.result] += 1
    }

    if (Number(deal?.multiplier) === MULTIPLIERS.COINCHE) coined += 1
    if (Number(deal?.multiplier) === MULTIPLIERS.SURCOINCHE) surcoined += 1

    for (const teamId of teamIds) {
      const score = safeScore(deal?.scores?.[teamId])
      running[teamId] += score

      if (!biggestDeal || score > biggestDeal.score) {
        biggestDeal = {
          dealId: deal?.id ?? null,
          dealNumber,
          teamId,
          score,
        }
      }
    }

    const lead = Math.abs(running[teamIds[0]] - running[teamIds[1]])
    if (lead > maxLead.amount) {
      maxLead = {
        amount: lead,
        teamId:
          running[teamIds[0]] > running[teamIds[1]] ? teamIds[0] : teamIds[1],
        dealNumber,
      }
    }
  })

  return {
    dealsPlayed: gameDeals(game).length,
    totals,
    byTeam,
    coined,
    surcoined,
    biggestDeal,
    maxLead,
  }
}
