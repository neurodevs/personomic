import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'uplot/dist/uPlot.min.css'
import './ui/styles.css'

import App from './ui/App'
import { Downsampling } from './ui/components/StreamPlot'

clearReactDevPerformanceTimelineEverySecond()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App downsampling={downsamplingFromEnv()} />
    </StrictMode>
)

function downsamplingFromEnv() {
    const value = import.meta.env.VITE_DOWNSAMPLING

    return ['light', 'medium', 'heavy'].includes(value)
        ? (value as Downsampling)
        : undefined
}

function clearReactDevPerformanceTimelineEverySecond() {
    if (import.meta.env.DEV) {
        setInterval(() => performance.clearMeasures(), 1000)
    }
}
