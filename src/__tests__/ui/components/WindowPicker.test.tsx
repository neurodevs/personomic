import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'

import WindowPicker from '../../../ui/components/WindowPicker'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class WindowPickerTest extends AbstractPackageTest {
    @test()
    protected static async labelsUnknownWindowAsMixed() {
        render(<WindowPicker onChange={() => {}} />)

        assert.isEqual(
            this.windowButton.textContent,
            'Mixed windows',
            'Did not label unknown window as mixed!'
        )
    }

    @test()
    protected static async checksNoOptionWhenWindowIsMixed() {
        render(<WindowPicker onChange={() => {}} />)

        fireEvent.click(this.windowButton)

        assert.isEqualDeep(
            screen
                .getAllByRole('menuitemradio')
                .filter(
                    (option) => option.getAttribute('aria-checked') === 'true'
                ),
            [],
            'Checked an option when window was mixed!'
        )
    }

    @test()
    protected static async describesWhatItChangesInItsTitle() {
        render(
            <WindowPicker
                seconds={10}
                onChange={() => {}}
                title="Change time window of all graphs"
            />
        )

        assert.isEqual(
            this.windowButton.title,
            'Change time window of all graphs',
            'Did not describe what it changes in its title!'
        )
    }

    private static get windowButton() {
        return screen.getByRole('button', { name: /window/i })
    }
}
