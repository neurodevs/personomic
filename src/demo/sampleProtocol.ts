import { simulatedMuseModel } from './simulatedMuse'

const fileName = 'tilt-series.json'

export default function sampleProtocol() {
    const text = `${JSON.stringify(
        {
            schemaVersion: 1,
            name: 'Tilt series',
            devices: [{ deviceName: simulatedMuseModel, nickname: 'Head' }],
            recordXdf: true,
        },
        null,
        4
    )}\n`

    return { name: fileName, text: async () => text }
}
