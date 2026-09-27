import generateId from '@neurodevs/generate-id'

export default class FakeWebSocket {
    public static instances: FakeWebSocket[] = []
    public static callsToConstructor: (string | undefined)[] = []
    public static callsToSend: { id: string; data: unknown }[] = []
    public static numCallsToClose = 0

    public readyState: number = WebSocket.OPEN
    public id = generateId()
    public onmessage?: (event: { data: string }) => void

    public constructor(url?: string) {
        FakeWebSocket.callsToConstructor.push(url)
        FakeWebSocket.instances.push(this)
    }

    public receive(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) })
    }

    public send(data: unknown) {
        FakeWebSocket.callsToSend.push({ id: this.id, data })
    }

    public close() {
        FakeWebSocket.numCallsToClose++
        this.readyState = WebSocket.CLOSED
    }

    public static resetTestDouble() {
        this.instances = []
        this.callsToConstructor = []
        this.callsToSend = []
        this.numCallsToClose = 0
    }
}
