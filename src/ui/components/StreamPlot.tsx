import React from 'react'
import { Text, View } from 'react-native'

export interface StreamPlotProps {
    name: string
    samples?: number[]
}

const StreamPlot: React.FC<StreamPlotProps> = (props: StreamPlotProps) => {
    const { name } = props

    return (
        <View testID={`stream-plot-${name}`}>
            <Text>{name}</Text>
        </View>
    )
}

export default StreamPlot
