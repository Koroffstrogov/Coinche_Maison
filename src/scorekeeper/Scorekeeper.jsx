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
  { value: 'spades', symbol: 'â™ ', label: 'Pique', red: false },
  { value: 'hearts', symbol: 'â™¥', label: 'CÅ“ur', red: true },
  { value: 'diamonds', symbol: 'â™¦', label: 'Carreau', red: true },
  { value: 'clubs', symbol: 'â™£', label: 'TrÃ¨fle', red: false },
]

const multiplierOptions = [
  { value: 1, label: 'Normal' },
  { value: 2, label: 'CoinchÃ©' },
  { value: 4, label: 'SurcoinchÃ©' },
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
  return game.teams.find((team) => team.id === teamId)?.name ?? 'Ã‰quipe'
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
        // Le compteur reste utilisable si lâ€™appareil refuse le verrouillage.
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
      body: 'Les cumuls suivants seront recalculÃ©s automatiquement.',
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
      body: 'Le bilan sera crÃ©Ã© avec les scores actuellement enregistrÃ©s.',
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
      body: 'Son historique et ses statistiques seront dÃ©finitivement effacÃ©s de ce tÃ©lÃ©phone.',
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
            body: 'La partie active doit Ãªtre abandonnÃ©e avant dâ€™en commencer une nouvelle.',
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
              body: 'Toutes les donnes de cette partie seront supprimÃ©es.',
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
        title="Cette partie nâ€™existe plus"
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
          <span>DerniÃ¨re donne annulÃ©e.</span>
          <button type="button" onClick={restoreLastDeal}>RÃ©tablir</button>
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
          â† RÃ¨glement
        </button>
        <p className="score-kicker">Mode table</p>
        <h1>Compter une partie</h1>
        <p>Des scores lisibles, une saisie rapide et aucun papier Ã  retrouver.</p>
      </header>

      {activeGame && (
        <ActiveGameCard game={activeGame} onResume={() => navigate('/compteur/partie')} />
      )}

      <button className="score-primary-button score-new-game" type="button" onClick={onNewGame}>
        <span aria-hidden="true">ï¼‹</span>
        Nouvelle partie
      </button>

      <section className="archive-section" aria-labelledby="archive-title">
        <div className="archive-heading">
          <div>
          Û®ô¶‰žËkºwµçy±¥¬õí½¹¥¹¥Í¡ô‘¥Í…‰±•õì……µ”¹‘•…±Ì¹±•¹Ñ¡ôùQ•Éµ¥¹•È±„Á…ÉÑ¥”ð½‰ÕÑÑ½¸ø(€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘…¹•Èµ±¥¹¬ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹‰…¹‘½¹ôù‰…¹‘½¹¹•Èð½‰ÕÑÑ½¸ø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½µ…¥¸ø(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸M½É•…µ•!•…‘•È¡ìÑ¥Ñ±”°½¹	…¬°…Ñ¥½¸°½¹Ñ¥½¸ô¤ì(€É•ÑÕÉ¸€ (€€€€ñ¡•…‘•È±…ÍÍ9…µ”ô‰Í½É”µ…µ”µ¡•…‘•Èˆø(€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹	…­ô…É¥„µ±…‰•°ô‰I•Ñ½ÕÈˆûŠ@ð½‰ÕÑÑ½¸ø(€€€€€€ñ‘¥Øø(€€€€€€€€ñÍÑÉ½¹œù½¥¹¡”ð½ÍÑÉ½¹œø(€€€€€€€€ñÍÁ…¸ùíÑ¥Ñ±•ôð½ÍÁ…¸ø(€€€€€€ð½‘¥Øø(€€€€€í…Ñ¥½¸€ü€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹Ñ¥½¹ôùí…Ñ¥½¹ôð½‰ÕÑÑ½¸ø€è€ñÍÁ…¸€¼ùô(€€€€ð½¡•…‘•Èø(€€¤)ô()™Õ¹Ñ¥½¸½¹ÑÉ…Ñ¹ÑÉä¡ì…µ”°‘É…™Ð°½¹¡…¹”°½¹	…¬°½¹½¹Ñ¥¹Õ”ô¤ì(€½¹ÍÐÁ¡…Í”€ô‘É…™Ð¹½¹ÑÉ…ÑA¡…Í”€üü€Ñ•…´œ(€½¹ÍÐÕÁ‘…Ñ”€ô€¡Ù…±Õ•Ì¤€ôø½¹¡…¹” ¡ÕÉÉ•¹Ð¤€ôø€¡ì€¸¸¹ÕÉÉ•¹Ð°€¸¸¹Ù…±Õ•Ìô¤¤((€½¹ÍÐ¡½½Í•Q•…´€ô€¡Ñ•…µ%¤€ôøÕÁ‘…Ñ”¡ì…ÑÑ…­¥¹Q•…µ%èÑ•…µ%°½¹ÑÉ…ÑA¡…Í”è€…µ½Õ¹Ðœô¤(€½¹ÍÐ¡½½Í•½¹ÑÉ…Ð€ô€¡½¹ÑÉ…Ð¤€ôøÕÁ‘…Ñ”¡ì½¹ÑÉ…Ð°½¹ÑÉ…ÑA¡…Í”è€ÍÕ¥Ðœô¤(€½¹ÍÐ¡½½Í•MÕ¥Ð€ô€¡ÍÕ¥Ð¤€ôøÕÁ‘…Ñ”¡ìÍÕ¥Ð°½¹ÑÉ…ÑA¡…Í”è€µÕ±Ñ¥Á±¥•Èœô¤(€½¹ÍÐ¡½½Í•5Õ±Ñ¥Á±¥•È€ô€¡µÕ±Ñ¥Á±¥•È¤€ôøì(€€€½¹¡…¹” ¡ÕÉÉ•¹Ð¤€ôø€¡ì(€€€€€€¸¸¹ÕÉÉ•¹Ð°(€€€€€µÕ±Ñ¥Á±¥•È°(€€€€€ÍÑ•Àè€Í½É”œ°(€€€€€Í½É•A¡…Í”è€É•ÍÕ±Ðœ°(€€€€€…Ñ¥Ù•M½É•Q•…µ%èÕÉÉ•¹Ð¹…ÑÑ…­¥¹Q•…µ%€üüQ5}°(€€€ô¤¤(€€€½¹½¹Ñ¥¹Õ” ¤(€ô((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í½É”µ…µ”µÁ…”•¹ÑÉäµÁ…”ˆø(€€€€€€ñM½É•…µ•!•…‘•È(€€€€€€€Ñ¥Ñ±”õí‘É…™Ð¹•‘¥Ñ¥¹•…±%€ü€5½‘¥™¥•È±„‘½¹¹”œ€è½¹¹”€‘í…µ”¹‘•…±Ì¹±•¹Ñ €¬€Åõô(€€€€€€€½¹	…¬õí½¹	…­ô(€€€€€€¼ø(€€€€€€ñµ…¥¸±…ÍÍ9…µ”ô‰•¹ÑÉäµ½¹Ñ•¹Ðˆø(€€€€€€€€ñMÑ•Á%¹‘¥…Ñ½ÈÕÉÉ•¹ÐõìÅô€¼ø(€€€€€€€€ñ•…±MÕµµ…Éä…µ”õí…µ•ô‘É…™Ðõí‘É…™Ñô•‘¥Ñ…‰±”½¹)ÕµÀõì¡¹•áÑA¡…Í”¤€ôøÕÁ‘…Ñ”¡ì½¹ÑÉ…ÑA¡…Í”è¹•áÑA¡…Í”ô¥ô€¼ø((€€€€€€€íÁ¡…Í”€ôôô€Ñ•…´œ€˜˜€ (€€€€€€€€€€ñ¡½¥•MÑ…”Ñ¥Ñ±”ô‰EÕ¤Á½ÉÑ”±”½¹ÑÉ…Ð€üˆ¡¥¹Ðô‹%ÅÕ¥Á”…ÑÑ…ÅÕ…¹Ñ”ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰±…É”µ¡½¥”µÉ¥ÑÝ¼ˆø(€€€€€€€€€€€€€í…µ”¹Ñ•…µÌ¹µ…À ¡Ñ•…´¤€ôø€ (€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ­•äõíÑ•…´¹¥‘ô½¹±¥¬õì ¤€ôø¡½½Í•Q•…´¡Ñ•…´¹¥¥ôø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸û%ÅÕ¥Á”ð½ÍÁ…¸øñÍÑÉ½¹œùíÑ•…´¹¹…µ•ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½¡½¥•MÑ…”ø(€€€€€€€€¥ô((€€€€€€€íÁ¡…Í”€ôôô€…µ½Õ¹Ðœ€˜˜€ (€€€€€€€€€€ñ¡½¥•MÑ…”Ñ¥Ñ±”ô‰EÕ•±±”…¹¹½¹”€üˆ¡¥¹Ðô‰Y…±•ÕÈ‘Ô½¹ÑÉ…Ðˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…µ½Õ¹ÐµÉ¥ˆø(€€€€€€€€€€€€€í=9QIQ}5=U9QL¹µ…À ¡…µ½Õ¹Ð¤€ôø€ (€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ­•äõí…µ½Õ¹Ñô½¹±¥¬õì ¤€ôø¡½½Í•½¹ÑÉ…Ð¡…µ½Õ¹Ð¥ôùí…µ½Õ¹Ñôð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰…Á½Ðµ¡½¥”ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôø¡½½Í•½¹ÑÉ…Ð …Á½Ðœ¥ôù…Á½Ðð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½¡½¥•MÑ…”ø(€€€€€€€€¥ô((€€€€€€€íÁ¡…Í”€ôôô€ÍÕ¥Ðœ€˜˜€ (€€€€€€€€€€ñ¡½¥•MÑ…”Ñ¥Ñ±”ô‰…¹ÌÅÕ•±±”½Õ±•ÕÈ€üˆ¡¥¹Ðô‰½Õ±•ÕÈ“Še…Ñ½ÕÐˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÕ¥Ðµ¡½¥”µÉ¥ˆø(€€€€€€€€€€€€€íÍÕ¥Ñ=ÁÑ¥½¹Ì¹µ…À ¡ÍÕ¥Ð¤€ôø€ (€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ­•äõíÍÕ¥Ð¹Ù…±Õ•ô½¹±¥¬õì ¤€ôø¡½½Í•MÕ¥Ð¡ÍÕ¥Ð¹Ù…±Õ”¥ôø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”õíÍÕ¥Ð¹É•€ü€¥ÌµÉ•œ€è€œô…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆùíÍÕ¥Ð¹Íåµ‰½±ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œùíÍÕ¥Ð¹±…‰•±ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½¡½¥•MÑ…”ø(€€€€€€€€¥ô((€€€€€€€íÁ¡…Í”€ôôô€µÕ±Ñ¥Á±¥•Èœ€˜˜€ (€€€€€€€€€€ñ¡½¥•MÑ…”Ñ¥Ñ±”ô‹%Ñ…Ð‘Ô½¹ÑÉ…Ðˆ¡¥¹Ðô‰•É¹§¡É”…¹¹½¹”ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰±…É”µ¡½¥”µÉ¥Ñ¡É•”ˆø(€€€€€€€€€€€€€íµÕ±Ñ¥Á±¥•É=ÁÑ¥½¹Ì¹µ…À ¡½ÁÑ¥½¸¤€ôø€ (€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ­•äõí½ÁÑ¥½¸¹Ù…±Õ•ô½¹±¥¬õì ¤€ôø¡½½Í•5Õ±Ñ¥Á±¥•È¡½ÁÑ¥½¸¹Ù…±Õ”¥ôø(€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œùí½ÁÑ¥½¸¹±…‰•±ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùí½ÁÑ¥½¸¹Ù…±Õ”€ôôô€Ä€ü€Ÿ\Äœ€èƒ\‘í½ÁÑ¥½¸¹Ù…±Õ•õôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½¡½¥•MÑ…”ø(€€€€€€€€¥ô(€€€€€€ð½µ…¥¸ø(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸MÑ•Á%¹‘¥…Ñ½È¡ìÕÉÉ•¹Ðô¤ì(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÑ•Àµ¥¹‘¥…Ñ½Èˆ…É¥„µ±…‰•°õíƒ%Ñ…Á”€‘íÕÉÉ•¹ÑôÍÕÈ€Éôø(€€€€€€ñÍÁ…¸±…ÍÍ9…µ”õíÕÉÉ•¹Ð€øô€Ä€ü€¥Ìµ…Ñ¥Ù”œ€è€œôøÄð½ÍÁ…¸ø(€€€€€€ñ¤€¼ø(€€€€€€ñÍÁ…¸±…ÍÍ9…µ”õíÕÉÉ•¹Ð€øô€È€ü€¥Ìµ…Ñ¥Ù”œ€è€œôøÈð½ÍÁ…¸ø(€€€€€€ñÀùíÕÉÉ•¹Ð€ôôô€Ä€ü€½¹ÑÉ…Ðœ€è€M½É•Ìôð½Àø(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸•…±MÕµµ…Éä¡ì…µ”°‘É…™Ð°•‘¥Ñ…‰±”€ô™…±Í”°½¹)ÕµÀô¤ì(€½¹ÍÐÁ…ÉÑÌ€ôl(€€€‘É…™Ð¹…ÑÑ…­¥¹Q•…µ%€˜˜ì­•äè€Ñ•…´œ°±…‰•°èÑ•…µ9…µ”¡…µ”°‘É…™Ð¹…ÑÑ…­¥¹Q•…µ%¤ô°(€€€‘É…™Ð¹½¹ÑÉ…Ð€˜˜ì­•äè€…µ½Õ¹Ðœ°±…‰•°è½¹ÑÉ…Ñ1…‰•°¡‘É…™Ð¹½¹ÑÉ…Ð¤ô°(€€€‘É…™Ð¹ÍÕ¥Ð€˜˜ì­•äè€ÍÕ¥Ðœ°±…‰•°èÍÕ¥Ñ1…‰•°¡‘É…™Ð¹ÍÕ¥Ð¤ô°(€€€‘É…™Ð¹µÕ±Ñ¥Á±¥•È€˜˜ì­•äè€µÕ±Ñ¥Á±¥•Èœ°±…‰•°èµÕ±Ñ¥Á±¥•É1…‰•°¡‘É…™Ð¹µÕ±Ñ¥Á±¥•È¤ô°(€t¹™¥±Ñ•È¡	½½±•…¸¤((€¥˜€ …Á…ÉÑÌ¹±•¹Ñ ¤É•ÑÕÉ¸¹Õ±°((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‘•…°µÍÕµµ…Éäˆ…É¥„µ±…‰•°ô‰K¥ÍÕ·¤‘Ô½¹ÑÉ…Ðˆø(€€€€€íÁ…ÉÑÌ¹µ…À ¡Á…ÉÐ¤€ôø•‘¥Ñ…‰±”€ü€ (€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ­•äõíÁ…ÉÐ¹­•åô½¹±¥¬õì ¤€ôø½¹)ÕµÀ¡Á…ÉÐ¹­•ä¥ôùíÁ…ÉÐ¹±…‰•±ôð½‰ÕÑÑ½¸ø(€€€€€€¤€è€ñÍÁ…¸­•äõíÁ…ÉÐ¹­•åôùíÁ…ÉÐ¹±…‰•±ôð½ÍÁ…¸ø¥ô(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸¡½¥•MÑ…”¡ìÑ¥Ñ±”°¡¥¹Ð°¡¥±‘É•¸ô¤ì(€É•ÑÕÉ¸€ (€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰¡½¥”µÍÑ…”ˆø(€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ­¥­•Èˆùí¡¥¹Ñôð½Àø(€€€€€€ñ ÄùíÑ¥Ñ±•ôð½ Äø(€€€€€í¡¥±‘É•¹ô(€€€€ð½Í•Ñ¥½¸ø(€€¤)ô()™Õ¹Ñ¥½¸M½É•¹ÑÉä¡ì…µ”°‘É…™Ð°½¹¡…¹”°½¹	…¬°½¹M…Ù”ô¤ì(€½¹ÍÐÁ¡…Í”€ô‘É…™Ð¹Í½É•A¡…Í”€üü€É•ÍÕ±Ðœ(€½¹ÍÐÕÁ‘…Ñ”€ô€¡Ù…±Õ•Ì¤€ôø½¹¡…¹” ¡ÕÉÉ•¹Ð¤€ôø€¡ì€¸¸¹ÕÉÉ•¹Ð°€¸¸¹Ù…±Õ•Ìô¤¤((€½¹ÍÐ¡½½Í•I•ÍÕ±Ð€ô€¡É•ÍÕ±Ð¤€ôøÕÁ‘…Ñ”¡ìÉ•ÍÕ±Ð°Í½É•A¡…Í”è€Í½É•Ìœô¤((€½¹ÍÐ¡…¹•M½É”€ô€¡­•ä¤€ôøì(€€€½¹ÍÐÑ•…µ%€ô‘É…™Ð¹…Ñ¥Ù•M½É•Q•…µ%€üüQ5}(€€€½¹ÍÐÕÉÉ•¹ÑY…±Õ”€ô‘É…™Ð¹Í½É•ÍmÑ•…µ%‘t(€€€±•Ð¹•áÑY…±Õ”€ôÕÉÉ•¹ÑY…±Õ”((€€€¥˜€¡­•ä€ôôô€œ´ÄÀœñð­•ä€ôôô€œ¬ÄÀœ¤ì(€€€€€½¹ÍÐ…‘©ÕÍÑµ•¹Ð€ô­•ä€ôôô€œ¬ÄÀœ€ü€ÄÀ€è€´ÄÀ(€€€€€¹•áÑY…±Õ”€ôMÑÉ¥¹œ¡5…Ñ ¹µ…à À°€¡9Õµ‰•È¡ÕÉÉ•¹ÑY…±Õ”¤ñð€À¤€¬…‘©ÕÍÑµ•¹Ð¤¤(€€€ô•±Í”¥˜€¡­•ä€ôôô€±•…Èœ¤ì(€€€€€¹•áÑY…±Õ”€ô€œœ(€€€ô•±Í”¥˜€¡ÕÉÉ•¹ÑY…±Õ”€ôôô€œÀœ¤ì(€€€€€¹•áÑY…±Õ”€ô­•ä(€€€ô•±Í”¥˜€¡ÕÉÉ•¹ÑY…±Õ”¹±•¹Ñ €ð€Ð¤ì(€€€€€¹•áÑY…±Õ”€ô€‘íÕÉÉ•¹ÑY…±Õ•ô‘í­•åõ€(€€€ô((€€€½¹¡…¹” ¡ÕÉÉ•¹Ð¤€ôø€¡ì(€€€€€€¸¸¹ÕÉÉ•¹Ð°(€€€€€Í½É•Ìèì€¸¸¹ÕÉÉ•¹Ð¹Í½É•Ì°mÑ•…µ%‘tè¹•áÑY…±Õ”ô°(€€€ô¤¤(€ô((€½¹ÍÐ…¹M…Ù”€ô(€€€‘É…™Ð¹É•ÍÕ±Ð€˜˜‘É…™Ð¹Í½É•ÍmQ5}t€„ôô€œœ€˜˜‘É…™Ð¹Í½É•ÍmQ5}	t€„ôô€œœ((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í½É”µ…µ”µÁ…”•¹ÑÉäµÁ…”Í½É”µ•¹ÑÉäµÁ…”ˆø(€€€€€€ñM½É•…µ•!•…‘•È(€€€€€€€Ñ¥Ñ±”õí‘É…™Ð¹•‘¥Ñ¥¹•…±%€ü€5½‘¥™¥•È±•ÌÍ½É•Ìœ€è½¹¹”€‘í…µ”¹‘•…±Ì¹±•¹Ñ €¬€Åõô(€€€€€€€½¹	…¬õí½¹	…­ô(€€€€€€¼ø(€€€€€€ñµ…¥¸±…ÍÍ9…µ”ô‰•¹ÑÉäµ½¹Ñ•¹Ðˆø(€€€€€€€€ñMÑ•Á%¹‘¥…Ñ½ÈÕÉÉ•¹ÐõìÉô€¼ø(€€€€€€€€ñ•…±MÕµµ…Éä…µ”õí…µ•ô‘É…™Ðõí‘É…™Ñô€¼ø((€€€€€€€íÁ¡…Í”€ôôô€É•ÍÕ±Ðœ€ü€ (€€€€€€€€€€ñ¡½¥•MÑ…”Ñ¥Ñ±”ô‰1”½¹ÑÉ…Ð•ÍÓŠ˜ˆ¡¥¹Ðô‰K¥ÍÕ±Ñ…Ð‘”±„‘½¹¹”ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰±…É”µ¡½¥”µÉ¥ÑÝ¼É•ÍÕ±ÐµÉ¥ˆø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôø¡½½Í•I•ÍÕ±Ð µ…‘”œ¥ôø(€€€€€€€€€€€€€€€€ñÍÁ…¸…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆûŠrLð½ÍÁ…¸øñÍÑÉ½¹œùK¥ÕÍÍ¤ð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôø¡½½Í•I•ÍÕ±Ð ™…¥±•œ¥ôø(€€€€€€€€€€€€€€€€ñÍÁ…¸…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆû\ð½ÍÁ…¸øñÍÑÉ½¹œù¡ÕÓ¤ð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½¡½¥•MÑ…”ø(€€€€€€€€¤€è€ (€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰µ…¹Õ…°µÍ½É”µÍÑ…”ˆø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ…¹Õ…°µÍ½É”µ¡•…‘¥¹œˆø(€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ­¥­•ÈˆùM½É•Ì…ÑÑÉ¥‰×¥Ìð½Àø(€€€€€€€€€€€€€€€€ñ ÄùM…¥Í¥È±•ÌÁ½¥¹ÑÌð½ Äø(€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôø¡…¹•M½É” ±•…Èœ¥ôù™™…•Èð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ…¹Õ…°µÍ½É”µ™¥•±‘ÌˆÉ½±”ô‰É½ÕÀˆ…É¥„µ±…‰•°ô‹%ÅÕ¥Á”ƒ€µ½‘¥™¥•Èˆø(€€€€€€€€€€€€€í…µ”¹Ñ•…µÌ¹µ…À ¡Ñ•…´¤€ôøì(€€€€€€€€€€€€€€€½¹ÍÐ…Ñ¥Ù”€ô‘É…™Ð¹…Ñ¥Ù•M½É•Q•…µ%€ôôôÑ•…´¹¥(€€€€€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õí…Ñ¥Ù”€ü€¥Ìµ…Ñ¥Ù”œ€è€œô(€€€€€€€€€€€€€€€€€€€…É¥„µÁÉ•ÍÍ•õí…Ñ¥Ù•ô(€€€€€€€€€€€€€€€€€€€­•äõíÑ•…´¹¥‘ô(€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÕÁ‘…Ñ”¡ì…Ñ¥Ù•M½É•Q•…µ%èÑ•…´¹¥ô¥ô(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùíÑ•…´¹¹…µ•ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œùí‘É…™Ð¹Í½É•ÍmÑ•…´¹¥‘t€ôôô€œœ€ü€ŸŠPœ€è™½Éµ…Ñ9Õµ‰•È¡9Õµ‰•È¡‘É…™Ð¹Í½É•ÍmÑ•…´¹¥‘t¤¥ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€¤(€€€€€€€€€€€€€ô¥ô(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í½É”µ­•åÁ…ˆ…É¥„µ±…‰•°ô‰A…Û¤¹Õ·¥É¥ÅÕ”ˆø(€€€€€€€€€€€€€í­•åÁ…‘I½ÝÌ¹™±…Ð ¤¹µ…À ¡­•ä¤€ôø€ (€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õí­•ä¹¥¹±Õ‘•Ì œÄÀœ¤€ü€¥Ìµ…‘©ÕÍÑµ•¹Ðœ€è€œô(€€€€€€€€€€€€€€€€€­•äõí­•åô(€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôø¡…¹•M½É”¡­•ä¥ô(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€í­•ä€ôôô€œ´ÄÀœ€ü€ŸŠ"HÄÀœ€è­•åô(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Í½É”µÁÉ¥µ…Éäµ‰ÕÑÑ½¸Í…Ù”µ‘•…°µ‰ÕÑÑ½¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘¥Í…‰±•õì……¹M…Ù•ô½¹±¥¬õí½¹M…Ù•ôø(€€€€€€€€€€€€€í‘É…™Ð¹•‘¥Ñ¥¹•…±%€ü€¹É•¥ÍÑÉ•È±•Ìµ½‘¥™¥…Ñ¥½¹Ìœ€è€¹É•¥ÍÑÉ•È±„‘½¹¹”ô(€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€ð½Í•Ñ¥½¸ø(€€€€€€€€¥ô(€€€€€€ð½µ…¥¸ø(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸•…±!¥ÍÑ½Éä¡ì…µ”°½¹	…¬°½¹‘¥Ð°½¹•±•Ñ”ô¤ì(€½¹ÍÐÑ½Ñ…±Ì€ô•Ñ…µ•Q½Ñ…±Ì¡…µ”¤(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í½É”µ…µ”µÁ…”¡¥ÍÑ½ÉäµÁ…”ˆø(€€€€€€ñM½É•…µ•!•…‘•ÈÑ¥Ñ±”ô‰!¥ÍÑ½É¥ÅÕ”ˆ½¹	…¬õí½¹	…­ô€¼ø(€€€€€€ñµ…¥¸±…ÍÍ9…µ”ô‰¡¥ÍÑ½Éäµ½¹Ñ•¹Ðˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡¥ÍÑ½ÉäµÑ½Ñ…°µÍÑÉ¥Àˆø(€€€€€€€€€€ñÍÁ…¸ùí…µ”¹Ñ•…µÍlÁt¹¹…µ•ôñÍÑÉ½¹œùí™½Éµ…Ñ9Õµ‰•È¡Ñ½Ñ…±ÍmQ5}t¥ôð½ÍÑÉ½¹œøð½ÍÁ…¸ø(€€€€€€€€€€ñÍÁ…¸ùí…µ”¹Ñ•…µÍlÅt¹¹…µ•ôñÍÑÉ½¹œùí™½Éµ…Ñ9Õµ‰•È¡Ñ½Ñ…±ÍmQ5}	t¥ôð½ÍÑÉ½¹œøð½ÍÁ…¸ø(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‘•…°µ±¥ÍÐˆø(€€€€€€€€€íl¸¸¹…µ”¹‘•…±Ít¹É•Ù•ÉÍ” ¤¹µ…À ¡‘•…°°É•Ù•ÉÍ•%¹‘•à¤€ôøì(€€€€€€€€€€€½¹ÍÐ‘•…±9Õµ‰•È€ô…µ”¹‘•…±Ì¹±•¹Ñ €´É•Ù•ÉÍ•%¹‘•à(€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰‘•…°µ¡¥ÍÑ½Éäµ…Éˆ­•äõí‘•…°¹¥‘ôø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‘•…°µ¡¥ÍÑ½Éäµ¹Õµ‰•Èˆùí‘•…±9Õµ‰•Éôð½‘¥Øø(€€€€€€€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€€€€€€€ñÀùíÑ•…µ9…µ”¡…µ”°‘•…°¹…ÑÑ…­¥¹Q•…µ%¥ôƒ
Üí‘•…°¹É•ÍÕ±Ð€ôôô€µ…‘”œ€ü€Ë¥ÕÍÍ¤œ€è€¡ÕÓ¤ôð½Àø(€€€€€€€€€€€€€€€€€€ñÍÑÉ½¹œùí½¹ÑÉ…Ñ1…‰•°¡‘•…°¹½¹ÑÉ…Ð¥ôƒ€íÍÕ¥Ñ1…‰•°¡‘•…°¹ÍÕ¥Ð¤¹Ñ½1½Ý•É…Í” ¥ôƒ
ÜíµÕ±Ñ¥Á±¥•É1…‰•°¡‘•…°¹µÕ±Ñ¥Á±¥•È¥ôð½ÍÑÉ½¹œø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸ùí…µ”¹Ñ•…µÍlÁt¹¹…µ•ô€­í™½Éµ…Ñ9Õµ‰•È¡‘•…°¹Í½É•ÍmQ5}t¥ôƒ
Üí…µ”¹Ñ•…µÍlÅt¹¹…µ•ô€­í™½Éµ…Ñ9Õµ‰•È¡‘•…°¹Í½É•ÍmQ5}	t¥ôð½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‘•…°µ¡¥ÍÑ½Éäµ…Ñ¥½¹Ìˆø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôø½¹‘¥Ð¡‘•…°¥ôù5½‘¥™¥•Èð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õì ¤€ôø½¹•±•Ñ”¡‘•…°¹¥¥ôùMÕÁÁÉ¥µ•Èð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€ð½…ÉÑ¥±”ø(€€€€€€€€€€€€¤(€€€€€€€€€ô¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€€ì……µ”¹‘•…±Ì¹±•¹Ñ €˜˜€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ•µÁÑäµ½ÁäˆùÕÕ¹”‘½¹¹”•¹É•¥ÍÑË¥”¸ð½Àùô(€€€€€€ð½µ…¥¸ø(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸…µ•MÕµµ…Éä¡ì…µ”°½¹	…¬°½¹•±•Ñ”ô¤ì(€½¹ÍÐÑ½Ñ…±Ì€ô•Ñ…µ•Q½Ñ…±Ì¡…µ”¤(€½¹ÍÐÍ•É¥•Ì€ô•ÑÕµÕ±…Ñ¥Ù•M•É¥•Ì¡…µ”¤(€½¹ÍÐÍÑ…ÑÌ€ô•Ñ…µ•MÑ…ÑÌ¡…µ”¤(€½¹ÍÐ½ÕÑ½µ”€ô•Ñ…µ•=ÕÑ½µ”¡…µ”¤(€½¹ÍÐÝ¥¹¹•È€ô½ÕÑ½µ”ü¹Ý¥¹¹•ÉQ•…µ%(€€€€üÑ•…µ9…µ”¡…µ”°½ÕÑ½µ”¹Ý¥¹¹•ÉQ•…µ%¤(€€€€è¹Õ±°((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í½É”µÁ…”ÍÕµµ…ÉäµÁ…”ˆø(€€€€€€ñ¡•…‘•È±…ÍÍ9…µ”ô‰ÍÕµµ…Éäµ¡•É¼ˆø(€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Í½É”µÑ•áÐµ‰ÕÑÑ½¸±¥¡ÐˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹	…­ôûŠ@½µÁÑ•ÕÈð½‰ÕÑÑ½¸ø(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ­¥­•Èˆù	¥±…¸‘”±„Á…ÉÑ¥”ð½Àø(€€€€€€€€ñ ÄùíÝ¥¹¹•È€ü€‘íÝ¥¹¹•ÉôÉ•µÁ½ÉÑ”±„Á…ÉÑ¥•€€è€1„Á…ÉÑ¥”Í”Ñ•Éµ¥¹”ƒ€ƒ¥…±¥Ó¤ôð½ Äø(€€€€€€€€ñÀùí™½Éµ…Ñ…Ñ”¡…µ”¹™¥¹¥Í¡•‘Ð¥ôƒ
Üí…µ”¹‘•…±Ì¹±•¹Ñ¡ô‘½¹¹•í…µ”¹‘•…±Ì¹±•¹Ñ €ø€Ä€ü€Ìœ€è€œôð½Àø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÕµµ…Éäµ™¥¹…°µÍ½É•Ìˆø(€€€€€€€€€í…µ”¹Ñ•…µÌ¹µ…À ¡Ñ•…´¤€ôø€ (€€€€€€€€€€€€ñÍÁ…¸­•äõíÑ•…´¹¥‘ôøñÍµ…±°ùíÑ•…´¹¹…µ•ôð½Íµ…±°øñÍÑÉ½¹œùí™½Éµ…Ñ9Õµ‰•È¡Ñ½Ñ…±ÍmÑ•…´¹¥‘t¥ôð½ÍÑÉ½¹œøð½ÍÁ…¸ø(€€€€€€€€€€¤¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€ð½¡•…‘•Èø((€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰ÍÕµµ…ÉäµÍ•Ñ¥½¸ˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÕµµ…ÉäµÍ•Ñ¥½¸µ¡•…‘¥¹œˆø(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ­¥­•Èˆû%Ù½±ÕÑ¥½¸ð½Àø(€€€€€€€€€€ñ Èù1„½ÕÉÍ”…ÕàÁ½¥¹ÑÌð½ Èø(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñM½É•¡…ÉÐ(€€€€€€€€€Í•É¥•ÌõíÍ•É¥•Íô(€€€€€€€€€Ñ•…µÌõí…µ”¹Ñ•…µÍô(€€€€€€€€€Ñ…É•Ðõí…µ”¹•¹‘½¹‘¥Ñ¥½¸¹ÑåÁ”€ôôô€Í½É”œ€ü…µ”¹•¹‘½¹‘¥Ñ¥½¸¹Ñ…É•Ð€è¹Õ±±ô(€€€€€€€€¼ø(€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰ÍÕµµ…ÉäµÍ•Ñ¥½¸ˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÕµµ…ÉäµÍ•Ñ¥½¸µ¡•…‘¥¹œˆø(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ­¥­•Èˆù¸¡¥™™É•Ìð½Àø(€€€€€€€€€€ñ Èù1”‰¥±…¸ð½ Èø(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÑ…ÑÌµÉ¥ˆø(€€€€€€€€€í…µ”¹Ñ•…µÌ¹µ…À ¡Ñ•…´¤€ôø€ (€€€€€€€€€€€€ñMÑ…Ñ…É(€€€€€€€€€€€€€­•äõíÑ•…´¹¥‘ô(€€€€€€€€€€€€€Ù…±Õ”õí€‘íÍÑ…ÑÌ¹‰åQ•…´ü¹mÑ•…´¹¥‘tü¹µ…‘”€üü€Áô€¼€‘íÍÑ…ÑÌ¹‰åQ•…´ü¹mÑ•…´¹¥‘tü¹™…¥±•€üü€Áõô(€€€€€€€€€€€€€±…‰•°õí€‘íÑ•…´¹¹…µ•ôƒ
ÜË¥ÕÍÍ¥Ì€¼¡ÕÓ¥Íô(€€€€€€€€€€€€¼ø(€€€€€€€€€€¤¥ô(€€€€€€€€€€ñMÑ…Ñ…ÉÙ…±Õ”õì¡ÍÑ…ÑÌ¹½¥¹•€üü€À¤€¬€¡ÍÑ…ÑÌ¹ÍÕÉ½¥¹•€üü€À¥ô±…‰•°ô‰½¥¹¡•Ì•ÐÍÕÉ½¥¹¡•Ìˆ€¼ø(€€€€€€€€€€ñMÑ…Ñ…ÉÙ…±Õ”õí™½Éµ…Ñ9Õµ‰•È¡ÍÑ…ÑÌ¹‰¥•ÍÑ•…°ü¹Í½É”€üü€À¥ô±…‰•°ô‰Á½¥¹ÑÌÍÕÈ±„Á±ÕÌÉ½ÍÍ”‘½¹¹”ˆ€¼ø(€€€€€€€€€€ñMÑ…Ñ…ÉÙ…±Õ”õí™½Éµ…Ñ9Õµ‰•È¡ÍÑ…ÑÌ¹µ…á1•…ü¹…µ½Õ¹Ð€üü€À¥ô±…‰•°ô‰Á½¥¹ÑÌ“Še…Ù…¹”µ…á¥µ…±”ˆ€¼ø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰ÍÕµµ…ÉäµÍ•Ñ¥½¸½µÁ…ÐµÍÕµµ…Éäµ¡¥ÍÑ½Éäˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÕµµ…ÉäµÍ•Ñ¥½¸µ¡•…‘¥¹œˆø(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ­¥­•Èˆù¥Ñ…¥°ð½Àø(€€€€€€€€€€ñ Èù1•Ì‘½¹¹•Ìð½ Èø(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÕµµ…Éäµ‘•…°µ±¥ÍÐˆø(€€€€€€€€€í…µ”¹‘•…±Ì¹µ…À ¡‘•…°°¥¹‘•à¤€ôø€ (€€€€€€€€€€€€ñ‘¥Ø­•äõí‘•…°¹¥‘ôø(€€€€€€€€€€€€€€ñÍÁ…¸ùí¥¹‘•à€¬€Åôð½ÍÁ…¸ø(€€€€€€€€€€€€€€ñÀøñÍÑÉ½¹œùí½¹ÑÉ…Ñ1…‰•°¡‘•…°¹½¹ÑÉ…Ð¥ôƒ
ÜíÍÕ¥Ñ1…‰•°¡‘•…°¹ÍÕ¥Ð¥ôð½ÍÑÉ½¹œùíÑ•…µ9…µ”¡…µ”°‘•…°¹…ÑÑ…­¥¹Q•…µ%¥ôƒ
Üí‘•…°¹É•ÍÕ±Ð€ôôô€µ…‘”œ€ü€Ë¥ÕÍÍ¤œ€è€¡ÕÓ¤ôð½Àø(€€€€€€€€€€€€€€ñÀø­í™½Éµ…Ñ9Õµ‰•È¡‘•…°¹Í½É•ÍmQ5}t¥ô€¼€­í™½Éµ…Ñ9Õµ‰•È¡‘•…°¹Í½É•ÍmQ5}	t¥ôð½Àø(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€¤¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€ð½Í•Ñ¥½¸ø((€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰‘•±•Ñ”µ…É¡¥Ù”µ‰ÕÑÑ½¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹•±•Ñ•ôùMÕÁÁÉ¥µ•È•ÑÑ”Á…ÉÑ¥”ð½‰ÕÑÑ½¸ø(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸MÑ…Ñ…É¡ìÙ…±Õ”°±…‰•°ô¤ì(€É•ÑÕÉ¸€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰ÍÑ…Ðµ…ÉˆøñÍÑÉ½¹œùíÙ…±Õ•ôð½ÍÑÉ½¹œøñÍÁ…¸ùí±…‰•±ôð½ÍÁ…¸øð½…ÉÑ¥±”ø)ô()™Õ¹Ñ¥½¸M½É•µÁÑä¡ìÑ¥Ñ±”°…Ñ¥½¸°½¹Ñ¥½¸ô¤ì(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Í½É”µ•µÁÑäµÍÑ…Ñ”ˆø(€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰•µÁÑäµÍÕ¥Ðˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆûŠfŒð½ÍÁ…¸ø(€€€€€€ñ ÄùíÑ¥Ñ±•ôð½ Äø(€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Í½É”µÁÉ¥µ…Éäµ‰ÕÑÑ½¸ˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹Ñ¥½¹ôùí…Ñ¥½¹ôð½‰ÕÑÑ½¸ø(€€€€ð½‘¥Øø(€€¤)ô()™Õ¹Ñ¥½¸½¹™¥Éµ¥…±½œ¡ìÑ¥Ñ±”°‰½‘ä°±…‰•°°‘…¹•È€ô™…±Í”°½¹½¹™¥É´°½¹…¹•°ô¤ì(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰½¹™¥É´µ‰…­‘É½ÀˆÉ½±”ô‰ÁÉ•Í•¹Ñ…Ñ¥½¸ˆ½¹5½ÕÍ•½Ý¸õì¡•Ù•¹Ð¤€ôøì(€€€€€¥˜€¡•Ù•¹Ð¹Ñ…É•Ð€ôôô•Ù•¹Ð¹ÕÉÉ•¹ÑQ…É•Ð¤½¹…¹•° ¤(€€€õôø(€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰½¹™¥É´µ‘¥…±½œˆÉ½±”ô‰…±•ÉÑ‘¥…±½œˆ…É¥„µµ½‘…°ô‰ÑÉÕ”ˆ…É¥„µ±…‰•±±•‘‰äô‰½¹™¥É´µÑ¥Ñ±”ˆø(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Í½É”µ­¥­•Èˆù½¹™¥Éµ…Ñ¥½¸ð½Àø(€€€€€€€€ñ È¥ô‰½¹™¥É´µÑ¥Ñ±”ˆùíÑ¥Ñ±•ôð½ Èø(€€€€€€€€ñÀùí‰½‘åôð½Àø(€€€€€€€€ñ‘¥Øø(€€€€€€€€€€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹…¹•±ôù¹¹Õ±•Èð½‰ÕÑÑ½¸ø(€€€€€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”õí‘…¹•È€ü€¥Ìµ‘…¹•Èœ€è€¥ÌµÁÉ¥µ…ÉäôÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹½¹™¥Éµôùí±…‰•±ôð½‰ÕÑÑ½¸ø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½Í•Ñ¥½¸ø(€€€€ð½‘¥Øø(€€¤)ô(