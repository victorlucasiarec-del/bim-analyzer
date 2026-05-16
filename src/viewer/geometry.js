import * as THREE from 'three'
import {
  IFCCOLUMN, IFCBEAM, IFCSLAB, IFCWALL, IFCWALLSTANDARDCASE,
  IFCWINDOW, IFCDOOR
} from 'web-ifc'

const TYPE_COLORS = {
  [IFCCOLUMN]:           { color: 0x2A2A2A, opacity: 1.0 },
  [IFCBEAM]:             { color: 0x4A4A4A, opacity: 1.0 },
  [IFCSLAB]:             { color: 0x6E6E6E, opacity: 1.0 },
  [IFCWALL]:             { color: 0x8A8A8A, opacity: 1.0 },
  [IFCWALLSTANDARDCASE]: { color: 0x8A8A8A, opacity: 1.0 },
  [IFCWINDOW]:           { color: 0xB0D0E8, opacity: 0.6 },
  [IFCDOOR]:             { color: 0xA0A0A0, opacity: 1.0 },
}
const DEFAULT_COLOR = { color: 0xC0C0C0, opacity: 1.0 }

const materialCache = new Map()

function getMaterial(ifcType, selected = false) {
  if (selected) {
    return new THREE.MeshLambertMaterial({ color: 0x1A7A4A })
  }
  const cfg = TYPE_COLORS[ifcType] || DEFAULT_COLOR
  const key = `${ifcType}_${cfg.color}_${cfg.opacity}`
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({
      color: cfg.color,
      transparent: cfg.opacity < 1,
      opacity: cfg.opacity,
      side: THREE.DoubleSide,
    }))
  }
  return materialCache.get(key)
}

export async function buildGeometry(api, modelID) {
  const meshGroup = new THREE.Group()
  const meshMeta = [] // [{mesh, expressID, ifcType}]

  // expressID → ifcType lookup
  const idToType = new Map()
  const typeConsts = [
    IFCCOLUMN, IFCBEAM, IFCSLAB, IFCWALL, IFCWALLSTANDARDCASE,
    IFCWINDOW, IFCDOOR
  ]
  for (const tc of typeConsts) {
    try {
      const ids = api.GetLineIDsWithType(modelID, tc)
      for (let i = 0; i < ids.size(); i++) idToType.set(ids.get(i), tc)
    } catch {}
  }

  const geometryByExpressID = new Map()

  api.StreamAllMeshes(modelID, (ifcMesh) => {
    const expressID = ifcMesh.expressID
    const geometries = ifcMesh.geometries

    const posArrays = []
    const normArrays = []
    const idxArrays = []
    let indexOffset = 0

    for (let g = 0; g < geometries.size(); g++) {
      const placed = geometries.get(g)
      const geomData = api.GetGeometry(modelID, placed.geometryExpressID)

      const verts = api.GetVertexArray(geomData.GetVertexData(), geomData.GetVertexDataSize())
      const idxs  = api.GetIndexArray(geomData.GetIndexData(), geomData.GetIndexDataSize())

      const flatTransform = placed.flatTransformation
      const matrix = new THREE.Matrix4().fromArray(flatTransform)

      const pos = []
      const nrm = []

      // vertices are interleaved: x, y, z, nx, ny, nz (stride 6 floats)
      for (let i = 0; i < verts.length; i += 6) {
        const v = new THREE.Vector3(verts[i], verts[i+1], verts[i+2])
        v.applyMatrix4(matrix)
        pos.push(v.x, v.y, v.z)

        const n = new THREE.Vector3(verts[i+3], verts[i+4], verts[i+5])
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
        n.applyMatrix3(normalMatrix).normalize()
        nrm.push(n.x, n.y, n.z)
      }

      const shiftedIdx = new Uint32Array(idxs.length)
      for (let i = 0; i < idxs.length; i++) shiftedIdx[i] = idxs[i] + indexOffset
      indexOffset += verts.length / 6

      posArrays.push(...pos)
      normArrays.push(...nrm)
      idxArrays.push(...shiftedIdx)

      geomData.delete()
    }

    if (posArrays.length === 0) return

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArrays, 3))
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normArrays, 3))
    geo.setIndex(idxArrays)

    geometryByExpressID.set(expressID, geo)
  })

  for (const [expressID, geo] of geometryByExpressID) {
    const ifcType = idToType.get(expressID)
    const mat = getMaterial(ifcType)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.userData.expressID = expressID
    mesh.userData.ifcType = ifcType
    meshGroup.add(mesh)
    meshMeta.push({ mesh, expressID, ifcType })
  }

  return { meshGroup, meshMeta }
}

// selectedIDs: Set<expressID>
export function applySelection(selectedIDs, meshMeta) {
  for (const m of meshMeta) {
    const shouldSelect = selectedIDs.has(m.expressID)
    if (shouldSelect === m.mesh.userData.selected) continue
    if (shouldSelect) {
      m.mesh.material = new THREE.MeshLambertMaterial({ color: 0x1A7A4A })
      m.mesh.userData.selected = true
    } else {
      m.mesh.material = getMaterial(m.mesh.userData.ifcType)
      m.mesh.userData.selected = false
    }
  }
}

export function centerModel(meshGroup) {
  const box = new THREE.Box3().setFromObject(meshGroup)
  const center = box.getCenter(new THREE.Vector3())
  meshGroup.position.sub(center)

  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  return { center, size, maxDim }
}
