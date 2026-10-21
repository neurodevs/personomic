export const simulatedMuseModel = 'Muse S Gen 2'

export const simulatedMuse = {
    uuid: '5F2B7A1E-9C3D-4E8B-A6F0-2D1C3B4A5E6F',
    bleName: 'MuseS-6A8C',
}

export const simulatedLoopSeconds = 10

const streamsWithinOneLoop: SimulatedStream[] = [
    {
        type: 'EEG',
        channelNames: ['EEG_TP10', 'EEG_AF8', 'EEG_TP9', 'EEG_AF7', 'EEG_AUX'],
        sampleRateHz: 256,
        sampleAt: (index) => {
            const t = index / 256

            return [0, 1, 2, 3, 4].map((channel) =>
                channel === auxChannel
                    ? 4 * noiseAt(index, channel)
                    : brainwavesAt(t, channel) +
                      blinkAt(t, channel) +
                      6 * noiseAt(index, channel)
            )
        },
    },
    {
        type: 'PPG',
        channelNames: ['PPG_AMBIENT', 'PPG_INFRARED', 'PPG_RED'],
        sampleRateHz: 64,
        sampleAt: (index) => {
            const pulse = pulseAt(index / 64)

            return [
                30 + 0.5 * noiseAt(index, 10),
                1000 + 60 * pulse + 0.5 * noiseAt(index, 11),
                600 + 35 * pulse + 0.5 * noiseAt(index, 12),
            ]
        },
    },
    {
        type: 'ACCEL',
        channelNames: ['X', 'Y', 'Z'],
        sampleRateHz: 52,
        sampleAt: (index) => {
            const sway = swayAt(index / 52)

            return [
                0.04 * sway + 0.003 * noiseAt(index, 20),
                -0.02 * sway + 0.003 * noiseAt(index, 21),
                0.99 + 0.003 * noiseAt(index, 22),
            ]
        },
    },
    {
        type: 'GYRO',
        channelNames: ['X', 'Y', 'Z'],
        sampleRateHz: 52,
        sampleAt: (index) => {
            const sway = swayAt(index / 52 + 1.25)

            return [
                1.5 * sway + 0.3 * noiseAt(index, 30),
                -0.8 * sway + 0.3 * noiseAt(index, 31),
                0.3 * noiseAt(index, 32),
            ]
        },
    },
]

const simulatedMuseStreams: SimulatedStream[] = streamsWithinOneLoop.map(
    (stream) => ({
        ...stream,
        sampleAt: (index) =>
            stream.sampleAt(
                index % (simulatedLoopSeconds * stream.sampleRateHz)
            ),
    })
)

export default simulatedMuseStreams

const auxChannel = 4

const frontalChannels = [1, 3]

function brainwavesAt(t: number, channel: number) {
    const phase = channel * 0.7
    const alphaStrength = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.1 * t)

    return (
        14 * alphaStrength * Math.sin(2 * Math.PI * 10 * t + phase) +
        6 * Math.sin(2 * Math.PI * 6 * t + 2 * phase) +
        3 * Math.sin(2 * Math.PI * 21 * t + 3 * phase)
    )
}

function blinkAt(t: number, channel: number) {
    const secondsBetweenBlinks = 5
    const sinceBlink = (t % secondsBetweenBlinks) - 3

    return frontalChannels.includes(channel)
        ? -120 * Math.exp(-((sinceBlink / 0.12) ** 2))
        : 0
}

function pulseAt(t: number) {
    const beatsPerSecond = 1.1
    const breathingVariation = 0.04 * Math.sin(2 * Math.PI * 0.2 * t)
    const beatPhase = (t * beatsPerSecond + breathingVariation) % 1

    const peakPhase = 0.15

    return beatPhase < peakPhase
        ? Math.sin((Math.PI / 2) * (beatPhase / peakPhase)) ** 2
        : Math.exp(-(beatPhase - peakPhase) / 0.18)
}

function swayAt(t: number) {
    return (
        Math.sin(2 * Math.PI * 0.2 * t) + 0.3 * Math.sin(2 * Math.PI * 0.1 * t)
    )
}

function noiseAt(index: number, channel: number) {
    let hash = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b)
    hash ^= Math.imul(channel + 1, 0xc2b2ae35)
    hash ^= hash >>> 13
    hash = Math.imul(hash, 0x27d4eb2d)
    hash ^= hash >>> 15

    return ((hash >>> 0) / 0xffffffff) * 2 - 1
}

export interface SimulatedStream {
    type: string
    channelNames: string[]
    sampleRateHz: number
    sampleAt: (index: number) => number[]
}
