# Anotador de Esqueletos (protótipo de Ground Truth)

Casca de um frontend React + Vite + TypeScript para desenhar à mão os esqueletos de plântulas
(hipocótilo e raiz) sobre uma imagem e sua máscara de labels, gerando o *ground truth* usado na
avaliação dos algoritmos de esqueletização do projeto `seedling-skeleton`.

Tudo roda no navegador; nenhum dado sai da máquina.

## Executar

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # checagem de tipos + build de produção
```

## Uso

1. **Camadas**: use **Adicionar imagens** (aceita várias de uma vez) para carregar a original, a máscara (`originals-dataset/X.jpg`, `labeled-dataset/X.png`) e quaisquer outras imagens.
   Cada camada tem **visibilidade**, **opacidade** e **ordem** (arraste a alça ⋮⋮ ou use ▲▼); a do topo da lista fica por cima. Os traços do GT ficam sempre acima das imagens e também podem ser ocultados.
   A camada marcada **ref** define o tamanho e as coordenadas do GT (a primeira adicionada; troque com ⌖). As demais são ajustadas ao tamanho dela.
2. Escolha o órgão (**Hipocótilo** `1` / **Raiz** `2`) e o **ID da plântula** (hipocótilo e raiz da mesma plântula usam o mesmo ID).
3. **Mão livre** (`H`, padrão): segure o botão e arraste sobre o órgão; ao soltar, o traço é criado. Ele é simplificado (Ramer–Douglas–Peucker) com a tolerância "Simplificação (px)" (padrão 0,4 px da imagem; 0 mantém todos os pontos). **Pontos** (`D`) é a alternativa por cliques, descrita abaixo.
3. O traço é desenhado com **exatamente 1 pixel da imagem** de largura (muda com o zoom; abaixo de 100% fica mais fino que um pixel de tela — há uma opção só visual para engrossá-lo nesse caso). Ferramenta **Desenhar** (`D`): clique para adicionar pontos; **Enter** ou duplo clique finaliza;
   **Backspace** remove o último ponto; **Esc** cancela.
4. Ferramenta **Editar** (`S`): clique no traço para selecionar, arraste vértices, botão direito num vértice o remove,
   **Delete** exclui o traço selecionado.
5. **Zoom**: roda do mouse (centrado no cursor). **Mover**: ferramenta Mover (`M`), segurar **Espaço**, ou botão do meio. `F` ajusta à janela.
6. **Ctrl+Z / Ctrl+Shift+Z** desfazem/refazem. Um rascunho é salvo automaticamente no `localStorage` por imagem.
7. **Exportar GT** gera `<imagem>.gt.json`; **Importar GT** reabre um arquivo.

## Formato do arquivo (`*.gt.json`)

```json
{
  "version": 1,
  "coordinate_system": "image-pixels-xy",
  "image": { "name": "C10-R10_...jpg", "width": 640, "height": 640 },
  "strokes": [
    { "id": "…", "organ": "hipocotilo", "seedling_id": 1, "points": [[x, y], [x, y]] }
  ]
}
```

Coordenadas em pixels da imagem original, origem no canto superior esquerdo. Os pontos vão do colo ao ápice
(convenção a ser fixada no protocolo de anotação). O `seedling_id` é o da anotação; para casar com as plântulas do
`benchmark` (`skeleton_lib.identify_seedlings`) usa-se a sobreposição espacial, não o número.

## Estrutura

```
src/
  App.tsx                 estado global, atalhos, carregamento de arquivos
  components/Viewer.tsx   zoom/pan, desenho e edição (imagem em <canvas>, traços em SVG sobre ela)
  components/Toolbar.tsx  controles
  components/LayerPanel.tsx  lista de camadas (visibilidade, opacidade, ordem, referência)
  components/StrokeList.tsx
  hooks/useViewport.ts    zoom centrado no cursor, enquadramento
  state/docReducer.ts     traços + histórico (undo/redo)
  lib/io.ts               exportar/importar JSON, rascunho local
  lib/geometry.ts
```

## Próximos passos (fora da casca)

- Navegação entre imagens do dataset (fila, status “anotada/revisada”) e carregamento por pasta.
- Protocolo de anotação na interface (início/fim de cada órgão, ramificações legítimas, plântulas ilegíveis).
- Sugestão automática de ID de plântula a partir das componentes da máscara.
- Pré-visualização do comprimento por estimador (polilinha, spline) e comparação com os métodos.
- Dupla anotação, metadados do anotador e cálculo de concordância.
- Persistência em servidor e autenticação, se houver múltiplos anotadores.
- Testes (reducer e geometria) e edição por inserção de vértice em segmento.
