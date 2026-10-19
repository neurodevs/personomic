import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import FakeStreamMonitor from '../../../testDoubles/StreamMonitor/FakeStreamMonitor'
import FakeWebSocket from '../../../testDoubles/WebSocket/FakeWebSocket'
import App from '../../../ui/App'
import { setWebSocketComponent } from '../../../ui/components/StreamMonitor'
import { setDownloadFile } from '../../../ui/views/ProtocolsView'
import {
    biosensorNames,
    setIdentifierScanner,
} from '../../../ui/hooks/useBiosensorChoices'
import { setStreamMonitorComponent } from '../../../ui/views/SessionView'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class ProtocolsViewTest extends AbstractPackageTest {
    private static downloads: { fileName: string; text: string }[]

    protected static async beforeEach() {
        await super.beforeEach()

        this.downloads = []
        setDownloadFile((fileName, text) =>
            this.downloads.push({ fileName, text })
        )

        setStreamMonitorComponent(FakeStreamMonitor)
        setWebSocketComponent(FakeWebSocket as any)
        FakeWebSocket.resetTestDouble()
        setIdentifierScanner(() => () => {})
        localStorage.clear()

        render(<App />)
        this.chooseTab('Protocols')
    }

    @test()
    protected static async saysThereAreNoProtocolsYetWhenFolderIsEmpty() {
        this.answerListing()

        assert.isTrue(
            screen.queryByText('No protocols yet.') !== null,
            'Did not say there are no protocols yet!'
        )
    }

    @test()
    protected static async listsAnUntitledProtocolOnNewProtocol() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isEqualDeep(
            this.listedNames,
            ['Untitled protocol'],
            'Did not list an untitled protocol!'
        )
    }

    @test()
    protected static async stopsSayingThereAreNoProtocolsOnceOneExists() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isFalse(
            screen.queryByText('No protocols yet.') !== null,
            'Kept saying there are no protocols once one existed!'
        )
    }

    @test()
    protected static async selectsTheNewProtocol() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isEqual(
            this.selectedName,
            'Untitled protocol',
            'Did not select the new protocol!'
        )
    }

    @test()
    protected static async focusesNameOfTheNewProtocol() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isEqual(
            document.activeElement,
            this.nameInput,
            'Did not focus the name of the new protocol!'
        )
    }

    @test()
    protected static async renamesProtocolInListAsNameIsTyped() {
        this.answerListing()

        this.clickNewProtocol()

        this.typeName('Tilt series')

        assert.isEqualDeep(
            this.listedNames,
            ['Tilt series'],
            'Did not rename the protocol in the list as its name was typed!'
        )
    }

    @test()
    protected static async listsProtocolWithBlankNameAsUntitled() {
        this.answerListing()

        this.clickNewProtocol()
        this.typeName('Tilt series')

        this.typeName('  ')

        assert.isEqualDeep(
            this.listedNames,
            ['Untitled protocol'],
            'Did not list a protocol with a blank name as untitled!'
        )
    }

    @test()
    protected static async addsEachNewProtocolAfterTheOthersAndSelectsIt() {
        this.answerListing()

        this.clickNewProtocol()
        this.typeName('Tilt series')

        this.clickNewProtocol()

        assert.isEqualDeep(
            { listed: this.listedNames, selected: this.selectedName },
            {
                listed: ['Tilt series', 'Untitled protocol'],
                selected: 'Untitled protocol',
            },
            'Did not add the new protocol after the others and select it!'
        )
    }

    @test()
    protected static async showsNameOfProtocolChosenInList() {
        this.answerListing()

        this.clickNewProtocol()
        this.typeName('Tilt series')
        this.clickNewProtocol()

        fireEvent.click(screen.getByRole('button', { name: 'Tilt series' }))

        assert.isEqual(
            this.nameInput.value,
            'Tilt series',
            'Did not show the name of the protocol chosen in the list!'
        )
    }

    @test()
    protected static async savesNewProtocolWithoutFileName() {
        this.answerListing()
        this.clickNewProtocol()
        this.typeName('Tilt series')

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage,
            {
                command: 'saveProtocol',
                protocol: {
                    schemaVersion: 1,
                    name: 'Tilt series',
                    devices: [],
                },
            },
            'Did not save the new protocol without a file name!'
        )
    }

    @test()
    protected static async saysWhereProtocolWasSaved() {
        this.answerListing()
        this.clickNewProtocol()

        this.save('untitled-protocol.json')

        assert.isEqual(
            this.statusText,
            'Saved to untitled-protocol.json',
            'Did not say where the protocol was saved!'
        )
    }

    @test()
    protected static async savesAgainToTheSameFile() {
        this.answerListing()
        this.clickNewProtocol()
        this.typeName('Tilt series')
        this.save('tilt-series.json')

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqual(
            this.lastSentMessage.fileName,
            'tilt-series.json',
            'Did not save again to the same file!'
        )
    }

    @test()
    protected static async savesListedProtocolToItsFile() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        fireEvent.click(screen.getByRole('button', { name: 'Beeps' }))

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqual(
            this.lastSentMessage.fileName,
            'beeps.json',
            'Did not save a listed protocol to its file!'
        )
    }

    @test()
    protected static async stopsSayingSavedOnceNameChanges() {
        this.answerListing()
        this.clickNewProtocol()
        this.save('untitled-protocol.json')

        this.typeName('Tilt series')

        assert.isFalse(
            screen.queryByRole('status') !== null,
            'Kept saying saved once the name changed!'
        )
    }

    @test()
    protected static async showsErrorFromSaving() {
        this.answerListing()
        this.clickNewProtocol()
        this.clickSave()

        this.answer({ error: 'Permission denied' })

        assert.isEqual(
            this.alertText,
            'Permission denied',
            'Did not show the error from saving!'
        )
    }

    @test()
    protected static async saysOrchestratorIsUnreachableWhenSaving() {
        this.answerListing()
        this.clickNewProtocol()
        this.clickSave()

        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            this.alertText,
            'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
            'Did not say the orchestrator is unreachable when saving!'
        )
    }

    @test()
    protected static async saysNewProtocolHasNoBiosensorsYet() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isTrue(
            screen.queryByText('No biosensors yet.') !== null,
            'Did not say the new protocol has no biosensors yet!'
        )
    }

    @test()
    protected static async offersEveryBiosensorModel() {
        this.answerListing()
        this.clickNewProtocol()

        this.openBiosensorMenu()

        assert.isEqualDeep(
            screen
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
                .sort(),
            [...biosensorNames].sort(),
            'Did not offer every biosensor model!'
        )
    }

    @test()
    protected static async addsChosenBiosensorToProtocol() {
        this.answerListing()
        this.clickNewProtocol()

        this.addBiosensor('OpenBCI Cyton')

        assert.isEqualDeep(
            this.biosensorNames,
            ['OpenBCI Cyton'],
            'Did not add the chosen biosensor to the protocol!'
        )
    }

    @test()
    protected static async stopsSayingThereAreNoBiosensorsOnceOneIsAdded() {
        this.answerListing()
        this.clickNewProtocol()

        this.addBiosensor('OpenBCI Cyton')

        assert.isFalse(
            screen.queryByText('No biosensors yet.') !== null,
            'Kept saying there are no biosensors once one was added!'
        )
    }

    @test()
    protected static async numbersRepeatsOfTheSameModel() {
        this.answerListing()
        this.clickNewProtocol()

        this.addBiosensor('Muse S Gen 2')
        this.addBiosensor('Muse S Gen 2')

        assert.isEqualDeep(
            this.biosensorNames,
            ['Muse S Gen 2 #1', 'Muse S Gen 2 #2'],
            'Did not number repeats of the same model!'
        )
    }

    @test()
    protected static async removesBiosensorFromProtocol() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('Cognionics Quick-20r')
        this.addBiosensor('OpenBCI Cyton')

        fireEvent.click(
            screen.getByRole('button', { name: 'Remove Cognionics Quick-20r' })
        )

        assert.isEqualDeep(
            this.biosensorNames,
            ['OpenBCI Cyton'],
            'Did not remove the biosensor from the protocol!'
        )
    }

    @test()
    protected static async savesBiosensorsWithProtocol() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('Cognionics Quick-20r')
        this.addBiosensor('OpenBCI Cyton')

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage.protocol.devices,
            [
                { deviceName: 'Cognionics Quick-20r' },
                { deviceName: 'OpenBCI Cyton' },
            ],
            'Did not save the biosensors with the protocol!'
        )
    }

    @test()
    protected static async stopsSayingSavedOnceBiosensorsChange() {
        this.answerListing()
        this.clickNewProtocol()
        this.save('untitled-protocol.json')

        this.addBiosensor('OpenBCI Cyton')

        assert.isFalse(
            screen.queryByRole('status') !== null,
            'Kept saying saved once the biosensors changed!'
        )
    }

    @test()
    protected static async hidesConnectionStatusOfBiosensors() {
        this.answerListing()
        this.clickNewProtocol()

        this.addBiosensor('OpenBCI Cyton')

        assert.isFalse(
            screen
                .getByRole('list', { name: 'Biosensors' })
                .querySelector('.stream-monitor__device-status') !== null,
            'Showed the connection status of biosensors!'
        )
    }

    @test()
    protected static async offersEachModelWithoutIdentifierOnlyOnce() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('Zephyr BioHarness 3')

        this.openBiosensorMenu()

        assert.isFalse(
            screen.queryByRole('menuitem', { name: 'Zephyr BioHarness 3' }) !==
                null,
            'Offered a model without an identifier more than once!'
        )
    }

    @test()
    protected static async asksForNicknameAndIdentifierOfBiosensor() {
        this.answerListing()
        this.clickNewProtocol()

        this.addBiosensor('OpenBCI Cyton')

        assert.isEqualDeep(
            {
                nickname:
                    screen.queryByLabelText('OpenBCI Cyton nickname') !== null,
                identifier:
                    screen.queryByLabelText(
                        'OpenBCI Cyton Serial number (optional)'
                    ) !== null,
            },
            { nickname: true, identifier: true },
            'Did not ask for the nickname and identifier of the biosensor!'
        )
    }

    @test()
    protected static async savesNicknameAndIdentifierOfBiosensor() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('OpenBCI Cyton')
        this.typeInto('OpenBCI Cyton nickname', ' EMG ')
        this.typeInto('OpenBCI Cyton Serial number (optional)', 'DQ0081')

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage.protocol.devices,
            [
                {
                    deviceName: 'OpenBCI Cyton',
                    identifier: 'DQ0081',
                    nickname: 'EMG',
                },
            ],
            'Did not save the nickname and identifier of the biosensor!'
        )
    }

    @test()
    protected static async savesAutoDetectedMuseAsMuse() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('Muse (auto-detect, slower)')

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage.protocol.devices,
            [{ deviceName: 'Muse' }],
            'Did not save an auto-detected Muse as Muse!'
        )
    }

    @test()
    protected static async offersRememberedIdentifiers() {
        localStorage.setItem(
            'personomic.rememberedIdentifiers',
            JSON.stringify({ 'OpenBCI Cyton': ['DQ0081'] })
        )
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('OpenBCI Cyton')

        fireEvent.focus(
            screen.getByLabelText('OpenBCI Cyton Serial number (optional)')
        )

        assert.isTrue(
            screen.queryByRole('option', { name: 'DQ0081' }) !== null,
            'Did not offer remembered identifiers!'
        )
    }

    @test()
    protected static async scansForIdentifiersOfBiosensorsWithoutOne() {
        const scannedFor: string[][] = []
        setIdentifierScanner((deviceNames) => {
            scannedFor.push(deviceNames)
            return () => {}
        })
        this.answerListing()
        this.clickNewProtocol()

        this.addBiosensor('OpenBCI Cyton')

        assert.isEqualDeep(
            scannedFor.at(-1),
            ['OpenBCI Cyton'],
            'Did not scan for identifiers of biosensors without one!'
        )
    }

    @test()
    protected static async downloadsSavedProtocolUnderItsFileName() {
        this.answerListing([this.file('beeps.json', 'Beeps')])

        this.clickDownloadOf('Beeps')

        assert.isEqualDeep(
            this.downloads,
            [
                {
                    fileName: 'beeps.json',
                    text: '{\n    "schemaVersion": 1,\n    "name": "Beeps",\n    "devices": []\n}\n',
                },
            ],
            'Did not download a saved protocol under its file name!'
        )
    }

    @test()
    protected static async downloadsProtocolAsCurrentlyEdited() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')
        this.typeName('Loud beeps')

        this.clickDownloadOf('Loud beeps')

        assert.isEqual(
            JSON.parse(this.downloads[0].text).name,
            'Loud beeps',
            'Did not download the protocol as currently edited!'
        )
    }

    @test()
    protected static async downloadsUnsavedProtocolUnderFileNameFromItsName() {
        this.answerListing()
        this.clickNewProtocol()
        this.typeName('Tilt series: Left & Right')

        this.clickDownloadOf('Tilt series: Left & Right')

        assert.isEqual(
            this.downloads[0].fileName,
            'tilt-series-left-right.json',
            'Did not download an unsaved protocol under a file name from its name!'
        )
    }

    @test()
    protected static async downloadsUnsavedUntitledProtocolAsUntitled() {
        this.answerListing()
        this.clickNewProtocol()

        this.clickDownloadOf('Untitled protocol')

        assert.isEqual(
            this.downloads[0].fileName,
            'untitled-protocol.json',
            'Did not download an unsaved untitled protocol as untitled!'
        )
    }

    @test()
    protected static async removesProtocolThatWasNeverSavedRightAway() {
        this.answerListing()
        this.clickNewProtocol()

        this.clickRemoveOf('Untitled protocol')

        assert.isEqualDeep(
            this.listedNames,
            [],
            'Did not remove a protocol that was never saved right away!'
        )
    }

    @test()
    protected static async asksBeforeRemovingSavedProtocol() {
        this.answerListing([this.file('beeps.json', 'Beeps')])

        this.clickRemoveOf('Beeps')

        assert.isTrue(
            screen.queryByText('Remove Beeps?') !== null,
            'Did not ask before removing a saved protocol!'
        )
    }

    @test()
    protected static async offersToDeleteTheFileUncheckedByDefault() {
        this.answerListing([this.file('beeps.json', 'Beeps')])

        this.clickRemoveOf('Beeps')

        assert.isFalse(
            this.deleteFileCheckbox.checked,
            'Did not offer to delete the file, unchecked by default!'
        )
    }

    @test()
    protected static async movesFileAsideByDefault() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.clickRemoveOf('Beeps')

        this.clickConfirmRemove()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage,
            {
                command: 'removeProtocol',
                fileName: 'beeps.json',
                shouldDeleteFile: false,
            },
            'Did not move the file aside by default!'
        )
    }

    @test()
    protected static async deletesFileWhenAskedTo() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.clickRemoveOf('Beeps')
        fireEvent.click(this.deleteFileCheckbox)

        this.clickConfirmRemove()
        this.openOrchestratorSocket()

        assert.isTrue(
            this.lastSentMessage.shouldDeleteFile,
            'Did not delete the file when asked to!'
        )
    }

    @test()
    protected static async keepsProtocolListedUntilOrchestratorReplies() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.clickRemoveOf('Beeps')

        this.clickConfirmRemove()

        assert.isEqualDeep(
            this.listedNames,
            ['Beeps'],
            'Did not keep the protocol listed until the orchestrator replied!'
        )
    }

    @test()
    protected static async removesProtocolOnceOrchestratorReplies() {
        this.answerListing([
            this.file('beeps.json', 'Beeps'),
            this.file('tilt-series.json', 'Tilt series'),
        ])

        this.remove('Beeps')

        assert.isEqualDeep(
            this.listedNames,
            ['Tilt series'],
            'Did not remove the protocol once the orchestrator replied!'
        )
    }

    @test()
    protected static async keepsProtocolAndShowsErrorFromRemoving() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.clickRemoveOf('Beeps')
        this.clickConfirmRemove()

        this.answer({ error: 'Permission denied' })

        assert.isEqualDeep(
            { listed: this.listedNames, error: this.alertText },
            { listed: ['Beeps'], error: 'Permission denied' },
            'Did not keep the protocol and show the error from removing!'
        )
    }

    @test()
    protected static async saysOrchestratorIsUnreachableWhenRemoving() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.clickRemoveOf('Beeps')
        this.clickConfirmRemove()

        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            this.alertText,
            'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
            'Did not say the orchestrator is unreachable when removing!'
        )
    }

    @test()
    protected static async keepsProtocolWhenRemovingIsCancelled() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.clickRemoveOf('Beeps')

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        assert.isEqualDeep(
            {
                listed: this.listedNames,
                isAsking: screen.queryByText('Remove Beeps?') !== null,
            },
            { listed: ['Beeps'], isAsking: false },
            'Did not keep the protocol when removing was cancelled!'
        )
    }

    @test()
    protected static async stopsEditingProtocolOnceRemoved() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')

        this.remove('Beeps')

        assert.isFalse(
            screen.queryByLabelText('Name') !== null,
            'Kept editing the protocol once it was removed!'
        )
    }

    @test()
    protected static async keepsEditingProtocolListedAfterRemovedOne() {
        this.answerListing([
            this.file('beeps.json', 'Beeps'),
            this.file('tilt-series.json', 'Tilt series'),
        ])
        this.chooseListed('Tilt series')

        this.remove('Beeps')

        assert.isEqual(
            this.nameInput.value,
            'Tilt series',
            'Did not keep editing the protocol listed after the removed one!'
        )
    }

    private static openBiosensorMenu() {
        fireEvent.click(screen.getByRole('button', { name: /add biosensor/i }))
    }

    private static addBiosensor(name: string) {
        this.openBiosensorMenu()
        fireEvent.click(screen.getByRole('menuitem', { name }))
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

    private static typeInto(label: string, value: string) {
        fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }

    private static clickDownloadOf(name: string) {
        fireEvent.click(
            screen.getByRole('button', { name: `Download ${name}` })
        )
    }

    private static clickRemoveOf(name: string) {
        fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }))
    }

    private static clickConfirmRemove() {
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    }

    private static remove(name: string) {
        this.clickRemoveOf(name)
        this.clickConfirmRemove()
        this.answer({})
    }

    private static chooseListed(name: string) {
        fireEvent.click(screen.getByRole('button', { name }))
    }

    private static get deleteFileCheckbox() {
        return screen.getByRole('checkbox', {
            name: /^Delete /,
        }) as HTMLInputElement
    }

    private static answerListing(files: ProtocolFileReply[] = []) {
        this.answer({ protocols: files })
    }

    private static save(fileName: string) {
        this.clickSave()
        this.answer({ fileName })
    }

    private static answer(reply: object) {
        act(() => {
            this.orchestratorSocket.open()
            this.orchestratorSocket.receive(reply)
        })
    }

    private static openOrchestratorSocket() {
        act(() => this.orchestratorSocket.open())
    }

    private static clickSave() {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    }

    private static file(fileName: string, name: string): ProtocolFileReply {
        return { fileName, protocol: { schemaVersion: 1, name } }
    }

    private static get orchestratorSocket() {
        return FakeWebSocket.instances.at(-1)!
    }

    private static get lastSentMessage() {
        return JSON.parse(FakeWebSocket.callsToSend.at(-1)!.data as string)
    }

    private static get alertText() {
        return screen.getByRole('alert').textContent
    }

    private static get statusText() {
        return screen.getByRole('status').textContent
    }

    private static chooseTab(name: string) {
        fireEvent.click(screen.getByRole('tab', { name }))
    }

    private static clickNewProtocol() {
        fireEvent.click(screen.getByRole('button', { name: 'New protocol' }))
    }

    private static typeName(name: string) {
        fireEvent.change(this.nameInput, { target: { value: name } })
    }

    private static get nameInput() {
        return screen.getByLabelText('Name') as HTMLInputElement
    }

    private static get listedNames() {
        return within(screen.getByRole('navigation', { name: 'Protocols' }))
            .queryAllByRole('listitem')
            .map((item) => within(item).getAllByRole('button')[0].textContent)
    }

    private static get selectedName() {
        return screen.getByRole('button', { current: true }).textContent
    }
}

interface ProtocolFileReply {
    fileName: string
    protocol: { schemaVersion: number; name: string }
}
