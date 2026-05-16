import * as WebIFC from 'web-ifc'

const {
  IFCPROJECT, IFCBUILDING, IFCSITE, IFCPERSON,
  IFCORGANIZATION, IFCAPPLICATION, IFCOWNERHISTORY
} = WebIFC

// ── Nomes amigáveis em português para classes IFC conhecidas ──
// Tipos com o mesmo nome serão somados automaticamente
const PT_NAMES = {
  // Estrutural
  IFCCOLUMN:                  'Pilar',
  IFCCOLUMNSTANDARDCASE:      'Pilar',
  IFCBEAM:                    'Viga',
  IFCBEAMSTANDARDCASE:        'Viga',
  IFCSLAB:                    'Laje',
  IFCSLABSTANDARDCASE:        'Laje',
  IFCFOOTING:                 'Fundação',
  IFCPILE:                    'Estaca',
  IFCMEMBER:                  'Perfil Estrutural',
  IFCMEMBERSTANDARDCASE:      'Perfil Estrutural',
  IFCPLATE:                   'Chapa / Painel',
  IFCPLATESTANDARDCASE:       'Chapa / Painel',
  IFCREINFORCINGBAR:          'Armadura',
  IFCREINFORCINGELEMENT:      'Armadura',
  IFCREINFORCINGMESH:         'Tela Soldada',
  IFCTENDON:                  'Cabo Protendido',
  // Arquitetônico
  IFCWALL:                    'Parede',
  IFCWALLSTANDARDCASE:        'Parede',
  IFCWALLPARTITION:           'Divisória',
  IFCWINDOW:                  'Janela',
  IFCWINDOWSTANDARDCASE:      'Janela',
  IFCDOOR:                    'Porta',
  IFCDOORSTANDARDCASE:        'Porta',
  IFCROOF:                    'Cobertura',
  IFCSTAIR:                   'Escada',
  IFCSTAIRFLIGHT:             'Lanço de Escada',
  IFCRAMP:                    'Rampa',
  IFCRAMPFLIGHT:              'Lanço de Rampa',
  IFCCURTAINWALL:             'Fachada Cortina',
  IFCCOVERING:                'Revestimento',
  IFCRAILING:                 'Corrimão / Guarda-corpo',
  IFCSPACE:                   'Espaço / Ambiente',
  IFCZONE:                    'Zona',
  IFCOPENINGELEMENT:          'Abertura',
  IFCBUILDINGELEMENTPROXY:    'Elemento Genérico',
  // Mobiliário e equipamentos
  IFCFURNISHINGELEMENT:       'Mobiliário',
  IFCFURNITURE:               'Mobiliário',
  IFCSYSTEMFURNITUREELEMENT:  'Mobiliário Sistêmico',
  IFCDISCRETEACCESSORY:       'Acessório',
  IFCMECHANICALFASTENER:      'Fixador',
  // Elétrica
  IFCELECTRICDISTRIBUTIONBOARD: 'Quadro Elétrico',
  IFCELECTRICALELEMENT:       'Elemento Elétrico',
  IFCLIGHTFIXTURE:            'Luminária',
  IFCOUTLET:                  'Ponto Elétrico',
  IFCCABLECARRIERFITTING:     'Eletrocalha / Conexão',
  IFCCABLECARRIERSEGMENT:     'Eletrocalha',
  IFCCABLESEGMENT:            'Cabo',
  IFCPROTECTIVEDEVICE:        'Dispositivo de Proteção',
  IFCSWITCHINGDEVICE:         'Interruptor',
  // Hidráulica / Sanitário
  IFCSANITARYTERMINAL:        'Louça Sanitária',
  IFCPIPESEGMENT:             'Tubulação',
  IFCPIPEFITTING:             'Conexão Hidráulica',
  IFCVALVE:                   'Válvula',
  IFCWASTETERMINAL:           'Ralo / Sifão',
  // AVAC / Ar-condicionado
  IFCDUCTSEGMENT:             'Duto',
  IFCDUCTFITTING:             'Conexão de Duto',
  IFCAIRTOAIRHEATRECOVERY:    'Recuperador de Calor',
  IFCCHILLER:                 'Chiller',
  IFCCOIL:                    'Serpentina',
  IFCCOMPRESSOR:              'Compressor',
  IFCCONDENSER:               'Condensador',
  IFCFAN:                     'Ventilador',
  IFCFILTER:                  'Filtro',
  IFCHUMIDIFIER:              'Umidificador',
  IFCUNITARYEQUIPMENT:        'Unidade de Ar-condicionado',
  // Transporte vertical
  IFCTRANSPORTELEMENT:        'Elevador / Transporte',
  // Genérico
  IFCDISTRIBUTIONELEMENT:     'Elemento de Distribuição',
  IFCFLOWSEGMENT:             'Segmento de Instalação',
  IFCFLOWTERMINAL:            'Terminal de Instalação',
  IFCFLOWFITTING:             'Conexão de Instalação',
  IFCFLOWCONTROLLER:          'Controlador',
  IFCFLOWMOVINGDEVICE:        'Dispositivo de Movimentação',
  IFCFLOWSTORAGEDEVICE:       'Reservatório / Tanque',
  IFCENERGYCONVERSIONDEVICE:  'Equipamento de Energia',
  IFCDISTRIBUTIONFLOWELEMENT: 'Elemento de Fluxo',
}

