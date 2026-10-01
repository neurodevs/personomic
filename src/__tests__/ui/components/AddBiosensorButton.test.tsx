import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'

import AddBiosensorButton from '../../../ui/components/AddBiosensorButton'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class AddBiosensorButtonTest extends AbstractPackageTest {
    private static readonly names = [this.generateId(), this.generateId()]
    private static addedNames: string[] = []

    protected static async beforeEach() {
        await super.beforeEach()

        this.addedNames = []
        render(
            <AddBiosensorButton
                names={this.names}
                onAdd={(name) => this.addedNames.push(name)}
            />
        )
    }

    @test()
    protected static async rendersAddBiosensorButton() {
        assert.isTruthy(this.button, 'Did not render add biosensor button!')
    }

    @test()
    protected static async hidesBiosensorNamesUntilOpened() {
        assert.isLength(
            this.options,
            0,
            'Showed biosensor names before opening!'
        )
    }

    @test()
    protected static async showsEachBiosensorNameWhenOpened() {
        this.open()

        assert.isEqualDeep(
            this.options.map((option) => option.textContent),
            this.names,
            'Did not show each biosensor name when opened!'
        )
    }

    @test()
    protected static async addsChosenBiosensor() {
        this.open()
        fireEvent.click(screen.getByText(this.names[1]))

        assert.isEqualDeep(
            this.addedNames,
            [this.names[1]],
            'Did not add chosen biosensor!'
        )
    }

    @test()
    protected static async closesMenuAfterChoosing() {
        this.open()
        fireEvent.click(screen.getByText(this.names[0]))

        assert.isLength(this.options, 0, 'Did not close menu after choosing!')
    }

    private static open() {
        fireEvent.click(this.button)
    }

    private static get button() {
        return screen.getByRole('button', { name: /add biosensor/i })
    }

    private static get options() {
        return screen.queryAllByRole('menuitem')
    }
}
