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

1. **Camadas**: use **Adicionar imagens** (aceita várias de uma vez) para carregar a original, a máscara (`originals-dataset/X.jpg`, `labeled-dataset/X.png`) e quaisquer outras imagens — por exemplo, o esqueleto de um algoritmo, para comparar com o seu desenho.
   Cada camada tem **visibilidade**, **opacidade** e **ordem** (arraste a alça ⋮⋮ ou use ▲▼); a do topo da lista fica por cima. Os traços do GT ficam sempre acima das imagens e também podem ser ocultados.
   A camada marcada **ref** define o tamanho e as coordenadas do GT (a primeira adicionada; troque com ⌖). As demais são ajustadas ao tamanho dela.
2. Escolha o órgão (**Hipocótilo** `1` / **Raiz** `2`) e o **ID da plântula** (hipocótilo e raiz da mesma plântula usam o mesmo ID).
   Com a caixa **"Avançar o ID ao voltar de Raiz para Hipocótilo"** marcada (padrão; a escolha é lembrada), o fluxo hipocótilo → raiz → próxima plântula avança o ID sozinho: ao trocar de Raiz para Hipocótilo, o ID soma 1 — mas só se já existe um traço de raiz com o ID atual. O botão **+1** continua disponível para pular manualmente (ex.: plântula sem raiz).
3. **O desenho é em pixels**, não vetorial: cada traço é gravado como uma **cadeia de pixels inteiros, 8-conexa e fina** (sem pixels de "quina" redundantes), a mesma natureza da saída de `skeletonize`/`medial_axis`. Na tela, cada pixel do traço é pintado como um pixel da imagem.
   - **Mão livre** (`H`, padrão): segure e arraste; pontos consecutivos são ligados por Bresenham.
   - **Pontos** (`D`): clique para marcar vértices (ligados por Bresenham); **Enter** ou duplo clique finaliza, **Backspace** remove o último, **Esc** cancela.
   - **Borracha** (`E`): apaga pixels dentro do raio configurado; um traço cortado ao meio vira dois.
   - **Selecionar** (`S`): **arraste um retângulo** para selecionar todos os traços que têm pixels dentro dele, ou clique perto de um traço para selecioná-lo. **Shift/Ctrl** soma à seleção atual; **Delete** exclui os selecionados; **Esc** limpa.
     Os selecionados ganham contorno branco na imagem (os demais ficam esmaecidos) e destaque na lista, que rola até eles.
     O seletor **Destacar plântula** (acima da lista) lista todos os IDs existentes: escolher um ID seleciona e destaca todos os traços dele (e o seletor mostra o ID quando a seleção é exatamente "todos os traços daquele ID").
   - **Mover** (`M`), **Espaço** ou botão do meio: mover a imagem. Roda do mouse: zoom. `F` ajusta à janela.
4. **Ctrl+Z / Ctrl+Shift+Z** desfazem/refazem. Um rascunho é salvo no `localStorage` por imagem.
5. **Exportar GT** gera `<imagem>.gt.json`; **Exportar máscaras PNG** gera `<imagem>.gt.hipocotilo.png` e `<imagem>.gt.raiz.png`; **Importar GT** reabre um JSON (também aceita o formato antigo, vetorial, que é convertido para pixels).

## Formato do arquivo (`*.gt.json`, versão 2)

```json
{
  "version": 2,
  "coordinate_system": "image-pixels-xy-integer",
  "image": { "name": "C10-R10_...jpg", "width": 640, "height": 640 },
  "strokes": [
    { "id": "…", "organ": "hipocotilo", "seedling_id": 1, "pixels": [[x, y], [x, y]] }
  ]
}
```

`pixels` é a cadeia ordenada de pixels do esqueleto (índices inteiros, origem no canto superior esquerdo, `x` = coluna, `y` = linha).
As máscaras PNG têm o mesmo tamanho da imagem de referência: esqueleto = 255, fundo = 0 (uma por órgão, todas as plântulas juntas).
Para casar com as plântulas do `benchmark` (`skeleton_lib.identify_seedlings`) usa-se a sobreposição espacial, não o número.

Exemplo de leitura para comparar com um esqueleto de algoritmo (`skimage`):

```python
import numpy as np, cv2
gt = cv2.imread("X.gt.hipocotilo.png", cv2.IMREAD_GRAYSCALE) == 255   # bool (H, W)
pred = skeletonize(mask_hyp)                                          # bool (H, W)
```

## Estrutura

```
src/
  App.tsx                 estado global, atalhos, carregamento de arquivos
  components/Viewer.tsx   zoom/pan, desenho e edição (imagens em <canvas>; traços em pixels em outro <canvas> por cima)
  components/Toolbar.tsx  controles
  components/LayerPanel.tsx  lista de camadas (visibilidade, opacidade, ordem, referência)
  components/StrokeList.tsx
  hooks/useViewport.ts    zoom centrado no cursor, enquadramento
  state/docReducer.ts     traços + histórico (undo/redo)
  lib/io.ts               exportar/importar JSON, rascunho local
  lib/geometry.ts         Bresenham, cadeia fina 8-conexa, comprimento de cadeia
```

## Próximos passos (fora da casca)

- Navegação entre imagens do dataset (fila, status “anotada/revisada”) e carregamento por pasta.
- Protocolo de anotação na interface (início/fim de cada órgão, ramificações legítimas, plântulas ilegíveis).
- Sugestão automática de ID de plântula a partir das componentes da máscara.
- Pré-visualização do comprimento por estimador (polilinha, spline) e comparação com os métodos.
- Dupla anotação, metadados do anotador e cálculo de concordância.
- Persistência em servidor e autenticação, se houver múltiplos anotadores.
- Testes (reducer e geometria) e edição por inserção de vértice em segmento.
