import { test, assert } from '@neurodevs/node-tdd'

import readXdfRecording from '../../functions/readXdfRecording'
import buildXdfFile, { XdfTestStream } from '../../testDoubles/Xdf/buildXdfFile'
import AbstractPackageTest from '../AbstractPackageTest'

export default class ReadXdfRecordingTest extends AbstractPackageTest {
    private static readonly oneSample = [{ samples: [[1]], timestamps: [10] }]

    @test()
    protected static async throwsWhenFileIsNotXdf() {
        const notXdf = new Uint8Array([1, 2, 3, 4, 5, 6]).buffer

        assert.doesThrow(
            () => readXdfRecording(notXdf),
            'It is not an XDF file.'
        )
    }

    @test()
    protected static async readsTypeChannelNamesAndSampleRateOfStream() {
        const [stream] = this.streamsReadFrom([
            {
                type: 'EEG',
                channelNames: ['EEG_TP9', 'EEG_AF7'],
                sampleRateHz: 256,
                chunks: [{ samples: [[1, 2]], timestamps: [10] }],
            },
        ])

        assert.isEqualDeep(
            {
                type: stream.type,
                channelNames: stream.channelNames,
                sampleRateHz: stream.sampleRateHz,
            },
            {
                type: 'EEG',
                channelNames: ['EEG_TP9', 'EEG_AF7'],
                sampleRateHz: 256,
            },
            'Did not read type, channel names and sample rate of stream!'
        )
    }

    @test()
    protected static async readsSamplesOfEveryChunkInOrderWithTimestamps() {
        const [stream] = this.streamsReadFrom([
            {
                channelNames: ['A', 'B'],
                chunks: [
                    {
                        samples: [
                            [1, 2],
                            [3, 4],
                        ],
                        timestamps: [10, 10.5],
                    },
                    { samples: [[5, 6]], timestamps: [11] },
                ],
            },
        ])

        assert.isEqualDeep(
            { samples: stream.samples, timestamps: stream.timestamps },
            { samples: [1, 2, 3, 4, 5, 6], timestamps: [10, 10.5, 11] },
            'Did not read samples of every chunk in order with timestamps!'
        )
    }

    @test()
    protected static async continuesAtSampleRateWhereTimestampIsLeftOut() {
        const [stream] = this.streamsReadFrom([
            {
                channelNames: ['A'],
                sampleRateHz: 4,
                chunks: [
                    {
                        samples: [[1], [2], [3]],
                        timestamps: [10, undefined, undefined],
                    },
                ],
            },
        ])

        assert.isEqualDeep(
            stream.timestamps,
            [10, 10.25, 10.5],
            'Did not continue at sample rate where timestamp was left out!'
        )
    }

    @test()
    protected static async keepsSamplesOfInterleavedStreamsApart() {
        const file = buildXdfFile([
            { sourceId: 'a', channelNames: ['A'], chunks: this.oneSample },
            {
                sourceId: 'b',
                channelNames: ['B'],
                chunks: [{ samples: [[2]], timestamps: [20] }],
            },
        ])

        assert.isEqualDeep(
            readXdfRecording(file).devices.map(
                (device) => device.streams[0].samples
            ),
            [[1], [2]],
            'Did not keep samples of interleaved streams apart!'
        )
    }

    @test()
    protected static async readsEveryNumericChannelFormat() {
        const formats = [
            'float32',
            'double64',
            'int8',
            'int16',
            'int32',
            'int64',
        ]

        const streams = this.streamsReadFrom(
            formats.map((channelFormat) => ({
                channelFormat,
                channelNames: ['A', 'B'],
                chunks: [{ samples: [[-3, 7]], timestamps: [10] }],
            }))
        )

        assert.isEqualDeep(
            streams.map((stream) => stream.samples),
            formats.map(() => [-3, 7]),
            'Did not read every numeric channel format!'
        )
    }

    @test()
    protected static async leavesOutStreamsItCannotReadSamplesOf() {
        const streams = this.streamsReadFrom([
            {
                channelFormat: 'string',
                channelNames: ['Marker'],
                chunks: this.oneSample,
            },
        ])

        assert.isEqualDeep(
            streams,
            [],
            'Did not leave out streams it cannot read samples of!'
        )
    }

    @test()
    protected static async leavesOutStreamsWithoutSamples() {
        const streams = this.streamsReadFrom([
            { type: 'EEG', channelNames: ['A'] },
            { type: 'PPG', channelNames: ['B'], chunks: this.oneSample },
        ])

        assert.isEqualDeep(
            streams.map((stream) => stream.type),
            ['PPG'],
            'Did not leave out streams without samples!'
        )
    }

