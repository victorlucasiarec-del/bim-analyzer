/**
 * ifc.worker.js — Web Worker que executa todo o processamento pesado de IFC.
 *
 * Mensagens recebidas (main → worker):
 *   { type:'load',           buffer:ArrayBuffer, filename:string, loadId:number }
 *   { type:'get_properties', requestId:number, id:number }
 *   { type:'get_entity',     requestId:number, id:number }
 *   { type:'close' }
 *
 * Mensagens enviadas (worker → main):
 *   { type:'progress',       message:string,     loadId }
 *   { type:'meta',           data:object,        loadId }
 *   { type:'elements',       data:object,        loadId }
 *   { type:'quantities',     data:object,        loadId }
 *   { type:'geometry_batch', items:[...],        loadId }  (com transferables)
 *   { type:'done',                               loadId }
 *   { type:'error',          message:string,     loadId }
 *   { type:'properties',     requestId, data }
 *   { type:'entity',         requestId, data }
 */

import { IfcAPI } from 'web-ifc'
import * as WebIFC from 'web-ifc'
import { parseMetadata, countElements } from './parser.js'
import { extractQuantities } from './quantities.js'

const {
  IFCCOLUMN, IFCBEAM, IFCSLAB, IFCFOOTING, IFCPILE,
  IFCMEMBER, IFCMEMBERSTANDARDCASE,
  IFCPLATE, IFCPLATESTANDARDCASE,
  IFCWALL, IFCWALLSTANDARDCASE,
  IFCWINDOW, IFCDOOR,
  IFCROOF, IFCSTAIR, IFCSTAIRFLIGHT,
  IFCRAMP, IFCRAMPFLIGHT,
  IFCCURTAINWALL,
  IFCFURNISHINGELEMENT, IFCFURNITURE,
  IFCBUILDINGELEMENTPROXY,
  IFCRELDEFINESBYPROPERTIES,
  IFCELEMENTQUANTITY,
} = WebIFC

// Todos os tipos que serão mapeados para geometria colorida no viewer
const TYPED_CONSTS = [
  IFCCOLUMN, IFCBEAM, IFCSLAB, IFCFOOTING, IFCPILE,
  IFCMEMBER, IFCMEMBERSTANDARDCASE,
  IFCPLATE, IFCPLATESTANDARDCASE,
  IFCWALL, IFCWALLSTANDARDCASE,
  IFCWINDOW, IFCDOOR,
  IFCROOF, IFCSTAIR, IFCSTAIRFLIGHT,
  IFCRAMP, IFCRAMPFLIGHT,
  IFCCURTAINWALL,
  IFCFURNISHINGELEMENT, IFCFURNITURE,
  IFCBUILDINGELEMENTPROXY,
]

const BATCH_SIZE = 100   // meshes por pacote transferido para a thread principal

let api = null
let modelID = null

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeGet(id, flatten = true) {
  try { return api.GetLine(modelID, id, flatten) } catch { return null }
}

function extractStr(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v.trim() || null
  if (v.value !== undefined) {
    if (typeof v.value === 'boolean') return v.value ? 'Sim' : 'Não'
    const s = String(v.value).trim()
    return s || null
  }
  return null
}

function post(msg, transferables) {
  if (transferables?.length) self.postMessage(msg, transferables)
  else                       self.postMessage(msg)
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type } = e.data
  if      (type === 'load')           await handleLoad(e.data)
  else if (type === 'get_properties') handleGetProperties(e.data)
  else if (type === 'get_entity')     handleGetEntity(e.data)
  else if (type === 'close')          handleClose()
}

// ── LOAD ─────────────────────────────────────────────────────────────────────

