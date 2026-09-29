import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'uplot/dist/uPlot.min.css'
import './ui/styles.css'

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