    @test()
    protected static async numbersChannelsWhenTheirLabelsAreMissing() {
        const [stream] = this.streamsReadFrom([
            {
                type: 'EEG',
                channelCount: 2,
                chunks: [{ samples: [[1, 2]], timestamps: [10] }],
            },
        ])

        assert.isEqualDeep(
            stream.channelNames,
            ['EEG_1', 'EEG_2'],
            'Did not number channels when their labels were missing!'
        )
    }

    @test()
    protected static async readsUpToWhereRecordingWasCutShort() {
        const whole = buildXdfFile([
            {
                channelNames: ['A'],
                chunks: [
                    { samples: [[1]], timestamps: [10] },
                    { samples: [[2]], timestamps: [11] },
                ],
            },
        ])
        const cutShort = whole.slice(0, whole.byteLength - 3)

        assert.isEqualDeep(
            readXdfRecording(cutShort).devices[0].streams[0].samples,
            [1],
            'Did not read up to where recording was cut short!'
        )
    }

    @test()
    protected static async groupsStreamsOfEachMuseIntoItsOwnDevice() {
        const devices = this.devicesReadFrom([
            'muse-eeg-Device-1',
            'muse-eeg-Device-2',
            'muse-ppg-Device-1',
        ])

        assert.isEqualDeep(
            devices,
            [
                { deviceName: 'Muse', numStreams: 2 },
                { deviceName: 'Muse', numStreams: 1 },
            ],
            'Did not group streams of each Muse into its own device!'
        )
    }

    @test()
    protected static async readsNicknameOfEachDevice() {
        const nicknames = this.nicknamesReadFrom([
            { sourceId: 'muse-eeg-Device-1', nickname: 'Alice' },
            { sourceId: 'muse-eeg-Device-2', nickname: 'Bob' },
        ])

        assert.isEqualDeep(
            nicknames,
            ['Alice', 'Bob'],
            'Did not read nickname of each device!'
        )
    }

    @test()
    protected static async readsDescOfEachStream() {
        const [stream] = this.streamsReadFrom([
            {
                nickname: 'José & <Ana>',
                channelNames: ['A'],
                chunks: this.oneSample,
            },
        ])

        assert.isEqualDeep(
            stream.desc,
            [
                {
                    name: 'channels',
                    children: [
                        {
                            name: 'channel',
                            children: [
                                { name: 'label', value: 'A' },
                                { name: 'type', value: 'ignored' },
                            ],
                        },
                    ],
                },
                { name: 'nickname', value: 'José & <Ana>' },
            ],
            'Did not read desc of each stream!'
        )
    }

    @test()
    protected static async readsIndentedDescAsLabRecorderWritesIt() {
        const [stream] = this.streamsReadFrom([
            {
                descXml:
                    '\n\t\t<channels>\n\t\t\t<channel>\n\t\t\t\t<label>A</label>\n\t\t\t</channel>\n\t\t</channels>\n\t\t<empty />\n\t',
                channelNames: ['A'],
                chunks: this.oneSample,
            },
        ])

        assert.isEqualDeep(
            stream.desc,
            [
                {
                    name: 'channels',
                    children: [
                        {
                            name: 'channel',
                            children: [{ name: 'label', value: 'A' }],
                        },
                    ],
                },
                { name: 'empty', value: '' },
            ],
            'Did not read indented desc as LabRecorder writes it!'
        )
    }

    @test()
    protected static async readsFileHeaderInfo() {
        const file = buildXdfFile(
            [{ channelNames: ['A'], chunks: this.oneSample }],
            '\n  <version>1.0</version>\n  <datetime>2026-10-28T22:00:00</datetime>\n    <protocol>{&quot;a&quot;:1}</protocol>\n  '
        )

        assert.isEqualDeep(
            readXdfRecording(file).header,
            [
                { name: 'version', value: '1.0' },
                { name: 'datetime', value: '2026-10-28T22:00:00' },
                { name: 'protocol', value: '{"a":1}' },
            ],
            'Did not read the file header info!'
        )
    }

    @test()
    protected static async leavesHeaderOutWhenFileHasNone() {
        const file = buildXdfFile([
            { channelNames: ['A'], chunks: this.oneSample },
        ])

        assert.isFalse(
            'header' in readXdfRecording(file),
            'Should have left the header out!'
        )
    }

    @test()
    protected static async readsEveryChunkOfFileInOrder() {
        const file = buildXdfFile(
            [
                {
                    channelNames: ['A'],
                    chunks: this.oneSample,
                    clockOffsets: [[5, -0.25]],
                    hasBoundaryAfter: true,
                    footerInfoXml: '<sample_count>1</sample_count>',
                },
            ],
            '<version>1.0</version>'
        )

        assert.isEqualDeep(
            readXdfRecording(file).chunks?.map(({ name, attributes }) => ({
                name,
                attributes,
            })),
            [
                { name: 'FileHeader', attributes: undefined },
                { name: 'StreamHeader', attributes: { StreamId: '1' } },
                {
                    name: 'Samples',
                    attributes: { StreamId: '1', NumSamples: '1' },
                },
                { name: 'ClockOffset', attributes: { StreamId: '1' } },
                { name: 'Boundary', attributes: undefined },
                { name: 'StreamFooter', attributes: { StreamId: '1' } },
            ],
            'Did not read every chunk of file in order!'
        )
    }

