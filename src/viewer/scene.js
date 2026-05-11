import * as THREE from 'three'

export function createScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xECEAE5)
  scene.fog = new THREE.FogExp2(0xECEAE5, 0.006)

  const ambient = new THREE.AmbientLight(0xffffff, 0.7)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffffff, 1.0)
  sun.position.set(50, 80, 50)
  sun.castShadow = true
  sun.shadow.mapSize.width = 2048
  sun.shadow.mapSize.height = 2048
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 500
  sun.shadow.camera.left = -100
  sun.shadow.camera.right = 100
  sun.shadow.camera.top = 100
  sun.shadow.camera.bottom = -100
  scene.add(sun)

  const fill = new THREE.DirectionalLight(0xE8E5DF, 0.3)
  fill.position.set(-20, -30, -20)
  scene.add(fill)

  const grid = new THREE.GridHelper(200, 50, 0xDDDAD4, 0xECEAE5)
  scene.add(grid)

  return scene
}

export function createCamera(width, height) {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000)
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
