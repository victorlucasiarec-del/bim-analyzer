// properties.js — apenas renderização
// Os dados IFC são buscados pelo Web Worker (ifc.worker.js) e passados prontos.

// ── Construtores de HTML ─────────────────────────────────────────────────────

function propRow(key, value, green = false) {
  if (!value || value === '—') return ''
  const safeVal = String(value)
  const display = safeVal.length > 24 ? safeVal.substring(0, 22) + '…' : safeVal
  return `
    <div class="info-row">
      <span class="info-key prop-key" title="${key}">${key}</span>
      <span class="info-val${green ? ' prop-val-green' : ''}" title="${safeVal}">${display}</span>
    </div>
  `
}

function psetBlock(ps) {
  const rows = ps.props.map(p => propRow(p.name, String(p.value))).join('')
  return rows ? `
    <div class="prop-group">
      <div class="prop-group-label">${ps.name}</div>
      ${rows}
    </div>
  ` : ''
}

function qsetBlock(qs) {
  const rows = qs.quantities.map(q => propRow(q.name, q.value, true)).join('')
  return rows ? `
    <div class="prop-group">
      <div class="prop-group-label">${qs.name}</div>
      ${rows}
    </div>
  ` : ''
}

// ── Renderização principal ────────────────────────────────────────────────────
// data = { identity:{name,typeName,globalId,description,tag}, psets:[...], qsets:[...] }

export function renderPropertiesPanel(expressID, data) {
  const panel = document.getElementById('left-panel')
  if (!panel) return

  const { identity, psets, qsets } = data
  const typeName = identity.typeName || 'Elemento'

  const idHtml = [
    ['Nome',       identity.name],
    ['GlobalId',   identity.globalId],
    ['Descrição',  identity.description],
    ['Tag',        identity.tag],
    ['Express ID', `#${expressID}`],
  ].map(([k, v]) => propRow(k, v)).join('')

  const psetsHtml = psets.map(psetBlock).join('')
  const qsetsHtml = qsets.map(qsetBlock).join('')
  const noPsets   = !psets.length && !qsets.length

  panel.innerHTML = `
    <button class="prop-back-btn" id="prop-back-btn">← Projeto</button>

    <div>
      <div class="section-label">${typeName}</div>
      ${idHtml || propRow('Express ID', '#' + expressID)}
    </div>

    ${psetsHtml ? `
      <div>
        <div class="section-label">Propriedades</div>
        ${psetsHtml}
      </div>` : ''}

    ${qsetsHtml ? `
      <div>
        <div class="section-label">Quantitativos</div>
        ${qsetsHtml}
      </div>` : ''}

    ${noPsets ? `
      <div class="prop-empty">
        Nenhum Property Set encontrado.<br>
        Exporte o IFC com Psets ativados no seu<br>
        software BIM (Revit → Export IFC Options<br>
        → Export base quantities).
      </div>` : ''}
  `
}
