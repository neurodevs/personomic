import { fireEvent, within } from '@testing-library/dom'

import sampleProtocol from './sampleProtocol'
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
                    'Nearby headbands are scanned for automatically. Click the UUID field to see what was found.',
                target: (view) =>
                    view.getByRole('textbox', {
                        name: `${simulatedMuseModel} UUID (optional)`,
                    }),
            },
            {
                caption: 'Pick your headband. It is remembered for next time.',
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
                    fireEvent.change(slider, { target: { value: '5' } }),
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
                caption:
                    'Turn on Loop to start over each time the recording ends.',
                target: (view) => view.getByRole('button', { name: 'Loop' }),
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
    {
        title: 'How to share/upload a protocol',
        setup: [
            {
                target: (view) => view.getByRole('tab', { name: 'Protocols' }),
            },
            {
                target: (view) =>
                    view.getByRole('button', { name: 'New protocol' }),
            },
            {
                target: (view) => view.getByRole('textbox', { name: 'Name' }),
                act: (field) =>
                    fireEvent.change(field, {
                        target: { value: 'Eyes-closed baseline' },
                    }),
            },
            {
                target: (view) => view.getByRole('button', { name: 'Save' }),
            },
        ],
        steps: [
            {
                caption:
                    'Each protocol is saved as a JSON file in ~/Personomic/Protocols. Click its path to find it in Finder, then send it to collaborators however you like.',
                target: (view) =>
                    view.getByRole('button', {
                        name: '~/Personomic/Protocols/eyes-closed-baseline.json',
                    }),
                act: leaveAsIs,
            },
            {
                caption: 'Or click ↓ to download a copy from your browser.',
                target: (view) =>
                    view.getByRole('button', {
                        name: 'Download Eyes-closed baseline',
                    }),
                act: leaveAsIs,
            },
            {
                caption:
                    'To use a protocol a collaborator sent you, click Upload protocol and choose their file. For this tour, we will use a sample.',
                target: (view) =>
                    view.getByRole('button', { name: 'Upload protocol' }),
                act: (_, view) =>
                    fireEvent.change(
                        view.getByLabelText('Protocol to upload'),
                        {
                            target: { files: [sampleProtocol()] },
                        }
                    ),
            },
            {
                caption:
                    'It opens unsaved, so you can look it over first. Click Save to add it to your protocols.',
                target: (view) => saveButtonOnceEditing('Tilt series', view),
            },
            {
                caption:
                    'Now it is ready to choose in the Session tab, set up exactly as your collaborator made it.',
                target: (view) => view.getByRole('tab', { name: 'Session' }),
            },
        ],
    },
    {
        title: 'How real-time analytics work',
        setup: [
            {
                target: (view) => view.getByRole('radio', { name: 'Playback' }),
            },
            {
                target: (view) => view.getByLabelText('Recording to play'),
                act: (input) =>
                    fireEvent.change(input, {
                        target: { files: [sampleRecording()] },
                    }),
            },
            {
                target: (view) => view.getByRole('button', { name: 'Loop' }),
            },
        ],
        steps: [
            {
                caption:
                    "Each EEG channel's last 4 seconds are split into frequency bands, from slow delta to fast gamma, showing how much of the power falls in each.",
                target: (view) =>
                    plotOf('EEG', view).querySelector<HTMLElement>(
                        '.stream-plot__channel-header'
                    )!,
                act: leaveAsIs,
            },
            {
                caption:
                    'The average combines all channels. More alpha often means relaxed with eyes closed; more beta, alert and focused.',
                target: (view) =>
                    view.getByText(/^Average \(last/).parentElement!,
                act: leaveAsIs,
            },
            {
                caption:
                    'On the PPG, each heartbeat is detected as a peak in the infrared light reflected by your skin, and marked on the plot.',
                target: (view) => plotOf('PPG', view),
                act: leaveAsIs,
            },
            {
                caption:
                    'Heart rate counts the beats over the last 30 seconds, so it appears once 30 seconds have played.',
                target: (view) => view.getByText('Heart rate').parentElement!,
                act: leaveAsIs,
            },
            {
                caption:
                    'HRV (RMSSD) measures how much the time between beats varies. It needs 5 minutes of beats to be reliable, so earlier values are marked unreliable.',
                target: (view) => view.getByText('HRV (RMSSD)').parentElement!,
                act: leaveAsIs,
            },
            {
                caption: 'Click Stop to leave the recording.',
                target: (view) => view.getByRole('button', { name: 'Stop' }),
            },
        ],
    },
]

export default tours

function leaveAsIs() {}

function saveButtonOnceEditing(protocolName: string, view: TourView) {
    view.getByDisplayValue(protocolName)

    return view.getByRole('button', { name: 'Save' })
}

function plotOf(streamType: string, view: TourView) {
    const name = view
        .getAllByText(streamType)
        .find((element) => element.classList.contains('stream-plot__name'))

    return name!.closest('section')!
}

function protocolMenuOffering(protocolName: string, view: TourView) {
    const menu = view.getByRole('combobox', { name: 'Protocol' })
    within(menu).getByRole('option', { name: protocolName })

    return menu
}
