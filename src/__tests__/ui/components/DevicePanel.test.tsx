import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'

import DevicePanel, {
    DevicePanelProps,
    deviceDragType,
} from '../../../ui/components/DevicePanel'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class DevicePanelTest extends AbstractPackageTest {
    private static readonly deviceKey = 'Muse S Gen 2 #2'
    private static changes: [string, string[]][] = []

    protected static async beforeEach() {
        await super.beforeEach()

        this.changes = []
    }

    @test()
    protected static async offersSettingsOfBiosensorWithStreamsToTurnOff() {
        this.renderPanel()

        assert.isTrue(
            this.isSettingsButtonShown,
            'Did not offer settings of a biosensor with streams to turn off!'
        )
    }

    @test()
    protected static async hidesSettingsWithoutChangeHandler() {
        this.renderPanel({ onDisabledStreamsChange: undefined })

        assert.isFalse(
            this.isSettingsButtonShown,
            'Offered settings that could not be changed!'
        )
    }

    @test()
    protected static async showsUnchangeableStreamsTurnedOffWithoutChangeHandler() {
        this.renderPanel({
            disabledStreams: ['PPG'],
            onDisabledStreamsChange: undefined,
        })

        this.clickSettings()

        assert.isEqualDeep(
            {
                checked: this.checkedStreamNames,
                areAllDisabled: this.streamToggles.every(
                    (toggle) => toggle.disabled
                ),
            },
            {
                checked: ['EEG', 'Gyroscope', 'Accelerometer'],
                areAllDisabled: true,
            },
            'Did not show unchangeable streams turned off!'
        )
    }

    @test()
    protected static async showsOnlyCodeOfUnchangeableExgType() {
        this.renderPanel(
            {
                disabledStreams: [],
                exgType: 'EGG',
                onDisabledStreamsChange: undefined,
            },
            'OpenBCI Cyton'
        )

        this.clickSettings()

        assert.isEqualDeep(
            {
                shown: this.shownExgType,
                isOffered: screen.queryByRole('combobox') !== null,
            },
            { shown: 'EGG', isOffered: false },
            'Did not show only the code of an unchangeable ExG type!'
        )
    }

    @test('offers handle to reorder with move handler', true)
    @test('offers no handle to reorder without move handler', false)
    protected static async offersHandleToReorderOnlyWithMoveHandler(
        isMovable: boolean
    ) {
        this.renderPanel({ onMove: isMovable ? () => {} : undefined })

        assert.isEqual(
            this.reorderHandle !== null,
            isMovable,
            'Did not offer a handle to reorder only with a move handler!'
        )
    }

    @test('places device dropped on top half before', 120, 'before')
    @test('places device dropped on bottom half after', 180, 'after')
    protected static async reportsWhereDeviceDroppedOntoItGoes(
        clientY: number,
        placement: string
    ) {
        const moves: [string, string, string][] = []
        this.renderPanel({
            onMove: (key, toKey, where) => moves.push([key, toKey, where]),
        })

        this.dropDevice('Muse 2', clientY)

        assert.isEqualDeep(
            moves,
            [['Muse 2', this.deviceKey, placement]],
            'Did not report where the device dropped onto it goes!'
        )
    }

    @test('shows insertion line above over top half', 120, 'before')
    @test('shows insertion line below over bottom half', 180, 'after')
    protected static async showsInsertionLineWhereDeviceWouldGo(
        clientY: number,
        placement: string
    ) {
        this.renderPanel({ onMove: () => {} })

        this.dragDeviceOver('Muse 2', clientY)

        assert.isTrue(
            this.panel.classList.contains(
                `stream-monitor__device--drop-${placement}`
            ),
            'Did not show the insertion line where the device would go!'
        )
    }

    @test()
    protected static async hidesInsertionLineOnceDropped() {
        this.renderPanel({ onMove: () => {} })

        this.dropDevice('Muse 2', 120)

        assert.isFalse(
            this.panel.className.includes('--drop-'),
            'Kept showing the insertion line once dropped!'
        )
    }

    @test()
    protected static async ignoresDropsOfAnythingButDevices() {
        const moves: [string, string][] = []
        this.renderPanel({
            onMove: (key, toKey) => moves.push([key, toKey]),
        })
        const dataTransfer = this.fakeDataTransfer({ 'text/plain': 'hello' })

        fireDragEvent(this.panel, 'dragover', { dataTransfer, clientY: 120 })
        fireDragEvent(this.panel, 'drop', { dataTransfer, clientY: 120 })

        assert.isEqualDeep(moves, [], 'Moved a device on a drop of text!')
    }

    @test()
    protected static async carriesItsKeyWhenDragged() {
        this.renderPanel({ onMove: () => {} })
        const dataTransfer = this.fakeDataTransfer({})

        fireEvent.dragStart(this.reorderHandle!, { dataTransfer })

        assert.isEqual(
            dataTransfer.getData(deviceDragType),
            this.deviceKey,
            'Did not carry its key when dragged!'
        )
    }

    @test()
    protected static async hidesStreamsUntilSettingsAreOpened() {
        this.renderPanel()

        assert.isEqualDeep(
            { toggles: this.streamToggleNames, isExpanded: this.isExpanded },
            { toggles: [], isExpanded: 'false' },
            'Showed streams before settings were opened!'
        )
    }

    @test()
    protected static async closesSettingsWhenGearIsClickedAgain() {
        this.renderPanel()

        this.clickSettings()
        this.clickSettings()

        assert.isEqualDeep(
            this.streamToggleNames,
            [],
            'Did not close settings when the gear was clicked again!'
        )
    }

    @test('offers streams of Muse S Gen 2', 'Muse S Gen 2', [
        'EEG',
        'PPG',
        'Gyroscope',
        'Accelerometer',
    ])
    @test(
        'offers streams of auto-detected Muse',
        'Muse (auto-detect, slower)',
        ['EEG', 'PPG', 'Gyroscope', 'Accelerometer']
    )
    @test('offers coupled streams of Muse S Athena as one', 'Muse S Athena', [
        'EEG',
        'PPG',
        'Accelerometer + Gyroscope',
    ])
    @test('offers streams of Govee', 'Govee Thermohygrometer H5074', [
        'Temperature',
        'Humidity',
        'Battery',
    ])
    @test('offers streams of Cognionics', 'Cognionics Quick-20r', [
        'EEG',
        'Accelerometer',
    ])
    @test('offers streams of OpenBCI Cyton', 'OpenBCI Cyton', [
        'ExG',
        'Accelerometer',
    ])
    @test('offers streams of Zephyr BioHarness 3', 'Zephyr BioHarness 3', [
        'ECG',
        'Accelerometer',
        'Respiration',
        'R-to-R',
    ])
    protected static async offersEachStreamOfModel(
        name: string,
        expected: string[]
    ) {
        this.renderPanel({}, name)

        this.clickSettings()

        assert.isEqualDeep(
            this.streamToggleNames,
            expected,
            `Did not offer each stream of ${name}!`
        )
    }

    @test()
    protected static async offersEachExgTypeOfCyton() {
        this.renderCyton()

        assert.isEqualDeep(
            this.exgTypeOptions,
            ['ExG', 'EEG', 'EMG', 'ECG', 'EGG', 'EOG'],
            'Did not offer each ExG type of the Cyton!'
        )
    }

    @test()
    protected static async explainsEachExgTypeOfCyton() {
        this.renderCyton()

        assert.isEqualDeep(
            Array.from(this.exgTypeSelect.options).map(({ text }) => text),
            [
                'ExG — Any biopotential',
                'EEG — Electroencephalogram (Brain)',
                'EMG — Electromyogram (Muscle)',
                'ECG — Electrocardiogram (Heart)',
                'EGG — Electrogastrogram (Stomach)',
                'EOG — Electrooculogram (Eye movement)',
            ],
            'Did not explain each ExG type of the Cyton!'
        )
    }

    @test('shows ExG type of Cyton as ExG by default', undefined, 'ExG')
    @test('shows chosen ExG type of Cyton', 'EGG', 'EGG')
    protected static async showsExgTypeOfCyton(
        exgType: string | undefined,
        expected: string
    ) {
        this.renderCyton({ exgType })

        assert.isEqualDeep(
            { chosen: this.exgTypeSelect.value, shown: this.shownExgType },
            { chosen: expected, shown: expected },
            'Did not show only the code of the ExG type of the Cyton!'
        )
    }

    @test()
    protected static async reportsExgTypeChosenWithDeviceKey() {
        const chosen: [string, string][] = []

        this.renderCyton({
            onExgTypeChange: (key, exgType) => chosen.push([key, exgType]),
        })

        fireEvent.change(this.exgTypeSelect, { target: { value: 'EMG' } })

        assert.isEqualDeep(
            chosen,
            [[this.deviceKey, 'EMG']],
            'Did not report the ExG type chosen with the device key!'
        )
    }

    @test()
    protected static async doesNotOfferExgTypeWithoutChangeHandler() {
        this.renderPanel({}, 'OpenBCI Cyton')

        this.clickSettings()

        assert.isNull(
            screen.queryByRole('combobox'),
            'Offered an ExG type that could not be changed!'
        )
    }

    @test()
    protected static async checksOnlyStreamsThatAreNotTurnedOff() {
        this.renderPanel({ disabledStreams: ['PPG', 'Gyroscope'] })

        this.clickSettings()

        assert.isEqualDeep(
            this.checkedStreamNames,
            ['EEG', 'Accelerometer'],
            'Did not check only streams that are not turned off!'
        )
    }

    @test()
    protected static async reportsStreamTurnedOffWithDeviceKey() {
        this.renderPanel({ disabledStreams: ['Gyroscope'] })
        this.clickSettings()

        this.clickStream('PPG')

        assert.isEqualDeep(
            this.changes,
            [[this.deviceKey, ['PPG', 'Gyroscope']]],
            'Did not report the stream turned off with the device key!'
        )
    }

    @test()
    protected static async reportsZephyrRToRByItsStreamName() {
        this.renderPanel({}, 'Zephyr BioHarness 3')
        this.clickSettings()

        this.clickStream('R-to-R')

        assert.isEqualDeep(
            this.changes,
            [[this.deviceKey, ['RtoR']]],
            'Did not report the Zephyr R-to-R by its stream name!'
        )
    }

    @test()
    protected static async reportsStreamTurnedBackOn() {
        this.renderPanel({ disabledStreams: ['PPG', 'Gyroscope'] })
        this.clickSettings()

        this.clickStream('PPG')

        assert.isEqualDeep(
            this.changes,
            [[this.deviceKey, ['Gyroscope']]],
            'Did not report the stream turned back on!'
        )
    }

    @test()
    protected static async turnsOffCoupledStreamsTogether() {
        this.renderPanel({}, 'Muse S Athena')
        this.clickSettings()

        this.clickStream('Accelerometer + Gyroscope')

        assert.isEqualDeep(
            this.changes,
            [[this.deviceKey, ['Accelerometer', 'Gyroscope']]],
            'Did not turn off coupled streams together!'
        )
    }

    @test()
    protected static async keepsLastStreamOn() {
        this.renderPanel({ disabledStreams: ['EEG', 'PPG', 'Gyroscope'] })

        this.clickSettings()

        assert.isTrue(
            this.streamToggle('Accelerometer').disabled,
            'Let the last stream be turned off!'
        )
    }

    @test()
    protected static async keepsPlotsShownWhenSettingsAreClicked() {
        this.renderPanel({
            device: {
                ...this.device(),
                streams: [{ name: 'EEG', wssPort: 1 }],
            },
            children: <div data-testid="plot" />,
        })
        this.clickSettings()

        fireEvent.click(screen.getByText('PPG'))

        assert.isTrue(
            screen.queryByTestId('plot') !== null,
            'Hid plots when settings were clicked!'
        )
    }

    @test()
    protected static async leavesNicknameOptionalWhileIdentifierIs() {
        this.renderWithIdentifier(false)

        assert.isEqual(
            this.nicknameInput.placeholder,
            'Nickname (optional)',
            'Did not leave the nickname optional while the identifier is!'
        )
    }

    @test()
    protected static async recommendsNicknameOnceIdentifierIsRequired() {
        this.renderWithIdentifier(true)

        assert.isEqual(
            this.nicknameInput.placeholder,
            'Nickname (recommended)',
            'Did not recommend a nickname once the identifier was required!'
        )
    }

    @test()
    protected static async offersFullNameOnHoverInCaseItIsCutOff() {
        this.renderPanel()

        assert.isEqual(
            screen.getByText(this.deviceKey).getAttribute('title'),
            this.deviceKey,
            'Did not offer the full name on hover in case it is cut off!'
        )
    }

    @test()
    protected static async showsTooltipForNicknameOnHover() {
        this.renderWithIdentifier(false)

        assert.isEqual(
            this.nicknameInput.title,
            'Device nickname',
            'Did not show tooltip for nickname on hover!'
        )
    }

    @test()
    protected static async showsLockedIdentifierThatWasOnlyReported() {
        this.renderPanel({
            identifier: { label: 'UUID', value: '', reported: 'muse-uuid' },
        })

        assert.isTrue(
            screen.queryByDisplayValue('muse-uuid') !== null,
            'Did not show a locked identifier that was only reported!'
        )
    }

    @test()
    protected static async saysSignalIsLostOnlyWhileReconnecting() {
        this.renderPanel({ status: 'connected' })
        const whileConnected = this.isSignalLostSaid

        this.renderPanel({ status: 'reconnecting' })

        assert.isEqualDeep(
            { whileConnected, whileReconnecting: this.isSignalLostSaid },
            { whileConnected: false, whileReconnecting: true },
            'Did not say the signal was lost only while reconnecting!'
        )
    }

    @test()
    protected static async saysStreamingIsStartingOnlyWhileResuming() {
        this.renderPanel({ status: 'reconnecting' })
        const whileReconnecting = this.isStreamingStartingSaid

        this.renderPanel({ status: 'resuming' })

        assert.isEqualDeep(
            {
                whileReconnecting,
                whileResuming: this.isStreamingStartingSaid,
            },
            { whileReconnecting: false, whileResuming: true },
            'Did not say streaming was starting only while resuming!'
        )
    }

    private static get isStreamingStartingSaid() {
        return screen.queryByText('Reconnected. Starting streaming…') !== null
    }

    private static get isSignalLostSaid() {
        return screen.queryByText('Signal lost. Reconnecting…') !== null
    }

    private static renderWithIdentifier(isRequired: boolean) {
        this.renderPanel({
            identifier: { label: 'UUID', value: '', isRequired },
            onIdentifierChange: () => {},
            onNicknameChange: () => {},
        })
    }

    private static get nicknameInput() {
        return screen.getByRole('textbox', {
            name: `${this.deviceKey} nickname`,
        }) as HTMLInputElement
    }

    private static get reorderHandle() {
        return screen.queryByRole('button', {
            name: `Reorder ${this.deviceKey}`,
        })
    }

    private static get panel() {
        return screen.getByTestId(`device-${this.deviceKey}`)
    }

    private static dragDeviceOver(key: string, clientY: number) {
        const dataTransfer = this.fakeDataTransfer({ [deviceDragType]: key })
        this.placePanelBetween(100, 200)

        fireDragEvent(this.panel, 'dragover', { dataTransfer, clientY })

        return dataTransfer
    }

    private static dropDevice(key: string, clientY: number) {
        const dataTransfer = this.dragDeviceOver(key, clientY)
        fireDragEvent(this.panel, 'drop', { dataTransfer, clientY })
    }

    private static placePanelBetween(top: number, bottom: number) {
        this.panel.getBoundingClientRect = () =>
            ({ top, bottom, height: bottom - top }) as DOMRect
    }

    private static fakeDataTransfer(data: Record<string, string>) {
        return {
            get types() {
                return Object.keys(data)
            },
            getData: (type: string) => data[type] ?? '',
            setData: (type: string, value: string) => {
                data[type] = value
            },
            setDragImage: () => {},
            effectAllowed: '',
            dropEffect: '',
        }
    }

    private static renderCyton(props: Partial<DevicePanelProps> = {}) {
        this.renderPanel(
            { onExgTypeChange: () => {}, ...props },
            'OpenBCI Cyton'
        )
        this.clickSettings()
    }

    private static get exgTypeSelect() {
        return screen.getByRole('combobox', {
            name: `${this.deviceKey} ExG type`,
        }) as HTMLSelectElement
    }

    private static get shownExgType() {
        return document.querySelector('.stream-monitor__device-stream-type')
            ?.textContent
    }

    private static get exgTypeOptions() {
        return Array.from(this.exgTypeSelect.options).map(({ value }) => value)
    }

    private static renderPanel(
        props: Partial<DevicePanelProps> = {},
        name = 'Muse S Gen 2'
    ) {
        render(
            <DevicePanel
                device={this.device(name)}
                status="disconnected"
                onDisabledStreamsChange={(key, streams) =>
                    this.changes.push([key, streams])
                }
                {...props}
            />
        )
    }

    private static device(name = 'Muse S Gen 2') {
        return {
            key: this.deviceKey,
            name,
            label: this.deviceKey,
            streams: [],
            describedStreams: [],
        }
    }

    private static clickSettings() {
        fireEvent.click(this.settingsButton)
    }

    private static clickStream(label: string) {
        fireEvent.click(this.streamToggle(label))
    }

    private static get isSettingsButtonShown() {
        return (
            screen.queryByRole('button', {
                name: `${this.deviceKey} settings`,
            }) !== null
        )
    }

    private static get settingsButton() {
        return screen.getByRole('button', {
            name: `${this.deviceKey} settings`,
        })
    }

    private static get isExpanded() {
        return this.settingsButton.getAttribute('aria-expanded')
    }

    private static streamToggle(label: string) {
        return screen.getByRole('checkbox', {
            name: `${this.deviceKey} ${label}`,
        }) as HTMLInputElement
    }

    private static get streamToggles() {
        return screen.queryAllByRole('checkbox') as HTMLInputElement[]
    }

    private static get streamToggleNames() {
        return this.streamToggles.map((toggle) => this.streamNameOf(toggle))
    }

    private static get checkedStreamNames() {
        return this.streamToggles
            .filter((toggle) => toggle.checked)
            .map((toggle) => this.streamNameOf(toggle))
    }

    private static streamNameOf(toggle: HTMLInputElement) {
        return toggle
            .getAttribute('aria-label')!
            .slice(`${this.deviceKey} `.length)
    }
}

function fireDragEvent(
    element: Element,
    type: string,
    init: { dataTransfer: unknown; clientY?: number }
) {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientY: init.clientY,
    })
    Object.defineProperty(event, 'dataTransfer', { value: init.dataTransfer })
    fireEvent(element, event)
}