async function handleLoad({ buffer, filename, loadId }) {
  handleClose()   // fecha modelo anterior se existir

  try {
    api = new IfcAPI()
    api.SetWasmPath('/')

    post({ type: 'progress', message: 'Inicializando parser WebAssembly…', loadId })
    await api.Init()

    post({ type: 'progress', message: 'Abrindo modelo IFC…', loadId })
    const data8 = new Uint8Array(buffer)
    modelID = api.OpenModel(data8)

    // Detectar versão IFC pelo cabeçalho
    const hdrLen = Math.min(512, buffer.byteLength)
    const hdrText = new TextDecoder().decode(new Uint8Array(buffer, 0, hdrLen))
    let ifcVer = 'IFC4'
    const hm = hdrText.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/)
    if (hm) {
      const s = hm[1]
      if      (s.includes('IFC4X3')) ifcVer = 'IFC4X3'
      else if (s.includes('IFC4'))   ifcVer = 'IFC4'
      else if (s.includes('IFC2X3')) ifcVer = 'IFC2X3'
      else                           ifcVer = s
    }

    // ── Metadados ────────────────────────────────────────────────────────────
    post({ type: 'progress', message: 'Extraindo metadados…', loadId })
    const meta = parseMetadata(api, modelID, filename)
    meta.ifcVersion = ifcVer
    post({ type: 'meta', data: meta, loadId })

    // ── Elementos ────────────────────────────────────────────────────────────
    post({ type: 'progress', message: 'Contando elementos…', loadId })
    const elementData = countElements(api, modelID)
    meta.totalElements = elementData.total
    post({ type: 'elements', data: elementData, loadId })

    // ── Quantitativos ────────────────────────────────────────────────────────
    post({ type: 'progress', message: 'Extraindo quantitativos…', loadId })
    const quantities = await extractQuantities(api, modelID)
    post({ type: 'quantities', data: quantities, loadId })

    // ── Geometria ────────────────────────────────────────────────────────────
    post({ type: 'progress', message: 'Processando geometria 3D…', loadId })

    // Mapa expressID → tipo IFC (para coloração no viewer)
    const idToType = new Map()
    for (const tc of TYPED_CONSTS) {
      try {
        const ids = api.GetLineIDsWithType(modelID, tc)
        for (let i = 0; i < ids.size(); i++) idToType.set(ids.get(i), tc)
      } catch {}
    }

    let batch = []

    const flush = () => {
      if (!batch.length) return
      const transferables = batch.flatMap(item => [
        item.positions.buffer,
        item.normals.buffer,
        item.indices.buffer,
      ])
      post({ type: 'geometry_batch', items: batch, loadId }, transferables)
      batch = []
    }

    api.StreamAllMeshes(modelID, (ifcMesh) => {
      const expressID = ifcMesh.expressID
      const geos      = ifcMesh.geometries
      const posArr = [], nrmArr = [], idxArr = []
      let   offset = 0

      for (let g = 0; g < geos.size(); g++) {
        const placed = geos.get(g)
        if (!placed) continue
        const geomData = api.GetGeometry(modelID, placed.geometryExpressID)
        if (!geomData) continue

        const verts = api.GetVertexArray(geomData.GetVertexData(),  geomData.GetVertexDataSize())
        const idxs  = api.GetIndexArray(geomData.GetIndexData(),   geomData.GetIndexDataSize())
        const mat   = placed.flatTransformation  // Float32Array col-major 4×4

        if (!mat || mat.length < 16 || !verts || !verts.length) {
          geomData.delete()
          continue
        }

        // Transformar vértices e normais
        for (let i = 0; i < verts.length; i += 6) {
          const x = verts[i], y = verts[i + 1], z = verts[i + 2]
          posArr.push(
            mat[0] * x + mat[4] * y + mat[8]  * z + mat[12],
            mat[1] * x + mat[5] * y + mat[9]  * z + mat[13],
            mat[2] * x + mat[6] * y + mat[10] * z + mat[14],
          )
          const nx = verts[i + 3], ny = verts[i + 4], nz = verts[i + 5]
          const nnx = mat[0] * nx + mat[4] * ny + mat[8]  * nz
          const nny = mat[1] * nx + mat[5] * ny + mat[9]  * nz
          const nnz = mat[2] * nx + mat[6] * ny + mat[10] * nz
          const len = Math.sqrt(nnx * nnx + nny * nny + nnz * nnz) || 1
          nrmArr.push(nnx / len, nny / len, nnz / len)
        }

        for (let i = 0; i < idxs.length; i++) idxArr.push(idxs[i] + offset)
        offset += verts.length / 6

        geomData.delete()
      }

      if (!posArr.length) return

      batch.push({
        expressID,
        ifcType:   idToType.get(expressID),
        positions: new Float32Array(posArr),
        normals:   new Float32Array(nrmArr),
        indices:   new Uint32Array(idxArr),
      })

      if (batch.length >= BATCH_SIZE) flush()
    })

    flush()
    post({ type: 'done', loadId })

  } catch (err) {
    console.error('[worker] load error:', err)
    post({ type: 'error', message: err?.message || String(err), loadId })
  }
}

// ── GET ENTITY (identidade rápida para overlay de seleção) ───────────────────

function handleGetEntity({ requestId, id }) {
  let globalId    = '—'
  let displayType = `IFC #${id}`
  try {
    const e = safeGet(id, true)
    if (e) {
      globalId = e.GlobalId?.value || '—'
      if (e.constructor?.name && e.constructor.name !== 'Object')
        displayType = e.constructor.name
    }
  } catch {}
  self.postMessage({ type: 'entity', requestId, data: { globalId, displayType } })
}

