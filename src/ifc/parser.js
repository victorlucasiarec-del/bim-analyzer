import {
  IFCPROJECT, IFCBUILDING, IFCSITE, IFCPERSON, IFCORGANIZATION,
  IFCAPPLICATION, IFCOWNERHISTORY,
  IFCCOLUMN, IFCBEAM, IFCSLAB, IFCWALL, IFCWALLSTANDARDCASE,
  IFCWINDOW, IFCDOOR, IFCFURNISHINGELEMENT, IFCSTAIR, IFCROOF,
  IFCFOOTING, IFCPILE
} from 'web-ifc'

export const ELEMENT_TYPES = {
  IFCCOLUMN:            { name: 'Pilar',      icon: '🏛️', typeConst: IFCCOLUMN },
  IFCBEAM:              { name: 'Viga',       icon: '📏', typeConst: IFCBEAM },
  IFCSLAB:              { name: 'Laje',       icon: '⬛', typeConst: IFCSLAB },
  IFCWALL:              { name: 'Parede',     icon: '🧱', typeConst: IFCWALL },
  IFCWALLSTANDARDCASE:  { name: 'Parede',     icon: '🧱', typeConst: IFCWALLSTANDARDCASE },
  IFCWINDOW:            { name: 'Janela',     icon: '🪟', typeConst: IFCWINDOW },
  IFCDOOR:              { name: 'Porta',      icon: '🚪', typeConst: IFCDOOR },
  IFCFURNISHINGELEMENT: { name: 'Mobiliário', icon: '🪑', typeConst: IFCFURNISHINGELEMENT },
  IFCSTAIR:             { name: 'Escada',     icon: '🪜', typeConst: IFCSTAIR },
  IFCROOF:              { name: 'Cobertura',  icon: '🏠', typeConst: IFCROOF },
  IFCFOOTING:           { name: 'Fundação',   icon: '⚓', typeConst: IFCFOOTING },
  IFCPILE:              { name: 'Estaca',     icon: '📌', typeConst: IFCPILE },
}

function safeGetLine(api, modelID, id) {
  try { return api.GetLine(modelID, id, true) } catch { return null }
}

function extractString(val) {
  if (!val) return null
  if (typeof val === 'string') return val
  if (val.value !== undefined) return String(val.value)
  return null
}

function formatDate(ts) {
  if (!ts) return null
  const date = new Date(Number(ts) * 1000)
  if (isNaN(date.getTime())) return null
  return date.toLocaleDateString('pt-BR')
}

export function parseMetadata(api, modelID, filename) {
  const meta = {
    filename,
    ifcVersion: 'IFC',
    projectName: '—',
    buildingName: '—',
    siteName: '—',
    author: '—',
    organization: '—',
    application: '—',
    date: '—',
  }

  const tryFirst = (typeConst, cb) => {
    try {
      const ids = api.GetLineIDsWithType(modelID, typeConst)
      if (ids.size() > 0) {
        const entity = safeGetLine(api, modelID, ids.get(0))
        if (entity) cb(entity)
      }
    } catch {}
  }

  tryFirst(IFCPROJECT, e => {
    meta.projectName = extractString(e.Name) || '—'
    // grab IFC version from schema identifiers
    if (e.type) {
      const t = String(e.type)
      if (t.includes('4X3') || t.includes('4x3')) meta.ifcVersion = 'IFC4X3'
      else if (t.includes('4')) meta.ifcVersion = 'IFC4'
      else meta.ifcVersion = 'IFC2X3'
    }
  })

  tryFirst(IFCBUILDING, e => { meta.buildingName = extractString(e.Name) || '—' })
  tryFirst(IFCSITE,     e => { meta.siteName     = extractString(e.Name) || '—' })

  tryFirst(IFCPERSON, e => {
    const given  = extractString(e.GivenName)  || ''
    const family = extractString(e.FamilyName) || ''
    const full = [given, family].filter(Boolean).join(' ')
    if (full) meta.author = full
  })

  tryFirst(IFCORGANIZATION, e => {
    meta.organization = extractString(e.Name) || '—'
  })

  tryFirst(IFCAPPLICATION, e => {
    meta.application = extractString(e.ApplicationFullName) || '—'
  })

  tryFirst(IFCOWNERHISTORY, e => {
    const ts = e.LastModifiedDate?.value || e.CreationDate?.value
    const formatted = formatDate(ts)
    if (formatted) meta.date = formatted
  })

  // detect IFC version from raw file bytes via schema line
  // we'll do this from a separate call if needed; default to IFC4
  if (meta.ifcVersion === 'IFC') meta.ifcVersion = 'IFC4'

  return meta
}

export function countElements(api, modelID) {
  const counts = {}
  let total = 0

  for (const [key, info] of Object.entries(ELEMENT_TYPES)) {
    try {
      const ids = api.GetLineIDsWithType(modelID, info.typeConst)
      const count = ids.size()
      if (count > 0) {
        counts[key] = count
        total += count
      }
    } catch {}
  }

  // merge IFCWALLSTANDARDCASE into IFCWALL display
  const merged = []
  const seen = new Set()

  for (const [key, info] of Object.entries(ELEMENT_TYPES)) {
    if (seen.has(info.name)) continue
    if (info.name === 'Parede') {
      const wallCount = (counts['IFCWALL'] || 0) + (counts['IFCWALLSTANDARDCASE'] || 0)
      if (wallCount > 0) {
        merged.push({ key: 'IFCWALL', name: 'Parede', icon: '🧱', count: wallCount })
        seen.add('Parede')
      }
    } else {
      if (counts[key]) {
        merged.push({ key, name: info.name, icon: info.icon, count: counts[key] })
      }
      seen.add(info.name)
    }
  }

  merged.sort((a, b) => b.count - a.count)

  return { merged, total }
}

export function detectIfcVersion(fileText) {
  const match = fileText.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)/)
  if (!match) return null
  const schema = match[1]
  if (schema.includes('IFC4X3')) return 'IFC4X3'
  if (schema.includes('IFC4')) return 'IFC4'
  if (schema.includes('IFC2X3')) return 'IFC2X3'
  return schema
}
