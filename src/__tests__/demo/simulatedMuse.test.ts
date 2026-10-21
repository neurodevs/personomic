import { test, assert } from '@neurodevs/node-tdd'

import simulatedMuseStreams, { SimulatedStream } from '../../demo/simulatedMuse'
import AbstractPackageTest from '../AbstractPackageTest'

export default class SimulatedMuseTest extends AbstractPackageTest {
    @test()
    protected static async simulatesTheStreamsOfAMuseSGen2() {
        assert.isEqualDeep(
            simulatedMuseStreams.map(({ type, channelNames, sampleRateHz }) => [
                type,
                channelNames,
                sampleRateHz,
            ]),
            [
                [
                    'EEG',
                    ['EEG_TP10', 'EEG_AF8', 'EEG_TP9', 'EEG_AF7', 'EEG_AUX'],
                    256,
                ],
                ['PPG', ['PPG_AMBIENT', 'PPG_INFRARED', 'PPG_RED'], 64],
                ['ACCEL', ['X', 'Y', 'Z'], 52],
                ['GYRO', ['X', 'Y', 'Z'], 52],
            ],
            'Did not simulate the streams of a Muse S Gen 2!'
        )
    }

    @test()
    protected static async givesOneValuePerChannelForEachSample() {
        simulatedMuseStreams.forEach(({ type, channelNames, sampleAt }) => {
            assert.isEqual(
                sampleAt(100).length,
                channelNames.length,
                `Did not give one value per channel for each ${type} sample!`
            )
        })
    }

    @test()
    protected static async givesTheSameSampleEachTimeItIsAsked() {
        simulatedMuseStreams.forEach(({ type, sampleAt }) => {
            assert.isEqualDeep(
                sampleAt(1234),
                sampleAt(1234),
                `Gave a different ${type} sample when asked again!`
            )
        })
    }

    @test()
    protected static async repeatsEveryTenSecondsSoLoopsAreSeamless() {
        simulatedMuseStreams.forEach(({ type, sampleRateHz, sampleAt }) => {
            const samplesPerLoop = 10 * sampleRateHz

            for (const index of [0, 1, 777]) {
                const looped = sampleAt(index + samplesPerLoop)

                sampleAt(index).forEach((value, channel) => {
                    assert.isBelow(
                        Math.abs(looped[channel] - value),
                        1e-6,
                        `Did not repeat ${type} every ten seconds!`
                    )
                })
            }
        })
    }

    @test()
    protected static async variesFromSampleToSample() {
        simulatedMuseStreams.forEach(({ type, sampleAt }) => {
            assert.isFalse(
                sampleAt(10)[0] === sampleAt(11)[0],
                `Did not vary from ${type} sample to sample!`
            )
        })
    }

    @test()
    protected static async beatsAboutOnceASecondInInfraredPpg() {
        const numBeats = this.numPeaksPerMinuteIn(this.streamOf('PPG'), 1)

        assert.isTrue(
            numBeats >= 60 && numBeats <= 72,
            `Beat ${numBeats} times a minute instead of about once a second!`
        )
    }

    @test()
    protected static async peaksOnlyOnceEachBeatInInfraredPpg() {
        const numPeaks = this.numPeaksPerMinuteIn(this.streamOf('PPG'), 1, 0.3)

        assert.isTrue(
            numPeaks >= 60 && numPeaks <= 72,
            `Peaked ${numPeaks} times a minute instead of once each beat!`
        )
    }

    @test()
    protected static async feelsGravityOnTheAccelerometerZAxis() {
        const [, , z] = this.streamOf('ACCEL').sampleAt(500)

        assert.isTrue(
            Math.abs(z - 1) < 0.1,
            `Felt ${z} g on the Z axis instead of about 1 g!`
        )
    }

    private static streamOf(type: string) {
        return simulatedMuseStreams.find((stream) => stream.type === type)!
    }

    private static numPeaksPerMinuteIn(
        stream: SimulatedStream,
        channel: number,
        fractionOfRange = 0.8
    ) {
        const values = Array.from(
            { length: stream.sampleRateHz * 60 },
            (_, index) => stream.sampleAt(index)[channel]
        )
        const low = Math.min(...values)
        const threshold = low + (Math.max(...values) - low) * fractionOfRange

        return values.filter(
            (value, i) =>
                value > threshold &&
                value > values[i - 1] &&
                value >= values[i + 1]
        ).length
    }
}
