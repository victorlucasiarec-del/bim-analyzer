const DOT_GRAYS = ['#0D0D0D','#4A4A4A','#6E6E6E','#9A9A9A','#B8B8B8','#D0D0D0','#E2E2E2','#CCCCCC','#BBBBBB','#AAAAAA']

function fmtBR(num, decimals = 2) {
  return Number(num).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function renderDashboard(meta, elementData, quantities) {
  const panel = document.getElementById('left-panel')
  if (!panel) return

  panel.innerHTML = `
    ${buildProjectSection(meta)}
    ${buildElementsSection(elementData)}
    ${buildQuantitiesSection(quantities)}
    <div>
      <button class="btn-pdf-panel" id="btn-pdf-panel">↓ Exportar Relatório PDF</button>
    </div>
  `
}

function buildProjectSection(meta) {
  const rows = [
    ['Arquivo',     meta.filename],
    ['Versão IFC',  meta.ifcVersion],
    ['Projeto',     meta.projectName],
    ['Edifício',    meta.buildingName],
    ['Autor',       meta.author],
    ['Organização', meta.organization],
    ['Aplicação',   meta.application],
    ['Data',        meta.date],
    ['Total',       `${meta.totalElements} elementos`],
  ]

  const rowsHtml = rows.map(([k, v]) => `
    <div class="info-row">
      <span class="info-key">${k}</span>
      <span class="info-val" title="${v}">${v}</span>
    </div>
  `).join('')

  return `
    <div>
      <div class="section-label">Projeto</div>
      ${rowsHtml}
    </div>
  `
}

function buildElementsSection(elementData) {
  const { merged, total } = elementData
  if (!merged.length) return ''

  const maxCount = merged[0]?.count || 1

  const rows = merged.map((el, i) => {
    const pct = Math.round((el.count / maxCount) * 100)
    const color = DOT_GRAYS[i % DOT_GRAYS.length]
    return `
      <div class="element-row">
        <span class="element-dot" style="background:${color}"></span>
        <span class="element-name">${el.name}</span>
        <div class="element-bar-wrap">
          <div class="element-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="element-count">${el.count}</span>
      </div>
    `
  }).join('')

  return `
    <div>
      <div class="section-label">Elementos</div>
      ${rows}
    </div>
  `
}

function buildQuantitiesSection(quantities) {
  if (!quantities.hasData) {
    return `
      <div>
        <div class="section-label">Quantitativos</div>
        <p class="quant-warning">
          Modelo não contém IfcQuantitySet.<br><br>
          Para ver quantitativos, exporte o IFC com<br>
          "Include Quantities" ativado no seu software<br>
          BIM (Revit: Export > IFC Options > Export<br>
          base quantities).
        </p>
      </div>
    `
  }

  const rows = []
  if (quantities.columnVolume > 0) rows.push(['Volume Pilares', `${fmtBR(quantities.columnVolume)} m³`])
  if (quantities.beamVolume   > 0) rows.push(['Volume Vigas',   `${fmtBR(quantities.beamVolume)} m³`])
  if (quantities.slabArea     > 0) rows.push(['Área Lajes',     `${fmtBR(quantities.slabArea)} m²`])
  if (quantities.wallArea     > 0) rows.push(['Área Paredes',   `${fmtBR(quantities.wallArea)} m²`])
  if (quantities.beamLength   > 0) rows.push(['Compr. Vigas',   `${fmtBR(quantities.beamLength)} m`])

  const rowsHtml = rows.map(([label, val]) => `
    <div class="quant-row">
      <span class="quant-label">${label}</span>
      <span class="quant-val">${val}</span>
    </div>
  `).join('')

  return `
    <div>
      <div class="section-label">Quantitativos</div>
      ${rowsHtml}
    </div>
  `
}

export function renderBottomStats(elementData, quantities) {
  const total = elementData.total
  const types = elementData.merged.length
  const area  = quantities.hasData && quantities.slabArea > 0
    ? quantities.slabArea.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '—'

  const statsEl = document.getElementById('bottom-stats')
  if (statsEl) {
    const areaStyle = area.length > 5 ? 'font-size:1.6rem' : ''
    statsEl.innerHTML = `
      <div class="stats-block">
        <div class="stats-num">${total.toLocaleString('pt-BR')}</div>
        <div class="stats-label">Total Elementos</div>
      </div>
      <div class="stats-sep"></div>
      <div class="stats-block">
        <div class="stats-num">${types}</div>
        <div class="stats-label">Tipos</div>
      </div>
      <div class="stats-sep"></div>
      <div class="stats-block">
        <div class="stats-num" style="${areaStyle}">${area}</div>
        <div class="stats-label">Área Total m²</div>
      </div>
      <div class="stats-sep"></div>
    `
  }
}

export function renderViewerOverlay(total, ifcVersion) {
  const tl = document.querySelector('.viewer-overlay-tl')
  if (tl) {
    tl.innerHTML = `
      <span class="viewer-badge">${total} ELEMENTOS</span>
      <span class="viewer-badge">WebGL · ${ifcVersion}</span>
    `
  }
}

export function renderSelectionInfo(api, modelID, expressID, ifcType) {
  const panel = document.getElementById('selection-panel')
  if (!panel) return

  if (!expressID) {
    panel.style.display = 'none'
    return
  }

  let typeName = ifcType ? String(ifcType) : 'Desconhecido'
  let globalId = '—'
  let storey = '—'

  try {
    const entity = api.GetLine(modelID, expressID, true)
    if (entity) {
      globalId = entity.GlobalId?.value || '—'
      typeName = entity.constructor?.name || typeName
    }
  } catch {}

  // extract IFC type name from numeric constant
  const typeNames = {
    626085974: 'IfcColumn', 2906023776: 'IfcBeam', 3171933400: 'IfcSlab',
    2391406946: 'IfcWall', 3304561284: 'IfcWallStandardCase',
    3071080877: 'IfcWindow', 395920057: 'IfcDoor',
    1509553395: 'IfcFurnishingElement', 331165859: 'IfcStair',
    2547093498: 'IfcRoof', 900683007: 'IfcFooting', 1938806468: 'IfcPile',
  }
  const displayType = typeNames[ifcType] || `IFC #${ifcType}`

  panel.style.display = 'block'
  panel.innerHTML = `
    <div class="sel-title">Elemento Selecionado</div>
    <div class="sel-row">
      <span class="sel-key">Tipo</span>
      <span class="sel-val">${displayType}</span>
    </div>
    <div class="sel-row">
      <span class="sel-key">GlobalId</span>
      <span class="sel-val" title="${globalId}">${globalId.substring(0, 18)}…</span>
    </div>
    <div class="sel-row">
      <span class="sel-key">Express ID</span>
      <span class="sel-val">#${expressID}</span>
    </div>
  `
}
