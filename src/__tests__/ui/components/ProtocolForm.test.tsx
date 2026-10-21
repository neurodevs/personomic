import { test, assert } from '@neurodevs/node-tdd'
import { fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'

import ProtocolForm, {
    ProtocolFormProps,
} from '../../../ui/components/ProtocolForm'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class ProtocolFormTest extends AbstractPackageTest {
    private static calls: string[]
    private static numContentsMounts: number

    protected static async beforeEach() {
        await super.beforeEach()

        this.calls = []
        this.numContentsMounts = 0
    }

    @test()
    protected static async showsNameAndRecordAboveContentsAndActionsBelow() {
        this.renderForm()

        assert.isEqualDeep(
            this.shownInOrder,
            ['Name', 'Record XDF', 'Contents', 'Save', 'Cancel'],
            'Did not show name and record above contents and actions below!'
        )
    }

    @test()
    protected static async showsOnlyContentsWhileClosed() {
        this.renderForm({ isOpen: false })

        assert.isEqualDeep(
            this.shownInOrder,
            ['Contents'],
            'Did not show only the contents while closed!'
        )
    }

    @test()
    protected static async keepsContentsMountedWhenOpened() {
        const { rerender } = this.renderForm({ isOpen: false })

        rerender(this.form({ isOpen: true }))

        assert.isEqual(
            this.numContentsMounts,
            1,
            'Remounted the contents when opened!'
        )
    }

    @test()
    protected static async passesTypedNameOn() {
        this.renderForm()

        fireEvent.change(this.nameInput, { target: { value: 'Beeps' } })

        assert.isEqualDeep(
            this.calls,
            ['name: Beeps'],
            'Did not pass the typed name on!'
        )
    }

    @test()
    protected static async suggestsNameThroughPlaceholder() {
        this.renderForm({ namePlaceholder: 'Untitled protocol' })

        assert.isEqual(
            this.nameInput.placeholder,
            'Untitled protocol',
            'Did not suggest a name through the placeholder!'
        )
    }

    @test()
    protected static async asksForNewNameWhenNameIsTaken() {
        this.renderForm({ takenName: 'Beeps' })

        assert.isTrue(
            screen.queryByText(
                'Beeps is already a protocol. Please choose a new name.'
            ) !== null,
            'Did not ask for a new name when the name was taken!'
        )
    }

    @test()
    protected static async asksForRecordFolderAndNameOnlyOnceRecordingIsOn() {
        const { rerender } = this.renderForm()
        const beforeTurningOn = this.areRecordFieldsShown

        rerender(this.form({ record: { ...this.record, isOn: true } }))

        assert.isEqualDeep(
            { beforeTurningOn, afterTurningOn: this.areRecordFieldsShown },
            { beforeTurningOn: false, afterTurningOn: true },
            'Did not ask for the record folder and name only once recording was on!'
        )
    }

    @test()
    protected static async showsTimestampAddedToRecordingName() {
        this.renderForm({ record: { ...this.record, isOn: true } })

        assert.isTrue(
            screen.queryByText(/^_\d{4}-.*\.xdf$/) !== null,
            'Did not show the timestamp added to the recording name!'
        )
    }

    @test()
    protected static async labelsSaveAsGiven() {
        this.renderForm({ saveLabel: 'Save as new' })

        assert.isTrue(
            screen.queryByRole('button', { name: 'Save as new' }) !== null,
            'Did not label Save as given!'
        )
    }

    @test()
    protected static async disablesSaveAndCancelAsTold() {
        this.renderForm({ isSaveDisabled: true, isCancelDisabled: true })

        assert.isEqualDeep(
            [this.button('Save').disabled, this.button('Cancel').disabled],
            [true, true],
            'Did not disable Save and Cancel as told!'
        )
    }

    @test()
    protected static async savesAndCancelsWhenClicked() {
        this.renderForm()

        fireEvent.click(this.button('Save'))
        fireEvent.click(this.button('Cancel'))

        assert.isEqualDeep(
            this.calls,
            ['save', 'cancel'],
            'Did not save and cancel when clicked!'
        )
    }

    @test()
    protected static async saysWhereItWasSavedAndRevealsIt() {
        this.renderForm({ savedTo: '/protocols/beeps.json' })

        fireEvent.click(this.button('/protocols/beeps.json'))

        assert.isEqualDeep(
            {
                status: screen.getByRole('status').textContent,
                calls: this.calls,
            },
            {
                status: 'Saved to /protocols/beeps.json',
                calls: ['reveal'],
            },
            'Did not say where it was saved and reveal it!'
        )
    }

    private static renderForm(props: Partial<ProtocolFormProps> = {}) {
        return render(this.form(props))
    }

    private static form(props: Partial<ProtocolFormProps> = {}) {
        return (
            <ProtocolForm
                isOpen
                name=""
                namePlaceholder="Protocol name"
                onNameChange={(name) => this.calls.push(`name: ${name}`)}
                record={this.record}
                isSaveDisabled={false}
                onSave={() => this.calls.push('save')}
                onCancel={() => this.calls.push('cancel')}
                onRevealSaved={() => this.calls.push('reveal')}
                {...props}
            >
                <Contents onMount={() => this.numContentsMounts++} />
            </ProtocolForm>
        )
    }

    private static get record(): ProtocolFormProps['record'] {
        return {
            isOn: false,
            onIsOnChange: () => {},
            directory: '',
            name: '',
            isLocked: false,
            isBrowsing: false,
            onDirectoryChange: () => {},
            onNameChange: () => {},
            onBrowse: () => {},
        }
    }

    private static get shownInOrder() {
        const shown = [
            ['Name', screen.queryByRole('textbox', { name: 'Name' })],
            [
                'Record XDF',
                screen.queryByRole('checkbox', { name: 'Record XDF' }),
            ],
            ['Contents', screen.queryByText('Contents')],
            ['Save', screen.queryByRole('button', { name: 'Save' })],
            ['Cancel', screen.queryByRole('button', { name: 'Cancel' })],
        ] as const

        return shown
            .filter(([, element]) => element !== null)
            .sort(([, a], [, b]) => (isBefore(a!, b!) ? -1 : 1))
            .map(([name]) => name)
    }

    private static get areRecordFieldsShown() {
        return (
            screen.queryByLabelText('Recordings folder') !== null &&
            screen.queryByLabelText('Recording name') !== null
        )
    }

    private static get nameInput() {
        return screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
    }

    private static button(name: string) {
        return screen.getByRole('button', { name }) as HTMLButtonElement
    }
}

function Contents({ onMount }: { onMount: () => void }) {
    useEffect(() => {
        onMount()
    }, [])

    return <p>Contents</p>
}

function isBefore(element: Element, other: Element) {
    return (
        (element.compareDocumentPosition(other) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    )
}
