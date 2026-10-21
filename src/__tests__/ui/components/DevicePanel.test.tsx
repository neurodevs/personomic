import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'

import DevicePanel, {
    DevicePanelProps,
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
    protected static async hidesSettingsOfBiosensorWithoutStreamsToTurnOff() {
        this.renderPanel({}, 'Zephyr BioHarness 3')

        assert.isFalse(
            screen.queryByRole('button', { name: /settings/i }) !== null,
            'Offered settings of a biosensor without streams to turn off!'
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
