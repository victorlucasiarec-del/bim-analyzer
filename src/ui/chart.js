export function drawBarChart(container, elementData) {
  if (!container || !elementData?.merged?.length) return

  const { merged, total } = elementData
  const items = merged.slice(0, 6)
  const maxCount = items[0]?.count || 1

  const rows = items.map(el => {
    const fillPct = Math.round((el.count / maxCount) * 100)
    const totalPct = Math.round((el.count / total) * 100)
    return `
      <div class="bar-row">
        <span class="bar-label">${el.name.toUpperCase()}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${fillPct}%"></div></div>
        <span class="bar-val">${totalPct}%</span>
      </div>
    `
  }).join('')

  container.innerHTML = `<div class="bar-chart-css">${rows}</div>`
}
