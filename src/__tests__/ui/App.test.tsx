import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen } from '@testing-library/react'

import FakeStreamMonitor, {
    lastStreamMonitorProps,
    numStreamMonitorMounts,
} from '../../testDoubles/StreamMonitor/FakeStreamMonitor'
import FakeWebSocket from '../../testDoubles/WebSocket/FakeWebSocket'
import App from '../../ui/App'
import { setWebSocketComponent } from '../../ui/components/StreamMonitor'
import {
    setIdentifierScanner,
    setStreamMonitorComponent,
} from '../../ui/views/SessionView'
import AbstractPackageTest from '../AbstractPackageTest'

export default class AppTest extends AbstractPackageTest {
    protected static async beforeEach() {
        await super.beforeEach()

        setStreamMonitorComponent(FakeStreamMonitor)
        setWebSocketComponent(FakeWebSocket as any)
        FakeWebSocket.resetTestDouble()
        setIdentifierScanner(() => () => {})
        localStorage.clear()
    }

    @test()
    protected static async passesDownsamplingToMonitor() {
        render(<App downsampling="medium" />)

        assert.isEqual(
            lastStreamMonitorProps?.downsampling,
            'medium',
            'Did not pass downsampling to monitor!'
        )
    }

    @test()
    protected static async opensOnTheSessionTab() {
        render(<App />)

        assert.isEqual(
            this.selectedTabName,
            'Session',
            'Did not open on the Session tab!'
        )
    }

    @test()
    protected static async showsProtocolsViewWhenItsTabIsChosen() {
        render(<App />)

        this.chooseTab('Protocols')

        assert.isTruthy(
            screen.queryByRole('tabpanel', { name: 'Protocols' }),
            'Did not show the Protocols view when its tab was chosen!'
        )
    }

    @test()
    protected static async selectsTheChosenTab() {
        render(<App />)

        this.chooseTab('Protocols')

        assert.isEqual(
            this.selectedTabName,
            'Protocols',
            'Did not select the chosen tab!'
        )
    }

    @test()
    protected static async hidesSessionViewWhileOnProtocols() {
        this.renderWithMuse()

        this.chooseTab('Protocols')

        assert.isNull(
            screen.queryByRole('tabpanel', { name: 'Session' }),
            'Did not hide the Session view while on Protocols!'
        )
    }

    @test()
    protected static async showsSessionViewAgainWhenItsTabIsChosen() {
        this.renderWithMuse()

        this.chooseTab('Protocols')
        this.chooseTab('Session')

        assert.isTruthy(
            screen.queryByRole('tabpanel', { name: 'Session' }),
            'Did not show the Session view again when its tab was chosen!'
        )
    }

    @test()
    protected static async keepsMonitorMountedWhileVisitingProtocols() {
        this.renderWithMuse()
        this.connect()
        const numMountsWhileStreaming = numStreamMonitorMounts

        this.chooseTab('Protocols')
        this.chooseTab('Session')

        assert.isEqual(
            numStreamMonitorMounts,
            numMountsWhileStreaming,
            'Remounted the monitor while visiting Protocols!'
        )
    }

    @test()
    protected static async keepsChosenDevicesAfterVisitingProtocols() {
        this.renderWithMuse()

        this.chooseTab('Protocols')
        this.chooseTab('Session')

        assert.isEqualDeep(
            lastStreamMonitorProps?.deviceNames,
            ['Muse S Gen 2'],
            'Lost the chosen devices after visiting Protocols!'
        )
    }

