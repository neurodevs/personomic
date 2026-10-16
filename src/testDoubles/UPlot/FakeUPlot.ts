import type uPlot from 'uplot'

export default class FakeUPlot {
    public static instances: FakeUPlot[] = []
    public static pxRatio = 1
    public static overRect = { left: 0, top: 0, width: 100, height: 50 }

    public options: uPlot.Options
    public data: uPlot.AlignedData
    public target: HTMLElement
    public scales: Record<string, uPlot.Scale> = {}
    public isDestroyed = false
    public size?: { width: number; height: number }
    public over: HTMLElement
    public numRedraws = 0

    public constructor(
        options: uPlot.Options,
        data: uPlot.AlignedData,
        target: HTMLElement
    ) {
        this.options = options
        this.data = data
        this.target = target
        this.over = this.createOver()
        FakeUPlot.instances.push(this)
    }

    private createOver() {
        const over = document.createElement('div')
        over.className = 'u-over'

        over.getBoundingClientRect = () => {
            const { left, top, width, height } = FakeUPlot.overRect
            return {
                left,
                top,
                width,
                height,
                right: left + width,
                bottom: top + height,
            } as DOMRect
        }

        this.target.appendChild(over)
        return over
    }

    public posToVal(pos: number, scaleKey: string) {
        const { min = 0, max = 0 } = this.scales[scaleKey] ?? {}
        return min + ((max - min) * pos) / FakeUPlot.overRect.width
    }

    public redraw() {
        this.numRedraws++
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
        this.overRect = { left: 0, top: 0, width: 100, height: 50 }
    }
}
