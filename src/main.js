import './styles/main.css'
import { loadIfcFile, closeModel } from './ifc/loader.js'
import { parseMetadata, countElements, detectIfcVersion } from './ifc/parser.js'
import { extractQuantities } from './ifc/quantities.js'
import { createScene, createCamera, createRenderer, handleResize } from './viewer/scene.js'
import { buildGeometry, selectMesh, centerModel } from './viewer/geometry.js'
import { createOrbitControls, setupRaycasting } from './viewer/controls.js'
import { renderDashboard, renderBottomStats, renderViewerOverlay, renderSelectionInfo } from './ui/dashboard.js'
import { drawBarChart } from './ui/chart.js'
import { generatePDF } from './ui/pdf.js'

let currentModelID = null
let currentApi = null
let meshMeta = []
let orbitControls = null
let disposeRaycast = null
let animFrameId = null

// ── BUILD HTML SKELETON ──
document.getElementById('app').innerHTML = `
  <div id="upload-screen">
    <div class="upload-logo">
      <h1>BIM <em>Analyzer</em> <span class="beta-badge">beta</span></h1>
      <p>Análise e Visualização de Modelos IFC</p>
    </div>
    <div class="drop-zone" id="drop-zone">
      <div class="drop-zone-icon">⬡</div>
      <div class="drop-zone-main">Arraste o arquivo .ifc aqui</div>
      <div class="drop-zone-sub">ou clique para selecionar</div>
      <div class="drop-zone-formats">Suporta IFC 2x3 · IFC 4 · IFC 4x3</div>
    </div>
    <input type="file" id="file-input" accept=".ifc" style="display:none">
  </div>

  <div id="loading-screen">
    <div class="spinner"></div>
    <div class="loading-text" id="loading-text">Carregando modelo IFC...</div>
  </div>

  <div id="main-app">
    <header>
      <div class="header-logo">BIM <em>Analyzer</em> <span class="beta-badge">beta</span></div>
      <span class="header-filename" id="header-filename">—</span>
      <div class="header-actions">
        <button class="btn-ghost" id="btn-pdf-header">↓ PDF</button>
        <button class="btn-primary" id="btn-change">↑ Trocar IFC</button>
      </div>
    </header>

    <div class="workspace">
      <aside class="left-panel" id="left-panel"></aside>

      <div class="right-panel">
        <div id="viewer-container">
          <div class="viewer-overlay-tl"></div>
          <div id="selection-panel"></div>
          <div class="viewer-overlay-br">
            <div class="viewer-controls-hint">
              DRAG · ORBITAR<br>
              RIGHT · MOVER<br>
              SCROLL · ZOOM
            </div>
          </div>
          <div id="webgl-fallback" style="display:none;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:var(--bg)">
            <p class="webgl-msg">WebGL não disponível.<br>O visualizador 3D não pode ser exibido.<br>Os dados do projeto estão no painel à esquerda.</p>
          </div>
        </div>

        <div id="bottom-bar">
          <div id="bottom-stats" style="display:flex;align-items:center;gap:0;flex-shrink:0"></div>
          <div class="chart-area" id="chart-area"></div>
        </div>
      </div>
    </div>
  </div>
`

// ── UPLOAD / DROP ZONE ──
const dropZone  = document.getElementById('drop-zone')
const fileInput = document.getElementById('file-input')

dropZone.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0])
})

dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (file) handleFile(file)
})

document.getElementById('btn-change').addEventListener('click', resetToUpload)
document.getElementById('btn-pdf-header').addEventListener('click', exportPDF)
document.addEventListener('click', e => {
  if (e.target.id === 'btn-pdf-panel') exportPDF()
})

// ── SCREENS ──
function showScreen(name) {
  document.getElementById('upload-screen').style.display  = name === 'upload'  ? 'flex'   : 'none'
  document.getElementById('loading-screen').style.display = name === 'loading' ? 'flex'   : 'none'
  document.getElementById('main-app').style.display       = name === 'app'     ? 'flex'   : 'none'
}

function setLoadingText(t) {
  document.getElementById('loading-text').textContent = t
}

