import React, { useEffect, useState } from 'react'

export const defaultRecordDirectory = '~/Personomic/Sessions'
export const defaultRecordName = 'session'

const recordDirectoryLabel = 'Recordings folder'
const recordNameLabel = 'Recording name'

export interface RecordPathFieldsProps {
    directory: string
    directoryPlaceholder?: string
    name: string
    isLocked: boolean
    isBrowsing: boolean
    startedAt?: Date
    onDirectoryChange: (directory: string) => void
    onNameChange: (name: string) => void
    onBrowse: () => void
}

const RecordPathFields: React.FC<RecordPathFieldsProps> = (
    props: RecordPathFieldsProps
) => {
    const {
        directory,
        directoryPlaceholder = defaultRecordDirectory,
        name,
        isLocked,
        isBrowsing,
        startedAt,
        onDirectoryChange,
        onNameChange,
        onBrowse,
    } = props

    return (
        <>
            <input
                type="text"
                className="connect-devices__record-directory"
                aria-label={recordDirectoryLabel}
                placeholder={directoryPlaceholder}
                value={directory}
                readOnly={isLocked}
                onChange={(event) => onDirectoryChange(event.target.value)}
            />
            {!isLocked && (
                <button
                    type="button"
                    className="connect-devices__browse"
                    disabled={isBrowsing}
                    onClick={onBrowse}
                >
                    Browse…
                </button>
            )}
            <span className="connect-devices__record-file">
                <input
                    type="text"
                    className="connect-devices__record-name"
                    aria-label={recordNameLabel}
                    placeholder={defaultRecordName}
                    value={name}
                    readOnly={isLocked}
                    onChange={(event) => onNameChange(event.target.value)}
                />
                <RecordTimestamp frozenAt={startedAt} />
            </span>
        </>
    )
}

export default RecordPathFields

interface RecordTimestampProps {
    frozenAt?: Date
}

const RecordTimestamp: React.FC<RecordTimestampProps> = (
    props: RecordTimestampProps
) => {
    const { frozenAt } = props

    const [tickedAt, setTickedAt] = useState(now)

    useEffect(() => {
        if (frozenAt) {
            return undefined
        }

        return everySecond(() => setTickedAt(now()))
    }, [frozenAt])

    return (
        <span className="connect-devices__record-timestamp">
            {recordFileSuffixFor(frozenAt ?? tickedAt)}
        </span>
    )
}

export function recordFileSuffixFor(date: Date) {
    return `_${timestampFor(date)}.xdf`
}

function timestampFor(date: Date) {
    const padded = (value: number) => String(value).padStart(2, '0')

    const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]

    return `${day.map(padded).join('-')}_${time.map(padded).join('-')}`
}

// Test doubles

export let now = () => new Date()

export function setNow(nextNow: typeof now) {
    now = nextNow
}

export let everySecond = (callback: () => void) => {
    const id = setInterval(callback, 1000)
    return () => clearInterval(id)
}

export function setEverySecond(nextEverySecond: typeof everySecond) {
    everySecond = nextEverySecond
}
