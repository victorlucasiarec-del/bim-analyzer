import * as THREE from 'three'
import {
  IFCCOLUMN, IFCBEAM, IFCSLAB, IFCWALL, IFCWALLSTANDARDCASE,
  IFCWINDOW, IFCDOOR,
  IFCPLATE, IFCPLATESTANDARDCASE,
  IFCMEMBER, IFCMEMBERSTANDARDCASE,
  IFCBUILDINGELEMENTPROXY,
  IFCFURNISHINGELEMENT, IFCFURNITURE,
  IFCROOF, IFCSTAIR, IFCSTAIRFLIGHT,
  IFCRAMP, IFCRAMPFLIGHT, IFCCURTAINWALL,
  IFCFOOTING, IFCPILE,
} from 'web-ifc'

const TYPE_COLORS = {
  // ── Estrutural – Concreto ──────────────────────────────────────────────────
  [IFCCOLUMN]:               { color: 0x3C3C3C, opacity: 1.0 },  // concreto escuro
  [IFCBEAM]:                 { color: 0x525252, opacity: 1.0 },  // concreto médio
  [IFCSLAB]:                 { color: 0x787870, opacity: 1.0 },  // laje (cinza-quente)
  [IFCFOOTING]:              { color: 0x4A3020, opacity: 1.0 },  // fundação (terra)
  [IFCPILE]:                 { color: 0x4A3020, opacity: 1.0 },  // estaca (terra)
  // ── Estrutural – Aço / Metal ──────────────────────────────────────────────
  [IFCMEMBER]:               { color: 0x2E5070, opacity: 1.0 },  // perfil metálico (azul-aço)
  [IFCMEMBERSTANDARDCASE]:   { color: 0x2E5070, opacity: 1.0 },
  [IFCPLATE]:                { color: 0x4A7090, opacity: 1.0 },  // chapa (azul-aço claro)
  [IFCPLATESTANDARDCASE]:    { color: 0x4A7090, opacity: 1.0 },
  // ── Arquitetônico ─────────────────────────────────────────────────────────
  [IFCWALL]:                 { color: 0xC8B898, opacity: 1.0 },  // parede (bege-concreto)
  [IFCWALLSTANDARDCASE]:     { color: 0xC8B898, opacity: 1.0 },
  [IFCWINDOW]:               { color: 0x70B8E0, opacity: 0.40 }, // janela (vidro azul)
  [IFCDOOR]:                 { color: 0x9A7040, opacity: 1.0 },  // porta (madeira)
  [IFCROOF]:                 { color: 0x705040, opacity: 1.0 },  // cobertura (terra escura)
  [IFCSTAIR]:                { color: 0xC07820, opacity: 1.0 },  // escada (laranja)
  [IFCSTAIRFLIGHT]:          { color: 0xC07820, opacity: 1.0 },
  [IFCRAMP]:                 { color: 0xB07018, opacity: 1.0 },  // rampa (laranja escuro)
  [IFCRAMPFLIGHT]:           { color: 0xB07018, opacity: 1.0 },
  [IFCCURTAINWALL]:          { color: 0x58A0C8, opacity: 0.45 }, // fachada cortina (vidro)
  // ── Mobiliário / Equipamentos ─────────────────────────────────────────────
  [IFCFURNISHINGELEMENT]:    { color: 0xB08030, opacity: 1.0 },  // mobiliário (madeira)
  [IFCFURNITURE]:            { color: 0xB08030, opacity: 1.0 },
  // ── Genérico (Revit proxy: CALHA, PISO TATIL, etc.) ──────────────────────
  [IFCBUILDINGELEMENTPROXY]: { color: 0x6888A0, opacity: 1.0 },  // proxy (azul-aço neutro)
}
const DEFAULT_COLOR = { color: 0x9A9080, opacity: 1.0 }  // fallback (bege-cinza)

const materialCache = new Map()

export function getMaterial(ifcType, selected = false) {
  if (selected) {
    return new THREE.MeshLambertMaterial({ color: 0xE8A020 })  // amarelo-âmbar seleção
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

/**
 * Constrói um THREE.Mesh a partir de um item de geometria recebido do Worker.
 * item = { expressID, ifcType, positions:Float32Array, normals:Float32Array, indices:Uint32Array }
 */
export function buildMeshFromItem(item) {
  const { expressID, ifcType, positions, normals, indices } = item
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))

  const mat  = getMaterial(ifcType)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.userData.expressID = expressID
  mesh.userData.ifcType   = ifcType
  return mesh
}

export async function buildGeometry(api, modelID) {
  const meshGroup = new THREE.Group()
  const meshMeta = [] // [{mesh, expressID, ifcType}]

  // expressID → ifcType lookup (todos os tipos com cor definida)
  const idToType = new Map()
  const typeConsts = Object.keys(TYPE_COLORS).map(Number)
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
      m.mesh.material = new THREE.MeshLambertMaterial({ color: 0xE8A020 })
      m.mesh.userData.selected = true
    } else {
      m.mesh.material = getMaterial(m.mesh.userData.ifcType)
      m.mesh.userData.selected = false
    }
  }
}

export function centerModel(meshGroup) {
  const box = new THREE.Box3().setFromObject(meshGroup)

  // Proteção contra grupo vazio (sem geometria carregada)
  if (box.isEmpty()) {
    return { center: new THREE.Vector3(), size: new THREE.Vector3(), maxDim: 30 }
  }

  const center = box.getCenter(new THREE.Vector3())
  meshGroup.position.sub(center)

  const size   = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  return { center, size, maxDim }
}
