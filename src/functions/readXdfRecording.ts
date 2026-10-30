export default function readXdfRecording(file: ArrayBuffer): Recording {
    const bytes = new Uint8Array(file)
    const view = new DataView(file)

    if (textIn(bytes, 0, xdfMagic.length) !== xdfMagic) {
        throw new Error('It is not an XDF file.')
    }

    const streamsById = new Map<number, XdfStream>()
    const chunks: XmlNode[] = []
    let header: DescElement[] | undefined
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

        const attributes = { StreamId: String(streamId) }

        if (tag === fileHeaderTag) {
            const xml = textIn(bytes, length.end + numBytesOfTag, contentEnd)
            header = infoIn(xml)
            chunks.push({ name: 'FileHeader', children: xmlTreeOf(xml) })
        } else if (tag === streamHeaderTag) {
            const xml = textIn(bytes, contentStart, contentEnd)
            streamsById.set(streamId, streamFrom(xml))
            chunks.push({
                name: 'StreamHeader',
                attributes,
                children: xmlTreeOf(xml),
            })
        } else if (tag === samplesTag) {
            const numSamples = variableLengthAt(contentStart, view).value ?? 0
            const appended = stream && appendSamples(stream, view, contentStart)
            chunks.push(
                samplesChunkFor(stream, appended, {
                    ...attributes,
                    NumSamples: String(numSamples),
                })
            )
        } else if (tag === clockOffsetTag) {
            const collectionTime = view.getFloat64(contentStart, true)
            const offsetValue = view.getFloat64(contentStart + 8, true)
            chunks.push({
                name: 'ClockOffset',
                attributes,
                loadChildren: () => [
                    textNode('CollectionTime', collectionTime),
                    textNode('OffsetValue', offsetValue),
                ],
            })
        } else if (tag === boundaryTag) {
            chunks.push({ name: 'Boundary' })
        } else if (tag === streamFooterTag) {
            chunks.push({
                name: 'StreamFooter',
                attributes,
                children: xmlTreeOf(textIn(bytes, contentStart, contentEnd)),
            })
        }

        offset = contentEnd
    }

    return {
        ...(header && { header }),
        devices: devicesFrom([...streamsById.values()]),
        chunks,
    }
}

const xdfMagic = 'XDF:'
const fileHeaderTag = 1
const streamHeaderTag = 2
const samplesTag = 3
const clockOffsetTag = 4
const boundaryTag = 5
const streamFooterTag = 6
const numBytesOfTag = 2
const numBytesBeforeContent = numBytesOfTag + 4

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
        desc: descIn(headerXml),
    }
}

function descIn(headerXml: string) {
    const desc = elementIn(headerXml, 'info > desc')
    return desc ? descElementsIn(desc) : []
}

function xmlTreeOf(xml: string): XmlNode[] {
    const root = new DOMParser().parseFromString(
        xml,
        'application/xml'
    ).documentElement

    return [xmlNodeOf(root)]
}

function xmlNodeOf(element: Element): XmlNode {
    const attributes = Object.fromEntries(
        [...element.attributes].map(({ name, value }) => [name, value])
    )
    const text = element.textContent ?? ''

    return {
        name: element.tagName,
        ...(element.attributes.length > 0 && { attributes }),
        ...(element.children.length > 0
            ? { children: [...element.children].map(xmlNodeOf) }
            : text && { text }),
    }
}

function textNode(name: string, value: number): XmlNode {
    return { name, text: String(value) }
}

function samplesChunkFor(
    stream: XdfStream | undefined,
    appended: AppendedSamples | undefined,
    attributes: Record<string, string>
): XmlNode {
    return {
        name: 'Samples',
        attributes,
        loadChildren: () =>
            stream && appended ? sampleNodesOf(stream, appended) : [],
    }
}

function sampleNodesOf(
    stream: XdfStream,
    { start, count, timestamped }: AppendedSamples
): XmlNode[] {
    const { channelCount, samples, timestamps } = stream

    return Array.from({ length: count }, (_, offset) => {
        const index = start + offset
        const values = samples.slice(
            index * channelCount,
            (index + 1) * channelCount
        )
        const hasTimestamp =
            timestamped === 'all' || timestamped.includes(offset)

        return {
            name: 'sample',
            ...(hasTimestamp && {
                attributes: { timestamp: String(timestamps[index]) },
            }),
            text: values.join(' '),
        }
    })
}

function infoIn(headerXml: string) {
    const info = elementIn(headerXml, 'info')
    return info ? descElementsIn(info) : undefined
}

function elementIn(xml: string, selector: string) {
    return new DOMParser()
        .parseFromString(xml, 'application/xml')
        .querySelector(selector)
}

function descElementsIn(parent: Element): DescElement[] {
    return [...parent.children].map((child) =>
        child.children.length > 0
            ? { name: child.tagName, children: descElementsIn(child) }
            : { name: child.tagName, value: child.textContent ?? '' }
    )
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
): AppendedSamples {
    const { channelCount, sampleRateHz, valueReader, samples, timestamps } =
        stream
    const start = timestamps.length
    const timestamped: number[] = []

    if (!valueReader) {
        return { start, count: 0, timestamped }
    }

    const numSamples = variableLengthAt(contentStart, view)
    let offset = numSamples.end

    for (let i = 0; i < (numSamples.value ?? 0); i++) {
        const hasTimestamp = view.getUint8(offset++) === 8

        if (hasTimestamp) {
            timestamped.push(i)
        }

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

    const count = timestamps.length - start

    return {
        start,
        count,
        timestamped: timestamped.length === count ? 'all' : timestamped,
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
            ({
                type,
                channelNames,
                sampleRateHz,
                samples,
                timestamps,
                desc,
            }) => ({
                type,
                channelNames,
                sampleRateHz,
                samples,
                timestamps,
                desc,
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
    header?: DescElement[]
    devices: RecordedDevice[]
    chunks?: XmlNode[]
}

export interface XmlNode {
    name: string
    attributes?: Record<string, string>
    text?: string
    children?: XmlNode[]
    loadChildren?: () => XmlNode[]
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
    desc?: DescElement[]
}

export interface DescElement {
    name: string
    value?: string
    children?: DescElement[]
}

interface XdfStream extends RecordedStream {
    name: string
    sourceId: string
    nickname?: string
    channelCount: number
    valueReader?: ValueReader
}

interface AppendedSamples {
    start: number
    count: number
    timestamped: 'all' | number[]
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
