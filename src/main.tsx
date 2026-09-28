import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './ui/App'

clearReactDevPerformanceTimelineEverySecond()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
)

function clearReactDevPerformanceTimelineEverySecond() {
    if (import.meta.env.DEV) {
        setInterval(() => performance.clearMeasures(), 1000)
    }
}