// Mapa reverso: id numérico → chave string (ex: 843113511 → 'IFCCOLUMN')
const TYPE_ID_TO_KEY = {}
for (const [key, val] of Object.entries(WebIFC)) {
  if (key.startsWith('IFC') && typeof val === 'number') {
    TYPE_ID_TO_KEY[val] = key
  }
}

// Converte chave IFC desconhecida em nome legível (fallback)
// IFCSTAIRFLIGHT → 'Stair Flight'
function formatUnknown(key) {
  return key
    .replace(/^IFC/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

// Tipos que não são elementos físicos — ignorar na contagem
const SKIP_TYPES = new Set([
  'IFCRELATIONSHIP', 'IFCPROPERTYSET', 'IFCPROPERTYSINGLEVALUE',
  'IFCPROJECT', 'IFCBUILDING', 'IFCSITE', 'IFCBUILDINGSTOREY',
  'IFCPERSON', 'IFCORGANIZATION', 'IFCAPPLICATION', 'IFCOWNERHISTORY',
  'IFCGEOMETRICREPRESENTATIONCONTEXT', 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
  'IFCUNITASSIGNMENT', 'IFCSIUNIT', 'IFCMEASUREWITHUNIT',
  'IFCAXIS2PLACEMENT3D', 'IFCAXIS2PLACEMENT2D', 'IFCLOCALPLACEMENT',
  'IFCDIRECTION', 'IFCCARTESIANPOINT', 'IFCPOLYLINE',
  'IFCPRODUCTDEFINITIONSHAPE', 'IFCSHAPEREPRESENTATION',
  'IFCMATERIAL', 'IFCMATERIALLAYER', 'IFCMATERIALLAYERSET',
  'IFCMATERIALLAYERSETUSAGE', 'IFCMATERIALCONSTITUENT',
  'IFCPRESENTATIONLAYERASSIGNMENT', 'IFCSTYLEDITEM',
  'IFCRELDEFINESBYPROPERTIES', 'IFCRELDEFINESBYTYPE',
  'IFCRELASSOCIATESMATERIAL', 'IFCRELCONTAINEDINSPATIALSTRUCTURE',
  'IFCRELAGGREGATES', 'IFCRELCONNECTSPATHELEMENTS',
  'IFCRELSPACEBOUNDARY', 'IFCRELVOIDSELEMENT', 'IFCRELFILLSELEMENT',
])

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
  // Iterar TODAS as constantes IFC exportadas pelo web-ifc
  const rawCounts = {}

  for (const [key, typeConst] of Object.entries(WebIFC)) {
    if (!key.startsWith('IFC')) continue
    if (typeof typeConst !== 'number') continue
    if (SKIP_TYPES.has(key)) continue

    try {
      const ids = api.GetLineIDsWithType(modelID, typeConst)
      const count = ids.size()
      if (count > 0) rawCounts[key] = count
    } catch {}
  }

  // Agrupar tipos com o mesmo nome em português
  const nameMap = {}   // nome → count acumulado
  const nameKey  = {}  // nome → primeira chave (para referência)

  for (const [key, count] of Object.entries(rawCounts)) {
    const name = PT_NAMES[key] || formatUnknown(key)
    if (nameMap[name] === undefined) {
      nameMap[name] = 0
      nameKey[name] = key
    }
    nameMap[name] += count
  }

  // Montar array final ordenado por contagem
  const merged = Object.entries(nameMap)
    .map(([name, count]) => ({ key: nameKey[name], name, count }))
    .sort((a, b) => b.count - a.count)

  const total = merged.reduce((sum, el) => sum + el.count, 0)

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
