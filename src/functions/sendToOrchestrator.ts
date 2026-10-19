import { WebSocketComponent } from '../ui/components/StreamMonitor'

const orchestratorPort = 8763

export const orchestratorUnreachableMessage =
    'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.'

export default function sendToOrchestrator<Reply>(
    message: object,
    handlers: OrchestratorReplyHandlers<Reply>
) {
    const { onReply, onUnreachable } = handlers

    const socket = new WebSocketComponent(`ws://localhost:${orchestratorPort}`)
    let hasReplied = false

    socket.onopen = () => socket.send(JSON.stringify(message))

    socket.onmessage = (event) => {
        hasReplied = true
        onReply(JSON.parse(event.data))
        socket.close()
    }

    socket.onclose = () => {
        if (!hasReplied) {
            onUnreachable()
        }
    }
}

export interface OrchestratorReplyHandlers<Reply> {
    onReply: (reply: Reply & { error?: string }) => void
    onUnreachable: () => void
}
