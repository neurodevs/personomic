import buildXdfFile, { XdfTestChunk } from '../testDoubles/Xdf/buildXdfFile'
import simulatedMuseStreams, {
    SimulatedStream,
    simulatedMuse,
    simulatedMuseModel,
} from './simulatedMuse'

const fileName = 'sample-muse-session.xdf'
const durationSeconds = 60
const firstTimestamp = 1000
const maxSamplesCountedInOneByte = 255

export default function sampleRecording() {
    const xdf = buildXdfFile(
        simulatedMuseStreams.map((stream) => {
            const { type, channelNames, sampleRateHz } = stream

            return {
                name: `${simulatedMuseModel} ${type} (${simulatedMuse.bleName})`,
                type,
                sourceId: `muse-${type.toLowerCase()}-${simulatedMuse.uuid}`,
                channelNames,
                sampleRateHz,
                chunks: chunksOf(stream),
            }
        })
    )

    return new File([xdf], fileName)
}

function chunksOf(stream: SimulatedStream): XdfTestChunk[] {
    const { sampleRateHz, sampleAt } = stream
    const numSamples = durationSeconds * sampleRateHz
    const numChunks = Math.ceil(numSamples / maxSamplesCountedInOneByte)

    return Array.from({ length: numChunks }, (_, chunk) => {
        const first = chunk * maxSamplesCountedInOneByte
        const indexes = Array.from(
            {
                length: Math.min(
                    maxSamplesCountedInOneByte,
                    numSamples - first
                ),
            },
            (_, i) => first + i
        )

        return {
            samples: indexes.map(sampleAt),
            timestamps: indexes.map(
                (index) => firstTimestamp + index / sampleRateHz
            ),
        }
    })
}
