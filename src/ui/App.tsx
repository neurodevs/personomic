import React, { useRef, useState } from 'react'

import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../functions/sendToOrchestrator'
import { Downsampling } from './components/StreamPlot'
import { SelectedDevice, selectedNameOf } from './hooks/useBiosensorChoices'
import ProtocolsView, { ProtocolFile } from './views/ProtocolsView'
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
    const [protocolFiles, setProtocolFiles] = useState<ProtocolFile[]>()
    const [listingError, setListingError] = useState<string>()
    const hasAskedForProtocols = useRef(false)

    const listProtocols = () => {
        hasAskedForProtocols.current = true

        sendToOrchestrator<{ protocols?: ListedProtocolFile[] }>(
            { command: 'listProtocols' },
            {
                onReply: ({ error, protocols = [] }) => {
                    setListingError(error)
                    setProtocolFiles(protocols.map(protocolFileFrom))
                },
                onUnreachable: () => {
                    setListingError(orchestratorUnreachableMessage)
                    setProtocolFiles([])
                },
            }
        )
    }

    const chooseView = (id: View) => {
        setView(id)

        if (id === 'protocols' && !hasAskedForProtocols.current) {
            listProtocols()
        }
    }

    const changeProtocolFiles = (
        change: (files: ProtocolFile[]) => ProtocolFile[]
    ) => setProtocolFiles((previous) => change(previous ?? []))

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
                            onClick={() => chooseView(id)}
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
                    <ProtocolsView
                        files={protocolFiles}
                        listingError={listingError}
                        onFilesChange={changeProtocolFiles}
                    />
                </div>
            )}
        </main>
    )
}

export default App

type View = 'session' | 'protocols'

interface ListedProtocolFile {
    fileName: string
    protocol: { name?: unknown; devices?: unknown }
}

function protocolFileFrom(listed: ListedProtocolFile): ProtocolFile {
    const { fileName, protocol } = listed
    const name = typeof protocol.name === 'string' ? protocol.name : ''

    return { fileName, protocol: { name, devices: devicesFrom(protocol) } }
}

function devicesFrom(protocol: { devices?: unknown }): SelectedDevice[] {
    if (!Array.isArray(protocol.devices)) {
        return []
    }

    return protocol.devices
        .filter((device) => typeof device?.deviceName === 'string')
        .map(({ deviceName, identifier, nickname }) => ({
            name: selectedNameOf(deviceName),
            identifier: textOr(identifier),
            nickname: textOr(nickname),
        }))
}

function textOr(value: unknown) {
    return typeof value === 'string' ? value : ''
}

function tabIdOf(view: View) {
    return `app-tab-${view}`
}

function panelIdOf(view: View) {
    return `app-panel-${view}`
}
