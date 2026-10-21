import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import FakeStreamMonitor, {
    lastStreamMonitorProps,
    numStreamMonitorMounts,
} from '../../testDoubles/StreamMonitor/FakeStreamMonitor'
import FakeWebSocket from '../../testDoubles/WebSocket/FakeWebSocket'
import App from '../../ui/App'
import { setWebSocketComponent } from '../../ui/components/StreamMonitor'
import { setIdentifierScanner } from '../../ui/hooks/useBiosensorChoices'
import { setStreamMonitorComponent } from '../../ui/views/SessionView'
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

        assert.isTrue(
            screen.queryByRole('tabpanel', { name: 'Protocols' }) !== null,
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
    protected static async offersADemoTabAfterSessionAndProtocols() {
        render(<App />)

        assert.isEqualDeep(
            this.tabNames,
            ['Session', 'Protocols', 'Demo'],
            'Did not offer a Demo tab after Session and Protocols!'
        )
    }

    @test()
    protected static async showsTheDemoPageInAFrameOnTheDemoTab() {
        render(<App />)

        this.chooseTab('Demo')

        assert.isEqual(
            within(screen.getByRole('tabpanel', { name: 'Demo' }))
                .getByTitle('Personomic demo')
                .getAttribute('src'),
            '/demo.html',
            'Did not show the demo page in a frame on the Demo tab!'
        )
    }

    @test()
    protected static async showsNothingOfTheDemoUntilItsTabIsChosen() {
        render(<App />)

        assert.isTrue(
            screen.queryByTitle('Personomic demo') === null &&
                screen.queryByRole('tabpanel', { name: 'Demo' }) === null,
            'Showed some of the demo before its tab was chosen!'
        )
    }

    @test()
    protected static async showsNothingOfTheDemoAfterLeavingItsTab() {
        render(<App />)

        this.chooseTab('Demo')
        this.chooseTab('Session')

        assert.isTrue(
            screen.queryByTitle('Personomic demo') === null,
            'Showed some of the demo after leaving its tab!'
        )
    }

    @test()
    protected static async hidesSessionViewWhileOnDemo() {
        this.renderWithMuse()

        this.chooseTab('Demo')

        assert.isFalse(
            screen.queryByRole('tabpanel', { name: 'Session' }) !== null,
            'Did not hide the Session view while on Demo!'
        )
    }

    @test()
    protected static async offersNoDemoTabInsideTheDemo() {
        render(<App isDemo />)

        assert.isEqualDeep(
            this.tabNames,
            ['Session', 'Protocols'],
            'Offered a Demo tab inside the demo!'
        )
    }

    @test()
    protected static async hidesSessionViewWhileOnProtocols() {
        this.renderWithMuse()

        this.chooseTab('Protocols')

        assert.isFalse(
            screen.queryByRole('tabpanel', { name: 'Session' }) !== null,
            'Did not hide the Session view while on Protocols!'
        )
    }

    @test()
    protected static async showsSessionViewAgainWhenItsTabIsChosen() {
        this.renderWithMuse()

        this.chooseTab('Protocols')
        this.chooseTab('Session')

        assert.isTrue(
            screen.queryByRole('tabpanel', { name: 'Session' }) !== null,
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
    protected static async asksOrchestratorForProtocolsWhenAppOpens() {
        render(<App />)

        act(() => this.orchestratorSocket.open())

        assert.isEqualDeep(
            this.lastSentMessage,
            { command: 'listProtocols' },
            'Did not ask the orchestrator for protocols when the app opened!'
        )
    }

    @test()
    protected static async saysProtocolsAreLoadingUntilOrchestratorReplies() {
        render(<App />)

        this.chooseTab('Protocols')

        assert.isTrue(
            screen.queryByText('Loading protocols…') !== null,
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
    protected static async doesNotAskForProtocolsAgainWhenVisitingProtocols() {
        render(<App />)
        const numSocketsWhenOpened = FakeWebSocket.instances.length

        this.chooseTab('Protocols')
        this.chooseTab('Session')
        this.chooseTab('Protocols')

        assert.isEqual(
            FakeWebSocket.instances.length,
            numSocketsWhenOpened,
            'Asked for protocols again when visiting Protocols!'
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

        assert.isTrue(
            screen.queryByText('No protocols yet.') !== null,
            'Kept loading when the orchestrator was unreachable!'
        )
    }

    @test()
    protected static async readsBiosensorsOfListedProtocol() {
        render(<App />)
        this.visitProtocolsListing([
            {
                fileName: 'i-insula.json',
                protocol: {
                    schemaVersion: 1,
                    name: 'I-INSULA',
                    devices: [
                        { deviceName: 'Cognionics Quick-20r' },
                        { deviceName: 'OpenBCI Cyton' },
                    ],
                },
            },
        ])

        this.chooseListedProtocol('I-INSULA')

        assert.isEqualDeep(
            this.biosensorNames,
            ['Cognionics Quick-20r', 'OpenBCI Cyton'],
            'Did not read the biosensors of a listed protocol!'
        )
    }

    @test()
    protected static async readsRecordDefaultsOfListedProtocol() {
        render(<App />)
        act(() =>
            this.orchestratorSocket.receive({
                protocols: [
                    {
                        fileName: 'recorded.json',
                        protocol: {
                            schemaVersion: 1,
                            name: 'Recorded',
                            recordXdf: true,
                            recordDirectory: '/data/study',
                            recordFileStub: 'participant',
                        },
                    },
                ],
            })
        )

        fireEvent.change(screen.getByRole('combobox', { name: 'Protocol' }), {
            target: { value: 'recorded.json' },
        })

        assert.isEqualDeep(
            {
                isOn: (
                    screen.getByRole('checkbox', {
                        name: 'Record XDF',
                    }) as HTMLInputElement
                ).checked,
                directory: (
                    screen.getByLabelText(
                        'Recordings folder'
                    ) as HTMLInputElement
                ).value,
                name: (
                    screen.getByLabelText('Recording name') as HTMLInputElement
                ).value,
            },
            { isOn: true, directory: '/data/study', name: 'participant' },
            'Did not read the record defaults of a listed protocol!'
        )
    }

    @test()
    protected static async readsListedProtocolWithoutBiosensorsAsHavingNone() {
        render(<App />)
        this.visitProtocolsListing([this.protocolFile('beeps.json', 'Beeps')])

        this.chooseListedProtocol('Beeps')

        assert.isTrue(
            this.isNoneAddedSaidOnProtocols,
            'Did not read a listed protocol without biosensors as having none!'
        )
    }

    @test()
    protected static async skipsListedBiosensorsWithoutTextName() {
        render(<App />)
        this.visitProtocolsListing([
            {
                fileName: 'odd.json',
                protocol: {
                    schemaVersion: 1,
                    name: 'Odd',
                    devices: [
                        { deviceName: 'OpenBCI Cyton' },
                        { deviceName: 5 },
                        'Muse 2',
                        null,
                    ],
                },
            },
        ])

        this.chooseListedProtocol('Odd')

        assert.isEqualDeep(
            this.biosensorNames,
            ['OpenBCI Cyton'],
            'Did not skip listed biosensors without a text name!'
        )
    }

    @test()
    protected static async readsNicknameAndIdentifierOfListedBiosensor() {
        render(<App />)
        this.visitProtocolsListing([
            {
                fileName: 'i-insula.json',
                protocol: {
                    schemaVersion: 1,
                    name: 'I-INSULA',
                    devices: [
                        {
                            deviceName: 'OpenBCI Cyton',
                            identifier: 'DQ0081',
                            nickname: 'EMG',
                        },
                    ],
                },
            },
        ])

        this.chooseListedProtocol('I-INSULA')

        assert.isEqualDeep(
            {
                nickname: (
                    screen.getByLabelText(
                        'OpenBCI Cyton nickname'
                    ) as HTMLInputElement
                ).value,
                identifier: (
                    screen.getByLabelText(
                        'OpenBCI Cyton Serial number (optional)'
                    ) as HTMLInputElement
                ).value,
            },
            { nickname: 'EMG', identifier: 'DQ0081' },
            'Did not read the nickname and identifier of a listed biosensor!'
        )
    }

    @test()
    protected static async readsTextStreamsTurnedOffOfListedBiosensor() {
        render(<App />)
        this.visitProtocolsListing([
            {
                fileName: 'muse.json',
                protocol: {
                    schemaVersion: 1,
                    name: 'Muse',
                    devices: [
                        {
                            deviceName: 'Muse S Gen 2',
                            disableStreams: ['PPG', 7, 'Gyroscope'],
                        },
                    ],
                },
            },
        ])
        this.chooseListedProtocol('Muse')

        fireEvent.click(
            screen.getByRole('button', { name: 'Muse S Gen 2 settings' })
        )

        assert.isEqualDeep(
            screen
                .getAllByRole('checkbox', { name: /^Muse S Gen 2 / })
                .filter((toggle) => !(toggle as HTMLInputElement).checked)
                .map((toggle) => toggle.getAttribute('aria-label')),
            ['Muse S Gen 2 PPG', 'Muse S Gen 2 Gyroscope'],
            'Did not read the text streams turned off of a listed biosensor!'
        )
    }

    @test()
    protected static async readsListedMuseAsAutoDetectedMuse() {
        render(<App />)
        this.visitProtocolsListing([
            {
                fileName: 'muse.json',
                protocol: {
                    schemaVersion: 1,
                    name: 'Muse',
                    devices: [{ deviceName: 'Muse' }],
                },
            },
        ])

        this.chooseListedProtocol('Muse')

        assert.isEqualDeep(
            this.biosensorNames,
            ['Muse (auto-detect, slower)'],
            'Did not read a listed Muse as an auto-detected Muse!'
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

    @test()
    protected static async offersListedProtocolsInSession() {
        render(<App />)

        act(() =>
            this.orchestratorSocket.receive({
                protocols: [this.protocolFile('beeps.json', 'Beeps')],
            })
        )

        const protocolSelect = screen.getByRole('combobox', {
            name: 'Protocol',
        }) as HTMLSelectElement

        assert.isEqualDeep(
            Array.from(protocolSelect.options).map(
                (option) => option.textContent
            ),
            ['No protocol', 'Beeps'],
            'Did not offer the listed protocols in the session!'
        )
    }

    @test()
    protected static async showsProtocolSavedInSessionOnProtocols() {
        render(<App />)
        act(() =>
            this.orchestratorSocket.receive({
                protocols: [this.protocolFile('beeps.json', 'Beeps')],
            })
        )
        fireEvent.change(screen.getByRole('combobox', { name: 'Protocol' }), {
            target: { value: 'beeps.json' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Edit protocol' }))
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Protocol name' }),
            { target: { value: 'Loud beeps' } }
        )
        fireEvent.click(screen.getByRole('button', { name: 'Save as new' }))
        act(() =>
            this.orchestratorSocket.receive({ fileName: 'loud-beeps.json' })
        )

        this.chooseTab('Protocols')

        assert.isEqualDeep(
            this.listedProtocolNames,
            ['Beeps', 'Loud beeps'],
            'Did not show the protocol saved in the session on Protocols!'
        )
    }

    @test()
    protected static async doesNotMarkListedProtocolsUnsaved() {
        render(<App />)

        this.visitProtocolsListing([this.protocolFile('beeps.json', 'Beeps')])

        assert.isNull(
            screen.queryByRole('img', { name: 'Unsaved changes' }),
            'Marked a listed protocol unsaved!'
        )
    }

    @test()
    protected static async warnsBeforeLeavingWithUnsavedProtocol() {
        render(<App />)
        this.visitProtocolsListing([])

        fireEvent.click(screen.getByRole('button', { name: 'New protocol' }))

        assert.isTrue(
            this.isLeavingWarned,
            'Did not warn before leaving with an unsaved protocol!'
        )
    }

    @test()
    protected static async doesNotWarnBeforeLeavingWhenProtocolsAreSaved() {
        render(<App />)

        this.visitProtocolsListing([this.protocolFile('beeps.json', 'Beeps')])

        assert.isFalse(
            this.isLeavingWarned,
            'Warned before leaving when the protocols were saved!'
        )
    }

    private static get isLeavingWarned() {
        const leaving = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(leaving)
        return leaving.defaultPrevented
    }

    private static visitProtocolsListing(files: object[]) {
        this.chooseTab('Protocols')
        act(() => this.orchestratorSocket.receive({ protocols: files }))
    }

    private static protocolFile(fileName: string, name: string) {
        return { fileName, protocol: { schemaVersion: 1, name } }
    }

    private static chooseListedProtocol(name: string) {
        fireEvent.click(screen.getByRole('button', { name }))
    }

    private static get biosensorNames() {
        return within(screen.getByRole('list', { name: 'Biosensors' }))
            .getAllByRole('listitem')
            .map(
                (item) =>
                    item.querySelector('.stream-monitor__device-name')!
                        .textContent
            )
    }

    private static get listedProtocolNames() {
        return within(screen.getByRole('navigation', { name: 'Protocols' }))
            .queryAllByRole('listitem')
            .map((item) => within(item).getAllByRole('button')[0].textContent)
    }

    private static get isNoneAddedSaidOnProtocols() {
        return (
            within(
                screen.getByRole('tabpanel', { name: 'Protocols' })
            ).queryByText('None added yet.') !== null
        )
    }

    private static chooseTab(name: string) {
        fireEvent.click(screen.getByRole('tab', { name }))
    }

    private static get tabNames() {
        return screen.getAllByRole('tab').map((tab) => tab.textContent)
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
