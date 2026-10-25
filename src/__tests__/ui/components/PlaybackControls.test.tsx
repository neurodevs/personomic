import { test, assert } from '@neurodevs/node-tdd'
import { render, screen } from '@testing-library/react'

import PlaybackControls, {
    PlaybackControlsProps,
} from '../../../ui/components/PlaybackControls'
import AbstractPackageTest from '../../AbstractPackageTest'

export default class PlaybackControlsTest extends AbstractPackageTest {
    @test()
    protected static async keepsPlayButtonAsWideAsPlayInEveryState() {
        const states = [
            { label: 'Pause', isPaused: false, hasEnded: false },
            { label: 'Play', isPaused: true, hasEnded: false },
            { label: 'Replay', isPaused: false, hasEnded: true },
        ]

        const sizedBy = states.map(({ label, isPaused, hasEnded }) => {
            const { unmount } = this.render({ isPaused, hasEnded })
            const button = screen.getByRole('button', { name: label })
            const sizer = button.querySelector('[aria-hidden="true"]')
            unmount()

            return { label, sizedBy: sizer?.textContent }
        })

        assert.isEqualDeep(
            sizedBy,
            states.map(({ label }) => ({ label, sizedBy: 'Play' })),
            'Did not keep the play button as wide as Play in every state!'
        )
    }

    private static render(props: Partial<PlaybackControlsProps>) {
        return render(
            <PlaybackControls
                fileName="recording.xdf"
                hasEnded={false}
                isPaused={false}
                isLooping={false}
                speed={1}
                onReplay={() => {}}
                onPause={() => {}}
                onPlay={() => {}}
                onLoopChange={() => {}}
                onSeek={() => {}}
                onHold={() => {}}
                onRelease={() => {}}
                onSpeedChange={() => {}}
                {...props}
            />
        )
    }
}