    @test()
    protected static async readsXmlOfHeaderChunksAsTree() {
        const file = buildXdfFile(
            [],
            '<version>1.0</version><a x="1"><b>2</b></a>'
        )

        assert.isEqualDeep(
            readXdfRecording(file).chunks?.[0].children,
            [
                {
                    name: 'info',
                    children: [
                        { name: 'version', text: '1.0' },
                        {
                            name: 'a',
                            attributes: { x: '1' },
                            children: [{ name: 'b', text: '2' }],
                        },
                    ],
                },
            ],
            'Did not read XML of header chunks as tree!'
        )
    }

    @test()
    protected static async readsSamplesOfDataChunkOnlyWhenLoaded() {
        const file = buildXdfFile([
            {
                channelNames: ['A', 'B'],
                sampleRateHz: 2,
                chunks: [
                    {
                        samples: [
                            [1, 2],
                            [3, 4],
                        ],
                        timestamps: [10, undefined],
                    },
                ],
            },
        ])

        const samplesChunk = readXdfRecording(file).chunks?.[1]

        assert.isEqualDeep(
            {
                children: samplesChunk?.children,
                loaded: samplesChunk?.loadChildren?.(),
            },
            {
                children: undefined,
                loaded: [
                    {
                        name: 'sample',
                        attributes: { timestamp: '10' },
                        text: '1 2',
                    },
                    { name: 'sample', text: '3 4' },
                ],
            },
            'Did not read samples of data chunk only when loaded!'
        )
    }

    @test()
    protected static async loadsDataChunksWithoutKeepingFileBytes() {
        const file = buildXdfFile([
            {
                channelNames: ['A', 'B'],
                sampleRateHz: 2,
                chunks: [
                    { samples: [[1, 2]], timestamps: [10] },
                    {
                        samples: [
                            [3, 4],
                            [5, 6],
                        ],
                        timestamps: [undefined, 11],
                    },
                ],
                clockOffsets: [[5, -0.25]],
            },
        ])

        const { chunks = [] } = readXdfRecording(file)
        file.transfer()

        assert.isEqualDeep(
            chunks.slice(2).map((chunk) => chunk.loadChildren?.()),
            [
                [
                    { name: 'sample', text: '3 4' },
                    {
                        name: 'sample',
                        attributes: { timestamp: '11' },
                        text: '5 6',
                    },
                ],
                [
                    { name: 'CollectionTime', text: '5' },
                    { name: 'OffsetValue', text: '-0.25' },
                ],
            ],
            'Did not load data chunks without keeping file bytes!'
        )
    }

    @test()
    protected static async readsClockOffsetOnlyWhenLoaded() {
        const file = buildXdfFile([
            { channelNames: ['A'], clockOffsets: [[5, -0.25]] },
        ])

        const clockOffset = readXdfRecording(file).chunks?.[1]

        assert.isEqualDeep(
            clockOffset?.loadChildren?.(),
            [
                { name: 'CollectionTime', text: '5' },
                { name: 'OffsetValue', text: '-0.25' },
            ],
            'Did not read clock offset only when loaded!'
        )
    }

    @test()
    protected static async leavesNicknameOutWhenNoneWasRecorded() {
        const nicknames = this.nicknamesReadFrom([
            { sourceId: 'muse-eeg-Device-1' },
        ])

        assert.isEqualDeep(
            nicknames,
            [undefined],
            'Read a nickname that was not recorded!'
        )
    }

    @test()
    protected static async readsNicknameWithEscapedAndAccentedCharacters() {
        const nicknames = this.nicknamesReadFrom([
            { sourceId: 'muse-eeg-Device-1', nickname: 'José & <Ana>' },
        ])

        assert.isEqualDeep(
            nicknames,
            ['José & <Ana>'],
            'Did not read nickname with escaped and accented characters!'
        )
    }

    @test()
    protected static async namesMuseWithImuStreamAthena() {
        this.assertNamesDevice(
            ['muse-eeg-F57439', 'muse-imu-F57439'],
            'Muse S Athena'
        )
    }

    @test()
    protected static async namesMuseWithOpticsStreamAthena() {
        this.assertNamesDevice(['muse-optics-F57439'], 'Muse S Athena')
    }

