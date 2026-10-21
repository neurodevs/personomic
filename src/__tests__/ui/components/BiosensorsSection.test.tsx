import { test, assert } from '@neurodevs/node-tdd'
import { render, screen } from '@testing-library/react'

import BiosensorsSection from '../../../ui/components/BiosensorsSection'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class BiosensorsSectionTest extends AbstractPackageTest {
    @test()
    protected static async titlesSectionBiosensors() {
        render(<BiosensorsSection isEmpty={false} />)

        assert.isEqual(
            screen.getByRole('heading').textContent,
            'Biosensors',
            'Did not title the section Biosensors!'
        )
    }

    @test()
    protected static async namesSectionAfterItsTitle() {
        render(<BiosensorsSection isEmpty={false} />)

        assert.isTruthy(
            screen.queryByRole('region', { name: 'Biosensors' }),
            'Did not name the section after its title!'
        )
    }

    @test()
    protected static async saysNoneAddedYetWhenEmpty() {
        render(<BiosensorsSection isEmpty />)

        assert.isTruthy(
            screen.queryByText('None added yet.'),
            'Did not say none were added yet when empty!'
        )
    }

    @test()
    protected static async saysGivenMessageWhenEmpty() {
        render(<BiosensorsSection isEmpty emptyMessage="Choose a recording." />)

        assert.isEqualDeep(
            {
                given: screen.queryByText('Choose a recording.') !== null,
                noneAdded: screen.queryByText('None added yet.') !== null,
            },
            { given: true, noneAdded: false },
            'Did not say the given message when empty!'
        )
    }

    @test()
    protected static async saysNothingAboutNoneWhenNotEmpty() {
        render(<BiosensorsSection isEmpty={false} />)

        assert.isNull(
            screen.queryByText('None added yet.'),
            'Said none were added yet when not empty!'
        )
    }

    @test()
    protected static async showsItsContentsBelowTheTitle() {
        render(
            <BiosensorsSection isEmpty>
                <button type="button">Add biosensor</button>
            </BiosensorsSection>
        )

        assert.isTruthy(
            screen.queryByRole('button', { name: 'Add biosensor' }),
            'Did not show its contents!'
        )
    }
}
