export default class FakeSpeaker {
    public static calls: string[] = []
    public static spoken: string[] = []
    public static spokenVoices: string[] = []
    public static availableVoices: string[] = []
    public static onlineVoices: string[] = []

    private static onEnd?: () => void
    private static voicesListener?: () => void

    public static speak(text: string, voice: string, onEnd: () => void) {
        this.calls.push('speak')
        this.spoken.push(text)
        this.spokenVoices.push(voice)
        this.onEnd = onEnd
    }

    public static cancel() {
        this.calls.push('cancel')
        this.finish()
    }

    public static voices() {
        return [
            ...this.availableVoices.map((name) => ({
                name,
                isDownloaded: true,
            })),
            ...this.onlineVoices.map((name) => ({
                name,
                isDownloaded: false,
            })),
        ]
    }

    public static onVoicesChanged(listener: () => void) {
        this.voicesListener = listener

        return () => {
            if (this.voicesListener === listener) {
                this.voicesListener = undefined
            }
        }
    }

    public static finish() {
        const onEnd = this.onEnd
        this.onEnd = undefined
        onEnd?.()
    }

    public static loadVoices(names: string[]) {
        this.availableVoices = names
        this.voicesListener?.()
    }

    public static resetTestDouble() {
        this.calls = []
        this.spoken = []
        this.spokenVoices = []
        this.availableVoices = []
        this.onlineVoices = []
        this.onEnd = undefined
        this.voicesListener = undefined
    }
}
