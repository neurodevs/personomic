import PpgPeakDetector, {
    PpgDetectorOptions,
    PpgPeakDetectorResults,
} from '@neurodevs/node-biosignal-processing/build/impl/PpgPeakDetector.js'

export default class FakePpgDetector extends PpgPeakDetector {
    public static callsToConstructor: PpgDetectorOptions[] = []
    public static callsToRun: { rawSignal: number[]; timestamps: number[] }[] =
        []
    public static peakTimestamps: number[] = []

    public constructor(options: PpgDetectorOptions) {
        super(options)
        FakePpgDetector.callsToConstructor.push(options)
    }

    public run(
        rawSignal: readonly number[],
        timestamps: readonly number[]
    ): PpgPeakDetectorResults {
        FakePpgDetector.callsToRun.push({
            rawSignal: [...rawSignal],
            timestamps: [...timestamps],
        })

        return {
            rawSignal: [...rawSignal],
            filteredSignal: [],
            timestamps: [...timestamps],
            upperAnalyticSignal: [],
            upperEnvelope: [],
            lowerAnalyticSignal: [],
            lowerEnvelope: [],
            thresholdedSignal: [],
            nonZeroSegments: [],
            peaks: FakePpgDetector.peakTimestamps.map((timestamp) => ({
                timestamp,
                value: 0,
            })),
        }
    }

    public static resetTestDouble() {
        this.callsToConstructor = []
        this.callsToRun = []
        this.peakTimestamps = []
    }
}
