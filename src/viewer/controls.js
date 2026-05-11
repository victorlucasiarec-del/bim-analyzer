import * as THREE from 'three'

export function createOrbitControls(camera, domElement) {
  const state = {
    theta: Math.atan2(camera.position.x, camera.position.z),
    phi: Math.acos(camera.position.y / camera.position.length()),
    radius: camera.position.length(),
    panX: 0,
    panY: 0,
    target: new THREE.Vector3(),
    isDragging: false,
    isPanning: false,
    lastX: 0,
    lastY: 0,
    lastTouchDist: 0,
  }

  function updateCamera() {
    const x = state.radius * Math.sin(state.phi) * Math.sin(state.theta)
    const y = state.radius * Math.cos(state.phi)
    const z = state.radius * Math.sin(state.phi) * Math.cos(state.theta)
    camera.position.set(
      x + state.target.x,
      y + state.target.y,
      z + state.target.z
    )
    camera.lookAt(state.target)
  }

  function onMouseDown(e) {
    if (e.button === 0) { state.isDragging = true; state.isPanning = false }
    if (e.button === 2) { state.isPanning = true; state.isDragging = false }
    state.lastX = e.clientX
    state.lastY = e.clientY
  }

  function onMouseMove(e) {
    if (!state.isDragging && !state.isPanning) return
    const dx = e.clientX - state.lastX
    const dy = e.clientY - state.lastY
    state.lastX = e.clientX
    state.lastY = e.clientY

    if (state.isDragging) {
      state.theta -= dx * 0.005
      state.phi = Math.max(0.05, Math.min(Math.PI - 0.05, state.phi + dy * 0.005))
    }

    if (state.isPanning) {
      const right = new THREE.Vector3()
      const up = new THREE.Vector3()
      camera.getWorldDirection(new THREE.Vector3())
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize()
      up.copy(camera.up)
      const panSpeed = state.radius * 0.001
      state.target.addScaledVector(right, -dx * panSpeed)
      state.target.addScaledVector(up, dy * panSpeed)
    }

    updateCamera()
  }

  function onMouseUp() {
    state.isDragging = false
    state.isPanning = false
  }

  function onWheel(e) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 1.1 : 0.9
    state.radius = Math.max(1, Math.min(2000, state.radius * delta))
    updateCamera()
  }

  function onContextMenu(e) { e.preventDefault() }

  function onTouchStart(e) {
    if (e.touches.length === 1) {
      state.isDragging = true
      state.lastX = e.touches[0].clientX
      state.lastY = e.touches[0].clientY
    }
    if (e.touches.length === 2) {
      state.isDragging = false
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      state.lastTouchDist = Math.sqrt(dx*dx + dy*dy)
    }
  }

  function onTouchMove(e) {
    e.preventDefault()
    if (e.touches.length === 1 && state.isDragging) {
      const dx = e.touches[0].clientX - state.lastX
      const dy = e.touches[0].clientY - state.lastY
      state.lastX = e.touches[0].clientX
      state.lastY = e.touches[0].clientY
      state.theta -= dx * 0.005
      state.phi = Math.max(0.05, Math.min(Math.PI - 0.05, state.phi + dy * 0.005))
      updateCamera()
    }
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx*dx + dy*dy)
      const delta = state.lastTouchDist / dist
      state.radius = Math.max(1, Math.min(2000, state.radius * delta))
      state.lastTouchDist = dist
      updateCamera()
    }
  }

  function onTouchEnd() { state.isDragging = false }

  domElement.addEventListener('mousedown',    onMouseDown)
  domElement.addEventListener('mousemove',    onMouseMove)
  domElement.addEventListener('mouseup',      onMouseUp)
  domElement.addEventListener('mouseleave',   onMouseUp)
  domElement.addEventListener('wheel',        onWheel, { passive: false })
  domElement.addEventListener('contextmenu',  onContextMenu)
  domElement.addEventListener('touchstart',   onTouchStart, { passive: false })
  domElement.addEventListener('touchmove',    onTouchMove,  { passive: false })
  domElement.addEventListener('touchend',     onTouchEnd)

  updateCamera()

  return {
    state,
    updateCamera,
    setRadius(r) { state.radius = r; updateCamera() },
    fitToModel(maxDim) {
      state.radius = maxDim * 1.8
      state.phi = 1.1
      state.theta = Math.PI / 4
      updateCamera()
    },
    dispose() {
      domElement.removeEventListener('mousedown',   onMouseDown)
      domElement.removeEventListener('mousemove',   onMouseMove)
      domElement.removeEventListener('mouseup',     onMouseUp)
      domElement.removeEventListener('mouseleave',  onMouseUp)
      domElement.removeEventListener('wheel',       onWheel)
      domElement.removeEventListener('contextmenu', onContextMenu)
      domElement.removeEventListener('touchstart',  onTouchStart)
      domElement.removeEventListener('touchmove',   onTouchMove)
      domElement.removeEventListener('touchend',    onTouchEnd)
    }
  }
}

export function setupRaycasting(camera, meshMeta, domElement, onSelect) {
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  let mouseDownPos = null

  function onMouseDown(e) {
    mouseDownPos = { x: e.clientX, y: e.clientY }
  }

  function onMouseUp(e) {
    if (!mouseDownPos) return
    const dx = Math.abs(e.clientX - mouseDownPos.x)
    const dy = Math.abs(e.clientY - mouseDownPos.y)
    mouseDownPos = null
    if (dx > 4 || dy > 4) return // dragged, not clicked

    const rect = domElement.getBoundingClientRect()
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)
    const meshes = meshMeta.map(m => m.mesh)
    const intersects = raycaster.intersectObjects(meshes, false)

    if (intersects.length > 0) {
      const hit = intersects[0].object
      onSelect(hit)
    } else {
      onSelect(null)
    }
  }

  domElement.addEventListener('mousedown', onMouseDown)
  domElement.addEventListener('mouseup',   onMouseUp)

  return () => {
    domElement.removeEventListener('mousedown', onMouseDown)
    domElement.removeEventListener('mouseup',   onMouseUp)
  }
}
