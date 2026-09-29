// Browser stand-in for Node's `module.createRequire`, which
// @neurodevs/node-signal-processing@3 uses to load fili. Remove once
// node-biosignal-processing depends on node-signal-processing@4, which
// imports fili directly.
import fili from '@neurodevs/fili'

const modulesById = { '@neurodevs/fili': fili }

export function createRequire() {
    return (id) => {
        if (!(id in modulesById)) {
            throw new Error(`No browser shim for require('${id}')`)
        }
        return modulesById[id]
    }
}
