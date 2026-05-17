import {
  IFCRELDEFINESBYPROPERTIES,
  IFCELEMENTQUANTITY,
  IFCQUANTITYVOLUME,
  IFCQUANTITYAREA,
  IFCQUANTITYLENGTH,
  IFCCOLUMN, IFCBEAM, IFCSLAB, IFCWALL, IFCWALLSTANDARDCASE,
  IFCPLATE, IFCPLATESTANDARDCASE,
  IFCMEMBER, IFCMEMBERSTANDARDCASE,
  IFCBUILDINGELEMENTPROXY,
} from 'web-ifc'

function safeGetLine(api, modelID, id) {
  try { return api.GetLine(modelID, id, true) } catch { return null }
}

function extractVal(q) {
  if (!q) return null
  if (typeof q.value === 'number') return q.value
  if (q.VolumeValue?.value) return q.VolumeValue.value
  if (q.AreaValue?.value) return q.AreaValue.value
  if (q.LengthValue?.value) return q.LengthValue.value
  return null
}

export async function extractQuantities(api, modelID) {
  const result = {
    columnVolume: 0,
    beamVolume:   0,
    slabArea:     0,
    wallArea:     0,
    beamLength:   0,
    plateArea:    0,
    memberLength: 0,
    hasData:      false,
  }

  const elementToType = new Map()

  const targetTypes = [
    { const: IFCCOLUMN,              key: 'column' },
    { const: IFCBEAM,                key: 'beam'   },
    { const: IFCSLAB,                key: 'slab'   },
    { const: IFCWALL,                key: 'wall'   },
    { const: IFCWALLSTANDARDCASE,    key: 'wall'   },
    { const: IFCPLATE,               key: 'plate'  },
    { const: IFCPLATESTANDARDCASE,   key: 'plate'  },
    { const: IFCMEMBER,              key: 'member' },
    { const: IFCMEMBERSTANDARDCASE,  key: 'member' },
    { const: IFCBUILDINGELEMENTPROXY,key: 'proxy'  },
  ]

  for (const { const: tc, key } of targetTypes) {
    try {
      const ids = api.GetLineIDsWithType(modelID, tc)
      for (let i = 0; i < ids.size(); i++) {
        elementToType.set(ids.get(i), key)
      }
    } catch {}
  }

  try {
    const relIds = api.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES)
    for (let i = 0; i < relIds.size(); i++) {
      const rel = safeGetLine(api, modelID, relIds.get(i))
      if (!rel) continue

      const psetRef = rel.RelatingPropertyDefinition
      if (!psetRef) continue

      const psetId = psetRef.value ?? psetRef
      const pset = safeGetLine(api, modelID, psetId)
      if (!pset) continue

      // only process IfcElementQuantity
      if (pset.type !== IFCELEMENTQUANTITY) continue

      const relObjects = rel.RelatedObjects
      if (!relObjects || !Array.isArray(relObjects)) continue

      const quantities = pset.Quantities
      if (!quantities || !Array.isArray(quantities)) continue

      for (const objRef of relObjects) {
        const objId = objRef.value ?? objRef
        const elemType = elementToType.get(objId)
        if (!elemType) continue

        for (const qRef of quantities) {
          const qId = qRef.value ?? qRef
          const q = safeGetLine(api, modelID, qId)
          if (!q) continue

          const name = (q.Name?.value || '').toLowerCase()
          const qType = q.type

          if (elemType === 'column' && qType === IFCQUANTITYVOLUME) {
            const v = extractVal(q); if (v) { result.columnVolume += v; result.hasData = true }
          }
          if (elemType === 'beam') {
            if (qType === IFCQUANTITYVOLUME) {
              const v = extractVal(q); if (v) { result.beamVolume += v; result.hasData = true }
            }
            if (qType === IFCQUANTITYLENGTH && name.includes('length')) {
              const v = extractVal(q); if (v) { result.beamLength += v; result.hasData = true }
            }
          }
          if (elemType === 'slab' && qType === IFCQUANTITYAREA) {
            const v = extractVal(q); if (v) { result.slabArea += v; result.hasData = true }
          }
          if (elemType === 'wall' && qType === IFCQUANTITYAREA) {
            const v = extractVal(q); if (v) { result.wallArea += v; result.hasData = true }
          }
          if (elemType === 'plate' && qType === IFCQUANTITYAREA) {
            const v = extractVal(q); if (v) { result.plateArea += v; result.hasData = true }
          }
          if (elemType === 'member' && qType === IFCQUANTITYLENGTH) {
            const v = extractVal(q); if (v) { result.memberLength += v; result.hasData = true }
          }
        }
      }
    }
  } catch (e) {
    console.warn('Quantity extraction error:', e)
  }

  return result
}
