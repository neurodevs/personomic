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
                    {names.map((name) => (
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
                </ul>
            )}
        </div>
    )
}

export default AddBiosensorButton
