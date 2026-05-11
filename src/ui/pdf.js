import { jsPDF } from 'jspdf'

function fmtBR(num, decimals = 2) {
  return Number(num).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function today() {
  return new Date().toLocaleDateString('pt-BR')
}

export function generatePDF(meta, elementData, quantities) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W        = 210
  const marginL  = 20
  const marginR  = 20
  const contentW = W - marginL - marginR
  let y = 24

  const ink   = [13,  13,  13 ]
  const muted = [154, 154, 154]
  const green = [26,  122, 74 ]
  const rule  = [220, 217, 212]

  // Draw a thin rule at current y then advance
  function hRule(color = rule, w = 0.25) {
    doc.setDrawColor(...color)
    doc.setLineWidth(w)
    doc.line(marginL, y, W - marginR, y)
  }

  // Section heading: label + underline, returns after gap
  function sectionLabel(text) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...muted)
    doc.text(text.toUpperCase(), marginL, y)
    y += 2.5
    hRule()
    y += 5
  }

  // One key/value row, line drawn AFTER advancing y
  function infoRow(key, val) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...muted)
    doc.text(key, marginL, y)
    doc.setTextColor(...ink)
    doc.text(String(val), W - marginR, y, { align: 'right' })
    y += 2           // gap below baseline before rule
    hRule()
    y += 5           // gap above next baseline  → total row height ≈ 7mm
  }

  // Table row: text then rule below
  function tableRow(cols, widths, isHeader = false, isTotal = false) {
    doc.setFont('helvetica', isHeader ? 'bold' : 'normal')
    doc.setFontSize(isHeader ? 7.5 : 8.5)
    doc.setTextColor(...(isHeader ? muted : isTotal ? green : ink))

    let x = marginL
    cols.forEach((col, i) => {
      const align = i === 0 ? 'left' : 'right'
      doc.text(String(col), align === 'left' ? x : x + widths[i], y, { align })
      x += widths[i]
    })

    if (isHeader) {
      y += 3
      hRule(muted, 0.2)
      y += 4
    } else {
      y += 2
      hRule()
      y += 4
    }
  }

  // ── PAGE HEADER ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...ink)
  doc.text('BIM Analyzer', marginL, y)
  y += 2

  // thin accent line under title
  doc.setDrawColor(...ink)
  doc.setLineWidth(0.5)
  doc.line(marginL, y, marginL + 42, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...muted)
  doc.text('Relatório de Análise de Modelo IFC', marginL, y)
  y += 5

  doc.setFontSize(7.5)
  doc.text(`Gerado em ${today()}   ·   ${meta.filename}`, marginL, y)
  y += 4
  hRule(rule, 0.4)
  y += 2

  // ── SECTION 1 ──
  sectionLabel('1. Informações do Projeto')
  const projectRows = [
    ['Arquivo',     meta.filename    ],
    ['Versão IFC',  meta.ifcVersion  ],
    ['Projeto',     meta.projectName ],
    ['Edifício',    meta.buildingName],
    ['Autor',       meta.author      ],
    ['Organização', meta.organization],
    ['Aplicação',   meta.application ],
    ['Data',        meta.date        ],
  ]
  projectRows.forEach(([k, v]) => infoRow(k, v))

  // ── SECTION 2 ──
  if (y > 230) { doc.addPage(); y = 24 }
  sectionLabel('2. Elementos por Tipo')

  const colW = [contentW * 0.50, contentW * 0.25, contentW * 0.25]
  tableRow(['Tipo', 'Quantidade', '% do Total'], colW, true)

  const { merged, total } = elementData
  merged.forEach(el => {
    const pct = total > 0 ? ((el.count / total) * 100).toFixed(1) + '%' : '0%'
    tableRow([el.name, el.count.toLocaleString('pt-BR'), pct], colW)
  })
  tableRow(['Total', total.toLocaleString('pt-BR'), '100%'], colW, false, true)

  // ── SECTION 3 ──
  if (y > 230) { doc.addPage(); y = 24 }
  if (quantities.hasData) {
    sectionLabel('3. Quantitativos Gerais')
    const qColW = [contentW * 0.55, contentW * 0.25, contentW * 0.20]
    tableRow(['Descrição', 'Valor', 'Unidade'], qColW, true)

    const qRows = []
    if (quantities.columnVolume > 0) qRows.push(['Volume Pilares', fmtBR(quantities.columnVolume), 'm³'])
    if (quantities.beamVolume   > 0) qRows.push(['Volume Vigas',   fmtBR(quantities.beamVolume),   'm³'])
    if (quantities.slabArea     > 0) qRows.push(['Área Lajes',     fmtBR(quantities.slabArea),     'm²'])
    if (quantities.wallArea     > 0) qRows.push(['Área Paredes',   fmtBR(quantities.wallArea),     'm²'])
    if (quantities.beamLength   > 0) qRows.push(['Compr. Vigas',   fmtBR(quantities.beamLength),   'm'])
    qRows.forEach(r => tableRow(r, qColW))
  } else {
    sectionLabel('3. Quantitativos')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...muted)
    const warn = 'Modelo não contém IfcQuantitySet. Para ver quantitativos, exporte o IFC com "Include Quantities" ativado no seu software BIM (Revit: Export > IFC Options > Export base quantities).'
    const warnLines = doc.splitTextToSize(warn, contentW)
    doc.text(warnLines, marginL, y)
    y += warnLines.length * 5.5
  }

  // ── FOOTER (all pages) ──
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const pageH = 297
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...muted)
    doc.setDrawColor(...rule)
    doc.setLineWidth(0.3)
    doc.line(marginL, pageH - 16, W - marginR, pageH - 16)
    doc.text(`Gerado em ${today()} · BIM Analyzer · Beta`, marginL, pageH - 11)
    doc.text(`${i} / ${totalPages}`, W - marginR, pageH - 11, { align: 'right' })
  }

  const slug = meta.projectName !== '—'
    ? meta.projectName.replace(/\s+/g, '-').toLowerCase()
    : 'modelo'
  const dateSlug = today().replace(/\//g, '')
  doc.save(`relatorio-bim-${slug}-${dateSlug}.pdf`)
}
