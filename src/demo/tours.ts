import { fireEvent, within } from '@testing-library/dom'

import sampleRecording from './sampleRecording'
import { simulatedMuse, simulatedMuseModel } from './simulatedMuse'
import { Tour, TourView } from './TourPlayer'

const tours: Tour[] = [
    {
        title: 'How to run a session with Muse',
        steps: [
            {
                caption:
                    'A session starts with the biosensors you want to stream. Click + Add biosensor.',
                target: (view) =>
                    view.getByRole('button', { name: '+ Add biosensor' }),
            },
            {
                caption:
                    'Choose your Muse model. If you are not sure which one you have, choose auto-detect.',
                target: (view) =>
                    view.getByRole('menuitem', { name: simulatedMuseModel }),
            },
            {
                caption:
                    'Personomic scans for nearby headbands. Click the UUID field to see what it found.',
                target: (view) =>
                    view.getByRole('textbox', {
                        name: `${simulatedMuseModel} UUID (optional)`,
                    }),
            },
            {
                caption:
                    'Pick your headband. Personomic remembers it for next time.',
                target: (view) =>
                    view.getByRole('option', { name: simulatedMuse.uuid }),
            },
            {
                caption:
                    'Turn on Record XDF to save everything the headband streams to a file.',
                target: (view) =>
                    view.getByRole('checkbox', { name: 'Record XDF' }),
            },
            {
                caption: 'Click Connect to start streaming.',
                target: (view) => view.getByRole('button', { name: 'Connect' }),
            },
            {
                caption:
                    'You are streaming live: EEG with band powers, heart rate from PPG, and head motion. Click Stop to end the session and close the recording.',
                target: (view) => view.getByRole('button', { name: 'Stop' }),
            },
        ],
    },
    {
        title: 'How to replay an XDF recording',
        steps: [
            {
                caption:
                    'Switch to Playback to replay a recording instead of streaming live.',
                target: (view) => view.getByRole('radio', { name: 'Playback' }),
            },
            {
                caption:
                    'Click Play XDF recording… and choose a file. It is read right in your browser. For this tour, we will use a sample recording.',
                target: (view) =>
                    view.getByRole('button', { name: 'Play XDF recording…' }),
                act: (_, view) =>
                    fireEvent.change(view.getByLabelText('Recording to play'), {
                        target: { files: [sampleRecording()] },
                    }),
            },
            {
                caption:
                    'The recording plays back as if it were live. Click Pause to hold a moment on screen.',
                target: (view) => view.getByRole('button', { name: 'Pause' }),
            },
            {
                caption:
                    'Drag the position bar to jump anywhere in the recording.',
                target: (view) =>
                    view.getByRole('slider', { name: 'Playback position' }),
                act: (slider) =>
                    fireEvent.change(slider, { target: { value: '30' } }),
            },
            {
                caption: 'Click Play to carry on from there.',
                target: (view) => view.getByRole('button', { name: 'Play' }),
            },
            {
                caption: 'Speed it up to skim through a long recording.',
                target: (view) => view.getByRole('button', { name: '10×' }),
            },
            {
                caption: 'Click Stop to leave the recording.',
                target: (view) => view.getByRole('button', { name: 'Stop' }),
            },
        ],
    },
    {
        title: 'How to define a new protocol',
        steps: [
            {
                caption:
                    'A protocol saves the setup of an experiment, so every session runs it the same way. Open the Protocols tab.',
                target: (view) => view.getByRole('tab', { name: 'Protocols' }),
            },
            {
                caption: 'Click New protocol.',
                target: (view) =>
                    view.getByRole('button', { name: 'New protocol' }),
            },
            {
                caption:
                    'Name it after the experiment. Here, an eyes-closed baseline.',
                target: (view) => view.getByRole('textbox', { name: 'Name' }),
                act: (field) =>
                    fireEvent.change(field, {
                        target: { value: 'Eyes-closed baseline' },
                    }),
            },
            {
                caption: 'Add the biosensors the experiment uses.',
                target: (view) =>
                    view.getByRole('button', { name: '+ Add biosensor' }),
            },
            {
                caption: `Choose a ${simulatedMuseModel}.`,
                target: (view) =>
                    view.getByRole('menuitem', { name: simulatedMuseModel }),
            },
            {
                caption:
                    'Give it a nickname, so its recordings say whose it was.',
                target: (view) =>
                    view.getByRole('textbox', {
                        name: `${simulatedMuseModel} nickname`,
                    }),
                act: (field) =>
                    fireEvent.change(field, {
                        target: { value: 'Participant 1' },
                    }),
            },
            {
                caption: 'Open its settings to choose which streams to record.',
                target: (view) =>
                    view.getByRole('button', {
                        name: `${simulatedMuseModel} settings`,
                    }),
            },
            {
                caption:
                    'Turn off the streams the experiment does not need, such as the gyroscope.',
                target: (view) =>
                    view.getByRole('checkbox', {
                        name: `${simulatedMuseModel} Gyroscope`,
                    }),
            },
            {
                caption:
                    'Save the protocol. It is saved as a file you can share with collaborators.',
                target: (view) => view.getByRole('button', { name: 'Save' }),
            },
            {
                caption: 'Open the Session tab to run it.',
                target: (view) => view.getByRole('tab', { name: 'Session' }),
            },
            {
                caption:
                    'Choose the protocol. Its biosensors and settings fill in and lock, so every session matches.',
                target: (view) =>
                    protocolMenuOffering('Eyes-closed baseline', view),
                act: (menu) =>
                    fireEvent.change(menu, {
                        target: { value: 'eyes-closed-baseline.json' },
                    }),
            },
            {
                caption: 'Click Connect to run a session with the protocol.',
                target: (view) => view.getByRole('button', { name: 'Connect' }),
            },
        ],
    },
]

export default tours

function protocolMenuOffering(protocolName: string, view: TourView) {
    const menu = view.getByRole('combobox', { name: 'Protocol' })
    within(menu).getByRole('option', { name: protocolName })

    return menu
}
