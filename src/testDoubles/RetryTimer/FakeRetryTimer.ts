export default class FakeRetryTimer {
    public static pending: {
        id: number
        callback: () => void
        delayMs: number
    }[] = []
    public static delaysMs: number[] = []
    public static numCallsToClear = 0

    private static nextId = 1

    public static set(callback: () => void, delayMs: number) {
        const id = this.nextId++
        this.pending.push({ id, callback, delayMs })
        this.delaysMs.push(delayMs)
        return id
    }

    public static clear(id: number) {
        this.numCallsToClear++
        this.pending = this.pending.filter((timer) => timer.id !== id)
    }

    public static runPending() {
        const timers = this.pending
        this.pending = []
        timers.forEach((timer) => timer.callback())
    }

    public static resetTestDouble() {
        this.pending = []
        this.delaysMs = []
        this.numCallsToClear = 0
    }
}
