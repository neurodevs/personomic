export default function readXdfRecording(file: ArrayBuffer): Recording {
    const bytes = new Uint8Array(file)
    const view = new DataView(file)

    if (textIn(bytes, 0, xdfMagic.length) !== xdfMagic) {
        throw new Error('It is not an XDF file.')
    }

    const streamsById = new Map<number, XdfStream>()
    let offset = xdfMagic.length

    while (offset < bytes.length) {
        const length = variableLengthAt(offset, view)
        const contentEnd = length.end + (length.value ?? 0)

        if (isCutShort(length, contentEnd, bytes)) {
            break
        }

        const tag = view.getUint16(length.end, true)
        const streamId = view.getUint32(length.end + 2, true)
        const contentStart = length.end + numBytesBeforeContent
        const stream = streamsById.get(streamId)

        if (tag === streamHeaderTag) {
            streamsById.set(
                streamId,
                streamFrom(textIn(bytes, contentStart, contentEnd))
            )
        } else if (tag === samplesTag && stream) {
            appendSamples(stream, view, contentStart)
        }

        offset = contentEnd
    }

    return { devices: devicesFrom([...streamsById.values()]) }
}

const xdfMagic = 'XDF:'
const streamHeaderTag = 2
const samplesTag = 3
const numBytesBeforeContent = 6

function textIn(bytes: Uint8Array, start: number, end: number) {
    return new TextDecoder().decode(bytes.subarray(start, end))
}

function variableLengthAt(offset: number, view: DataView): VariableLength {
    const numBytes = offset < view.byteLength ? view.getUint8(offset) : 0
    const start = offset + 1
    const end = start + numBytes

    if (end > view.byteLength) {
        return { end }
    } else if (numBytes === 1) {
        return { value: view.getUint8(start), end }
    } else if (numBytes === 4) {
        return { value: view.getUint32(start, true), end }
    } else if (numBytes === 8) {
        return { value: Number(view.getBigUint64(start, true)), end }
    }

    return { end }
}

function isCutShort(
    length: VariableLength,
    contentEnd: number,
    bytes: Uint8Array
) {
    return (
        length.value === undefined ||
        length.value < numBytesBeforeContent ||
        contentEnd > bytes.length
    )
}

function streamFrom(headerXml: string): XdfStream {
    const type = textOf('type', headerXml) ?? ''
    const channelCount = Number(textOf('channel_count', headerXml))
    const labels = allTextsOf('label', headerXml)

    return {
        name: textOf('name', headerXml) ?? '',
        sourceId: textOf('source_id', headerXml) ?? '',
        nickname: textOf('nickname', headerXml),
        type,
        channelCount,
        channelNames:
            labels.length === channelCount
                ? labels
                : Array.from(
                      { length: channelCount },
                      (_, index) => `${type}_${index + 1}`
                  ),
        sampleRateHz: Number(textOf('nominal_srate', headerXml)),
        valueReader:
            valueReaders[textOf('channel_format', headerXml) as ChannelFormat],
        samples: [],
        timestamps: [],
    }
}

function textOf(tag: string, xml: string): string | undefined {
    return allTextsOf(tag, xml)[0]
}

function allTextsOf(tag: string, xml: string) {
    return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map(
        ([, text]) => unescapedFromXml(text)
    )
}

function unescapedFromXml(text: string) {
    return text.replace(
        /&(amp|lt|gt|quot|apos);/g,
        (_, entity: keyof typeof charactersByEntity) =>
            charactersByEntity[entity]
    )
}

const charactersByEntity = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
}

function appendSamples(
    stream: XdfStream,
    view: DataView,
    contentStart: number
) {
    const { channelCount, sampleRateHz, valueReader, samples, timestamps } =
        stream

    if (!valueReader) {
        return
    }

    const numSamples = variableLengthAt(contentStart, view)
    let offset = numSamples.end

    for (let i = 0; i < (numSamples.value ?? 0); i++) {
        const hasTimestamp = view.getUint8(offset++) === 8

        timestamps.push(
            hasTimestamp
                ? view.getFloat64(offset, true)
                : timestamps[timestamps.length - 1] + 1 / sampleRateHz
        )
        offset += hasTimestamp ? 8 : 0

        for (let channel = 0; channel < channelCount; channel++) {
            samples.push(valueReader.read(view, offset))
            offset += valueReader.numBytes
        }
    }
}

