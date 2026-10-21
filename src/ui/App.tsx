import React, { useEffect, useState } from 'react'

import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../functions/sendToOrchestrator'
import { Downsampling } from './components/StreamPlot'
import { SelectedDevice, selectedNameOf } from './hooks/useBiosensorChoices'
import useWarningBeforeLeaving from './hooks/useWarningBeforeLeaving'
import ProtocolsView, {
    hasUnsavedChanges,
    ProtocolFile,
} from './views/ProtocolsView'
import SessionView from './views/SessionView'

const viewLabels: Record<View, string> = {
    session: 'Session',
    protocols: 'Protocols',
    demo: 'Demo',
}

const allViews = Object.keys(viewLabels) as View[]

export interface AppProps {
    downsampling?: Downsampling
    isDemo?: boolean
}

const App: React.FC<AppProps> = (props: AppProps) => {
    const { downsampling, isDemo = false } = props

    const views = isDemo ? allViews.filter((id) => id !== 'demo') : allViews

    const [view, setView] = useState<View>('session')
    const [protocolFiles, setProtocolFiles] = useState<ProtocolFile[]>()
    const [listingError, setListingError] = useState<string>()

    useEffect(() => {
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
    }, [])

    const hasUnsavedProtocols = (protocolFiles ?? []).some(hasUnsavedChanges)

    useWarningBeforeLeaving(hasUnsavedProtocols)

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
                <SessionView
                    downsampling={downsampling}
                    protocolFiles={protocolFiles}
                    onProtocolFilesChange={changeProtocolFiles}
                />
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
            {view === 'demo' && (
                <div
                    role="tabpanel"
                    id={panelIdOf('demo')}
                    aria-labelledby={tabIdOf('demo')}
                >
                    <iframe
                        className="app__demo"
                        title="Personomic demo"
                        src="/demo.html"
                    />
                </div>
            )}
        </main>
    )
}

export default App

type View = 'session' | 'protocols' | 'demo'

interface ListedProtocolFile {
    fileName: string
    protocol: { name?: unknown; devices?: unknown }
}

function protocolFileFrom(listed: ListedProtocolFile): ProtocolFile {
    const { fileName, protocol } = listed
    const name = typeof protocol.name === 'string' ? protocol.name : ''

    const read = { name, devices: devicesFrom(protocol) }

    return { fileName, protocol: read, savedProtocol: read }
}

function devicesFrom(protocol: { devices?: unknown }): SelectedDevice[] {
    if (!Array.isArray(protocol.devices)) {
        return []
    }

    return protocol.devices
        .filter((device) => typeof device?.deviceName === 'string')
        .map(({ deviceName, identifier, nickname, disableStreams }) => ({
            name: selectedNameOf(deviceName),
            identifier: textOr(identifier),
            nickname: textOr(nickname),
            disabledStreams: textsIn(disableStreams),
        }))
}

function textOr(value: unknown) {
    return typeof value === 'string' ? value : ''
}

function textsIn(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : []
}

function tabIdOf(view: View) {
    return `app-tab-${view}`
}

function panelIdOf(view: View) {
    return `app-panel-${view}`
}
