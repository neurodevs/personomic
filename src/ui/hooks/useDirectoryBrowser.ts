import { useState } from 'react'

import sendToOrchestrator, {
    orchestratorUnreachableMessage,
} from '../../functions/sendToOrchestrator'

export default function useDirectoryBrowser(
    onChosen: (directory: string) => void,
    onError: (error?: string) => void
) {
    const [isBrowsing, setIsBrowsing] = useState(false)

    const browse = () => {
        setIsBrowsing(true)
        onError(undefined)

        sendToOrchestrator<{ directory?: string }>(
            { command: 'chooseDirectory' },
            {
                onReply: ({ error, directory }) => {
                    setIsBrowsing(false)
                    onError(error)

                    if (directory) {
                        onChosen(directory)
                    }
                },
                onUnreachable: () => {
                    setIsBrowsing(false)
                    onError(orchestratorUnreachableMessage)
                },
            }
        )
    }

    return { isBrowsing, browse }
}
