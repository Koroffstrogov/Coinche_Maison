import { useId, useMemo } from 'react'

const VIEWBOX_WIDTH = 480
const VIEWBOX_HEIGHT = 300
const PLOT = {
  left: 58,
  right: 18,
  top: 22,
  bottom: 44,
}

const numberFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
})

function readTeamName(team, fallback) {
  if (typeof team === 'string' && team.trim()) return team.trim()
  if (team && typeof team.name === 'string' && team.name.trim()) {
    return team.name.trim()
  }
  return fallback
}

function normaliseTeams(teams) {
  if (Array.isArray(teams)) {
    return [
      {
        id: teams[0]?.id ?? 'team-a',
        name: readTeamName(teams[0], 'Équipe A'),
      },
      {
        id: teams[1]?.id ?? 'team-b',
        name: readTeamName(teams[1], 'Équipe B'),
      },
    ]
  }

  return [
    {
      id: teams?.teamA?.id ?? teams?.a?.id ?? 'team-a',
      name: readTeamName(teams?.teamA ?? teams?.a, 'Équipe A'),
    },
    {
      id: teams?.teamB?.id ?? teams?.b?.id ?? 'team-b',
      name: readTeamName(teams?.teamB ?? teams?.b, 'Équipe B'),
    },
  ]
}

function readScore(point, teamId, fallbackKey) {
  const nestedScore = point?.scores?.[teamId]
  const rawScore = nestedScore ?? point?.[fallbackKey]
  const score = Number(rawScore)

  return Number.isFinite(score) ? Math.max(0, score) : 0
}

function normaliseSeries(series, teams) {
  if (!Array.isArray(series)) return []

  return series
    .filter((point) => point && typeof point === 'object')
    .map((point, index) => {
      const rawDealNumber = Number(point.dealNumber)

      return {
        dealNumber: Number.isFinite(rawDealNumber) ? rawDealNumber : index + 1,
        teamA: readScore(point, teams[0].id, 'teamA'),
        teamB: readScore(point, teams[1].id, 'teamB'),
      }
    })
}

function niceStep(value) {
  const exponent = Math.floor(Math.log10(value))
  const magnitude = 10 ** exponent
  const fraction = value / magnitude

  if (fraction <= 1) return magnitude
  if (fraction <= 2) return 2 * magnitude
  if (fraction <= 5) return 5 * magnitude
  return 10 * magnitude
}

function makeScaleMaximum(value) {
  const boundedValue = Math.max(10, value)
  const step = niceStep(boundedValue / 5)

  return {
    maximum: Math.ceil(boundedValue / step) * step,
    step,
  }
}

function makeTickIndices(length, maximumTicks = 7) {
  if (length <= maximumTicks) {
    return Array.from({ length }, (_, index) => index)
  }

  const indices = new Set([0, length - 1])
  const interval = (length - 1) / (maximumTicks - 1)

  for (let index = 1; index < maximumTicks - 1; index += 1) {
    indices.add(Math.round(index * interval))
  }

  return [...indices].sort((first, second) => first - second)
}

function makePath(points) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
}

