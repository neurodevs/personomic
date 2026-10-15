import React from 'react'

export interface BandPowersProps {
    powers?: number[]
}

const BandPowers: React.FC<BandPowersProps> = ({ powers }) => (
    <>
        <span className="stream-plot__band-power-bars" aria-hidden="true">
            {frequencyBands.map((band, i) => (
                <span
                    key={band.name}
                    className="stream-plot__band-power-bar"
                    style={{
                        height: `${percentOf(powers?.[i] ?? 0)}%`,
                        backgroundColor: band.color,
                    }}
                />
            ))}
        </span>
        {frequencyBands.map((band, i) => (
            <span
                key={band.name}
                className="stream-plot__band-power"
                title={`${band.name}, ${band.minHz} to ${band.maxHz} Hz, as a share of ${frequencyBands[0].minHz} to ${frequencyBands[frequencyBands.length - 1].maxHz} Hz power`}
            >
                <span
                    className="stream-plot__band-power-swatch"
                    style={{ backgroundColor: band.color }}
                />
                <span className="stream-plot__band-power-name">
                    {band.name}
                </span>
                <span className="stream-plot__band-power-value">
                    {powers ? percentOf(powers[i]) : '--'}%
                </span>
            </span>
        ))}
    </>
)

export default BandPowers

export const frequencyBands = [
    { name: 'Delta', minHz: 1, maxHz: 4, color: '#9085e9' },
    { name: 'Theta', minHz: 4, maxHz: 8, color: '#3987e5' },
    { name: 'Alpha', minHz: 8, maxHz: 13, color: '#199e70' },
    { name: 'Beta', minHz: 13, maxHz: 30, color: '#c98500' },
    { name: 'Gamma', minHz: 30, maxHz: 45, color: '#e66767' },
]

function percentOf(share: number) {
    return Math.round(share * 100)
}
