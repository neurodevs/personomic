import { test, assert } from '@neurodevs/node-tdd'

import DemoWebSocket from '../../demo/DemoWebSocket'
import AbstractPackageTest from '../AbstractPackageTest'

export default class DemoWebSocketTest extends AbstractPackageTest {
    private static nowMs: number
    private static sockets: DemoWebSocket[]

    protected static async beforeEach() {
        await super.beforeEach()

        DemoWebSocket.reset()
        DemoWebSocket.latencyMs = 0
        DemoWebSocket.pushIntervalMs = 1
        this.nowMs = 0
        DemoWebSocket.clock = () => this.nowMs
        this.sockets = []
    }

    protected static async afterEach() {
        this.sockets.forEach((socket) => socket.close())
        await super.afterEach()
    }

    @test()
    protected static async opensSoonAfterBeingCreated() {
        const socket = this.socketOn(8763)

        await new Promise<void>((resolve) => (socket.onopen = resolve))

        assert.isEqual(
            socket.readyState,
            WebSocket.OPEN,
            'Did not open soon after being created!'
        )
    }

    @test()
    protected static async listsADemoProtocol() {
        const { protocols } = await this.command({ command: 'listProtocols' })

        assert.isEqualDeep(
            protocols,
            [
                {
                    fileName: 'muse-meditation.json',
                    protocol: {
                        schemaVersion: 1,
                        name: 'Muse meditation',
                        devices: [{ deviceName: 'Muse S Gen 2' }],
                    },
                },
            ],
            'Did not list a demo protocol!'
        )
    }

    @test()
    protected static async reportsNoRunningSessionAtFirst() {
        const reply = await this.command({ command: 'status' })

        assert.isEqualDeep(reply, {}, 'Reported a running session at first!')
    }

    @test()
    protected static async scansANearbyMuse() {
        const { scanned } = await this.command({
            command: 'scan',
            deviceNames: ['Muse S Gen 2'],
        })

        assert.isEqualDeep(
            scanned,
            { 'Muse S Gen 2': [this.scannedMuse] },
            'Did not scan a nearby Muse!'
        )
    }

    @test()
    protected static async scansNothingForOtherBiosensors() {
        const { scanned } = await this.command({
            command: 'scan',
            deviceNames: ['OpenBCI Cyton'],
        })

        assert.isEqualDeep(
            scanned,
            {},
            'Scanned something for a biosensor it does not simulate!'
        )
    }

    @test()
    protected static async startsWithTheRequestedMuseAndRecordPath() {
        const reply = await this.startMuse()

        assert.isEqualDeep(
            reply,
            {
                devices: [this.museRequest],
                xdfRecordPath: this.recordPath,
            },
            'Did not start with the requested Muse and record path!'
        )
    }

    @test()
    protected static async startsAutoDetectedMuseAsMuseSGen2() {
        const { devices } = await this.command({
            command: 'start',
            devices: [{ deviceName: 'Muse' }],
        })

        assert.isEqualDeep(
            devices,
            [{ deviceName: 'Muse S Gen 2' }],
            'Did not start an auto-detected Muse as a Muse S Gen 2!'
        )
    }

    @test()
    protected static async refusesToStartBiosensorsItDoesNotSimulate() {
        const { error } = await this.command({
            command: 'start',
            devices: [{ deviceName: 'OpenBCI Cyton' }],
        })

        assert.isEqual(
            error,
            'The demo only simulates Muse headbands.',
            'Did not refuse to start a biosensor it does not simulate!'
        )
    }

    @test()
    protected static async reportsTheRunningSessionAfterStart() {
        await this.startMuse()

        const reply = await this.command({ command: 'status' })

        assert.isEqualDeep(
            reply,
            { devices: [this.museRequest], xdfRecordPath: this.recordPath },
            'Did not report the running session after start!'
        )
    }

    @test()
    protected static async reportsNoDevicesBeforeStart() {
        const status = await this.nextMessageOn(this.socketOn(8764))

        assert.isEqualDeep(
            status,
            { devices: [] },
            'Reported devices before start!'
        )
    }

    @test()
    protected static async reportsStreamingMuseAfterStart() {
        const statusSocket = this.socketOn(8764)
        await this.nextMessageOn(statusSocket)

        const status = this.nextMessageOn(statusSocket)
        await this.startMuse()

        assert.isEqualDeep(
            this.streamSummaryOf(await status),
            [
                {
                    deviceName: 'Muse S Gen 2',
                    state: 'streaming',
                    streams: [
                        ['EEG', 8765, 256, 5],
                        ['PPG', 8766, 64, 3],
                        ['ACCEL', 8767, 52, 3],
                        ['GYRO', 8768, 52, 3],
                    ],
                },
            ],
            'Did not report a streaming Muse after start!'
        )
    }