const valueReaders: Record<ChannelFormat, ValueReader> = {
    float32: { numBytes: 4, read: (view, at) => view.getFloat32(at, true) },
    double64: { numBytes: 8, read: (view, at) => view.getFloat64(at, true) },
    int8: { numBytes: 1, read: (view, at) => view.getInt8(at) },
    int16: { numBytes: 2, read: (view, at) => view.getInt16(at, true) },
    int32: { numBytes: 4, read: (view, at) => view.getInt32(at, true) },
    int64: {
        numBytes: 8,
        read: (view, at) => Number(view.getBigInt64(at, true)),
    },
}

function devicesFrom(streams: XdfStream[]): RecordedDevice[] {
    const streamsByDevice = new Map<string, XdfStream[]>()

    for (const stream of streams.filter(hasSamples)) {
        const key = deviceKeyFor(stream)
        streamsByDevice.set(key, [...(streamsByDevice.get(key) ?? []), stream])
    }

    return [...streamsByDevice.values()].map((ofDevice) => ({
        deviceName: deviceNameFor(ofDevice),
        ...nicknameOf(ofDevice),
        streams: ofDevice.map(
            ({ type, channelNames, sampleRateHz, samples, timestamps }) => ({
                type,
                channelNames,
                sampleRateHz,
                samples,
                timestamps,
            })
        ),
    }))
}

function nicknameOf(streams: XdfStream[]) {
    const nickname = streams.find((stream) => stream.nickname)?.nickname
    return nickname ? { nickname } : {}
}

function hasSamples(stream: XdfStream) {
    return stream.timestamps.length > 0
}

function deviceKeyFor(stream: XdfStream) {
    const { name, sourceId } = stream
    const [family, , ...identifier] = sourceId.split('-')

    return deviceNamesByFamily.has(family)
        ? `${family}/${identifier.join('-')}`
        : sourceId || name
}

function deviceNameFor(streams: XdfStream[]) {
    const [family] = streams[0].sourceId.split('-')
    const kinds = streams.map(({ sourceId }) => sourceId.split('-')[1])
    const museModel = family === 'muse' ? museModelIn(streams[0].name) : ''

    if (museModel) {
        return museModel
    } else if (family === 'muse' && kinds.some(isOnlyOnAthena)) {
        return 'Muse S Athena'
    }

    return deviceNamesByFamily.get(family) ?? streams[0].name
}

function museModelIn(streamName: string) {
    const [, model = ''] = streamName.match(museModelStreamName) ?? []
    return model
}

const museModelStreamName = /^(Muse .+) \S+ \(.*\)$/

function isOnlyOnAthena(kind: string) {
    return kind === 'imu' || kind === 'optics'
}

const deviceNamesByFamily = new Map([
    ['cgx', 'Cognionics Quick-20r'],
    ['cyton', 'OpenBCI Cyton'],
    ['govee', 'Govee Thermohygrometer H5074'],
    ['muse', 'Muse'],
])

export interface Recording {
    devices: RecordedDevice[]
}

export interface RecordedDevice {
    deviceName: string
    nickname?: string
    streams: RecordedStream[]
}

export interface RecordedStream {
    type: string
    channelNames: string[]
    sampleRateHz: number
    samples: number[]
    timestamps: number[]
}

interface XdfStream extends RecordedStream {
    name: string
    sourceId: string
    nickname?: string
    channelCount: number
    valueReader?: ValueReader
}

interface VariableLength {
    value?: number
    end: number
}

interface ValueReader {
    numBytes: number
    read: (view: DataView, at: number) => number
}

type ChannelFormat =
    'float32' | 'double64' | 'int8' | 'int16' | 'int32' | 'int64'
