import type uPlot from 'uplot'

export default class FakeUPlot {
    public static instances: FakeUPlot[] = []
    public static pxRatio = 1

    public options: uPlot.Options
    public data: uPlot.AlignedData
    public target: HTMLElement
    public scales: Record<string, uPlot.Scale> = {}
    public isDestroyed = false
    public size?: { width: number; height: number }

    public constructor(
        options: uPlot.Options,
        data: uPlot.AlignedData,
        target: HTMLElement
    ) {
        this.options = options
        this.data = data
        this.target = target
        FakeUPlot.instances.push(this)
    }

    public setData(data: uPlot.AlignedData) {
        this.data = data
    }

    public setScale(key: string, limits: uPlot.Scale) {
        this.scales[key] = limits
    }

    public setSize(size: { width: number; height: number }) {
        this.size = size
    }

    public batch(callback: () => void) {
        callback()
    }

    public destroy() {
        this.isDestroyed = true
    }

    public static get latest() {
        return this.instances[this.instances.length - 1]
    }

    public static resetTestDouble() {
        this.instances = []
    }
}
