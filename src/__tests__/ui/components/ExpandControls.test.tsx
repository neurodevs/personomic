import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'

import ExpandControls, {
    useExpandLevels,
} from '../../../ui/components/ExpandControls'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class ExpandControlsTest extends AbstractPackageTest {
    private static readonly levels = [['a', 'b'], ['a/c']]

    @test()
    protected static async expandsShallowestLevelNotYetOpenThenNext() {
        render(<Harness levels={this.levels} />)

        fireEvent.click(this.button('Expand one level'))
        const afterOne = this.openKeys
        fireEvent.click(this.button('Expand one level'))

        assert.isEqualDeep(
            { afterOne, afterTwo: this.openKeys },
            { afterOne: 'a,b', afterTwo: 'a,b,a/c' },
            'Did not expand shallowest level not yet open, then next!'
        )
    }

    @test()
    protected static async collapsesDeepestOpenLevel() {
        render(<Harness levels={this.levels} />)

        fireEvent.click(this.button(/^(Expand|Collapse) all$/))
        fireEvent.click(this.button('Collapse one level'))

        assert.isEqual(
            this.openKeys,
            'a,b',
            'Did not collapse deepest open level!'
        )
    }

    @test()
    protected static async togglesBetweenExpandAllAndCollapseAll() {
        render(<Harness levels={this.levels} />)

        const allButton = this.button(/^(Expand|Collapse) all$/)
        const labelBefore = allButton.textContent
        fireEvent.click(allButton)
        const labelExpanded = allButton.textContent
        const openExpanded = this.openKeys
        fireEvent.click(allButton)

        assert.isEqualDeep(
            {
                labelBefore,
                labelExpanded,
                openExpanded,
                openCollapsed: this.openKeys,
            },
            {
                labelBefore: 'Expand all',
                labelExpanded: 'Collapse all',
                openExpanded: 'a,b,a/c',
                openCollapsed: '',
            },
            'Did not toggle between expand all and collapse all!'
        )
    }

    @test()
    protected static async togglesOneKey() {
        render(<Harness levels={this.levels} />)

        fireEvent.click(screen.getByRole('button', { name: 'toggle b' }))

        assert.isEqual(this.openKeys, 'b', 'Did not toggle one key!')
    }

    private static button(name: string | RegExp) {
        return screen.getByRole('button', { name })
    }

    private static get openKeys() {
        return screen.getByTestId('open-keys').textContent
    }
}

const Harness: React.FC<{ levels: string[][] }> = ({ levels }) => {
    const { controls, toggleOf } = useExpandLevels(levels)

    return (
        <>
            <ExpandControls {...controls} />
            <button type="button" onClick={toggleOf('b').onToggle}>
                toggle b
            </button>
            <span data-testid="open-keys">
                {levels
                    .flat()
                    .filter((key) => toggleOf(key).isOpen)
                    .join(',')}
            </span>
        </>
    )
}
