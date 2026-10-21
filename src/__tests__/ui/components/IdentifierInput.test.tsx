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