    @test()
    protected static async asksOrchestratorForProtocolsOnFirstVisit() {
        render(<App />)

        this.chooseTab('Protocols')
        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage,
            { command: 'listProtocols' },
            'Did not ask the orchestrator for protocols on first visit!'
        )
    }

    @test()
    protected static async saysProtocolsAreLoadingUntilOrchestratorReplies() {
        render(<App />)

        this.chooseTab('Protocols')

        assert.isTruthy(
            screen.queryByText('Loading protocols…'),
            'Did not say protocols are loading!'
        )
    }

    @test()
    protected static async listsProtocolsFromTheFolder() {
        render(<App />)

        this.visitProtocolsListing([
            this.protocolFile('tilt-series.json', 'Tilt series'),
            this.protocolFile('beeps.json', 'Beeps'),
        ])

        assert.isEqualDeep(
            this.listedProtocolNames,
            ['Tilt series', 'Beeps'],
            'Did not list the protocols from the folder!'
        )
    }

    @test()
    protected static async listsProtocolWhoseNameIsNotTextAsUntitled() {
        render(<App />)

        this.visitProtocolsListing([
            { fileName: 'odd.json', protocol: { schemaVersion: 1, name: 5 } },
        ])

        assert.isEqualDeep(
            this.listedProtocolNames,
            ['Untitled protocol'],
            'Did not list a protocol whose name is not text as untitled!'
        )
    }

    @test()
    protected static async asksForProtocolsOnlyOnFirstVisit() {
        render(<App />)
        this.visitProtocolsListing([])
        const numSocketsAfterFirstVisit = FakeWebSocket.instances.length

        this.chooseTab('Session')
        this.chooseTab('Protocols')

        assert.isEqual(
            FakeWebSocket.instances.length,
            numSocketsAfterFirstVisit,
            'Asked for protocols again on a later visit!'
        )
    }

    @test()
    protected static async keepsListedProtocolsAfterVisitingSession() {
        render(<App />)
        this.visitProtocolsListing([this.protocolFile('beeps.json', 'Beeps')])

        this.chooseTab('Session')
        this.chooseTab('Protocols')

        assert.isEqualDeep(
            this.listedProtocolNames,
            ['Beeps'],
            'Lost the listed protocols after visiting Session!'
        )
    }

    @test()
    protected static async saysOrchestratorIsUnreachableWhenListingProtocols() {
        render(<App />)

        this.chooseTab('Protocols')
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
            'Did not say the orchestrator is unreachable when listing protocols!'
        )
    }

    @test()
    protected static async stopsLoadingWhenOrchestratorIsUnreachable() {
        render(<App />)

        this.chooseTab('Protocols')
        act(() => this.orchestratorSocket.dropConnection())

        assert.isTruthy(
            screen.queryByText('No protocols yet.'),
            'Kept loading when the orchestrator was unreachable!'
        )
    }

    @test()
    protected static async showsErrorFromListingProtocols() {
        render(<App />)

        this.chooseTab('Protocols')
        act(() =>
            this.orchestratorSocket.receive({ error: 'Permission denied' })
        )

        assert.isEqual(
            screen.getByRole('alert').textContent,
            'Permission denied',
            'Did not show the error from listing protocols!'
        )
    }

    private static visitProtocolsListing(files: object[]) {
        this.chooseTab('Protocols')
        act(() => this.orchestratorSocket.receive({ protocols: files }))
    }

    private static protocolFile(fileName: string, name: string) {
        return { fileName, protocol: { schemaVersion: 1, name } }
    }

    private static get listedProtocolNames() {
        return screen.getAllByRole('listitem').map((item) => item.textContent)
    }

    private static chooseTab(name: string) {
        fireEvent.click(screen.getByRole('tab', { name }))
    }

    private static get selectedTabName() {
        return screen.getByRole('tab', { selected: true }).textContent
    }

    private static renderWithMuse() {
        render(<App />)
        this.addBiosensor('Muse S Gen 2')
    }

    private static addBiosensor(name: string) {
        this.openBiosensorMenu()
        fireEvent.click(screen.getByRole('menuitem', { name }))
    }

    private static openBiosensorMenu() {
        fireEvent.click(screen.getByRole('button', { name: /add biosensor/i }))
    }

    private static clickConnect() {
        fireEvent.click(this.sessionButton)
    }

    private static connect() {
        this.clickConnect()
        act(() => this.orchestratorSocket.receive({}))
    }

    private static get sessionButton() {
        return screen.getByRole('button', { name: /^(Connect|Stop|Detecting)/ })
    }

    private static get orchestratorSocket() {
        return FakeWebSocket.instances.at(-1)!
    }

    private static get lastSentMessage() {
        return JSON.parse(FakeWebSocket.callsToSend.at(-1)?.data as string)
    }
}