    @test()
    protected static async reportsNoDevicesAfterStop() {
        await this.startMuse()
        const statusSocket = this.socketOn(8764)
        await this.nextMessageOn(statusSocket)

        const status = this.nextMessageOn(statusSocket)
        await this.command({ command: 'stop' })

        assert.isEqualDeep(
            await status,
            { devices: [] },
            'Reported devices after stop!'
        )
    }

    @test()
    protected static async forgetsTheRunningSessionWhenReset() {
        await this.startMuse()

        DemoWebSocket.reset()

        assert.isEqualDeep(
            await this.command({ command: 'status' }),
            {},
            'Did not forget the running session when reset!'
        )
    }

    @test()
    protected static async streamsEverySampleDueSinceOpening() {
        await this.startMuse()
        const eegSocket = this.socketOn(8765)
        await new Promise<void>((resolve) => (eegSocket.onopen = resolve))

        const data = this.nextMessageOn(eegSocket)
        this.nowMs = 1000

        const { samples, timestamps } = await data

        assert.isEqualDeep(
            [samples.length, timestamps.length],
            [256 * 5, 256],
            'Did not stream every sample due since opening!'
        )
    }

    @test()
    protected static async streamsNothingWithoutARunningSession() {
        const eegSocket = this.socketOn(8765)
        let numMessages = 0
        eegSocket.onmessage = () => numMessages++

        this.nowMs = 1000
        await new Promise((resolve) => setTimeout(resolve, 10))

        assert.isEqual(
            numMessages,
            0,
            'Streamed samples without a running session!'
        )
    }

    @test()
    protected static async savesAProtocolUnderAFileNameFromItsName() {
        const reply = await this.command({
            command: 'saveProtocol',
            protocol: { schemaVersion: 1, name: 'Evening Walk', devices: [] },
        })

        assert.isEqualDeep(
            reply,
            {
                fileName: 'evening-walk.json',
                filePath: '~/Personomic/Protocols/evening-walk.json',
            },
            'Did not save a protocol under a file name from its name!'
        )
    }

    @test()
    protected static async keepsTheFileNameOfAProtocolSavedAgain() {
        const { fileName } = await this.command({
            command: 'saveProtocol',
            fileName: 'muse-meditation.json',
            protocol: { schemaVersion: 1, name: 'Renamed', devices: [] },
        })

        assert.isEqual(
            fileName,
            'muse-meditation.json',
            'Did not keep the file name of a protocol saved again!'
        )
    }

    @test()
    protected static async choosesTheRecordingsFolder() {
        const { directory } = await this.command({
            command: 'chooseDirectory',
        })

        assert.isEqual(
            directory,
            '~/Personomic/Recordings',
            'Did not choose the recordings folder!'
        )
    }

    @test()
    protected static async firesCloseWhenClosed() {
        const socket = this.socketOn(8763)
        let wasClosed = false
        socket.onclose = () => (wasClosed = true)

        socket.close()

        assert.isTrue(wasClosed, 'Did not fire close when closed!')
    }

    private static socketOn(port: number) {
        const socket = new DemoWebSocket(`ws://localhost:${port}`)
        this.sockets.push(socket)
        return socket
    }

    private static nextMessageOn(socket: DemoWebSocket) {
        return new Promise<any>((resolve) => {
            socket.onmessage = (event) => resolve(JSON.parse(event.data))
        })
    }

    private static command(message: object) {
        const socket = this.socketOn(8763)
        const reply = this.nextMessageOn(socket)

        socket.onopen = () => socket.send(JSON.stringify(message))

        return reply
    }

    private static startMuse() {
        return this.command({
            command: 'start',
            devices: [this.museRequest],
            xdfRecordPath: this.recordPath,
        })
    }

    private static streamSummaryOf(status: any) {
        return status.devices.map(({ deviceName, state, streams }: any) => ({
            deviceName,
            state,
            streams: streams.map((stream: any) => [
                stream.type,
                stream.listenPort,
                stream.sampleRateHz,
                stream.channelNames.length,
            ]),
        }))
    }

    private static readonly museRequest = {
        deviceName: 'Muse S Gen 2',
        identifier: '5F2B7A1E-9C3D-4E8B-A6F0-2D1C3B4A5E6F',
    }

    private static readonly scannedMuse = {
        value: '5F2B7A1E-9C3D-4E8B-A6F0-2D1C3B4A5E6F',
        source: 'MuseS-6A8C',
    }

    private static readonly recordPath = '~/Personomic/demo_2026-10-21.xdf'
}
