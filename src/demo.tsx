import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'uplot/dist/uPlot.min.css'
import './ui/styles.css'

import DemoWebSocket from './demo/DemoWebSocket'
import TourPlayer, { TourBackend } from './demo/TourPlayer'
import tours from './demo/tours'
import App from './ui/App'
import { setWebSocketComponent } from './ui/components/StreamMonitor'

const realisticLatencyMs = DemoWebSocket.latencyMs

setWebSocketComponent(DemoWebSocket as unknown as typeof WebSocket)
const demoStorage = keepTheAppsStorageOutOfTheDemo()

const demoBackend: TourBackend = {
    reset: () => {
        DemoWebSocket.reset()
        demoStorage.clear()
    },
    setIsInstant: (isInstant) => {
        DemoWebSocket.latencyMs = isInstant ? 0 : realisticLatencyMs
    },
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <TourPlayer tours={tours} backend={demoBackend}>
            <App isDemo />
        </TourPlayer>
    </StrictMode>
)

function keepTheAppsStorageOutOfTheDemo() {
    const items = new Map<string, string>()

    const storage: Storage = {
        get length() {
            return items.size
        },
        key: (index) => [...items.keys()][index] ?? null,
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => void items.set(key, String(value)),
        removeItem: (key) => void items.delete(key),
        clear: () => items.clear(),
    }

    Object.defineProperty(window, 'localStorage', { value: storage })

    return storage
}
