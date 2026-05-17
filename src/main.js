import './styles/main.css'
import * as THREE from 'three'
import { createScene, createCamera, createRenderer, handleResize } from './viewer/scene.js'
import { buildMeshFromItem, applySelection, centerModel, getMaterial } from './viewer/geometry.js'
import { createOrbitControls, setupRaycasting } from './viewer/controls.js'
import { renderDashboard, renderBottomStats, renderViewerOverlay, renderSelectionInfo, resetBottomBar } from './ui/dashboard.js'
import { renderPropertiesPanel } from './ui/properties.js'
import { drawBarChart } from './ui/chart.js'
import { generatePDF } from './ui/pdf.js'

// ── BUILD HTML SKELETON ──────────────────────────────────────────────────────
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
              SCROLL · ZOOM<br>
              SHIFT · SELEC. MÚLTIPLA
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

// ── ESTADO GLOBAL ────────────────────────────────────────────────────────────

let currentWorker = null
let _loadId       = 0           // incrementado a cada novo arquivo
const _pending    = new Map()   // requestId → resolve (para queries ao worker)
let _reqId        = 0

let _meshGroup    = null
let _scene        = null
let _camera       = null
let _renderer     = null

let _meta         = null
let _elementData  = null
let _quantities   = null

let meshMeta      = []
let orbitControls = null
let disposeRaycast= null
let animFrameId   = null
let selectedIDs   = new Set()

// ── WEB WORKER ───────────────────────────────────────────────────────────────

function getWorker() {
  if (!currentWorker) {
    currentWorker = new Worker(
      new URL('./ifc/ifc.worker.js', import.meta.url),
      { type: 'module' }
    )
    currentWorker.onmessage = handleWorkerMessage
    currentWorker.onerror   = (e) => {
      console.error('[worker] erro:', e)
      showScreen('upload')
      alert(`Erro no worker: ${e.message}`)
    }
  }
  return currentWorker
}

/** Envia uma query ao worker e retorna uma Promise que resolve quando a resposta chegar */
function workerQuery(type, params = {}) {
  return new Promise(resolve => {
    const id = ++_reqId
    _pending.set(id, resolve)
    getWorker().postMessage({ type, requestId: id, ...params })
  })
}

function handleWorkerMessage(e) {
  const msg = e.data

  // Ignorar mensagens de carregamentos antigos (loadId mismatch)
  if (msg.loadId !== undefined && msg.loadId !== _loadId) return

  switch (msg.type) {
    case 'progress':
      setLoadingText(msg.message)
      break

    case 'meta':
      _meta = msg.data
      break

    case 'elements':
      _elementData = msg.data
      break

    case 'quantities':
      _quantities = msg.data
      break

    case 'geometry_batch':
      handleGeometryBatch(msg.items)
      break

    case 'done':
      handleLoadingDone()
      break

    case 'error':
      console.error('[worker] load error:', msg.message)
      showScreen('upload')
      alert(`Erro ao carregar o modelo IFC.\n\nDetalhe: ${msg.message}\n\nVerifique o console (F12) para mais informações.`)
      break

    // Respostas a queries (properties / entity)
    case 'properties':
    case 'entity': {
      const resolve = _pending.get(msg.requestId)
      if (resolve) {
        _pending.delete(msg.requestId)
        resolve(msg.data)
      }
      break
    }
  }
}

// Acumula meshes recebidos do worker no grupo 3D
function handleGeometryBatch(items) {
  if (!_meshGroup) return
  for (const item of items) {
    const mesh = buildMeshFromItem(item)
    _meshGroup.add(mesh)
    meshMeta.push({ mesh, expressID: item.expressID, ifcType: item.ifcType })
  }
}

