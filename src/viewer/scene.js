import * as THREE from 'three'

export function createScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xD8D4CE)   // cinza-médio (melhor contraste)
  scene.fog = new THREE.FogExp2(0xD8D4CE, 0.004)

  // Luz ambiente — reduzida para as cores aparecerem com mais contraste
  const ambient = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(ambient)

  // Sol principal — levemente aquecido
  const sun = new THREE.DirectionalLight(0xFFF8F0, 1.2)
  sun.position.set(60, 100, 50)
  sun.castShadow = true
  sun.shadow.mapSize.width  = 2048
  sun.shadow.mapSize.height = 2048
  sun.shadow.camera.near   = 0.5
  sun.shadow.camera.far    = 800
  sun.shadow.camera.left   = -200
  sun.shadow.camera.right  =  200
  sun.shadow.camera.top    =  200
  sun.shadow.camera.bottom = -200
  scene.add(sun)

  // Luz de preenchimento fria (lado oposto) — dá profundidade
  const fill = new THREE.DirectionalLight(0xD0E8FF, 0.4)
  fill.position.set(-40, -20, -60)
  scene.add(fill)

  // Luz de chão (rimlight suave) — evita sombras totalmente negras
  const ground = new THREE.HemisphereLight(0xffffff, 0x888870, 0.25)
  scene.add(ground)

  return scene
}

export function createCamera(width, height) {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 8000)
  camera.position.set(30, 25, 40)
  camera.lookAt(0, 0, 0)
  return camera
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)
  return renderer
}

export function handleResize(camera, renderer, container) {
  const w = container.clientWidth
  const h = container.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}
