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

function isMissing(value) {
  return value === undefined || value === null || (
    typeof value === 'string' && value.trim() === ''
  )
}

function roundedCardPoints(value) {
  return Math.floor((value + 5) / 10) * 10
}

function scoreCandidate(attackingTeamId, defendingTeamId, attackingScore, defendingScore, beloteOwnerTeamId) {
  return {
    scores: {
      [attackingTeamId]: attackingScore,
      [defendingTeamId]: defendingScore,
    },
    beloteOwnerTeamId,
  }
}

function scoreCandidates({ attackingTeamId, contract, multiplier, result }) {
  const defendingTeamId = TEAM_IDS.find((teamId) => teamId !== attackingTeamId)
  const beloteOwners = [null, attackingTeamId, defendingTeamId]
  const candidates = []
  const seen = new Set()

  const addCandidate = (attackingScore, defendingScore, beloteOwnerTeamId) => {
    const key = `${attackingScore}:${defendingScore}:${beloteOwnerTeamId ?? 'none'}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(scoreCandidate(
      attackingTeamId,
      defendingTeamId,
      attackingScore,
      defendingScore,
      beloteOwnerTeamId,
    ))
  }

  for (const beloteOwnerTeamId of beloteOwners) {
    const attackingBelote = beloteOwnerTeamId === attackingTeamId ? 20 : 0
    const defendingBelote = beloteOwnerTeamId === defendingTeamId ? 20 : 0

    if (contract !== 'capot' && result === 'made') {
      for (let exactAttackingPoints = 0; exactAttackingPoints <= 162; exactAttackingPoints += 1) {
        if (exactAttackingPoints + attackingBelote < contract) continue

        addCandidate(
          roundedCardPoints(exactAttackingPoints) + contract * multiplier + attackingBelote,
          roundedCardPoints(162 - exactAttackingPoints) + defendingBelote,
          beloteOwnerTeamId,
        )
      }
      continue
    }

    if (contract !== 'capot') {
      addCandidate(
        attackingBelote,
        160 + (multiplier === MULTIPLIERS.NORMAL ? 0 : contract * multiplier) + defendingBelote,
        beloteOwnerTeamId,
      )
      continue
    }

    if (result === 'made') {
      addCandidate(
        160 + 250 * multiplier + attackingBelote,
        defendingBelote,
        beloteOwnerTeamId,
      )
      continue
    }

    const failedCapotScore = {
      [MULTIPLIERS.NORMAL]: 160,
      [MULTIPLIERS.COINCHE]: 320,
      [MULTIPLIERS.SURCOINCHE]: 640,
    }[multiplier]

    addCandidate(
      attackingBelote,
      failedCapotScore + defendingBelote,
      beloteOwnerTeamId,
    )
  }

  return candidates
}

function uniqueBeloteOwners(candidates) {
  return [...new Set(candidates.map((candidate) => candidate.beloteOwnerTeamId))]
}

/**
 * Vérifie qu'une paire de scores peut provenir du contrat et de son résultat.
 *
 * Les scores restent manuels. Une valeur supérieure à un score réglementaire
 * de base est donc signalée comme une pénalité possible, jamais rejetée. La
 * belote-rebelote n'ayant pas de champ dédié, ses trois états possibles
 * (aucune, attaque, défense) sont examinés implicitement.
 */
export function checkScoreConsistency(input = {}) {
  const attackingTeamInput = input.attackingTeamId ?? input.attackerTeamId ?? input.attacker
  const contractInput = input.contract ?? input.amount
  const multiplierInput = input.multiplier ?? input.coinche
  const resultInput = input.result ?? input.outcome

  if (
    isMissing(attackingTeamInput) ||
    isMissing(contractInput) ||
    isMissing(multiplierInput) ||
    (isMissing(resultInput) && typeof input.success !== 'boolean')
  ) {
    return { status: 'incomplete' }
  }

  if (!TEAM_IDS.includes(attackingTeamInput)) {
    return { status: 'invalid-input' }
  }

  const attackingScoreInput = scoreInput(input, attackingTeamInput)
  const defendingTeamInput = TEAM_IDS.find((teamId) => teamId !== attackingTeamInput)
  const defendingScoreInput = scoreInput(input, defendingTeamInput)

  if (isMissing(attackingScoreInput) || isMissing(defendingScoreInput)) {
    return { status: 'incomplete' }
  }

  let contract
  let multiplier
  let result
  let attackingScore
  let defendingScore

  try {
    contract = normalizeContract(contractInput)
    multiplier = normalizeMultiplier(multiplierInput)
    result = normalizeResult(input)
    attackingScore = manualScore(attackingScoreInput, "Le score de l'équipe attaquante")
    defendingScore = manualScore(defendingScoreInput, "Le score de l'équipe en défense")
  } catch {
    return { status: 'invalid-input' }
  }

  const attackingTeamId = attackingTeamInput
  const defendingTeamId = TEAM_IDS.find((teamId) => teamId !== attackingTeamId)
  const scores = {
    [attackingTeamId]: attackingScore,
    [defendingTeamId]: defendingScore,
  }
  const candidates = scoreCandidates({ attackingTeamId, contract, multiplier, result })
  const exactCandidates = candidates.filter((candidate) => (
    candidate.scores[attackingTeamId] === attackingScore &&
    candidate.scores[defendingTeamId] === defendingScore
  ))

  if (exactCandidates.length) {
    return {
      status: 'exact',
      attackingTeamId,
      defendingTeamId,
      scores,
      baseScores: { ...scores },
      penalties: { [attackingTeamId]: 0, [defendingTeamId]: 0 },
      totalPenalty: 0,
      possibleBeloteOwners: uniqueBeloteOwners(exactCandidates),
    }
  }

  const penaltyCandidates = candidates
    .filter((candidate) => (
      candidate.scores[attackingTeamId] <= attackingScore &&
      candidate.scores[defendingTeamId] <= defendingScore
    ))
    .map((candidate) => {
      const penalties = {
        [attackingTeamId]: attackingScore - candidate.scores[attackingTeamId],
        [defendingTeamId]: defendingScore - candidate.scores[defendingTeamId],
      }
      return {
        candidate,
        penalties,
        totalPenalty: penalties[attackingTeamId] + penalties[defendingTeamId],
      }
    })
    .sort((left, right) => left.totalPenalty - right.totalPenalty)

  if (penaltyCandidates.length) {
    const best = penaltyCandidates[0]
    const equallyClose = penaltyCandidates.filter(({ totalPenalty }) => (
      totalPenalty === best.totalPenalty
    ))

    return {
      status: 'penalty-required',
      attackingTeamId,
      defendingTeamId,
      scores,
      baseScores: { ...best.candidate.scores },
      penalties: best.penalties,
      totalPenalty: best.totalPenalty,
      possibleBeloteOwners: uniqueBeloteOwners(
        equallyClose.map(({ candidate }) => candidate),
      ),
    }
  }

  const closest = candidates
    .map((candidate) => {
      const shortfalls = {
        [attackingTeamId]: Math.max(0, candidate.scores[attackingTeamId] - attackingScore),
        [defendingTeamId]: Math.max(0, candidate.scores[defendingTeamId] - defendingScore),
      }
      return {
        candidate,
        shortfalls,
        totalShortfall: shortfalls[attackingTeamId] + shortfalls[defendingTeamId],
      }
    })
    .sort((left, right) => left.totalShortfall - right.totalShortfall)[0]

  return {
    status: 'inconsistent',
    attackingTeamId,
    defendingTeamId,
    scores,
    closestBaseScores: { ...closest.candidate.scores },
    shortfalls: closest.shortfalls,
    totalShortfall: closest.totalShortfall,
  }
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
