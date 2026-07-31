import { useEffect, useMemo, useState } from 'react'
import {
  CONTRACT_AMOUNTS,
  createDeal,
  createGame,
  getCumulativeSeries,
  getGameOutcome,
  getGameStats,
  getGameTotals,
  hasReachedEnd,
} from './model'
import { loadScorekeeperStore, normalizeStore, saveScorekeeperStore } from './storage'
import { ScoreChart } from './ScoreChart'
import './scorekeeper.css'

const TEAM_A = 'team-a'
const TEAM_B = 'team-b'

const suitOptions = [
  { value: 'spades', symbol: '♠', label: 'Pique', red: false },
  { value: 'hearts', symbol: '♥', label: 'Cœur', red: true },
  { value: 'diamonds', symbol: '♦', label: 'Carreau', red: true },
  { value: 'clubs', symbol: '♣', label: 'Trèfle', red: false },
]

const multiplierOptions = [
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Coinché' },
  { value: 4, label: 'Surcoinché' },
]

const keypadRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['-10', '0', '+10'],
]

function formatNumber(value) {
  return new Intl.NumberFormat('fr-FR').format(value ?? 0)
}

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function teamName(game, teamId) {
  return game.teams.find((team) => team.id === teamId)?.name ?? 'Équipe'
}

function otherTeamId(teamId) {
  return teamId === TEAM_A ? TEAM_B : TEAM_A
}

function contractLabel(contract) {
  return contract === 'capot' ? 'Capot' : contract ? String(contract) : 'Annonce'
}

function suitLabel(suit) {
  return suitOptions.find((option) => option.value === suit)?.label ?? 'Couleur'
}

function multiplierLabel(multiplier) {
  return multiplierOptions.find((option) => option.value === multiplier)?.label ?? 'Normal'
}

function createEmptyDraft() {
  return {
    editingDealId: null,
    step: 'contract',
    contractPhase: 'team',
    scorePhase: 'result',
    attackingTeamId: null,
    contract: null,
    suit: null,
    multiplier: null,
    result: null,
    activeScoreTeamId: TEAM_A,
    scores: { [TEAM_A]: '', [TEAM_B]: '' },
  }
}

function draftFromDeal(deal) {
  return {
    editingDealId: deal.id,
    step: 'score',
    contractPhase: 'team',
    scorePhase: 'scores',
    attackingTeamId: deal.attackingTeamId,
    contract: deal.contract,
    suit: deal.suit,
    multiplier: deal.multiplier,
    result: deal.result,
    activeScoreTeamId: deal.attackingTeamId,
    scores: {
      [TEAM_A]: String(deal.scores[TEAM_A]),
      [TEAM_B]: String(deal.scores[TEAM_B]),
    },
  }
}

function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return undefined

    let lock = null
    let cancelled = false

    const requestLock = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        lock.addEventListener('release', () => {
          lock = null
        })
        if (cancelled) await lock.release()
      } catch {
        // Le compteur reste utilisable si l’appareil refuse le verrouillage.
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !lock) requestLock()
    }

    requestLock()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      lock?.release().catch(() => {})
    }
  }, [enabled])
}

function loadInitialStore() {
  try {
    return normalizeStore(loadScorekeeperStore())
  } catch {
    return normalizeStore(null)
  }
}

