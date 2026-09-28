export default class FakeFrameScheduler {
    public static pending: (() => void)[] = []

    public static schedule(callback: () => void) {
        FakeFrameScheduler.pending.push(callback)
    }

    public static runFrame() {
        const frames = this.pending
        this.pending = []
        frames.forEach((frame) => frame())
    }

    public static resetTestDouble() {
        this.pending = []
    }
}
