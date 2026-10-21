import { test, assert } from '@neurodevs/node-tdd'

import sampleRecording from '../../demo/sampleRecording'
import readXdfRecording from '../../functions/readXdfRecording'
import AbstractPackageTest from '../AbstractPackageTest'

export default class SampleRecordingTest extends AbstractPackageTest {
    @test()
    protected static async isNamedAsASampleMuseSession() {
        assert.isEqual(
            sampleRecording().name,
            'sample-muse-session.xdf',
            'Was not named as a sample Muse session!'
        )
    }

    @test()
    protected static async holdsEachStreamOfOneMuseSGen2() {
        const { devices } = await this.read()

        assert.isEqualDeep(
            devices.map(({ deviceName, streams }) => [
                deviceName,
                streams.map(({ type }) => type),
            ]),
            [['Muse S Gen 2', ['EEG', 'PPG', 'ACCEL', 'GYRO']]],
            'Did not hold each stream of one Muse S Gen 2!'
        )
    }

    @test()
    protected static async holdsAMinuteOfEachStream() {
        const { devices } = await this.read()

        assert.isEqualDeep(
            devices[0].streams.map(
                ({ timestamps, sampleRateHz }) =>
                    timestamps.length / sampleRateHz
            ),
            [60, 60, 60, 60],
            'Did not hold a minute of each stream!'
        )
    }

    private static async read() {
        return readXdfRecording(await sampleRecording().arrayBuffer())
    }
}
