import { StreamMonitor } from '@neurodevs/react-biosensors'
import './App.css'

const App: React.FC = () => {

  return (
    <>
      Hello Personomic!
      <StreamMonitor streams={[{ name: 'EEG', wssPort: 8080 }, { name: 'PPG', wssPort: 8081 }]}/>
    </>
  )
}

export default App
