import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rulesSource from './content/regles-coinche-variante-maison.md?raw'
import { ruleExamples } from './content/ruleExamples'
import { Scorekeeper } from './scorekeeper/Scorekeeper'

const groupDefinitions = [
  { id: 'commencer', title: 'Commencer', sections: [1, 2, 3, 4] },
  { id: 'annoncer', title: 'Annoncer', sections: [5, 6] },
  { id: 'jouer', title: 'Jouer un pli', sections: [7, 8, 9] },
  { id: 'compter', title: 'Compter les points', sections: [10, 11, 12] },
  { id: 'table', title: 'Autour de la table', sections: [13, 14] },
  { id: 'reference', title: 'Référence', sections: [15] },
]

const sectionDescriptions = {
  1: 'Le principe du jeu et l’objectif de la partie.',
  2: 'Le jeu de cartes, les équipes et le sens du jeu.',
  3: 'La coupe, les trois passages et la rotation des rôles.',
  4: 'La force et la valeur de chaque carte.',
  5: 'Les montants, les passes et le contrat forcé.',
  6: 'Quand coincher, surcoincher et arrêter les enchères.',
  7: 'Fournir, couper, surcouper et défausser.',
  8: 'Le bonus inaliénable et les annonces exclues.',
  9: 'Le seuil à atteindre avant l’arrondi.',
  10: 'Les arrondis et les formules de score.',
  11: 'L’annonce à 250 points et ses cas de chute.',
  12: 'L’objectif choisi et la désignation du vainqueur.',
  13: 'Les informations interdites entre partenaires.',
  14: 'La reprise d’une carte et les sanctions facultatives.',
  15: 'Les mots indispensables du règlement.',
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function parseRules(source) {
  const headings = [...source.matchAll(/^##\s+(.+)$/gm)]

  return headings
    .map((match, index) => {
      const heading = match[1].trim()
      const next = headings[index + 1]
      const contentStart = match.index + match[0].length
      const contentEnd = next ? next.index : source.length
      const numberedHeading = heading.match(/^(\d+)\.\s+(.+)$/)

      if (!numberedHeading) return null

      const number = Number(numberedHeading[1])
      const title = numberedHeading[2]
      const group = groupDefinitions.find((item) => item.sections.includes(number))

      return {
        number,
        title,
        slug: slugify(title),
        groupId: group?.id ?? 'reference',
        groupTitle: group?.title ?? 'Référence',
        description: sectionDescriptions[number] ?? '',
        markdown: source.slice(contentStart, contentEnd).trim(),
      }
    })
    .filter(Boolean)
}

function readRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/'

  if (hash === '/compteur') return { type: 'scoreHome' }
  if (hash === '/compteur/partie') return { type: 'scoreGame' }
  if (hash.startsWith('/compteur/archives/')) {
    return {
      type: 'scoreArchive',
      archiveId: decodeURIComponent(hash.replace('/compteur/archives/', '')),
    }
  }
  if (hash === '/reglement') return { type: 'full' }
  if (hash.startsWith('/categorie/')) {
    return { type: 'section', slug: hash.replace('/categorie/', '') }
  }

  return { type: 'home' }
}

function MarkdownContent({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h3: ({ children: heading }) => <h2 className="rule-subtitle">{heading}</h2>,
        table: ({ children: tableChildren }) => (
          <div className="table-scroll">
            <table>{tableChildren}</table>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

function RuleExamples({ sectionNumber }) {
  const examples = ruleExamples[sectionNumber]

  if (!examples?.length) return null

  const headingId = `examples-article-${sectionNumber}`

  return (
    <aside className="rule-examples" aria-labelledby={headingId}>
      <div className="examples-heading">
        <p className="eyebrow">Pour trancher à table</p>
        <h2 id={headingId}>Exemples de situations</h2>
        <p>
          Ces cas illustrent l’article. Le texte du règlement reste la référence.
        </p>
      </div>

      <div className="examples-grid">
        {examples.map((example, index) => (
          <section className="example-card" key={`${example.reference}-${index}`}>
            <div className="example-meta">
              <span>Article {example.reference}</span>
              <span>{example.kind}</span>
            </div>
            <h3>{example.title}</h3>
            <p>
              <strong>Situation</strong>
              {example.situation}
            </p>
            <p className="example-application">
              <strong>Application</strong>
              {example.application}
            </p>
          </section>
        ))}
      </div>
    </aside>
  )
}

function SuitMark() {
  return (
    <span className="suit-mark" aria-hidden="true">
      <span>♠</span>
      <span className="suit-red">♥</span>
      <span className="suit-red">♦</span>
      <span>♣</span>
    </span>
  )
}

function InstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches,
  )

  useEffect(() => {
    const handlePrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!installPrompt || installed) return null

  const install = async () => {
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return (
    <button className="install-button" type="button" onClick={install}>
      Installer
    </button>
  )
}

function App() {
  const sections = useMemo(() => parseRules(rulesSource), [])
  const [route, setRoute] = useState(readRoute)
  const [menuOpen, setMenuOpen] = useState(false)

  const activeSection =
    route.type === 'section'
      ? sections.find((section) => section.slug === route.slug)
      : null
  const isScoreRoute = route.type.startsWith('score')

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(readRoute())
      setMenuOpen(false)
      window.scrollTo({ top: 0, behavior: 'instant' })
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (route.type === 'scoreHome') {
      document.title = 'Compteur de partie · Coinche'
    } else if (route.type === 'scoreGame') {
      document.title = 'Partie en cours · Coinche'
    } else if (route.type === 'scoreArchive') {
      document.title = 'Bilan de partie · Coinche'
    } else if (route.type === 'full') {
      document.title = 'Règlement complet · Coinche'
    } else if (activeSection) {
      document.title = `${activeSection.title} · Coinche`
    } else {
      document.title = 'Règles de la Coinche'
    }
  }, [activeSection, route.type])

  const navigate = (path) => {
    if (window.location.hash === `#${path}`) {
      setMenuOpen(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    window.location.hash = path
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>

      {!isScoreRoute && <header className="topbar">
        <button
          className="menu-button"
          type="button"
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <button className="brand-button" type="button" onClick={() => navigate('/')}>
          <SuitMark />
          <span>
            <strong>Coinche</strong>
            <small>Variante maison</small>
          </span>
        </button>

        <InstallButton />
      </header>}

      {!isScoreRoute && <div
        className={`menu-backdrop ${menuOpen ? 'is-visible' : ''}`}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />}

      {!isScoreRoute && <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Catégories">
        <div className="sidebar-heading">
          <div className="sidebar-heading-row">
            <SuitMark />
            <button
              className="sidebar-close"
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMenuOpen(false)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p>Le règlement, catégorie par catégorie.</p>
        </div>

        <nav className="category-nav">
          <button
            type="button"
            className={route.type === 'home' ? 'nav-home is-active' : 'nav-home'}
            onClick={() => navigate('/')}
          >
            Accueil
          </button>

          <button
            type="button"
            className="nav-scorekeeper"
            onClick={() => navigate('/compteur')}
          >
            <span>+</span>
            Compter une partie
          </button>

          {groupDefinitions.map((group) => (
            <div className="nav-group" key={group.id}>
              <p>{group.title}</p>
              {sections
                .filter((section) => section.groupId === group.id)
                .map((section) => (
                  <button
                    type="button"
                    key={section.slug}
                    className={activeSection?.slug === section.slug ? 'is-active' : ''}
                    aria-current={activeSection?.slug === section.slug ? 'page' : undefined}
                    onClick={() => navigate(`/categorie/${section.slug}`)}
                  >
                    <span>{section.number}</span>
                    {section.title}
                  </button>
                ))}
            </div>
          ))}

          <button
            type="button"
            className={route.type === 'full' ? 'nav-full is-active' : 'nav-full'}
            onClick={() => navigate('/reglement')}
          >
            Règlement complet
          </button>
        </nav>
      </aside>}

      <main id="contenu" className={isScoreRoute ? 'main-content score-main' : 'main-content'}>
        {route.type === 'home' && (
          <HomePage sections={sections} navigate={navigate} />
        )}

        {route.type === 'section' && activeSection && (
          <SectionPage section={activeSection} sections={sections} navigate={navigate} />
        )}

        {route.type === 'section' && !activeSection && (
          <NotFound navigate={navigate} />
        )}

        {route.type === 'full' && (
          <FullRules sections={sections} navigate={navigate} />
        )}

        {isScoreRoute && (
          <Scorekeeper route={route} navigate={navigate} />
        )}
      </main>
    </div>
  )
}

function HomePage({ sections, navigate }) {
  return (
    <div className="page home-page">
      <section className="hero">
        <p className="eyebrow">Règles officielles de notre table</p>
        <h1>La Coinche,<br />sans zone d’ombre.</h1>
        <p className="hero-copy">
          Retrouvez chaque règle rapidement pendant une partie, ou parcourez le
          règlement complet d’une seule traite.
        </p>
        <div className="hero-actions">
          <button className="primary-action" type="button" onClick={() => navigate('/compteur')}>
            Compter une partie
            <span aria-hidden="true">→</span>
          </button>
          <button className="secondary-action" type="button" onClick={() => navigate('/reglement')}>
            Lire le règlement
          </button>
        </div>
      </section>

      <section className="home-intro" aria-label="Informations principales">
        <div>
          <strong>4</strong>
          <span>joueurs</span>
        </div>
        <div>
          <strong>32</strong>
          <span>cartes</span>
        </div>
        <div>
          <strong>{sections.length}</strong>
          <span>catégories</span>
        </div>
      </section>

      <div className="category-groups">
        {groupDefinitions.map((group) => {
          const groupSections = sections.filter((section) => section.groupId === group.id)
          return (
            <section className="category-group" key={group.id}>
              <div className="group-title">
                <p>{group.title}</p>
                <span>{groupSections.length}</span>
              </div>
              <div className="category-grid">
                {groupSections.map((section) => (
                  <button
                    className="category-card"
                    type="button"
                    key={section.slug}
                    onClick={() => navigate(`/categorie/${section.slug}`)}
                  >
                    <span className="category-number">{String(section.number).padStart(2, '0')}</span>
                    <span className="category-title">{section.title}</span>
                    <span className="category-description">{section.description}</span>
                    <span className="category-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function SectionPage({ section, sections, navigate }) {
  const index = sections.findIndex((item) => item.slug === section.slug)
  const previous = sections[index - 1]
  const next = sections[index + 1]

  return (
    <article className="page rule-page">
      <div className="rule-heading">
        <button className="back-button" type="button" onClick={() => navigate('/')}>
          ← Toutes les catégories
        </button>
        <p className="eyebrow">{section.groupTitle} · Article {section.number}</p>
        <h1>{section.title}</h1>
        <p>{section.description}</p>
      </div>

      <div className="rule-content">
        <MarkdownContent>{section.markdown}</MarkdownContent>
      </div>

      <RuleExamples sectionNumber={section.number} />

      <nav className="page-navigation" aria-label="Articles voisins">
        {previous ? (
          <button type="button" onClick={() => navigate(`/categorie/${previous.slug}`)}>
            <span>Précédent</span>
            {previous.title}
          </button>
        ) : <span />}
        {next ? (
          <button type="button" onClick={() => navigate(`/categorie/${next.slug}`)}>
            <span>Suivant</span>
            {next.title}
          </button>
        ) : (
          <button type="button" onClick={() => navigate('/reglement')}>
            <span>Continuer</span>
            Règlement complet
          </button>
        )}
      </nav>
    </article>
  )
}

function FullRules({ sections, navigate }) {
  return (
    <article className="page full-rules">
      <div className="rule-heading">
        <button className="back-button" type="button" onClick={() => navigate('/')}>
          ← Retour à l’accueil
        </button>
        <p className="eyebrow">Lecture continue</p>
        <h1>Règlement complet</h1>
        <p>L’ensemble des règles de la variante maison, dans l’ordre du jeu.</p>
      </div>

      <div className="full-rules-list">
        {sections.map((section) => (
          <section className="full-rule-section" id={section.slug} key={section.slug}>
            <p className="article-index">Article {section.number}</p>
            <h2>{section.title}</h2>
            <div className="rule-content">
              <MarkdownContent>{section.markdown}</MarkdownContent>
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}

function NotFound({ navigate }) {
  return (
    <div className="page empty-state">
      <SuitMark />
      <h1>Cette catégorie n’existe pas.</h1>
      <button className="primary-action" type="button" onClick={() => navigate('/')}>
        Revenir à l’accueil
      </button>
    </div>
  )
}

export default App
