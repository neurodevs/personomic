export default class FakeResizeObserver {
    public static instances: FakeResizeObserver[] = []

    public observed: Element[] = []
    public isDisconnected = false

    private callback: ResizeObserverCallback

    public constructor(callback: ResizeObserverCallback) {
        this.callback = callback
        FakeResizeObserver.instances.push(this)
    }

    public observe(element: Element) {
        this.observed.push(element)
    }

    public unobserve() {}

    public disconnect() {
        this.isDisconnected = true
    }

    public resize(width: number) {
        this.callback(
            [{ contentRect: { width } } as ResizeObserverEntry],
            this as unknown as ResizeObserver
        )
    }

    public static get latest() {
        return this.instances[this.instances.length - 1]
    }

    public static resetTestDouble() {
        this.instances = []
    }
}
