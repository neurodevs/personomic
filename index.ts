import { registerRootComponent } from 'expo'

import App from './src/ui/App'

clearReactDevPerformanceTimelineEverySecond()

registerRootComponent(App)

function clearReactDevPerformanceTimelineEverySecond() {
    if (__DEV__ && typeof performance.clearMeasures === 'function') {
        setInterval(() => performance.clearMeasures(), 1000)
    }
}
