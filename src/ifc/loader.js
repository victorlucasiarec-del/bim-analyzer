import { IfcAPI } from 'web-ifc'

let api = null

export async function initIfcAPI() {
  if (api) return api
  api = new IfcAPI()
  api.SetWasmPath('/')
  await api.Init()
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
