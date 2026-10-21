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