export function ScoreChart({ series = [], teams = [], target }) {
  const id = useId().replace(/:/g, '')
  const titleId = `score-chart-title-${id}`
  const descriptionId = `score-chart-description-${id}`
  const svgTitleId = `score-chart-svg-title-${id}`
  const svgDescriptionId = `score-chart-svg-description-${id}`

  const teamData = useMemo(() => normaliseTeams(teams), [teams])
  const points = useMemo(
    () => normaliseSeries(series, teamData),
    [series, teamData],
  )

  const numericTarget = Number(target)
  const hasTarget = Number.isFinite(numericTarget) && numericTarget > 0

  const lastDealNumber = points.at(-1)?.dealNumber ?? 0

  if (points.length === 0 || (points.length === 1 && lastDealNumber === 0)) {
    return (
      <figure
        className="score-chart score-chart--empty"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <figcaption className="score-chart__heading">
          <h2 id={titleId} className="score-chart__title">
            Évolution du score
          </h2>
          <p id={descriptionId} className="score-chart__description">
            La courbe apparaîtra après l’enregistrement de la première donne.
          </p>
        </figcaption>
        <p className="score-chart__empty-message">Aucune donne enregistrée.</p>
      </figure>
    )
  }

  const plotWidth = VIEWBOX_WIDTH - PLOT.left - PLOT.right
  const plotHeight = VIEWBOX_HEIGHT - PLOT.top - PLOT.bottom
  const highestScore = Math.max(
    ...points.flatMap((point) => [point.teamA, point.teamB]),
    hasTarget ? numericTarget : 0,
  )
  const { maximum, step } = makeScaleMaximum(highestScore)
  const yTicks = Array.from(
    { length: Math.round(maximum / step) + 1 },
    (_, index) => index * step,
  )
  const xTicks = makeTickIndices(points.length)
  const xForIndex = (index) =>
    points.length === 1
      ? PLOT.left + plotWidth / 2
      : PLOT.left + (index / (points.length - 1)) * plotWidth
  const yForScore = (score) =>
    PLOT.top + plotHeight - (score / maximum) * plotHeight

  const teamAPoints = points.map((point, index) => ({
    x: xForIndex(index),
    y: yForScore(point.teamA),
  }))
  const teamBPoints = points.map((point, index) => ({
    x: xForIndex(index),
    y: yForScore(point.teamB),
  }))
  const latest = points.at(-1)
  const chartDescription = `${teamData[0].name} termine à ${numberFormatter.format(latest.teamA)} points et ${teamData[1].name} à ${numberFormatter.format(latest.teamB)} points après ${latest.dealNumber} donne${latest.dealNumber > 1 ? 's' : ''}.`

  return (
    <figure
      className="score-chart"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <figcaption className="score-chart__heading">
        <h2 id={titleId} className="score-chart__title">
          Évolution du score
        </h2>
        <p id={descriptionId} className="score-chart__description">
          Scores cumulés après chaque donne.
        </p>
      </figcaption>

      <ul className="score-chart__legend" aria-label="Légende du graphique">
        <li className="score-chart__legend-item">
          <span
            className="score-chart__legend-line score-chart__legend-line--team-a"
            aria-hidden="true"
          />
          <span>{teamData[0].name}</span>
          <span className="score-chart__visually-hidden">
            , ligne continue et points ronds
          </span>
        </li>
        <li className="score-chart__legend-item">
          <span
            className="score-chart__legend-line score-chart__legend-line--team-b"
            aria-hidden="true"
          />
          <span>{teamData[1].name}</span>
          <span className="score-chart__visually-hidden">
            , ligne discontinue et points carrés
          </span>
        </li>
        {hasTarget && (
          <li className="score-chart__legend-item">
            <span
              className="score-chart__legend-line score-chart__legend-line--target"
              aria-hidden="true"
            />
            <span>Objectif {numberFormatter.format(numericTarget)}</span>
          </li>
        )}
      </ul>

      <div className="score-chart__canvas">
        <svg
          className="score-chart__svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="img"
          aria-labelledby={`${svgTitleId} ${svgDescriptionId}`}
        >
          <title id={svgTitleId}>Courbe des scores cumulés</title>
          <desc id={svgDescriptionId}>{chartDescription}</desc>

          <g className="score-chart__grid" aria-hidden="true">
            {yTicks.map((tick) => {
              const y = yForScore(tick)

              return (
                <g key={tick}>
                  <line
                    className="score-chart__grid-line"
                    x1={PLOT.left}
                    x2={PLOT.left + plotWidth}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="score-chart__axis-label score-chart__axis-label--y"
                    x={PLOT.left - 10}
                    y={y}
                  >
                    {numberFormatter.format(tick)}
                  </text>
                </g>
              )
            })}

            {xTicks.map((index) => {
              const x = xForIndex(index)

              return (
                <g key={`${points[index].dealNumber}-${index}`}>
                  <line
                    className="score-chart__axis-tick"
                    x1={x}
                    x2={x}
                    y1={PLOT.top + plotHeight}
                    y2={PLOT.top + plotHeight + 6}
                  />
                  <text
                    className="score-chart__axis-label score-chart__axis-label--x"
                    x={x}
                    y={PLOT.top + plotHeight + 24}
                  >
                    {numberFormatter.format(points[index].dealNumber)}
                  </text>
                </g>
              )
            })}

            <line
              className="score-chart__axis"
              x1={PLOT.left}
              x2={PLOT.left}
              y1={PLOT.top}
              y2={PLOT.top + plotHeight}
            />
            <line
              className="score-chart__axis"
              x1={PLOT.left}
              x2={PLOT.left + plotWidth}
              y1={PLOT.top + plotHeight}
              y2={PLOT.top + plotHeight}
            />
            <text
              className="score-chart__axis-title"
              x={PLOT.left + plotWidth / 2}
              y={VIEWBOX_HEIGHT - 8}
            >
              Donnes
            </text>
          </g>

          {hasTarget && (
            <g className="score-chart__target" aria-hidden="true">
              <line
                className="score-chart__target-line"
                x1={PLOT.left}
                x2={PLOT.left + plotWidth}
                y1={yForScore(numericTarget)}
                y2={yForScore(numericTarget)}
              />
              <text
                className="score-chart__target-label"
                x={PLOT.left + plotWidth - 4}
                y={Math.max(PLOT.top + 12, yForScore(numericTarget) - 7)}
              >
                Objectif {numberFormatter.format(numericTarget)}
              </text>
            </g>
          )}

          <g className="score-chart__series score-chart__series--team-a" aria-hidden="true">
            <path
              className="score-chart__line score-chart__line--team-a"
              d={makePath(teamAPoints)}
            />
            {teamAPoints.map((point, index) => (
              <circle
                key={`team-a-${points[index].dealNumber}-${index}`}
                className="score-chart__point score-chart__point--team-a"
                cx={point.x}
                cy={point.y}
                r="6"
              />
            ))}
          </g>

          <g className="score-chart__series score-chart__series--team-b" aria-hidden="true">
            <path
              className="score-chart__line score-chart__line--team-b"
              d={makePath(teamBPoints)}
            />
            {teamBPoints.map((point, index) => (
              <rect
                key={`team-b-${points[index].dealNumber}-${index}`}
                className="score-chart__point score-chart__point--team-b"
                x={point.x - 5.5}
                y={point.y - 5.5}
                width="11"
                height="11"
                transform={`rotate(45 ${point.x} ${point.y})`}
              />
            ))}
          </g>
        </svg>
      </div>

      <div className="score-chart__visually-hidden">
        <p>{chartDescription}</p>
        <table className="score-chart__data-table">
          <caption>Détail des scores cumulés par donne</caption>
          <thead>
            <tr>
              <th scope="col">Donne</th>
              <th scope="col">{teamData[0].name}</th>
              <th scope="col">{teamData[1].name}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={`row-${point.dealNumber}-${index}`}>
                <th scope="row">{numberFormatter.format(point.dealNumber)}</th>
                <td>{numberFormatter.format(point.teamA)} points</td>
                <td>{numberFormatter.format(point.teamB)} points</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

export default ScoreChart
