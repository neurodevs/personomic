import React, { useState } from 'react'

const ExpandControls: React.FC<ExpandControlsProps> = ({
    canCollapseLevel,
    isAllOpen,
    canExpandLevel,
    onCollapseLevel,
    onToggleAll,
    onExpandLevel,
}) => (
    <>
        <button
            type="button"
            className="control-button"
            aria-label="Collapse one level"
            disabled={!canCollapseLevel}
            onClick={onCollapseLevel}
        >
            −
        </button>
        <button type="button" className="control-button" onClick={onToggleAll}>
            {isAllOpen ? 'Collapse all' : 'Expand all'}
        </button>
        <button
            type="button"
            className="control-button"
            aria-label="Expand one level"
            disabled={!canExpandLevel}
            onClick={onExpandLevel}
        >
            +
        </button>
    </>
)

export default ExpandControls

export function useExpandLevels(levels: string[][]) {
    const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())

    const allKeys = levels.flat()
    const isAllOpen =
        allKeys.length > 0 && allKeys.every((key) => openKeys.has(key))

    const nextLevelToExpand = levels.findIndex(
        (level) => !level.every((key) => openKeys.has(key))
    )
    const nextLevelToCollapse = levels.findLastIndex((level) =>
        level.some((key) => isShownOpen(key, openKeys))
    )

    const controls: ExpandControlsProps = {
        canCollapseLevel: nextLevelToCollapse !== -1,
        isAllOpen,
        canExpandLevel: nextLevelToExpand !== -1,
        onCollapseLevel: () => {
            const closing = new Set(levels.slice(nextLevelToCollapse).flat())
            setOpenKeys(
                new Set([...openKeys].filter((key) => !closing.has(key)))
            )
        },
        onToggleAll: () => setOpenKeys(new Set(isAllOpen ? [] : allKeys)),
        onExpandLevel: () =>
            setOpenKeys(
                new Set([
                    ...openKeys,
                    ...levels.slice(0, nextLevelToExpand + 1).flat(),
                ])
            ),
    }

    const toggleOf = (key: string) => ({
        isOpen: openKeys.has(key),
        onToggle: () =>
            setOpenKeys((previous) => {
                const next = new Set(previous)
                next[next.has(key) ? 'delete' : 'add'](key)
                return next
            }),
    })

    return { controls, toggleOf }
}

function isShownOpen(key: string, openKeys: Set<string>) {
    const parts = key.split('/')
    return parts.every((_, depth) =>
        openKeys.has(parts.slice(0, depth + 1).join('/'))
    )
}

export interface ExpandControlsProps {
    canCollapseLevel: boolean
    isAllOpen: boolean
    canExpandLevel: boolean
    onCollapseLevel: () => void
    onToggleAll: () => void
    onExpandLevel: () => void
}