// ── MAIN FLOW ──
let _meta, _elementData, _quantities

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.ifc')) {
    alert('Arquivo inválido. Selecione um arquivo .ifc')
    return
  }

  if (file.size > 200 * 1024 * 1024) {
    if (!confirm(`Arquivo grande (${(file.size / 1024 / 1024).toFixed(0)} MB). O carregamento pode ser lento. Continuar?`)) return
  }

  showScreen('loading')
  cleanup()

  try {
    setLoadingText('Lendo arquivo IFC...')
    const buffer = await file.arrayBuffer()

    // detect version from raw text header
    const header = new TextDecoder().decode(buffer.slice(0, 512))
    const ifcVersion = detectIfcVersion(header) || 'IFC4'

    setLoadingText('Inicializando parser WebAssembly...')
    const { api, modelID } = await loadIfcFile(buffer)
    currentApi = api
    currentModelID = modelID

    setLoadingText('Extraindo metadados...')
    const meta = parseMetadata(api, modelID, file.name)
    meta.ifcVersion = ifcVersion

    setLoadingText('Contando elementos...')
    const elementData = countElements(api, modelID)
    meta.totalElements = elementData.total

    setLoadingText('Extraindo quantitativos...')
    const quantities = await extractQuantities(api, modelID)

    setLoadingText('Processando geometria 3D...')
    await buildAndShowApp(api, modelID, meta, elementData, quantities)

    _meta = meta
    _elementData = elementData
    _quantities = quantities

  } catch (err) {
    console.error('IFC load error:', err)
    showScreen('upload')
    alert(`Erro ao carregar o modelo IFC.\n\nDetalhe: ${err?.message || err}\n\nVerifique o console (F12) para mais informações.`)
  }
}

async function buildAndShowApp(api, modelID, meta, elementData, quantities) {
  showScreen('app')

  document.getElementById('header-filename').textContent = meta.filename

  renderDashboard(meta, elementData, quantities)
  renderBottomStats(elementData, quantities)
  renderViewerOverlay(elementData.total, meta.ifcVersion)

  // 3D viewer
  const container = document.getElementById('viewer-container')

  if (!isWebGLAvailable()) {
    document.getElementById('webgl-fallback').style.display = 'flex'
    drawBarChart(document.getElementById('chart-area'), elementData)
    return
  }

  const scene    = createScene()
  const camera   = createCamera(container.clientWidth, container.clientHeight)
  const renderer = createRenderer(container)

  try {
    const { meshGroup, meshMeta: mm } = await buildGeometry(api, modelID)
    meshMeta = mm
    const { maxDim } = centerModel(meshGroup)
    scene.add(meshGroup)

    if (orbitControls) orbitControls.dispose()
    orbitControls = createOrbitControls(camera, renderer.domElement)
    orbitControls.fitToModel(maxDim)

    if (disposeRaycast) disposeRaycast()
    disposeRaycast = setupRaycasting(camera, meshMeta, renderer.domElement, (hitMesh) => {
      selectMesh(hitMesh, meshMeta)
      if (hitMesh) {
        renderSelectionInfo(api, modelID, hitMesh.userData.expressID, hitMesh.userData.ifcType)
      } else {
        renderSelectionInfo(api, modelID, null, null)
      }
    })

    if (animFrameId) cancelAnimationFrame(animFrameId)
    function animate() {
      animFrameId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    window.addEventListener('resize', () => handleResize(camera, renderer, container))

  } catch (geoErr) {
    console.warn('Geometry error:', geoErr)
    document.getElementById('webgl-fallback').style.display = 'flex'
  }

  drawBarChart(document.getElementById('chart-area'), elementData)
}

function resetToUpload() {
  cleanup()
  showScreen('upload')
  fileInput.value = ''
}

function exportPDF() {
  if (!_meta) return
  try {
    generatePDF(_meta, _elementData, _quantities)
  } catch (err) {
    console.error('PDF error:', err)
    alert(`Erro ao gerar PDF: ${err?.message || err}`)
  }
}

function cleanup() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }
  if (orbitControls) { orbitControls.dispose(); orbitControls = null }
  if (disposeRaycast) { disposeRaycast(); disposeRaycast = null }
  if (currentModelID !== null) {
    try { closeModel(currentModelID) } catch {}
    currentModelID = null
  }
  meshMeta = []

  const vc = document.getElementById('viewer-container')
  if (vc) {
    const oldCanvas = vc.querySelector('canvas')
    if (oldCanvas) vc.removeChild(oldCanvas)
  }
}

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch { return false }
}

showScreen('upload')
