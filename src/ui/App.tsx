import React, { useState } from 'react'

import { Downsampling } from './components/StreamPlot'
import ProtocolsView from './views/ProtocolsView'
import SessionView from './views/SessionView'

const viewLabels: Record<View, string> = {
    session: 'Session',
    protocols: 'Protocols',
}

const views = Object.keys(viewLabels) as View[]

export interface AppProps {
    downsampling?: Downsampling
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling } = props

    const [view, setView] = useState<View>('session')

    return (
        <main className="app">
            <header className="app__header">
                <span className="app__wordmark">Personomic</span>
                <div className="app__tabs" role="tablist">
                    {views.map((id) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            id={tabIdOf(id)}
                            className="app__tab"
                            aria-selected={view === id}
                            aria-controls={panelIdOf(id)}
                            onClick={() => setView(id)}
                        >
                            {viewLabels[id]}
                        </button>
                    ))}
                </div>
            </header>
            <div
                role="tabpanel"
                id={panelIdOf('session')}
                aria-labelledby={tabIdOf('session')}
                hidden={view !== 'session'}
            >
                <SessionView downsampling={downsampling} />
            </div>
            {view === 'protocols' && (
                <div
                    role="tabpanel"
                    id={panelIdOf('protocols')}
                    aria-labelledby={tabIdOf('protocols')}
                >
                    <ProtocolsView />
                </div>
            )}
        </main>
    )
}

export default App

type View = 'session' | 'protocols'

function tabIdOf(view: View) {
    return `app-tab-${view}`
}

function panelIdOf(view: View) {
    return `app-panel-${view}`
}
