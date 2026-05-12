# BIM Analyzer — Instruções de Desenvolvimento

> Documento gerado a partir do histórico de desenvolvimento com Claude (Anthropic).
> Serve como referência para continuar o projeto em novas sessões.

---

## Visão Geral

Ferramenta web para análise e visualização de modelos BIM no formato IFC.
Construída com Vite + Vanilla JS + web-ifc + Three.js + jsPDF.

**URL de produção:** https://bim-analyzer.netlify.app
**Repositório:** https://github.com/victorlucasiarec-del/bim-analyzer
**Arquivos locais:** `C:\Users\victo\Downloads\BIM\bim-analyzer\`

---

## Estrutura de Arquivos

```
bim-analyzer/
├── index.html
├── vite.config.js
├── package.json
├── netlify.toml
├── public/
│   ├── web-ifc.wasm          ← WASM copiado do node_modules
│   ├── web-ifc-mt.wasm
│   └── web-ifc-mt.worker.js
└── src/
    ├── main.js               ← Orquestração principal, HTML skeleton, eventos
    ├── ifc/
    │   ├── loader.js         ← Inicializa IfcAPI, abre modelo
    │   ├── parser.js         ← Extrai metadados, conta elementos
    │   └── quantities.js     ← Lê IfcElementQuantity (m³, m²)
    ├── viewer/
    │   ├── scene.js          ← Three.js: câmera, luzes, fog, grid
    │   ├── geometry.js       ← StreamAllMeshes → BufferGeometry
    │   └── controls.js       ← Orbit/pan/zoom manual + raycasting
    ├── ui/
    │   ├── dashboard.js      ← Painel esquerdo, overlay, seleção
    │   ├── chart.js          ← Gráfico de barras CSS puro
    │   └── pdf.js            ← Relatório PDF com jsPDF
    └── styles/
        └── main.css          ← Design system completo
```

---

## Stack e Versões

| Pacote | Versão | Função |
|---|---|---|
| `vite` | ^8.x | Bundler e dev server |
| `web-ifc` | 0.0.57 | Parser IFC via WebAssembly |
| `three` | ^0.160.0 | Renderização 3D |
| `jspdf` | ^2.5.1 | Exportação PDF |

---

## Decisões Técnicas Importantes

### 1. WASM em modo Single-Thread
**Problema:** O `web-ifc` detecta `SharedArrayBuffer` (ativado pelos headers COOP/COEP) e tenta usar WASM multi-thread, causando falha com `createObjectURL` nos workers.

**Solução:** Remover o header `Cross-Origin-Embedder-Policy: require-corp` do servidor. Sem COEP, `SharedArrayBuffer` fica indisponível e o web-ifc usa automaticamente o modo single-thread.

**Onde está configurado:**
- `vite.config.js` → só tem `COOP`, sem `COEP`
- `netlify.toml` → sem headers COOP/COEP, apenas `Content-Type` para `.wasm`

### 2. WASM servido localmente
Os arquivos `.wasm` e `.worker.js` foram copiados de `node_modules/web-ifc/` para `public/` e o path foi configurado como `api.SetWasmPath('/')` no `loader.js`.

**Por quê:** Evita dependência do CDN e garante compatibilidade com as políticas CORS do servidor.

### 3. Gráfico de barras em CSS puro
O gráfico inferior usa `div` com CSS em vez de `<canvas>`. Mais simples, responsivo por natureza, sem artefatos de DPI.

### 4. Merge de IFCWALL + IFCWALLSTANDARDCASE
Ambos os tipos são somados e exibidos como "Parede" no painel. Ver `parser.js → countElements()`.

---

## Design System

```css
--bg:      #F5F3EF   /* fundo creme */
--surface: #FFFFFF   /* painéis */
--ink:     #0D0D0D   /* texto principal */
--ink2:    #3A3A3A   /* texto secundário */
--muted:   #9A9A9A   /* labels */
--rule:    #E0DDD8   /* divisórias */
--green:   #1A7A4A   /* quantitativos */

Fontes:
- Playfair Display → logo, números grandes
- Geist Mono       → labels técnicos, valores
- Geist            → textos corridos
```

---

## Erros Conhecidos e Soluções

| Erro | Causa | Solução |
|---|---|---|
| `createObjectURL failed` | COEP ativo → web-ifc tenta MT mode | Remover COEP dos headers |
| `instanceof is not an object` | SharedArrayBuffer oculto depois que módulo carregou | Não ocultar SAB — remover COEP antes |
| `WebAssembly.instantiate Import #0 "a"` | WASM ST sendo carregado com módulo JS MT | Não redirecionar arquivos WASM |
| PDF com linhas sobrepostas | `setDrawColor` chamado antes do avanço do `y` | Linha desenhada após `y += offset` |
| `setTextColor` sem efeito | Array passado sem spread `...` | Usar `doc.setTextColor(...array)` |

---

## Como Rodar Localmente

```bash
cd C:\Users\victo\Downloads\BIM\bim-analyzer
npm install
npm run dev
# acessa http://localhost:5173
```

## Como Fazer Deploy

```bash
npm run build       # gera pasta dist/
git add .
git commit -m "descrição"
git push            # Netlify detecta e faz deploy automático
```

---

## Funcionalidades Implementadas

- [x] Upload por clique ou drag-and-drop
- [x] Tela de loading com status em tempo real
- [x] Extração de metadados IFC (projeto, autor, software, data)
- [x] Detecção de versão IFC do header do arquivo
- [x] Contagem de elementos por tipo (12 tipos suportados)
- [x] Merge de IFCWALL + IFCWALLSTANDARDCASE
- [x] Quantitativos reais (m³ volume, m² área) via IfcElementQuantity
- [x] Aviso quando modelo não tem IfcQuantitySet
- [x] Visualização 3D com geometria real (StreamAllMeshes)
- [x] Cores por tipo de elemento (escala de cinzas)
- [x] Orbit/pan/zoom manual sem OrbitControls externo
- [x] Raycasting — clicar no elemento exibe suas propriedades
- [x] Elemento selecionado fica verde
- [x] Stats grandes na barra inferior (total, tipos, área)
- [x] Gráfico de barras horizontais CSS
- [x] Exportação PDF com layout limpo
- [x] Botão PDF no header e no painel esquerdo
- [x] Design premium minimalista (creme/mono)
- [x] Selo "Beta" no header e tela de upload
- [x] Fallback para WebGL indisponível
- [x] Aviso para arquivos > 200MB

## Melhorias Futuras (Sugeridas)

- [ ] Filtrar elementos no visualizador 3D por tipo
- [ ] Exibir pavimento (IfcBuildingStorey) na seleção de elemento
- [ ] Suporte a modelos federados (múltiplos IFCs)
- [ ] Modo escuro
- [ ] Tabela de propriedades completa do elemento selecionado
- [ ] Exportar geometria como OBJ/GLTF
- [ ] Histórico de modelos carregados (localStorage)

---

## Créditos

- **Ideia original:** Colega de Victor Lucas
- **Desenvolvimento:** Victor Lucas com Claude (Anthropic)
- **Repositório:** github.com/victorlucasiarec-del/bim-analyzer
