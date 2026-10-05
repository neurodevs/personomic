import { test, assert } from '@neurodevs/node-tdd'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

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

    @test()
    protected static async separatesFamiliesWithLine() {
        this.openWithNames([
            'Cognionics Quick-20r',
            'Muse S Athena',
            'Muse 2',
            'OpenBCI Cyton',
        ])

        assert.isEqualDeep(
            this.menuRows,
            [
                'Cognionics Quick-20r',
                '---',
                'Muse S Athena',
                'Muse 2',
                '---',
                'OpenBCI Cyton',
            ],
            'Did not separate families with a line!'
        )
    }

    @test()
    protected static async keepsMuseHeadsetsTogetherWhenNotAdjacent() {
        this.openWithNames(['Muse 2', 'OpenBCI Cyton', 'Muse S Gen 2'])

        assert.isEqualDeep(
            this.menuRows,
            ['Muse 2', 'Muse S Gen 2', '---', 'OpenBCI Cyton'],
            'Did not keep Muse headsets together when not adjacent!'
        )
    }

    @test()
    protected static async showsNoLineForSingleFamily() {
        this.openWithNames(['Muse 2', 'Muse S Gen 2'])

        assert.isEqualDeep(
            this.menuRows,
            ['Muse 2', 'Muse S Gen 2'],
            'Showed a line for a single family!'
        )
    }

    private static openWithNames(names: string[]) {
        cleanup()
        render(<AddBiosensorButton names={names} onAdd={() => {}} />)
        this.open()
    }

    private static get menuRows() {
        return Array.from(screen.getByRole('menu').children, (row) =>
            row.getAttribute('role') === 'separator' ? '---' : row.textContent
        )
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
