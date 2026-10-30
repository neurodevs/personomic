import { test, assert } from '@neurodevs/node-tdd'
import { act, fireEvent, render, screen } from '@testing-library/react'

import IdentifierInput, {
    setCopyText,
} from '../../../ui/components/IdentifierInput'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class IdentifierInputTest extends AbstractPackageTest {
    private static copied: string[]

    protected static async beforeEach() {
        await super.beforeEach()

        this.copied = []
        setCopyText(async (text) => {
            this.copied.push(text)
        })
    }

    @test()
    protected static async offersCopyOnlyOnceFilled() {
        const { rerender } = render(this.input(''))
        const whileEmpty = this.copyButton !== null

        rerender(this.input('muse-uuid'))

        assert.isEqualDeep(
            { whileEmpty, onceFilled: this.copyButton !== null },
            { whileEmpty: false, onceFilled: true },
            'Did not offer copy only once filled!'
        )
    }

    @test()
    protected static async copiesIdentifierWhenClicked() {
        render(this.input('muse-uuid'))

        await this.clickCopy()

        assert.isEqualDeep(
            this.copied,
            ['muse-uuid'],
            'Did not copy the identifier when clicked!'
        )
    }

    @test()
    protected static async confirmsOnceCopied() {
        render(this.input('muse-uuid'))
        const beforeCopying = this.copyButton!.title

        await this.clickCopy()

        assert.isEqualDeep(
            { beforeCopying, onceCopied: this.copyButton!.title },
            { beforeCopying: 'Copy', onceCopied: 'Copied' },
            'Did not confirm once copied!'
        )
    }

    @test()
    protected static async offersCopyWhileLocked() {
        render(this.input('muse-uuid', { isLocked: true }))

        assert.isTrue(
            this.copyButton !== null,
            'Did not offer copy while locked!'
        )
    }

    @test()
    protected static async showsTooltipForUuidOnHover() {
        render(this.input(''))

        assert.isEqual(
            this.field.title,
            'Device Bluetooth UUID',
            'Did not show tooltip for UUID on hover!'
        )
    }

    @test()
    protected static async showsTooltipForSerialNumberOnHover() {
        render(
            <IdentifierInput
                deviceLabel="Cognionics Quick-20r"
                identifier={{ label: 'Serial number', value: 'serial-number' }}
            />
        )

        assert.isEqual(
            this.field.title,
            'Device USB serial number',
            'Did not show tooltip for serial number on hover!'
        )
    }

    @test()
    protected static async showsTooltipForAddressOnHover() {
        render(
            <IdentifierInput
                deviceLabel="Zephyr BioHarness 3"
                identifier={{ label: 'Address', value: 'a0-e6-f8-a5-60-bf' }}
            />
        )

        assert.isEqual(
            this.field.title,
            'Device Bluetooth address',
            'Did not show tooltip for address on hover!'
        )
    }

    @test()
    protected static async showsReportedValueWhileLockedAndBlank() {
        render(
            <IdentifierInput
                deviceLabel="Muse S Gen 2"
                identifier={{ label: 'UUID', value: '', reported: 'muse-uuid' }}
            />
        )

        assert.isEqual(
            this.field.value,
            'muse-uuid',
            'Did not show the reported value while locked and blank!'
        )
    }

    @test()
    protected static async suggestsReportedValueWhileEditable() {
        render(
            <IdentifierInput
                deviceLabel="Muse S Gen 2"
                identifier={{ label: 'UUID', value: '', reported: 'muse-uuid' }}
                onChange={() => {}}
            />
        )

        assert.isEqualDeep(
            { value: this.field.value, placeholder: this.field.placeholder },
            { value: '', placeholder: 'muse-uuid' },
            'Did not suggest the reported value while editable!'
        )
    }

    @test()
    protected static async formatsTypedAddressAsUppercaseWithColons() {
        assert.isEqual(
            this.typeAddress('a0e6f8'),
            'A0:E6:F8',
            'Did not format the typed address as uppercase with colons!'
        )
    }

    @test()
    protected static async replacesOtherSeparatorsInTypedAddress() {
        assert.isEqual(
            this.typeAddress('a0-e6-f8-a5-60-bf'),
            'A0:E6:F8:A5:60:BF',
            'Did not replace other separators in the typed address!'
        )
    }

    @test()
    protected static async addsNoTrailingColonToTypedAddress() {
        assert.isEqual(
            this.typeAddress('A0:E6:'),
            'A0:E6',
            'Added a trailing colon to the typed address!'
        )
    }

    @test()
    protected static async dropsNonHexAndExtraDigitsFromTypedAddress() {
        assert.isEqual(
            this.typeAddress('a0e6f8a560bfzz12'),
            'A0:E6:F8:A5:60:BF',
            'Did not drop non-hex and extra digits from the typed address!'
        )
    }

    @test()
    protected static async formatsChosenAddress() {
        const changes: string[] = []
        render(
            <IdentifierInput
                deviceLabel="Zephyr BioHarness 3"
                identifier={{ label: 'Address', value: '' }}
                scanned={[{ value: 'a0-e6-f8-a5-60-bf', source: 'Bluetooth' }]}
                onChange={(value) => changes.push(value)}
            />
        )

        fireEvent.focus(this.field)
        fireEvent.click(screen.getByRole('option'))

        assert.isEqualDeep(
            changes,
            ['A0:E6:F8:A5:60:BF'],
            'Did not format the chosen address!'
        )
    }

    @test()
    protected static async choosesRememberedValueWhenItsTagIsClicked() {
        const changes = this.renderRemembered()

        fireEvent.focus(this.field)
        fireEvent.click(screen.getByText('Memory · Muse S Gen 2'))

        assert.isEqualDeep(
            changes,
            ['muse-uuid'],
            'Did not choose the remembered value when its tag was clicked!'
        )
    }

    @test()
    protected static async doesNotChooseRememberedValueWhenForgotten() {
        const changes = this.renderRemembered()

        fireEvent.focus(this.field)
        fireEvent.click(
            screen.getByRole('button', { name: 'Forget muse-uuid' })
        )

        assert.isEqualDeep(
            changes,
            [],
            'Chose the remembered value when it was forgotten!'
        )
    }

    @test()
    protected static async leavesTypedUuidUnformatted() {
        const changes: string[] = []
        render(
            <IdentifierInput
                deviceLabel="Muse S Gen 2"
                identifier={{ label: 'UUID', value: '' }}
                onChange={(value) => changes.push(value)}
            />
        )

        fireEvent.change(this.field, { target: { value: 'muse-uuid' } })

        assert.isEqualDeep(
            changes,
            ['muse-uuid'],
            'Did not leave the typed UUID unformatted!'
        )
    }

    private static typeAddress(typed: string) {
        const changes: string[] = []
        render(
            <IdentifierInput
                deviceLabel="Zephyr BioHarness 3"
                identifier={{ label: 'Address', value: '' }}
                onChange={(value) => changes.push(value)}
            />
        )

        fireEvent.change(this.field, { target: { value: typed } })

        return changes[0]
    }

    private static renderRemembered() {
        const changes: string[] = []
        render(
            <IdentifierInput
                deviceLabel="Muse S Gen 2"
                identifier={{ label: 'UUID', value: '' }}
                remembered={['muse-uuid']}
                onChange={(value) => changes.push(value)}
                onForget={() => {}}
            />
        )
        return changes
    }

    private static get field() {
        return screen.getByRole('textbox') as HTMLInputElement
    }

    private static input(value: string, options = { isLocked: false }) {
        return (
            <IdentifierInput
                deviceLabel="Muse S Gen 2"
                identifier={{ label: 'UUID', value }}
                onChange={options.isLocked ? undefined : () => {}}
            />
        )
    }

    private static async clickCopy() {
        await act(async () => {
            fireEvent.click(this.copyButton!)
        })
    }

    private static get copyButton() {
        return screen.queryByRole('button', {
            name: 'Copy Muse S Gen 2 UUID',
        }) as HTMLButtonElement | null
    }
}