// ── GET PROPERTIES (Psets e Qsets completos) ─────────────────────────────────

function handleGetProperties({ requestId, id }) {
  const out = {
    identity: { name: null, typeName: null, globalId: null, description: null, tag: null },
    psets: [],
    qsets: [],
  }

  // Identidade básica
  try {
    const e = safeGet(id, true)
    if (e) {
      out.identity.typeName    = (e.constructor?.name && e.constructor.name !== 'Object')
                                   ? e.constructor.name : null
      out.identity.name        = extractStr(e.Name)
      out.identity.description = extractStr(e.Description)
      out.identity.globalId    = e.GlobalId?.value || null
      out.identity.tag         = extractStr(e.Tag)
    }
  } catch {}

  // Property/Quantity Sets via IFCRELDEFINESBYPROPERTIES
  try {
    const relIds = api.GetLineIDsWithType(modelID, IFCRELDEFINESBYPROPERTIES)
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = safeGet(relIds.get(i), false)  // flatten:false = mais rápido
        if (!rel?.RelatedObjects) continue
        const related = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : []
        const isTarget = related.some(r => (r?.value ?? r) === id)
        if (!isTarget) continue

        const pdefId = rel.RelatingPropertyDefinition?.value ?? rel.RelatingPropertyDefinition
        const pdef   = safeGet(pdefId, true)
        if (!pdef) continue

        const setName = extractStr(pdef.Name) || 'Propriedades'

        // ── QuantitySet ──────────────────────────────────────────────────────
        if (pdef.type === IFCELEMENTQUANTITY && Array.isArray(pdef.Quantities)) {
          const quantities = []
          for (const ref of pdef.Quantities) {
            try {
              const q     = safeGet(ref?.value ?? ref, true)
              if (!q) continue
              const qname = extractStr(q.Name)
              if (!qname) continue
              let raw = null, unit = ''
              if      (q.LengthValue  !== undefined) { raw = q.LengthValue?.value;  unit = 'm'  }
              else if (q.AreaValue    !== undefined) { raw = q.AreaValue?.value;    unit = 'm²' }
              else if (q.VolumeValue  !== undefined) { raw = q.VolumeValue?.value;  unit = 'm³' }
              else if (q.WeightValue  !== undefined) { raw = q.WeightValue?.value;  unit = 'kg' }
              else if (q.CountValue   !== undefined) { raw = q.CountValue?.value;   unit = ''   }
              else if (q.TimeValue    !== undefined) { raw = q.TimeValue?.value;    unit = 's'  }
              if (raw !== null) {
                const n   = Number(raw)
                const fmt = isNaN(n)
                  ? String(raw)
                  : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + (unit ? ' ' + unit : '')
                quantities.push({ name: qname, value: fmt })
              }
            } catch {}
          }
          if (quantities.length) out.qsets.push({ name: setName, quantities })
        }

        // ── PropertySet ──────────────────────────────────────────────────────
        else if (Array.isArray(pdef.HasProperties)) {
          const props = []
          for (const ref of pdef.HasProperties) {
            try {
              const p     = safeGet(ref?.value ?? ref, true)
              if (!p) continue
              const pname = extractStr(p.Name)
              if (!pname) continue
              let val = null
              if (p.NominalValue !== undefined) {
                val = extractStr(p.NominalValue)
              } else if (Array.isArray(p.EnumerationValues)) {
                val = p.EnumerationValues.map(v => extractStr(v)).filter(Boolean).join(', ')
              } else if (Array.isArray(p.ListValues)) {
                val = p.ListValues.map(v => extractStr(v)).filter(Boolean).join(', ')
              } else if (p.UpperBoundValue !== undefined || p.LowerBoundValue !== undefined) {
                const lo = extractStr(p.LowerBoundValue)
                const hi = extractStr(p.UpperBoundValue)
                val = [lo, hi].filter(Boolean).join(' – ')
              }
              props.push({ name: pname, value: val ?? '—' })
            } catch {}
          }
          if (props.length) out.psets.push({ name: setName, props })
        }

      } catch {}
    }
  } catch (e) {
    console.warn('[worker] properties error:', e)
  }

  self.postMessage({ type: 'properties', requestId, data: out })
}

// ── CLOSE ────────────────────────────────────────────────────────────────────

function handleClose() {
  if (api && modelID !== null) {
    try { api.CloseModel(modelID) } catch {}
    modelID = null
  }
}