    @test()
    protected static async namesMuseAfterModelInItsStreamNames() {
        this.assertNamesMuse(
            ['Muse S Gen 2 EEG (F57439)', 'Muse S Gen 2 PPG (F57439)'],
            'Muse S Gen 2'
        )
    }

    @test()
    protected static async namesMuseWhoseModelEndsInNumber() {
        this.assertNamesMuse(['Muse 2 Accelerometer (F57439)'], 'Muse 2')
    }

    @test()
    protected static async namesMuseWithFallbackIdentifierAfterModel() {
        this.assertNamesMuse(['Muse 1 Gen 2 EEG (Device-1)'], 'Muse 1 Gen 2')
    }

    @test()
    protected static async namesAthenaAfterModelEvenWithoutImuOrOptics() {
        this.assertNamesMuse(['Muse S Athena EEG (F57439)'], 'Muse S Athena')
    }

    @test()
    protected static async namesMuseWithoutModelInStreamNamesMuse() {
        this.assertNamesMuse(['Muse EEG (F57439)'], 'Muse')
    }

    @test()
    protected static async namesAthenaWithoutModelInStreamNamesFromImu() {
        this.assertNamesMuse(
            ['Muse EEG (F57439)', 'Muse IMU (F57439)'],
            'Muse S Athena'
        )
    }

    @test()
    protected static async namesGoveeFromItsSourceIds() {
        this.assertNamesDevice(
            ['govee-temperature', 'govee-humidity', 'govee-battery'],
            'Govee Thermohygrometer H5074'
        )
    }

    @test()
    protected static async namesCytonFromItsSourceIds() {
        this.assertNamesDevice(
            ['cyton-exg-ABC', 'cyton-accelerometer-ABC'],
            'OpenBCI Cyton'
        )
    }

    @test()
    protected static async namesCognionicsFromItsSourceIds() {
        this.assertNamesDevice(['cgx-eeg', 'cgx-accel'], 'Cognionics Quick-20r')
    }

    @test()
    protected static async namesUnknownDeviceAfterItsStream() {
        const file = buildXdfFile([
            {
                name: 'Some Other Amp',
                sourceId: 'other-amp-1',
                channelNames: ['A'],
                chunks: this.oneSample,
            },
        ])

        assert.isEqual(
            readXdfRecording(file).devices[0].deviceName,
            'Some Other Amp',
            'Did not name unknown device after its stream!'
        )
    }

    @test()
    protected static async keepsStreamsWithoutSourceIdAsSeparateDevices() {
        const file = buildXdfFile(
            ['First', 'Second'].map((name) => ({
                name,
                channelNames: ['A'],
                chunks: this.oneSample,
            }))
        )

        assert.isEqualDeep(
            readXdfRecording(file).devices.map((device) => device.deviceName),
            ['First', 'Second'],
            'Did not keep streams without source id as separate devices!'
        )
    }

    private static assertNamesDevice(sourceIds: string[], expected: string) {
        assert.isEqualDeep(
            this.devicesReadFrom(sourceIds),
            [{ deviceName: expected, numStreams: sourceIds.length }],
            `Did not name device ${expected}!`
        )
    }

    private static assertNamesMuse(streamNames: string[], expected: string) {
        const file = buildXdfFile(
            streamNames.map((name) => ({
                name,
                sourceId: `muse-${name.split(' ').at(-2)?.toLowerCase()}-F57439`,
                channelNames: ['A'],
                chunks: this.oneSample,
            }))
        )

        assert.isEqualDeep(
            readXdfRecording(file).devices.map(({ deviceName }) => deviceName),
            [expected],
            `Did not name Muse ${expected}!`
        )
    }

    private static devicesReadFrom(sourceIds: string[]) {
        const file = buildXdfFile(
            sourceIds.map((sourceId) => ({
                sourceId,
                channelNames: ['A'],
                chunks: this.oneSample,
            }))
        )

        return readXdfRecording(file).devices.map((device) => ({
            deviceName: device.deviceName,
            numStreams: device.streams.length,
        }))
    }

    private static nicknamesReadFrom(streams: XdfTestStream[]) {
        const file = buildXdfFile(
            streams.map((stream) => ({
                channelNames: ['A'],
                chunks: this.oneSample,
                ...stream,
            }))
        )

        return readXdfRecording(file).devices.map(({ nickname }) => nickname)
    }

    private static streamsReadFrom(streams: XdfTestStream[]) {
        const separate = streams.map((stream, index) => ({
            sourceId: `source-${index}`,
            ...stream,
        }))

        return readXdfRecording(buildXdfFile(separate)).devices.flatMap(
            (device) => device.streams
        )
    }
}

declare global {
    interface ArrayBuffer {
        transfer(): ArrayBuffer
    }
}
