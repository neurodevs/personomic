export default function displayNameOf(deviceLabel: string) {
    const [deviceName, displayName] =
        Object.entries(displayNamesByDeviceName).find(([deviceName]) =>
            deviceLabel.startsWith(deviceName)
        ) ?? []

    return deviceName
        ? `${displayName}${deviceLabel.slice(deviceName.length)}`
        : deviceLabel
}

const displayNamesByDeviceName: Record<string, string> = {
    'Zephyr BioHarness 3': 'Zephyr BioHarness 3.0',
}
