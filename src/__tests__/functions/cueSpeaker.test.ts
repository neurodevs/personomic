import { test, assert } from '@neurodevs/node-tdd'

import {
    orchestratorOrBrowserSpeaker,
    Speaker,
} from '../../functions/cueSpeaker'
import FakeSpeaker from '../../testDoubles/Speaker/FakeSpeaker'
import FakeWebSocket from '../../testDoubles/WebSocket/FakeWebSocket'
import { setWebSocketComponent } from '../../ui/components/StreamMonitor'
import AbstractPackageTest from '../AbstractPackageTest'

export default class CueSpeakerTest extends AbstractPackageTest {
    private static speaker: Speaker
    private static numVoiceChanges: number

    protected static async beforeEach() {
        await super.beforeEach()

        setWebSocketComponent(FakeWebSocket as any)
        FakeWebSocket.resetTestDouble()
        FakeSpeaker.availableVoices = ['Samantha']

        this.speaker = orchestratorOrBrowserSpeaker(FakeSpeaker)
        this.numVoiceChanges = 0
        this.speaker.onVoicesChanged(() => this.numVoiceChanges++)
    }

    @test()
    protected static async asksOrchestratorForItsVoices() {
        this.speaker.voices()
        this.orchestratorSocket.open()

        assert.isEqualDeep(
            this.lastSentMessage,
            { command: 'listVoices' },
            'Did not ask the orchestrator for its voices!'
        )
    }

    @test()
    protected static async offersOrchestratorVoicesOnceListed() {
        this.listOrchestratorVoices(['Daniel', 'Tara'])

        assert.isEqualDeep(
            {
                voices: this.speaker.voices(),
                numVoiceChanges: this.numVoiceChanges,
            },
            {
                voices: [
                    { name: 'Daniel', isDownloaded: true },
                    { name: 'Tara', isDownloaded: true },
                ],
                numVoiceChanges: 1,
            },
            'Did not offer the orchestrator voices once listed!'
        )
    }

    @test()
    protected static async offersBrowserVoicesWhenOrchestratorIsUnreachable() {
        this.speaker.voices()
        this.orchestratorSocket.dropConnection()

        assert.isEqualDeep(
            {
                voices: this.speaker.voices(),
                numVoiceChanges: this.numVoiceChanges,
            },
            {
                voices: [{ name: 'Samantha', isDownloaded: true }],
                numVoiceChanges: 1,
            },
            'Did not offer the browser voices when the orchestrator was unreachable!'
        )
    }

    @test()
    protected static async offersBrowserVoicesWhenOrchestratorListsNone() {
        this.speaker.voices()
        this.orchestratorSocket.open()
        this.orchestratorSocket.receive({})

        assert.isEqualDeep(
            this.speaker.voices(),
            [{ name: 'Samantha', isDownloaded: true }],
            'Did not offer the browser voices when the orchestrator listed none!'
        )
    }

    @test()
    protected static async asksOrchestratorForVoicesOnlyOnce() {
        this.listOrchestratorVoices(['Daniel'])

        this.speaker.voices()

        assert.isLength(
            FakeWebSocket.instances,
            1,
            'Asked the orchestrator for its voices more than once!'
        )
    }

    @test()
    protected static async speaksCueThroughOrchestrator() {
        this.listOrchestratorVoices(['Daniel'])
        let numEnds = 0

        this.speaker.speak('Close your eyes', 'Daniel', () => numEnds++)
        this.orchestratorSocket.open()
        const endsBeforeReply = numEnds
        this.orchestratorSocket.receive({})

        assert.isEqualDeep(
            {
                sent: this.lastSentMessage,
                spokenInBrowser: FakeSpeaker.spoken,
                endsBeforeReply,
                endsAfterReply: numEnds,
            },
            {
                sent: {
                    command: 'speakCue',
                    text: 'Close your eyes',
                    voice: 'Daniel',
                },
                spokenInBrowser: [],
                endsBeforeReply: 0,
                endsAfterReply: 1,
            },
            'Did not speak the cue through the orchestrator!'
        )
    }

    @test()
    protected static async stopsCueThroughOrchestrator() {
        this.listOrchestratorVoices(['Daniel'])

        this.speaker.cancel()
        this.orchestratorSocket.open()

        assert.isEqualDeep(
            { sent: this.lastSentMessage, browserCalls: FakeSpeaker.calls },
            { sent: { command: 'stopCue' }, browserCalls: [] },
            'Did not stop the cue through the orchestrator!'
        )
    }

    @test()
    protected static async speaksAndStopsInBrowserWithoutOrchestrator() {
        this.speaker.voices()
        this.orchestratorSocket.dropConnection()

        this.speaker.speak('Close your eyes', 'Samantha', () => {})
        this.speaker.cancel()

        assert.isEqualDeep(
            {
                browserCalls: FakeSpeaker.calls,
                spoken: FakeSpeaker.spoken,
                numSockets: FakeWebSocket.instances.length,
            },
            {
                browserCalls: ['speak', 'cancel'],
                spoken: ['Close your eyes'],
                numSockets: 1,
            },
            'Did not speak and stop in the browser without the orchestrator!'
        )
    }

    private static listOrchestratorVoices(voices: string[]) {
        this.speaker.voices()
        this.orchestratorSocket.open()
        this.orchestratorSocket.receive({ voices })
    }

    private static get orchestratorSocket() {
        return FakeWebSocket.instances.at(-1)!
    }

    private static get lastSentMessage() {
        return JSON.parse(FakeWebSocket.callsToSend.at(-1)!.data as string)
    }
}