// Chamado quando o worker termina de enviar tudo
function handleLoadingDone() {
  if (!_meta || !_elementData || !_quantities) return

  _meta.totalElements = _elementData.total

  showScreen('app')
  document.getElementById('header-filename').textContent = _meta.filename

  renderDashboard(_meta, _elementData, _quantities)
  renderBottomStats(_elementData, _quantities)
  renderViewerOverlay(_elementData.total, _meta.ifcVersion)

  const container = document.getElementById('viewer-container')

  if (!isWebGLAvailable()) {
    document.getElementById('webgl-fallback').style.display = 'flex'
    drawBarChart(document.getElementById('chart-area'), _elementData)
    return
  }

  // Configurar cena 3D
  _scene = createScene()
  _camera = createCamera(container.clientWidth, container.clientHeight)
  _renderer = createRenderer(container)

  if (_meshGroup) _scene.add(_meshGroup)

  const { maxDim } = centerModel(_meshGroup || new THREE.Group())

  if (orbitControls) orbitControls.dispose()
  orbitControls = createOrbitControls(_camera, _renderer.domElement)
  orbitControls.fitToModel(maxDim)

  if (disposeRaycast) disposeRaycast()
  disposeRaycast = setupRaycasting(_camera, meshMeta, _renderer.domElement, async (hitMesh, shiftKey) => {
    if (!hitMesh) {
      if (!shiftKey) {
        selectedIDs.clear()
        applySelection(selectedIDs, meshMeta)
        renderSelectionInfo([])
        renderDashboard(_meta, _elementData, _quantities)
      }
      return
    }

    const id = hitMesh.userData.expressID
    if (shiftKey) {
      if (selectedIDs.has(id)) selectedIDs.delete(id)
      else selectedIDs.add(id)
    } else {
      selectedIDs.clear()
      selectedIDs.add(id)
    }

    applySelection(selectedIDs, meshMeta)

    if (selectedIDs.size === 1) {
      // Mostrar spinner imediatamente no painel lateral
      const panel = document.getElementById('left-panel')
      if (panel) {
        panel.innerHTML = `
          <div class="prop-loading">
            <div class="spinner-sm"></div>
            <span>Carregando propriedades…</span>
          </div>
        `
      }
      renderSelectionInfo([])  // esconde overlay do viewer

      // Buscar dados no worker (roda na thread do worker, sem bloquear UI)
      const propData = await workerQuery('get_properties', { id })
      renderPropertiesPanel(id, propData)

    } else {
      renderSelectionInfo([...selectedIDs])
      renderDashboard(_meta, _elementData, _quantities)
    }
  })

  if (animFrameId) cancelAnimationFrame(animFrameId)
  const animate = () => {
    animFrameId = requestAnimationFrame(animate)
    _renderer.render(_scene, _camera)
  }
  animate()

  window.addEventListener('resize', () => handleResize(_camera, _renderer, container))

  drawBarChart(document.getElementById('chart-area'), _elementData)
}

// ── UPLOAD / DROP ZONE ───────────────────────────────────────────────────────

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
  if (e.target.id === 'prop-back-btn') {
    selectedIDs.clear()
    applySelection(selectedIDs, meshMeta)
    renderSelectionInfo([])
    renderDashboard(_meta, _elementData, _quantities)
  }
})

// ── SCREENS ──────────────────────────────────────────────────────────────────

function showScreen(name) {
  document.getElementById('upload-screen').style.display  = name === 'upload'  ? 'flex'   : 'none'
  document.getElementById('loading-screen').style.display = name === 'loading' ? 'flex'   : 'none'
  document.getElementById('main-app').style.display       = name === 'app'     ? 'flex'   : 'none'
}

function setLoadingText(t) {
  const el = document.getElementById('loading-text')
  if (el) el.textContent = t
}

// ── MAIN FLOW ────────────────────────────────────────────────────────────────

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.ifc')) {
    alert('Arquivo inválido. Selecione um arquivo .ifc')
    return
  }

  if (file.size > 200 * 1024 * 1024) {
    if (!confirm(`Arquivo grande (${(file.size / 1024 / 1024).toFixed(0)} MB). O carregamento pode ser lento. Continuar?`)) return
  }

  const thisLoadId = ++_loadId
  showScreen('loading')
  setLoadingText('Lendo arquivo IFC…')
  cleanup()

  // Criar novo grupo de meshes para este carregamento
  _meshGroup = new THREE.Group()
  meshMeta   = []
  _meta = _elementData = _quantities = null

  try {
    const buffer = await file.arrayBuffer()
    // Transfere o buffer para o worker (zero-copy, não bloqueia a thread principal)
    getWorker().postMessage(
      { type: 'load', buffer, filename: file.name, loadId: thisLoadId },
      [buffer]
    )
  } catch (err) {
    console.error('Erro ao ler arquivo:', err)
    showScreen('upload')
    alert(`Erro ao ler o arquivo: ${err?.message || err}`)
  }
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
  // Parar animação
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null }

  // Desregistrar controlos
  if (orbitControls) { orbitControls.dispose(); orbitControls = null }
  if (disposeRaycast) { disposeRaycast(); disposeRaycast = null }

  // Liberar memória GPU dos meshes anteriores
  if (_meshGroup) {
    _meshGroup.traverse(obj => {
      if (obj.isMesh && obj.geometry) obj.geometry.dispose()
    })
    _meshGroup = null
  }

  // Descartar renderer anterior
  if (_renderer) {
    _renderer.dispose()
    _renderer = null
  }

  // Remover canvas do DOM
  const vc = document.getElementById('viewer-container')
  if (vc) {
    const oldCanvas = vc.querySelector('canvas')
    if (oldCanvas) vc.removeChild(oldCanvas)
  }

  // Cancelar queries pendentes do worker
  _pending.clear()

  // Fechar modelo no worker
  if (currentWorker) {
    currentWorker.postMessage({ type: 'close' })
  }

  // Resetar estado
  meshMeta = []
  selectedIDs.clear()
  _scene = _camera = null
  resetBottomBar()
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch { return false }
}

showScreen('upload')
