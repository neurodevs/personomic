import React, { useState } from 'react'

export interface AddBiosensorButtonProps {
    names: readonly string[]
    onAdd: (name: string) => void
}

const AddBiosensorButton: React.FC<AddBiosensorButtonProps> = (
    props: AddBiosensorButtonProps
) => {
    const { names, onAdd } = props

    const [isOpen, setIsOpen] = useState(false)

    const add = (name: string) => {
        onAdd(name)
        setIsOpen(false)
    }

    return (
        <div className="add-biosensor">
            <button
                type="button"
                className="add-biosensor__button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((wasOpen) => !wasOpen)}
            >
                + Add biosensor
            </button>
            {isOpen && (
                <ul className="add-biosensor__menu" role="menu">
                    {familiesOf(names).map((family, i) => (
                        <React.Fragment key={family[0]}>
                            {i > 0 && (
                                <li
                                    role="separator"
                                    className="add-biosensor__separator"
                                />
                            )}
                            {family.map((name) => (
                                <li key={name} role="none">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className="add-biosensor__option"
                                        onClick={() => add(name)}
                                    >
                                        {name}
                                    </button>
                                </li>
                            ))}
                        </React.Fragment>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default AddBiosensorButton

function familiesOf(names: readonly string[]) {
    const namesByFamily = new Map<string, string[]>()

    for (const name of names) {
        const family = familyOf(name)
        namesByFamily.set(family, [...(namesByFamily.get(family) ?? []), name])
    }

    return [...namesByFamily.values()]
}

function familyOf(name: string) {
    return name.startsWith('Muse ') ? 'Muse' : name
}
