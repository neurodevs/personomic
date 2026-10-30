import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import FakeSpeaker from '../../../testDoubles/Speaker/FakeSpeaker'
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
    protected static async saysFullPathWhereProtocolWasSaved() {
        this.answerListing()
        this.clickNewProtocol()
        this.clickSave()

        this.answer({
            fileName: 'untitled-protocol.json',
            filePath: '/Users/me/Personomic/Protocols/untitled-protocol.json',
        })

        assert.isEqual(
            this.statusText,
            'Saved to /Users/me/Personomic/Protocols/untitled-protocol.json',
            'Did not say the full path where the protocol was saved!'
        )
    }

    @test()
    protected static async saysFileNameWhenOrchestratorGivesNoPath() {
        this.answerListing()
        this.clickNewProtocol()

        this.save('untitled-protocol.json')

        assert.isEqual(
            this.statusText,
            'Saved to untitled-protocol.json',
            'Did not say the file name when the orchestrator gave no path!'
        )
    }

    @test()
    protected static async savesAgainToTheSameFile() {
        this.answerListing()
        this.clickNewProtocol()
        this.typeName('Tilt series')
        this.save('tilt-series.json')
        this.typeName('Tilt series 2')

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
        this.typeName('Beeps 2')

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
    protected static async opensFilePickerWhenUploadProtocolIsClicked() {
        this.answerListing()
        let numPickerOpenings = 0
        screen.getByLabelText('Protocol to upload').click = () =>
            numPickerOpenings++

        fireEvent.click(screen.getByRole('button', { name: 'Upload protocol' }))

        assert.isEqual(
            numPickerOpenings,
            1,
            'Did not open the file picker when Upload protocol was clicked!'
        )
    }

    @test()
    protected static async uploadsProtocolAsNewUnsavedProtocol() {
        this.answerListing()

        await this.upload('i-insula.json', this.insulaContents)

        assert.isEqualDeep(
            {
                listed: this.listedNames,
                selected: this.selectedName,
                unsaved: this.unsavedNames,
                biosensors: this.biosensorNames,
            },
            {
                listed: ['I-INSULA'],
                selected: 'I-INSULA',
                unsaved: ['I-INSULA'],
                biosensors: ['OpenBCI Cyton'],
            },
            'Did not upload the protocol as a new unsaved protocol!'
        )
    }

    @test()
    protected static async savesUploadedProtocolAsNewFile() {
        this.answerListing()
        await this.upload('i-insula.json', this.insulaContents)

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            {
                fileName: this.lastSentMessage.fileName,
                name: this.lastSentMessage.protocol.name,
            },
            { fileName: undefined, name: 'I-INSULA' },
            'Did not save the uploaded protocol as a new file!'
        )
    }

    @test()
    protected static async saysWhenUploadedFileIsNotAProtocol() {
        this.answerListing()

        await this.upload('notes.json', 'just some notes')

        assert.isEqualDeep(
            { alert: this.alertText, listed: this.listedNames },
            {
                alert: 'Could not upload notes.json. It does not hold a protocol.',
                listed: [],
            },
            'Did not say the uploaded file was not a protocol!'
        )
    }

    @test()
    protected static async saysToChooseNewNameWhenUploadedNameExists() {
        this.answerListing([this.file('i-insula.json', 'I-INSULA')])

        await this.upload('i-insula.json', this.insulaContents)

        assert.isTrue(
            screen.queryByText(
                'I-INSULA is already a protocol. Please choose a new name.'
            ) !== null,
            'Did not say to Please choose a new name for an uploaded name that exists!'
        )
    }

    @test()
    protected static async stopsAskingForNewNameOnceRenamed() {
        this.answerListing([this.file('i-insula.json', 'I-INSULA')])
        await this.upload('i-insula.json', this.insulaContents)

        this.typeName('I-INSULA 2')

        assert.isFalse(
            this.isNewNameAskedFor,
            'Kept asking for a new name once renamed!'
        )
    }

    @test()
    protected static async disablesSaveUntilTakenNameIsChanged() {
        this.answerListing([this.file('i-insula.json', 'I-INSULA')])
        await this.upload('i-insula.json', this.insulaContents)
        const whileTaken = this.saveButton.disabled

        this.typeName('I-INSULA 2')

        assert.isEqualDeep(
            { whileTaken, onceChanged: this.saveButton.disabled },
            { whileTaken: true, onceChanged: false },
            'Did not disable Save until the taken name was changed!'
        )
    }

    private static get saveButton() {
        return screen.getByRole('button', {
            name: 'Save',
        }) as HTMLButtonElement
    }

    @test()
    protected static async disablesCancelUntilChangesAreMade() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')
        const beforeChanging = this.cancelButton.disabled

        this.typeName('Changed')

        assert.isEqualDeep(
            { beforeChanging, afterChanging: this.cancelButton.disabled },
            { beforeChanging: true, afterChanging: false },
            'Did not disable Cancel until changes were made!'
        )
    }

    @test()
    protected static async disablesSaveUntilChangesAreMade() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')
        const beforeChanging = this.saveButton.disabled

        this.typeName('Changed')

        assert.isEqualDeep(
            { beforeChanging, afterChanging: this.saveButton.disabled },
            { beforeChanging: true, afterChanging: false },
            'Did not disable Save until changes were made!'
        )
    }

    @test()
    protected static async cancelDiscardsChanges() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')
        this.typeName('Changed')
        this.addBiosensor('OpenBCI Cyton')

        fireEvent.click(this.cancelButton)

        assert.isEqualDeep(
            {
                listed: this.listedNames,
                unsaved: this.unsavedNames,
                name: this.nameInput.value,
                hasNoBiosensors: this.isNoneAddedSaidOnProtocols,
            },
            {
                listed: ['Beeps'],
                unsaved: [],
                name: 'Beeps',
                hasNoBiosensors: true,
            },
            'Did not discard the changes on Cancel!'
        )
    }

    @test()
    protected static async cancelRemovesProtocolThatWasNeverSaved() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.clickNewProtocol()

        fireEvent.click(this.cancelButton)

        assert.isEqualDeep(
            { listed: this.listedNames, isEditing: this.isEditing },
            { listed: ['Beeps'], isEditing: false },
            'Did not remove the never-saved protocol on Cancel!'
        )
    }

    private static get cancelButton() {
        return screen.getByRole('button', {
            name: 'Cancel',
        }) as HTMLButtonElement
    }

    private static get isEditing() {
        return screen.queryByLabelText('Name') !== null
    }

    @test()
    protected static async doesNotAskForNewNameOfUntitledProtocols() {
        this.answerListing()
        this.clickNewProtocol()

        this.clickNewProtocol()

        assert.isFalse(
            this.isNewNameAskedFor,
            'Asked for a new name of untitled protocols!'
        )
    }

    private static get isNewNameAskedFor() {
        return screen.queryByText(/Please choose a new name\.$/) !== null
    }

    private static readonly insulaContents = JSON.stringify({
        schemaVersion: 1,
        name: 'I-INSULA',
        devices: [{ deviceName: 'OpenBCI Cyton' }],
    })

    private static async upload(fileName: string, contents: string) {
        const file = { name: fileName, text: async () => contents }

        await act(async () => {
            fireEvent.change(screen.getByLabelText('Protocol to upload'), {
                target: { files: [file] },
            })
        })
    }

    @test()
    protected static async saysNewProtocolHasNoBiosensorsYet() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isTrue(
            this.isNoneAddedSaidOnProtocols,
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
            this.isNoneAddedSaidOnProtocols,
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
    protected static async savesRecordDefaultsWithProtocol() {
        this.answerListing()
        this.clickNewProtocol()
        this.turnRecordOn()
        this.typeInto('Recordings folder', '/data/study')
        this.typeInto('Recording name', 'participant')

        this.clickSave()
        this.openOrchestratorSocket()

        const { recordXdf, recordDirectory, recordFileStub } =
            this.lastSentMessage.protocol

        assert.isEqualDeep(
            { recordXdf, recordDirectory, recordFileStub },
            {
                recordXdf: true,
                recordDirectory: '/data/study',
                recordFileStub: 'participant',
            },
            'Did not save the record defaults with the protocol!'
        )
    }

    @test()
    protected static async suggestsRecordFolderNamedAfterProtocol() {
        this.answerListing()
        this.clickNewProtocol()
        this.typeName('Eyes Closed Baseline')

        this.turnRecordOn()

        assert.isEqual(
            (screen.getByLabelText('Recordings folder') as HTMLInputElement)
                .placeholder,
            '~/Personomic/Protocols/eyes-closed-baseline',
            'Did not suggest a record folder named after the protocol!'
        )
    }

    @test()
    protected static async browsesForRecordFolder() {
        this.answerListing()
        this.clickNewProtocol()
        this.turnRecordOn()

        fireEvent.click(screen.getByRole('button', { name: 'Browse…' }))
        this.answer({ directory: '/chosen' })

        assert.isEqualDeep(
            {
                asked: this.lastSentMessage,
                folder: (
                    screen.getByLabelText(
                        'Recordings folder'
                    ) as HTMLInputElement
                ).value,
            },
            { asked: { command: 'chooseDirectory' }, folder: '/chosen' },
            'Did not browse for the record folder!'
        )
    }

    @test()
    protected static async savesNoRecordDefaultsForProtocolThatDoesNotRecord() {
        this.answerListing()
        this.clickNewProtocol()

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage.protocol,
            { schemaVersion: 1, name: '', devices: [] },
            'Saved record defaults for a protocol that does not record!'
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
    protected static async savesStreamsTurnedOffForBiosensor() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('Muse S Gen 2')

        fireEvent.click(
            screen.getByRole('button', { name: 'Muse S Gen 2 settings' })
        )
        fireEvent.click(
            screen.getByRole('checkbox', { name: 'Muse S Gen 2 PPG' })
        )

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage.protocol.devices,
            [{ deviceName: 'Muse S Gen 2', disableStreams: ['PPG'] }],
            'Did not save the streams turned off for the biosensor!'
        )
    }

    @test()
    protected static async savesExgTypeChosenForCyton() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('OpenBCI Cyton')

        fireEvent.click(
            screen.getByRole('button', { name: 'OpenBCI Cyton settings' })
        )
        fireEvent.change(
            screen.getByRole('combobox', { name: 'OpenBCI Cyton ExG type' }),
            { target: { value: 'EOG' } }
        )

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage.protocol.devices,
            [{ deviceName: 'OpenBCI Cyton', exgType: 'EOG' }],
            'Did not save the ExG type chosen for the Cyton!'
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
    protected static async disablesDownloadOfProtocolWithUnsavedChanges() {
        this.answerListing([
            this.file('beeps.json', 'Beeps'),
            this.file('tilt.json', 'Tilt'),
        ])
        this.chooseListed('Beeps')

        this.typeName('Loud beeps')

        assert.isEqualDeep(
            {
                edited: this.downloadButtonOf('Loud beeps').disabled,
                other: this.downloadButtonOf('Tilt').disabled,
            },
            { edited: true, other: false },
            'Did not disable download of only the protocol with unsaved changes!'
        )
    }

    @test()
    protected static async asksToSaveChangesBeforeDownloading() {
        this.answerListing([
            this.file('beeps.json', 'Beeps'),
            this.file('tilt.json', 'Tilt'),
        ])
        this.chooseListed('Beeps')

        this.typeName('Loud beeps')

        assert.isEqualDeep(
            {
                edited: this.downloadButtonOf('Loud beeps').title,
                other: this.downloadButtonOf('Tilt').title,
            },
            {
                edited: 'Download (save or cancel changes)',
                other: 'Download',
            },
            'Did not ask to save changes before downloading!'
        )
    }

    @test()
    protected static async enablesDownloadOnceNewProtocolIsSaved() {
        this.answerListing()
        this.clickNewProtocol()
        this.typeName('Tilt')
        const beforeSaving = this.downloadButtonOf('Tilt').disabled

        this.save('tilt.json')

        assert.isEqualDeep(
            {
                beforeSaving,
                afterSaving: this.downloadButtonOf('Tilt').disabled,
            },
            { beforeSaving: true, afterSaving: false },
            'Did not enable download once the new protocol was saved!'
        )
    }

    private static downloadButtonOf(name: string) {
        return screen.getByRole('button', {
            name: `Download ${name}`,
        }) as HTMLButtonElement
    }

    @test()
    protected static async disablesRemoveOfProtocolWithUnsavedChanges() {
        this.answerListing([
            this.file('beeps.json', 'Beeps'),
            this.file('tilt.json', 'Tilt'),
        ])
        this.chooseListed('Beeps')

        this.typeName('Loud beeps')

        assert.isEqualDeep(
            {
                edited: this.removeStateOf('Loud beeps'),
                other: this.removeStateOf('Tilt'),
            },
            {
                edited: {
                    isDisabled: true,
                    tooltip: 'Remove (save or cancel changes)',
                },
                other: { isDisabled: false, tooltip: 'Remove' },
            },
            'Did not disable remove of only the protocol with unsaved changes!'
        )
    }

    @test()
    protected static async disablesRemoveOfProtocolThatWasNeverSaved() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isTrue(
            this.removeStateOf('Untitled protocol').isDisabled,
            'Did not disable remove of a protocol that was never saved!'
        )
    }

    private static removeStateOf(name: string) {
        const button = this.removeButtonOf(name)
        return { isDisabled: button.disabled, tooltip: button.title }
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
    protected static async keepsRemoveButtonDisabledWhileAsking() {
        this.answerListing([this.file('beeps.json', 'Beeps')])

        this.clickRemoveOf('Beeps')

        assert.isTrue(
            (
                screen.getByRole('button', {
                    name: 'Remove Beeps',
                }) as HTMLButtonElement
            ).disabled,
            'Did not keep the remove button disabled while asking!'
        )
    }

    @test()
    protected static async pointsToConfirmationWhileAsking() {
        this.answerListing([
            this.file('beeps.json', 'Beeps'),
            this.file('tilt.json', 'Tilt'),
        ])

        this.clickRemoveOf('Beeps')

        assert.isEqualDeep(
            {
                asking: this.removeButtonOf('Beeps').title,
                other: this.removeButtonOf('Tilt').title,
            },
            { asking: 'Remove (confirm or cancel below)', other: 'Remove' },
            'Did not point to the confirmation while asking!'
        )
    }

    private static removeButtonOf(name: string) {
        return screen.getByRole('button', {
            name: `Remove ${name}`,
        }) as HTMLButtonElement
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

    @test()
    protected static async marksNewProtocolUnsaved() {
        this.answerListing()

        this.clickNewProtocol()

        assert.isEqualDeep(
            this.unsavedNames,
            ['Untitled protocol'],
            'Did not mark a new protocol unsaved!'
        )
    }

    @test()
    protected static async clearsUnsavedMarkOnceSaved() {
        this.answerListing()
        this.clickNewProtocol()

        this.save('untitled-protocol.json')

        assert.isEqualDeep(
            this.unsavedNames,
            [],
            'Did not clear the unsaved mark once saved!'
        )
    }

    @test()
    protected static async marksSavedProtocolUnsavedOnceRenamed() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')

        this.typeName('Loud beeps')

        assert.isEqualDeep(
            this.unsavedNames,
            ['Loud beeps'],
            'Did not mark a saved protocol unsaved once renamed!'
        )
    }

    @test()
    protected static async marksSavedProtocolUnsavedOnceBiosensorsChange() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')

        this.addBiosensor('Muse S Gen 2')

        assert.isEqualDeep(
            this.unsavedNames,
            ['Beeps'],
            'Did not mark a saved protocol unsaved once its biosensors changed!'
        )
    }

    @test()
    protected static async clearsUnsavedMarkWhenEditedBackToSaved() {
        this.answerListing([this.file('beeps.json', 'Beeps')])
        this.chooseListed('Beeps')
        this.typeName('Loud beeps')

        this.typeName('Beeps')

        assert.isEqualDeep(
            this.unsavedNames,
            [],
            'Did not clear the unsaved mark when edited back to as saved!'
        )
    }

    @test()
    protected static async keepsUnsavedMarkWhenSavingFails() {
        this.answerListing()
        this.clickNewProtocol()
        this.clickSave()

        this.answer({ error: 'Permission denied' })

        assert.isEqualDeep(
            this.unsavedNames,
            ['Untitled protocol'],
            'Did not keep the unsaved mark when saving failed!'
        )
    }

    @test()
    protected static async keepsUnsavedMarkForEditsMadeWhileSaving() {
        this.answerListing()
        this.clickNewProtocol()
        this.clickSave()

        this.typeName('Tilt series')
        this.answer({ fileName: 'untitled-protocol.json' })

        assert.isEqualDeep(
            this.unsavedNames,
            ['Tilt series'],
            'Did not keep the unsaved mark for edits made while saving!'
        )
    }

    @test()
    protected static async showsSavedProtocolInFinderWhenItsPathIsClicked() {
        this.answerListing()
        this.clickNewProtocol()
        this.typeName('Tilt series')
        this.clickSave()
        this.answer({
            fileName: 'tilt-series.json',
            filePath: '/protocols/tilt-series.json',
        })

        this.clickSavedPath('/protocols/tilt-series.json')
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage,
            { command: 'revealProtocol', fileName: 'tilt-series.json' },
            'Did not show the saved protocol in Finder when its path was clicked!'
        )
    }

    @test()
    protected static async showsErrorFromShowingSavedProtocol() {
        this.answerListing()
        this.clickNewProtocol()
        this.save('untitled-protocol.json')

        this.clickSavedPath('untitled-protocol.json')
        this.answer({ error: 'Showing the protocol only works on macOS.' })

        assert.isEqual(
            this.alertText,
            'Showing the protocol only works on macOS.',
            'Did not show the error from showing the saved protocol!'
        )
    }

    @test()
    protected static async saysOrchestratorIsUnreachableWhenShowingSavedProtocol() {
        this.answerListing()
        this.clickNewProtocol()
        this.save('untitled-protocol.json')

        this.clickSavedPath('untitled-protocol.json')
        act(() => this.orchestratorSocket.dropConnection())

        assert.isEqual(
            this.alertText,
            'Could not reach the orchestrator. Start it with `yarn run.orchestrator`.',
            'Did not say the orchestrator is unreachable when showing the saved protocol!'
        )
    }

    @test()
    protected static async requiresIdentifierOfRepeatedBiosensors() {
        this.answerListing()
        this.clickNewProtocol()
        this.addBiosensor('Govee Thermohygrometer H5074')

        this.addBiosensor('Govee Thermohygrometer H5074')

        assert.isEqualDeep(
            screen
                .getAllByRole('textbox', { name: /UUID/ })
                .map((input) => input.getAttribute('placeholder')),
            ['UUID (required)', 'UUID (required)'],
            'Did not require the identifier of repeated biosensors!'
        )
    }

    @test()
    protected static async showsPhasesBelowBiosensors() {
        this.answerListing()

        this.clickNewProtocol()

        const biosensors = screen.getByRole('region', { name: 'Biosensors' })
        const phases = screen.getByRole('region', { name: 'Phases' })

        assert.isTrue(
            (biosensors.compareDocumentPosition(phases) &
                Node.DOCUMENT_POSITION_FOLLOWING) !==
                0,
            'Did not show the phases below the biosensors!'
        )
    }

    @test()
    protected static async readsEventMarkersOfOlderProtocolAsPhases() {
        this.answerListing()

        await this.upload('i-insula.json', this.olderInsulaContents)

        assert.isEqualDeep(
            [1, 2].map(
                (number) =>
                    (
                        screen.getByLabelText(
                            `Phase ${number} name`
                        ) as HTMLInputElement
                    ).value
            ),
            ['pre-baseline', 'post-baseline'],
            'Did not read the event markers of an older protocol as phases!'
        )
    }

    @test()
    protected static async savesOlderProtocolWithPhasesOnly() {
        this.answerListing()
        await this.upload('i-insula.json', this.olderInsulaContents)

        this.clickSave()
        this.openOrchestratorSocket()

        const { phases, sessionBeginMarker, eventMarkers, sessionEndMarker } =
            this.lastSentMessage.protocol

        assert.isEqualDeep(
            {
                phases: phases.map(
                    ({
                        name,
                        durationMs,
                    }: {
                        name: string
                        durationMs: number
                    }) => ({
                        name,
                        durationMs,
                    })
                ),
                markers: [sessionBeginMarker, eventMarkers, sessionEndMarker],
            },
            {
                phases: [
                    { name: 'pre-baseline', durationMs: 300000 },
                    { name: 'post-baseline', durationMs: 300000 },
                ],
                markers: [undefined, undefined, undefined],
            },
            'Did not save the older protocol with phases only!'
        )
    }

    private static readonly olderInsulaContents = JSON.stringify({
        schemaVersion: 1,
        name: 'I-INSULA',
        devices: [],
        sessionBeginMarker: { name: 'session-begin', waitAfterMs: 0 },
        eventMarkers: [
            { name: 'pre-baseline', waitAfterMs: 300000 },
            { name: 'post-baseline', waitAfterMs: 300000 },
        ],
        sessionEndMarker: { name: 'session-end', waitAfterMs: 0 },
    })

    @test()
    protected static async savesPhasesOfProtocol() {
        this.answerListing()
        this.clickNewProtocol()
        fireEvent.click(screen.getByRole('button', { name: 'Add phase' }))
        this.typeInto('Phase 1 name', 'pre-baseline')
        this.typeInto('Phase 1 lasts (seconds)', '300')

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            this.lastSentMessage.protocol.phases,
            [
                {
                    name: 'pre-baseline',
                    durationMs: 300000,
                    items: [],
                    blockOrder: 'fixed',
                },
            ],
            'Did not save the phases of the protocol!'
        )
    }

    @test()
    protected static async savesCueVoiceWithPhases() {
        FakeSpeaker.availableVoices = ['Alex', 'Tara']
        this.answerListing()
        this.clickNewProtocol()
        fireEvent.click(screen.getByRole('button', { name: 'Add phase' }))
        const defaultVoice = this.chosenVoice
        this.typeInto('Cue voice', 'Alex')

        this.clickSave()
        this.openOrchestratorSocket()

        assert.isEqualDeep(
            { defaultVoice, saved: this.lastSentMessage.protocol.voice },
            { defaultVoice: 'Tara', saved: 'Alex' },
            'Did not save the cue voice with the phases!'
        )
    }

    @test()
    protected static async showsCueVoiceOfListedProtocol() {
        this.answerListing([
            {
                fileName: 'tilt.json',
                protocol: {
                    schemaVersion: 1,
                    name: 'Tilt',
                    voice: 'Rishi',
                    phases: [{ name: 'pre-baseline', durationMs: 300000 }],
                },
            },
        ])

        fireEvent.click(screen.getByRole('button', { name: 'Tilt' }))

        assert.isEqual(
            this.chosenVoice,
            'Rishi',
            'Did not show the cue voice of the listed protocol!'
        )
    }

    private static get chosenVoice() {
        return (screen.getByLabelText('Cue voice') as HTMLSelectElement).value
    }

    @test()
    protected static async showsPhasesOfListedProtocol() {
        this.answerListing([
            {
                fileName: 'tilt.json',
                protocol: {
                    schemaVersion: 1,
                    name: 'Tilt',
                    phases: [{ name: 'pre-baseline', durationMs: 300000 }],
                },
            },
        ])

        fireEvent.click(screen.getByRole('button', { name: 'Tilt' }))

        assert.isEqual(
            (screen.getByLabelText('Phase 1 name') as HTMLInputElement).value,
            'pre-baseline',
            'Did not show the phases of the listed protocol!'
        )
    }

    private static clickSavedPath(path: string) {
        fireEvent.click(screen.getByRole('button', { name: path }))
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

    private static turnRecordOn() {
        fireEvent.click(screen.getByRole('checkbox', { name: 'Record XDF' }))
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

    private static get unsavedNames() {
        return within(screen.getByRole('navigation', { name: 'Protocols' }))
            .queryAllByRole('listitem')
            .filter(
                (item) =>
                    within(item).queryByRole('img', {
                        name: 'Unsaved changes',
                    }) !== null
            )
            .map((item) => within(item).getAllByRole('button')[0].textContent)
    }

    private static get selectedName() {
        return screen.getByRole('button', { current: true }).textContent
    }
}

interface ProtocolFileReply {
    fileName: string
    protocol: { schemaVersion: number; name: string; [field: string]: unknown }
}
