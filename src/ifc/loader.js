import { IfcAPI } from 'web-ifc'

let api = null

export async function initIfcAPI() {
  if (api) return api
  api = new IfcAPI()

  // Force single-threaded WASM by intercepting the locate file handler.
  // This prevents web-ifc from spawning MT workers which fail in some environments.
  await api.Init((path) => {
    if (path.endsWith('.wasm')) return '/web-ifc.wasm'
    return '/' + path
  })

  return api
}

export function getIfcAPI() {
  return api
}

export async function loadIfcFile(arrayBuffer) {
  const ifcApi = await initIfcAPI()
  const data = new Uint8Array(arrayBuffer)
  const modelID = ifcApi.OpenModel(data)
  return { api: ifcApi, modelID }
}

export function closeModel(modelID) {
  if (api) api.CloseModel(modelID)
}