export function Scorekeeper({ route, navigate }) {
  const [store, setStore] = useState(loadInitialStore)
  const [storageWarning, setStorageWarning] = useState(false)
  const [hubView, setHubView] = useState('home')
  const [gameView, setGameView] = useState('board')
  const [undoDeal, setUndoDeal] = useState(null)
  const [confirmation, setConfirmation] = useState(null)

  const activeGame = store.activeGame
  const isPlaying = route.type === 'scoreGame' && Boolean(activeGame)

  useWakeLock(isPlaying)

  useEffect(() => {
    try {
      const saved = saveScorekeeperStore(store)
      if (saved === false) setStorageWarning(true)
    } catch {
      setStorageWarning(true)
    }
  }, [store])

  useEffect(() => {
    if (route.type !== 'scoreGame') return
    if (!activeGame?.draft) {
      setGameView('board')
      return
    }
    setGameView(activeGame.draft.step === 'score' ? 'score' : 'contract')
  }, [route.type, activeGame?.id])

  const updateActiveGame = (updater) => {
    setStore((current) => {
      if (!current.activeGame) return current
      return {
        ...current,
        activeGame: updater(current.activeGame),
      }
    })
  }

  const setDraft = (updater) => {
    updateActiveGame((game) => ({
      ...game,
      updatedAt: new Date().toISOString(),
      draft:
        typeof updater === 'function'
          ? updater(game.draft ?? createEmptyDraft())
          : updater,
    }))
  }

  const startDraft = () => {
    if (!activeGame) return
    const draft = activeGame.draft ?? createEmptyDraft()
    if (!activeGame.draft) setDraft(draft)
    setGameView(draft.step === 'score' ? 'score' : 'contract')
  }

  const editDeal = (deal) => {
    setDraft(draftFromDeal(deal))
    setGameView('score')
  }

  const deleteDeal = (dealId) => {
    setConfirmation({
      title: 'Supprimer cette donne ?',
      body: 'Les cumuls suivants seront recalculés automatiquement.',
      label: 'Supprimer',
      danger: true,
      onConfirm: () => {
        updateActiveGame((game) => ({
          ...game,
          deals: game.deals.filter((deal) => deal.id !== dealId),
          updatedAt: new Date().toISOString(),
        }))
        setConfirmation(null)
      },
    })
  }

  const removeLastDeal = () => {
    if (!activeGame?.deals.length) return
    const index = activeGame.deals.length - 1
    const deal = activeGame.deals[index]
    setUndoDeal({ deal, index, gameId: activeGame.id })
    updateActiveGame((game) => ({
      ...game,
      deals: game.deals.slice(0, -1),
      updatedAt: new Date().toISOString(),
    }))
  }

  const restoreLastDeal = () => {
    if (!undoDeal || undoDeal.gameId !== activeGame?.id) return
    updateActiveGame((game) => {
      const deals = [...game.deals]
      deals.splice(Math.min(undoDeal.index, deals.length), 0, undoDeal.deal)
      return { ...game, deals, updatedAt: new Date().toISOString() }
    })
    setUndoDeal(null)
  }

  const saveDraftDeal = () => {
    const draft = activeGame?.draft
    if (!draft) return
    if (
      !draft.attackingTeamId ||
      !draft.contract ||
      !draft.suit ||
      !draft.multiplier ||
      !draft.result ||
      draft.scores[TEAM_A] === '' ||
      draft.scores[TEAM_B] === ''
    ) return

    const existingDeal = activeGame.deals.find((deal) => deal.id === draft.editingDealId)
    const nextDeal = createDeal({
      id: existingDeal?.id,
      createdAt: existingDeal?.createdAt,
      attackingTeamId: draft.attackingTeamId,
      contract: draft.contract,
      suit: draft.suit,
      multiplier: draft.multiplier,
      result: draft.result,
      scores: {
        [TEAM_A]: Number(draft.scores[TEAM_A]),
        [TEAM_B]: Number(draft.scores[TEAM_B]),
      },
    })

    updateActiveGame((game) => ({
      ...game,
      deals: existingDeal
        ? game.deals.map((deal) => (deal.id === existingDeal.id ? nextDeal : deal))
        : [...game.deals, nextDeal],
      draft: null,
      updatedAt: new Date().toISOString(),
    }))
    setUndoDeal(null)
    setGameView('board')
    navigator.vibrate?.(18)
  }

  const archiveActiveGame = () => {
    if (!activeGame) return
    const finishedGame = {
      ...activeGame,
      draft: null,
      status: 'archived',
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setStore((current) => ({
      ...current,
      activeGame: null,
      archivedGames: [finishedGame, ...current.archivedGames],
    }))
    setUndoDeal(null)
    setConfirmation(null)
    navigate(`/compteur/archives/${finishedGame.id}`)
  }

  const finishActiveGame = () => {
    if (!activeGame) return

    if (activeGame.draft) {
      setConfirmation({
        title: 'Terminer sans enregistrer la saisie ?',
        body: 'La donne en cours de saisie ne figurera pas dans le bilan.',
        label: 'Ignorer la saisie et terminer',
        danger: true,
        onConfirm: archiveActiveGame,
      })
      return
    }

    if (hasReachedEnd(activeGame)) {
      archiveActiveGame()
      return
    }

    setConfirmation({
      title: 'Terminer la partie maintenant ?',
      body: 'Le bilan sera créé avec les scores actuellement enregistrés.',
      label: 'Terminer et voir le bilan',
      onConfirm: archiveActiveGame,
    })
  }

  const abandonActiveGame = () => {
    setStore((current) => ({ ...current, activeGame: null }))
    setConfirmation(null)
    setUndoDeal(null)
    navigate('/compteur')
  }

  const deleteArchive = (gameId) => {
    setConfirmation({
      title: 'Supprimer cette partie ?',
      body: 'Son historique et ses statistiques seront définitivement effacés de ce téléphone.',
      label: 'Supprimer',
      danger: true,
      onConfirm: () => {
        setStore((current) => ({
          ...current,
          archivedGames: current.archivedGames.filter((game) => game.id !== gameId),
        }))
        setConfirmation(null)
        navigate('/compteur')
      },
    })
  }

  let page

  if (route.type === 'scoreHome') {
    page = hubView === 'setup' ? (
      <GameSetup
        onCancel={() => setHubView('home')}
        onCreate={(config) => {
          const game = createGame(config)
          setStore((current) => ({ ...current, activeGame: game }))
          setHubView('home')
          navigate('/compteur/partie')
        }}
      />
    ) : (
      <ScoreHub
        store={store}
        navigate={navigate}
        onNewGame={() => {
          if (!activeGame) {
            setHubView('setup')
            return
          }
          setConfirmation({
            title: 'Remplacer la partie en cours ?',
            body: 'La partie active doit être abandonnée avant d’en commencer une nouvelle.',
            label: 'Abandonner et recommencer',
            danger: true,
            onConfirm: () => {
              setStore((current) => ({ ...current, activeGame: null }))
              setConfirmation(null)
              setHubView('setup')
            },
          })
        }}
      />
    )
  } else if (route.type === 'scoreGame') {
    if (!activeGame) {
      page = (
        <ScoreEmpty
          title="Aucune partie en cours"
          action="Ouvrir le compteur"
          onAction={() => navigate('/compteur')}
        />
      )
    } else if (gameView === 'contract') {
      page = (
        <ContractEntry
          game={activeGame}
          draft={activeGame.draft ?? createEmptyDraft()}
          onChange={setDraft}
          onBack={() => {
            if (activeGame.draft?.editingDealId) {
              updateActiveGame((game) => ({
                ...game,
                draft: null,
                updatedAt: new Date().toISOString(),
              }))
              setGameView('history')
              return
            }
            setGameView('board')
          }}
          onContinue={() => setGameView('score')}
        />
      )
    } else if (gameView === 'score') {
      page = (
        <ScoreEntry
          game={activeGame}
          draft={activeGame.draft ?? createEmptyDraft()}
          onChange={setDraft}
          onBack={() => setGameView('contract')}
          onSave={saveDraftDeal}
        />
      )
    } else if (gameView === 'history') {
      page = (
        <DealHistory
          game={activeGame}
          onBack={() => setGameView('board')}
          onEdit={editDeal}
          onDelete={deleteDeal}
        />
      )
    } else {
      page = (
        <GameBoard
          game={activeGame}
          hasDraft={Boolean(activeGame.draft)}
          onBack={() => navigate('/compteur')}
          onAdd={startDraft}
          onDiscardDraft={() => {
            updateActiveGame((game) => ({ ...game, draft: null, updatedAt: new Date().toISOString() }))
            setGameView('board')
          }}
          onHistory={() => setGameView('history')}
          onReview={() => setGameView('history')}
          onUndo={removeLastDeal}
          onFinish={finishActiveGame}
          onAbandon={() => {
            setConfirmation({
              title: 'Abandonner la partie ?',
              body: 'Toutes les donnes de cette partie seront supprimées.',
              label: 'Abandonner',
              danger: true,
              onConfirm: abandonActiveGame,
            })
          }}
        />
      )
    }
  } else {
    const game = store.archivedGames.find((item) => item.id === route.archiveId)
    page = game ? (
      <GameSummary
        game={game}
        onBack={() => navigate('/compteur')}
        onDelete={() => deleteArchive(game.id)}
      />
    ) : (
      <ScoreEmpty
        title="Cette partie n’existe plus"
        action="Voir les archives"
        onAction={() => navigate('/compteur')}
      />
    )
  }

  return (
    <div className="scorekeeper-shell">
      {storageWarning && (
        <div className="storage-warning" role="status">
          Sauvegarde locale indisponible : gardez cette page ouverte pour conserver la partie.
        </div>
      )}
      {page}
      {undoDeal && route.type === 'scoreGame' && (
        <div className="score-toast" role="status">
          <span>Dernière donne annulée.</span>
          <button type="button" onClick={restoreLastDeal}>Rétablir</button>
        </div>
      )}
      {confirmation && (
        <ConfirmDialog
          {...confirmation}
          onCancel={() => setConfirmation(null)}
        />
      )}
    </div>
  )
}

function ScoreHub({ store, navigate, onNewGame }) {
  const activeGame = store.activeGame

  return (
    <div className="score-page score-hub">
      <header className="score-page-heading">
        <button className="score-text-button" type="button" onClick={() => navigate('/')}>
          ← Règlement
        </button>
        <p className="score-kicker">Mode table</p>
        <h1>Compter une partie</h1>
        <p>Des scores lisibles, une saisie rapide et aucun papier à retrouver.</p>
      </header>

      {activeGame && (
        <ActiveGameCard game={activeGame} onResume={() => navigate('/compteur/partie')} />
      )}

      <button className="score-primary-button score-new-game" type="button" onClick={onNewGame}>
        <span aria-hidden="true">＋</span>
        Nouvelle partie
      </button>

      <section className="archive-section" aria-labelledby="archive-title">
        <div className="archive-heading">
          <div>
            <p className="score-kicker">Sur ce téléphone</p>
            <h2 id="archive-title">Parties terminées</h2>
          </div>
          <span>{store.archivedGames.length}</span>
        </div>

        {store.archivedGames.length ? (
          <div className="archive-list">
            {store.archivedGames.map((game) => {
              const totals = getGameTotals(game)
              return (
                <button
                  className="archive-card"
                  type="button"
                  key={game.id}
                  onClick={() => navigate(`/compteur/archives/${game.id}`)}
                >
                  <span className="archive-date">{formatDate(game.finishedAt)}</span>
                  <strong>{game.teams[0].name} · {formatNumber(totals[TEAM_A])}</strong>
                  <strong>{game.teams[1].name} · {formatNumber(totals[TEAM_B])}</strong>
                  <span>{game.deals.length} donne{game.deals.length > 1 ? 's' : ''} →</span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="score-empty-copy">Les bilans de vos parties apparaîtront ici.</p>
        )}
      </section>
    </div>
  )
}

function ActiveGameCard({ game, onResume }) {
  const totals = getGameTotals(game)
  return (
    <section className="active-game-card" aria-label="Partie en cours">
      <div>
        <p className="score-kicker">Partie en cours · Donne {game.deals.length + 1}</p>
        <div className="active-game-totals">
          <span><strong>{formatNumber(totals[TEAM_A])}</strong>{game.teams[0].name}</span>
          <span><strong>{formatNumber(totals[TEAM_B])}</strong>{game.teams[1].name}</span>
        </div>
      </div>
      <button className="score-primary-button" type="button" onClick={onResume}>
        Reprendre <span aria-hidden="true">→</span>
      </button>
    </section>
  )
}

function GameSetup({ onCancel, onCreate }) {
  const [teamA, setTeamA] = useState('Équipe A')
  const [teamB, setTeamB] = useState('Équipe B')
  const [endType, setEndType] = useState('score')
  const [endValue, setEndValue] = useState('1000')

  const submit = (event) => {
    event.preventDefault()
    const value = Math.max(1, Number.parseInt(endValue, 10) || 1)
    onCreate({
      teamAName: teamA.trim() || 'Équipe A',
      teamBName: teamB.trim() || 'Équipe B',
      endCondition:
        endType === 'score'
          ? { type: 'score', target: value }
          : { type: 'deals', count: value },
    })
  }

  return (
    <form className="score-page setup-page" onSubmit={submit}>
      <header className="score-page-heading compact">
        <button className="score-text-button" type="button" onClick={onCancel}>← Annuler</button>
        <p className="score-kicker">Nouvelle partie</p>
        <h1>Préparer la table</h1>
      </header>

      <section className="setup-section">
        <h2>Les équipes</h2>
        <label>
          <span>Première équipe</span>
          <input value={teamA} onChange={(event) => setTeamA(event.target.value)} maxLength="24" />
        </label>
        <label>
          <span>Deuxième équipe</span>
          <input value={teamB} onChange={(event) => setTeamB(event.target.value)} maxLength="24" />
        </label>
      </section>

      <section className="setup-section">
        <h2>Fin de la partie</h2>
        <div className="score-segmented two" role="group" aria-label="Condition de fin">
          <button type="button" className={endType === 'score' ? 'is-selected' : ''} onClick={() => setEndType('score')}>
            Score à atteindre
          </button>
          <button type="button" className={endType === 'deals' ? 'is-selected' : ''} onClick={() => setEndType('deals')}>
            Nombre de donnes
          </button>
        </div>
        <label className="end-value-field">
          <span>{endType === 'score' ? 'Objectif' : 'Nombre de donnes'}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={endValue}
            onChange={(event) => setEndValue(event.target.value)}
          />
          <small>{endType === 'score' ? 'points' : 'donnes'}</small>
        </label>
      </section>

      <button className="score-primary-button score-submit" type="submit">
        Commencer la partie <span aria-hidden="true">→</span>
      </button>
    </form>
  )
}

function GameBoard({ game, hasDraft, onBack, onAdd, onDiscardDraft, onHistory, onReview, onUndo, onFinish, onAbandon }) {
  const totals = getGameTotals(game)
  const reached = hasReachedEnd(game)
  const objectiveCurrent = game.endCondition.type === 'score'
    ? Math.max(totals[TEAM_A], totals[TEAM_B])
    : game.deals.length
  const objectiveTarget = game.endCondition.type === 'score'
    ? game.endCondition.target
    : game.endCondition.count
  const progress = Math.min(100, (objectiveCurrent / objectiveTarget) * 100)
  const lastDeal = game.deals.at(-1)

  return (
    <div className="score-game-page board-page">
      <ScoreGameHeader
        title={`Donne ${game.deals.length + 1}`}
        onBack={onBack}
        action="Historique"
        onAction={onHistory}
      />

      <main className="board-content">
        <div className="team-score-grid" aria-label="Scores cumulés">
          {game.teams.map((team, index) => (
            <section className={`team-score-card team-${index + 1}`} key={team.id}>
              <p>{team.name}</p>
              <strong>{formatNumber(totals[team.id])}</strong>
              <span>points</span>
            </section>
          ))}
        </div>

        <section className="objective-card">
          <div>
            <span>Objectif</span>
            <strong>
              {game.endCondition.type === 'score'
                ? `${formatNumber(game.endCondition.target)} points`
                : `${game.endCondition.count} donne${game.endCondition.count > 1 ? 's' : ''}`}
            </strong>
          </div>
          <span>{Math.round(progress)} %</span>
          <div className="objective-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>

        {reached && (
          <section className="finish-banner">
            <p className="score-kicker">Objectif atteint</p>
            <h2>La partie peut être terminée.</h2>
            <button className="score-primary-button" type="button" onClick={onFinish}>
              Voir le bilan <span aria-hidden="true">→</span>
            </button>
            <button className="finish-review-button" type="button" onClick={onReview}>
              Vérifier les donnes avant de terminer
            </button>
          </section>
        )}

        <button className="add-deal-button" type="button" onClick={onAdd}>
          <span aria-hidden="true">＋</span>
          <strong>{hasDraft ? 'Reprendre la saisie' : 'Ajouter une donne'}</strong>
          <small>{hasDraft ? 'Une donne est en attente' : 'Annonce puis scores'}</small>
        </button>

        {hasDraft && (
          <button className="discard-draft-button" type="button" onClick={onDiscardDraft}>
            Abandonner cette saisie
          </button>
        )}

        {lastDeal && (
          <section className="last-deal-card">
            <div>
              <p className="score-kicker">Dernière donne</p>
              <strong>{contractLabel(lastDeal.contract)} à {suitLabel(lastDeal.suit).toLowerCase()} · {multiplierLabel(lastDeal.multiplier)}</strong>
              <span>{game.teams[0].name} +{formatNumber(lastDeal.scores[TEAM_A])} · {game.teams[1].name} +{formatNumber(lastDeal.scores[TEAM_B])}</span>
            </div>
            <button type="button" onClick={onUndo}>Annuler</button>
          </section>
        )}

        <div className="board-secondary-actions">
          <button type="button" onClick={onHistory}>Voir toutes les donnes</button>
          <button type="button" onClick={onFinish} disabled={!game.deals.length}>Terminer la partie</button>
          <button className="danger-link" type="button" onClick={onAbandon}>Abandonner</button>
        </div>
      </main>
    </div>
  )
}

function ScoreGameHeader({ title, onBack, action, onAction }) {
  return (
    <header className="score-game-header">
      <button type="button" onClick={onBack} aria-label="Retour">←</button>
      <div>
        <strong>Coinche</strong>
        <span>{title}</span>
      </div>
      {action ? <button type="button" onClick={onAction}>{action}</button> : <span />}
    </header>
  )
}

function ContractEntry({ game, draft, onChange, onBack, onContinue }) {
  const phase = draft.contractPhase ?? 'team'
  const update = (values) => onChange((current) => ({ ...current, ...values }))

  const chooseTeam = (teamId) => update({ attackingTeamId: teamId, contractPhase: 'amount' })
  const chooseContract = (contract) => update({ contract, contractPhase: 'suit' })
  const chooseSuit = (suit) => update({ suit, contractPhase: 'multiplier' })
  const chooseMultiplier = (multiplier) => {
    onChange((current) => ({
      ...current,
      multiplier,
      step: 'score',
      scorePhase: 'result',
      activeScoreTeamId: current.attackingTeamId ?? TEAM_A,
    }))
    onContinue()
  }

  return (
    <div className="score-game-page entry-page">
      <ScoreGameHeader
        title={draft.editingDealId ? 'Modifier la donne' : `Donne ${game.deals.length + 1}`}
        onBack={onBack}
      />
      <main className="entry-content">
        <StepIndicator current={1} />
        <DealSummary game={game} draft={draft} editable onJump={(nextPhase) => update({ contractPhase: nextPhase })} />

        {phase === 'team' && (
          <ChoiceStage title="Qui porte le contrat ?" hint="Équipe attaquante">
            <div className="large-choice-grid two">
              {game.teams.map((team) => (
                <button type="button" key={team.id} onClick={() => chooseTeam(team.id)}>
                  <span>Équipe</span><strong>{team.name}</strong>
                </button>
              ))}
            </div>
          </ChoiceStage>
        )}

        {phase === 'amount' && (
          <ChoiceStage title="Quelle annonce ?" hint="Valeur du contrat">
            <div className="amount-grid">
              {CONTRACT_AMOUNTS.map((amount) => (
                <button type="button" key={amount} onClick={() => chooseContract(amount)}>{amount}</button>
              ))}
              <button className="capot-choice" type="button" onClick={() => chooseContract('capot')}>Capot</button>
            </div>
          </ChoiceStage>
        )}

        {phase === 'suit' && (
          <ChoiceStage title="Dans quelle couleur ?" hint="Couleur d’atout">
            <div className="suit-choice-grid">
              {suitOptions.map((suit) => (
                <button type="button" key={suit.value} onClick={() => chooseSuit(suit.value)}>
                  <span className={suit.red ? 'is-red' : ''} aria-hidden="true">{suit.symbol}</span>
                  <strong>{suit.label}</strong>
                </button>
              ))}
            </div>
          </ChoiceStage>
        )}

        {phase === 'multiplier' && (
          <ChoiceStage title="État du contrat" hint="Dernière annonce">
            <div className="large-choice-grid three">
              {multiplierOptions.map((option) => (
                <button type="button" key={option.value} onClick={() => chooseMultiplier(option.value)}>
                  <strong>{option.label}</strong>
                  <span>{option.value === 1 ? '×1' : `×${option.value}`}</span>
                </button>
              ))}
            </div>
          </ChoiceStage>
        )}
      </main>
    </div>
  )
}

function StepIndicator({ current }) {
  return (
    <div className="step-indicator" aria-label={`Étape ${current} sur 2`}>
      <span className={current >= 1 ? 'is-active' : ''}>1</span>
      <i />
      <span className={current >= 2 ? 'is-active' : ''}>2</span>
      <p>{current === 1 ? 'Contrat' : 'Scores'}</p>
    </div>
  )
}

function DealSummary({ game, draft, editable = false, onJump }) {
  const parts = [
    draft.attackingTeamId && { key: 'team', label: teamName(game, draft.attackingTeamId) },
    draft.contract && { key: 'amount', label: contractLabel(draft.contract) },
    draft.suit && { key: 'suit', label: suitLabel(draft.suit) },
    draft.multiplier && { key: 'multiplier', label: multiplierLabel(draft.multiplier) },
  ].filter(Boolean)

  if (!parts.length) return null

  return (
    <div className="deal-summary" aria-label="Résumé du contrat">
      {parts.map((part) => editable ? (
        <button type="button" key={part.key} onClick={() => onJump(part.key)}>{part.label}</button>
      ) : <span key={part.key}>{part.label}</span>)}
    </div>
  )
}

function ChoiceStage({ title, hint, children }) {
  return (
    <section className="choice-stage">
      <p className="score-kicker">{hint}</p>
      <h1>{title}</h1>
      {children}
    </section>
  )
}

function ScoreEntry({ game, draft, onChange, onBack, onSave }) {
  const phase = draft.scorePhase ?? 'result'
  const update = (values) => onChange((current) => ({ ...current, ...values }))

  const chooseResult = (result) => update({ result, scorePhase: 'scores' })

  const changeScore = (key) => {
    const teamId = draft.activeScoreTeamId ?? TEAM_A
    const currentValue = draft.scores[teamId]
    let nextValue = currentValue

    if (key === '-10' || key === '+10') {
      const adjustment = key === '+10' ? 10 : -10
      nextValue = String(Math.max(0, (Number(currentValue) || 0) + adjustment))
    } else if (key === 'clear') {
      nextValue = ''
    } else if (currentValue === '0') {
      nextValue = key
    } else if (currentValue.length < 4) {
      nextValue = `${currentValue}${key}`
    }

    onChange((current) => ({
      ...current,
      scores: { ...current.scores, [teamId]: nextValue },
    }))
  }

  const canSave =
    draft.result && draft.scores[TEAM_A] !== '' && draft.scores[TEAM_B] !== ''

  return (
    <div className="score-game-page entry-page score-entry-page">
      <ScoreGameHeader
        title={draft.editingDealId ? 'Modifier les scores' : `Donne ${game.deals.length + 1}`}
        onBack={onBack}
      />
      <main className="entry-content">
        <StepIndicator current={2} />
        <DealSummary game={game} draft={draft} />

        {phase === 'result' ? (
          <ChoiceStage title="Le contrat est…" hint="Résultat de la donne">
            <div className="large-choice-grid two result-grid">
              <button type="button" onClick={() => chooseResult('made')}>
                <span aria-hidden="true">✓</span><strong>Réussi</strong>
              </button>
              <button type="button" onClick={() => chooseResult('failed')}>
                <span aria-hidden="true">×</span><strong>Chuté</strong>
              </button>
            </div>
          </ChoiceStage>
        ) : (
          <section className="manual-score-stage">
            <div className="manual-score-heading">
              <div>
                <p className="score-kicker">Scores attribués</p>
                <h1>Saisir les points</h1>
              </div>
              <button type="button" onClick={() => changeScore('clear')}>Effacer</button>
            </div>

            <div className="manual-score-fields" role="group" aria-label="Équipe à modifier">
              {game.teams.map((team) => {
                const active = draft.activeScoreTeamId === team.id
                return (
                  <button
                    type="button"
                    className={active ? 'is-active' : ''}
                    aria-pressed={active}
                    key={team.id}
                    onClick={() => update({ activeScoreTeamId: team.id })}
                  >
                    <span>{team.name}</span>
                    <strong>{draft.scores[team.id] === '' ? '—' : formatNumber(Number(draft.scores[team.id]))}</strong>
                  </button>
                )
              })}
            </div>

            <div className="score-keypad" aria-label="Pavé numérique">
              {keypadRows.flat().map((key) => (
                <button
                  type="button"
                  className={key.includes('10') ? 'is-adjustment' : ''}
                  key={key}
                  onClick={() => changeScore(key)}
                >
                  {key === '-10' ? '−10' : key}
                </button>
              ))}
            </div>

            <button className="score-primary-button save-deal-button" type="button" disabled={!canSave} onClick={onSave}>
              {draft.editingDealId ? 'Enregistrer les modifications' : 'Enregistrer la donne'}
            </button>
          </section>
        )}
      </main>
    </div>
  )
}

function DealHistory({ game, onBack, onEdit, onDelete }) {
  const totals = getGameTotals(game)
  return (
    <div className="score-game-page history-page">
      <ScoreGameHeader title="Historique" onBack={onBack} />
      <main className="history-content">
        <div className="history-total-strip">
          <span>{game.teams[0].name}<strong>{formatNumber(totals[TEAM_A])}</strong></span>
          <span>{game.teams[1].name}<strong>{formatNumber(totals[TEAM_B])}</strong></span>
        </div>
        <div className="deal-list">
          {[...game.deals].reverse().map((deal, reverseIndex) => {
            const dealNumber = game.deals.length - reverseIndex
            return (
              <article className="deal-history-card" key={deal.id}>
                <div className="deal-history-number">{dealNumber}</div>
                <div>
                  <p>{teamName(game, deal.attackingTeamId)} · {deal.result === 'made' ? 'réussi' : 'chuté'}</p>
                  <strong>{contractLabel(deal.contract)} à {suitLabel(deal.suit).toLowerCase()} · {multiplierLabel(deal.multiplier)}</strong>
                  <span>{game.teams[0].name} +{formatNumber(deal.scores[TEAM_A])} · {game.teams[1].name} +{formatNumber(deal.scores[TEAM_B])}</span>
                </div>
                <div className="deal-history-actions">
                  <button type="button" onClick={() => onEdit(deal)}>Modifier</button>
                  <button type="button" onClick={() => onDelete(deal.id)}>Supprimer</button>
                </div>
              </article>
            )
          })}
        </div>
        {!game.deals.length && <p className="score-empty-copy">Aucune donne enregistrée.</p>}
      </main>
    </div>
  )
}

function GameSummary({ game, onBack, onDelete }) {
  const totals = getGameTotals(game)
  const series = getCumulativeSeries(game)
  const stats = getGameStats(game)
  const outcome = getGameOutcome(game)
  const winner = outcome?.winnerTeamId
    ? teamName(game, outcome.winnerTeamId)
    : null

  return (
    <div className="score-page summary-page">
      <header className="summary-hero">
        <button className="score-text-button light" type="button" onClick={onBack}>← Compteur</button>
        <p className="score-kicker">Bilan de la partie</p>
        <h1>{winner ? `${winner} remporte la partie` : 'La partie se termine à égalité'}</h1>
        <p>{formatDate(game.finishedAt)} · {game.deals.length} donne{game.deals.length > 1 ? 's' : ''}</p>
        <div className="summary-final-scores">
          {game.teams.map((team) => (
            <span key={team.id}><small>{team.name}</small><strong>{formatNumber(totals[team.id])}</strong></span>
          ))}
        </div>
      </header>

      <section className="summary-section">
        <div className="summary-section-heading">
          <p className="score-kicker">Évolution</p>
          <h2>La course aux points</h2>
        </div>
        <ScoreChart
          series={series}
          teams={game.teams}
          target={game.endCondition.type === 'score' ? game.endCondition.target : null}
        />
      </section>

      <section className="summary-section">
        <div className="summary-section-heading">
          <p className="score-kicker">En chiffres</p>
          <h2>Le bilan</h2>
        </div>
        <div className="stats-grid">
          {game.teams.map((team) => (
            <StatCard
              key={team.id}
              value={`${stats.byTeam?.[team.id]?.made ?? 0} / ${stats.byTeam?.[team.id]?.failed ?? 0}`}
              label={`${team.name} · réussis / chutés`}
            />
          ))}
          <StatCard value={(stats.coined ?? 0) + (stats.surcoined ?? 0)} label="coinches et surcoinches" />
          <StatCard value={formatNumber(stats.biggestDeal?.score ?? 0)} label="points sur la plus grosse donne" />
          <StatCard value={formatNumber(stats.maxLead?.amount ?? 0)} label="points d’avance maximale" />
        </div>
      </section>

      <section className="summary-section compact-summary-history">
        <div className="summary-section-heading">
          <p className="score-kicker">Détail</p>
          <h2>Les donnes</h2>
        </div>
        <div className="summary-deal-list">
          {game.deals.map((deal, index) => (
            <div key={deal.id}>
              <span>{index + 1}</span>
              <p><strong>{contractLabel(deal.contract)} · {suitLabel(deal.suit)}</strong>{teamName(game, deal.attackingTeamId)} · {deal.result === 'made' ? 'réussi' : 'chuté'}</p>
              <p>+{formatNumber(deal.scores[TEAM_A])} / +{formatNumber(deal.scores[TEAM_B])}</p>
            </div>
          ))}
        </div>
      </section>

      <button className="delete-archive-button" type="button" onClick={onDelete}>Supprimer cette partie</button>
    </div>
  )
}

function StatCard({ value, label }) {
  return <article className="stat-card"><strong>{value}</strong><span>{label}</span></article>
}

function ScoreEmpty({ title, action, onAction }) {
  return (
    <div className="score-empty-state">
      <span className="empty-suit" aria-hidden="true">♣</span>
      <h1>{title}</h1>
      <button className="score-primary-button" type="button" onClick={onAction}>{action}</button>
    </div>
  )
}

function ConfirmDialog({ title, body, label, danger = false, onConfirm, onCancel }) {
  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <p className="score-kicker">Confirmation</p>
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div>
          <button type="button" onClick={onCancel}>Annuler</button>
          <button className={danger ? 'is-danger' : 'is-primary'} type="button" onClick={onConfirm}>{label}</button>
        </div>
      </section>
    </div>
  )
}
