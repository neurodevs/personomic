import { TextEncoder } from 'node:util'

export default function buildXdfFile(streams: XdfTestStream[]): ArrayBuffer {
    const bytes: number[] = [...utf8BytesOf('XDF:')]

    streams.forEach((stream, index) => {
        const streamId = index + 1

        bytes.push(...chunkOf(2, streamId, utf8BytesOf(headerXmlFor(stream))))

        for (const chunk of stream.chunks ?? []) {
            bytes.push(
                ...chunkOf(3, streamId, samplesContentFor(chunk, stream))
            )
        }
    })

    return new Uint8Array(bytes).buffer
}

function chunkOf(tag: number, streamId: number, content: number[]) {
    return [
        4,
        ...littleEndianBytesOf(content.length + 6, 'Uint32'),
        ...littleEndianBytesOf(tag, 'Uint16'),
        ...littleEndianBytesOf(streamId, 'Uint32'),
        ...content,
    ]
}

function headerXmlFor(stream: XdfTestStream) {
    const {
        name = '',
        type = '',
        sourceId = '',
        channelNames = [],
        channelCount = channelNames.length,
        channelFormat = 'float32',
        sampleRateHz = 0,
        nickname,
    } = stream

    const channels = channelNames
        .map(
            (label) =>
                `<channel><label>${label}</label><type>ignored</type></channel>`
        )
        .join('')

    return [
        '<?xml version="1.0"?><info>',
        `<name>${name}</name>`,
        `<type>${type}</type>`,
        `<channel_count>${channelCount}</channel_count>`,
        `<channel_format>${channelFormat}</channel_format>`,
        `<source_id>${sourceId}</source_id>`,
        `<nominal_srate>${sampleRateHz}</nominal_srate>`,
        `<desc><channels>${channels}</channels>${nicknameXmlFor(nickname)}</desc></info>`,
    ].join('\n')
}

function nicknameXmlFor(nickname: string | undefined) {
    return nickname === undefined
        ? ''
        : `<nickname>${escapedForXml(nickname)}</nickname>`
}

function escapedForXml(text: string) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function samplesContentFor(chunk: XdfTestChunk, stream: XdfTestStream) {
    const { samples, timestamps } = chunk
    const { channelFormat = 'float32' } = stream

    return [
        1,
        samples.length,
        ...samples.flatMap((sample, index) => [
            ...timestampBytesOf(timestamps[index]),
            ...sample.flatMap((value) =>
                littleEndianBytesOf(
                    value,
                    valueTypes[channelFormat] ?? 'Float32'
                )
            ),
        ]),
    ]
}

function timestampBytesOf(timestamp: number | undefined) {
    return timestamp === undefined
        ? [0]
        : [8, ...littleEndianBytesOf(timestamp, 'Float64')]
}

const valueTypes: Record<string, ValueType> = {
    float32: 'Float32',
    double64: 'Float64',
    int8: 'Int8',
    int16: 'Int16',
    int32: 'Int32',
    int64: 'BigInt64',
}

const numBytesByType: Record<ValueType, number> = {
    Uint16: 2,
    Uint32: 4,
    Float32: 4,
    Float64: 8,
    Int8: 1,
    Int16: 2,
    Int32: 4,
    BigInt64: 8,
}

function littleEndianBytesOf(value: number, type: ValueType) {
    const view = new DataView(new ArrayBuffer(numBytesByType[type]))

    if (type === 'BigInt64') {
        view.setBigInt64(0, BigInt(value), true)
    } else {
        view[`set${type}`](0, value, true)
    }

    return [...new Uint8Array(view.buffer)]
}

function utf8BytesOf(text: string) {
    return [...new TextEncoder().encode(text)]
}

export interface XdfTestStream {
    name?: string
    type?: string
    sourceId?: string
    channelNames?: string[]
    channelCount?: number
    channelFormat?: string
    sampleRateHz?: number
    nickname?: string
    chunks?: XdfTestChunk[]
}

export interface XdfTestChunk {
    samples: number[][]
    timestamps: (number | undefined)[]
}

type ValueType =
    | 'Uint16'
    | 'Uint32'
    | 'Float32'
    | 'Float64'
    | 'Int8'
    | 'Int16'
    | 'Int32'
    | 'BigInt64'
