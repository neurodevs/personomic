export default function familyOf(deviceName: string) {
    return deviceName.startsWith('Muse ') ? 'Muse' : deviceName
}
