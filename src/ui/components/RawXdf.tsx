import React, { useMemo, useState } from 'react'

import { XmlNode } from '../../functions/readXdfRecording'
import ExpandControls, { useExpandLevels } from './ExpandControls'

const RawXdf: React.FC<RawXdfProps> = React.memo(({ chunks }) => {
    const [showsData, setShowsData] = useState(false)
    const levels = useMemo(
        () => levelsOf(chunks, showsData),
        [chunks, showsData]
    )
    const { controls, toggleOf } = useExpandLevels(levels)

    return (
        <section className="raw-xdf" aria-label="Raw XDF">
            <div className="raw-xdf__header">
                <div className="raw-xdf__controls">
                    <button
                        type="button"
                        className="control-button"
                        aria-pressed={showsData}
                        onClick={() => setShowsData(!showsData)}
                    >
                        {showsData ? 'Hide data' : 'Show data'}
                    </button>
                    {levels.length > 0 && <ExpandControls {...controls} />}
                </div>
            </div>
            <XmlNodeList
                className="raw-xdf__tree"
                nodes={chunks}
                showsData={showsData}
                toggleOf={toggleOf}
            />
        </section>
    )
})

export default RawXdf

function isShown(node: XmlNode, showsData: boolean) {
    return showsData || !dataNames.includes(node.name)
}

const dataNames = ['Samples', 'ClockOffset', 'Boundary', 'clock_offsets']

function levelsOf(
    nodes: readonly XmlNode[],
    showsData: boolean,
    parentPath?: string,
    levels: string[][] = []
) {
    const depth = parentPath === undefined ? 0 : parentPath.split('/').length

    nodes.forEach((node, index) => {
        if (node.children && isShown(node, showsData)) {
            const path = pathOf(parentPath, index)
            levels[depth] = [...(levels[depth] ?? []), path]
            levelsOf(node.children, showsData, path, levels)
        }
    })

    return levels
}

function pathOf(parentPath: string | undefined, index: number) {
    return parentPath === undefined ? `${index}` : `${parentPath}/${index}`
}

const XmlNodeList: React.FC<XmlNodeListProps> = ({
    className,
    nodes,
    parentPath,
    showsData,
    toggleOf,
}) => (
    <ul className={className}>
        {nodes.map(
            (node, index) =>
                isShown(node, showsData) && (
                    <XmlNodeItem
                        key={index}
                        node={node}
                        path={pathOf(parentPath, index)}
                        showsData={showsData}
                        toggleOf={toggleOf}
                    />
                )
        )}
    </ul>
)

const XmlNodeItem: React.FC<XmlNodeItemProps> = ({
    node,
    path,
    showsData,
    toggleOf,
}) => {
    const { name, text, children, loadChildren } = node
    const { isOpen, onToggle } = toggleOf(path)
    const shownChildren = useMemo(
        () => (isOpen ? (children ?? loadChildren?.() ?? []) : []),
        [isOpen, node]
    )

    if (!children && !loadChildren) {
        return (
            <li>
                <span className="raw-xdf__line">
                    <OpenTag node={node} isSelfClosing={text === undefined} />
                    {text !== undefined && (
                        <>
                            <span className="raw-xdf__text">{text}</span>
                            <CloseTag name={name} />
                        </>
                    )}
                </span>
            </li>
        )
    }

    return (
        <li>
            <button
                type="button"
                className="raw-xdf__line raw-xdf__toggle"
                aria-expanded={isOpen}
                onClick={onToggle}
            >
                <OpenTag node={node} />
                {!isOpen && (
                    <>
                        …<CloseTag name={name} />
                    </>
                )}
            </button>
            {isOpen && (
                <>
                    <XmlNodeList
                        className="raw-xdf__children"
                        nodes={shownChildren}
                        parentPath={path}
                        showsData={showsData}
                        toggleOf={toggleOf}
                    />
                    <span className="raw-xdf__line">
                        <CloseTag name={name} />
                    </span>
                </>
            )}
        </li>
    )
}

const OpenTag: React.FC<{ node: XmlNode; isSelfClosing?: boolean }> = ({
    node: { name, attributes = {} },
    isSelfClosing = false,
}) => (
    <>
        &lt;<span className="raw-xdf__name">{name}</span>
        {Object.entries(attributes).map(([attribute, value]) => (
            <React.Fragment key={attribute}>
                {' '}
                <span className="raw-xdf__attribute">{attribute}</span>=&quot;
                <span className="raw-xdf__attribute-value">{value}</span>
                &quot;
            </React.Fragment>
        ))}
        {isSelfClosing ? '/>' : '>'}
    </>
)

const CloseTag: React.FC<{ name: string }> = ({ name }) => (
    <>
        &lt;/<span className="raw-xdf__name">{name}</span>&gt;
    </>
)

interface RawXdfProps {
    chunks: readonly XmlNode[]
}

interface XmlNodeListProps {
    className: string
    nodes: readonly XmlNode[]
    parentPath?: string
    showsData: boolean
    toggleOf: ToggleOf
}

interface XmlNodeItemProps {
    node: XmlNode
    path: string
    showsData: boolean
    toggleOf: ToggleOf
}

type ToggleOf = (path: string) => { isOpen: boolean; onToggle: () => void }
