# Desenvolvimento & Planeta

Narrativa web e base de dados pais-ano para analisar a relacao entre desenvolvimento humano, renda, educacao, expectativa de vida, populacao e emissoes de CO2.

A pergunta central do projeto e:

> Da para uma nacao viver bem sem cobrar a conta do planeta?

O produto principal fica em `web/threejs-globe/` e usa uma narrativa scrollytelling com cinco atos, visualizacoes coordenadas e selecao compartilhada de paises.

## Visao geral

O projeto combina dados de desenvolvimento humano, economia, populacao, emissoes nacionais e emissoes por instalacao. A entrega inclui:

- pipeline de coleta e limpeza de dados;
- bases finais para Tableau, Streamlit e web;
- narrativa web interativa;
- app Streamlit exploratorio;
- documentacao tecnica em LaTeX e PDF.

O projeto e exploratorio. Ele ajuda a comparar paises e padroes, mas nao deve ser usado para afirmar causalidade.

## Fontes de dados

| Fonte | Uso principal | Link |
| --- | --- | --- |
| UNDP / Human Development Reports | IDH, expectativa de vida, escolaridade, renda nacional bruta e classificacoes de desenvolvimento humano | <https://hdr.undp.org/data-center> |
| World Bank / World Development Indicators | PIB per capita PPP, populacao, expectativa de vida, regiao e grupo de renda | <https://api.worldbank.org/v2/> |
| Our World in Data / CO2 and Greenhouse Gas Emissions | CO2 total, CO2 per capita, CO2 acumulado, CO2 por consumo e gases de efeito estufa | <https://github.com/owid/co2-data> |
| Climate TRACE | Instalacoes emissoras, setor, coordenadas e CO2e por instalacao | <https://climatetrace.org/data> |
| GeoJSON mundial preparado no projeto | Geometria dos paises para mapas e globos | `web/threejs-globe/data/world.geojson` |
| CARTO basemaps | Tiles do mapa de instalacoes | <https://carto.com/basemaps/> |

Mais detalhes de fontes e tratamento estao em [docs/fontes.md](docs/fontes.md).

## Produto web

A narrativa web tem cinco atos:

1. **A corrida do ponto ideal**: bolhas animadas IDH x CO2 per capita, 1990-2023, com D3.
2. **Quantas Terras?**: transforma CO2 per capita em numero de planetas necessarios.
3. **O mapa que mente**: compara emissoes por territorio e por consumo, com mapa D3 e barras Vega-Lite.
4. **De onde vem o CO2**: mostra instalacoes emissoras reais do Climate TRACE, com deck.gl e treemap D3.
5. **Explore os dados**: mapa 2D, globos 3D, painel Vega-Lite e coordenadas paralelas.

As visualizacoes sao coordenadas por `web/threejs-globe/core/state.js`. O usuario pode selecionar ate dois paises; essa selecao atualiza os demais paineis.

### Mapa de arquivos por ato

| Parte | Visualizacao / funcao | Arquivos principais | Dados usados |
| --- | --- | --- | --- |
| Base da pagina | Estrutura HTML, topbar, hero, secoes e rodape | `web/threejs-globe/index.html` | Carrega os modulos e elementos da pagina |
| Base visual | Tema, layout, cards, responsividade e estados visuais | `web/threejs-globe/styles.css` | Variaveis CSS e classes da interface |
| Coordenacao | Estado compartilhado de ano e paises selecionados | `web/threejs-globe/core/state.js` | Selecoes feitas em qualquer visualizacao |
| Tema | Alternancia claro/escuro | `web/threejs-globe/core/theme.js` | `localStorage` e variaveis CSS |
| Narrativa | Ativacao por scroll e links ativos da topbar | `web/threejs-globe/core/narrative.js` | Passos `.step` dos atos |
| Fundo | Particulas e globo translucido animado | `web/threejs-globe/core/ambient.js` | Scroll da pagina e tema atual |
| Timeline | Linha visual da narrativa | `web/threejs-globe/core/timeline.js` | Posicao dos atos na pagina |
| Ato 1 | Corrida IDH x CO2 com bolhas animadas | `web/threejs-globe/acts/ato-1/race.js` | `data/dev_planet_narrative.json` |
| Ato 2 | Quantas Terras | `web/threejs-globe/acts/ato-2/footprint.js` | `data/dev_planet_narrative.json` |
| Ato 3 | Mapa territorio x consumo e barras liquidas | `web/threejs-globe/acts/ato-3/trade-map.js` | `data/dev_planet_narrative.json`, `data/world.geojson` |
| Ato 4 | Mapa de instalacoes emissoras | `web/threejs-globe/acts/ato-4/facilities-map.js` | `data/facilities/facilities_global.json`, `data/facilities/*.json` |
| Ato 4 | Treemap por setor e instalacao | `web/threejs-globe/acts/ato-4/treemap.js` | `data/facilities/facilities_global.json`, `data/facilities/*.json` |
| Ato 5 | Alternar Mapa 2D / Globos 3D | `web/threejs-globe/acts/ato-5/viewmode.js` | Estado do modo salvo em `localStorage` |
| Ato 5 | Mapa 2D coropletico | `web/threejs-globe/acts/ato-5/map2d.js` | `data/dev_planet_globe.json`, `data/world.geojson` |
| Ato 5 | Globos 3D duais | `web/threejs-globe/acts/ato-5/globe.js` | `data/dev_planet_globe.json`, `data/world.geojson` |
| Ato 5 | Painel de comparacao Vega-Lite | `web/threejs-globe/acts/ato-5/comparison.js` | `data/dev_planet_globe.json` |
| Ato 5 | Coordenadas paralelas | `web/threejs-globe/acts/ato-5/parallel.js` | `data/dev_planet_globe.json` |
| Utilitario | Fade ao trocar conteudo | `web/threejs-globe/core/fx.js` | Elementos atualizados pela interface |

### Organizacao atual em pastas

Os modulos JavaScript da web ficam separados por responsabilidade:

```text
web/threejs-globe/
  core/        state, theme, fx, narrative, timeline, ambient
  acts/
    ato-1/     race
    ato-2/     footprint
    ato-3/     trade-map
    ato-4/     facilities-map, treemap
    ato-5/     viewmode, map2d, globe, comparison, parallel
  data/        jsons usados pela web
  styles.css
  index.html
```

### Tecnologias web

- HTML, CSS e JavaScript ES Modules;
- D3.js;
- Vega-Lite e Vega Embed;
- Three.js, OrbitControls e three-globe;
- deck.gl;
- Scrollama;
- IntersectionObserver e ResizeObserver;
- Canvas 2D para o fundo animado.

### Executar a web

Rode um servidor local na raiz do projeto:

```bash
.venv/bin/python -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000/web/threejs-globe/
```

## Pipeline de dados

Crie o ambiente virtual e instale dependencias:

```bash
uv venv .venv
uv pip install -r requirements.txt --python .venv/bin/python
```

Execute o pipeline completo:

```bash
.venv/bin/python scripts/run_pipeline.py
```

Ou rode por etapas:

```bash
.venv/bin/python scripts/01_download_undp.py
.venv/bin/python scripts/02_download_worldbank.py
.venv/bin/python scripts/03_download_owid_co2.py
.venv/bin/python scripts/04_clean_undp.py
.venv/bin/python scripts/05_clean_worldbank.py
.venv/bin/python scripts/06_clean_owid.py
.venv/bin/python scripts/07_join_final_dataset.py
.venv/bin/python scripts/08_generate_figures.py
.venv/bin/python scripts/09_prepare_streamlit_data.py
.venv/bin/python scripts/11_prepare_threejs_globe_data.py
.venv/bin/python scripts/12_download_climate_trace.py
.venv/bin/python scripts/13_prepare_narrative_data.py
```

Os logs ficam em `logs/`.

## App Streamlit

Depois de gerar a base:

```bash
.venv/bin/streamlit run app/streamlit_app.py
```

O app usa:

- `data/streamlit/dev_planet_streamlit_wide.csv`;
- `data/streamlit/dev_planet_streamlit_latest.csv`;
- `data/streamlit/dev_planet_streamlit_null_report.csv`.

## Estrutura do repositorio

```text
app/                  app streamlit
data/                 dados brutos, intermediarios e finais
docs/                 fontes e documentacao latex/pdf
figures/              figuras de prova de conceito
logs/                 logs do pipeline e apps
scripts/              scripts de coleta, limpeza e preparo
web/threejs-globe/    produto web narrativo
requirements.txt      dependencias python
Book1.twbx            workbook tableau
```

## Saidas principais

- `data/processed/dev_planet_country_year_wide.csv`
- `data/processed/dev_planet_country_year_long.csv`
- `data/tableau/dev_planet_tableau_wide.csv`
- `data/tableau/dev_planet_tableau_long.csv`
- `data/tableau/dev_planet_country_latest.csv`
- `data/tableau/dev_planet_data_dictionary.csv`
- `data/tableau/dev_planet_quality_report.csv`
- `web/threejs-globe/data/dev_planet_globe.json`
- `web/threejs-globe/data/dev_planet_narrative.json`
- `web/threejs-globe/data/world.geojson`
- `web/threejs-globe/data/facilities/*.json`

## Documentacao

A documentacao tecnica da parte web esta em:

- [docs/documentacao_web.tex](docs/documentacao_web.tex)
- [docs/documentacao_web.pdf](docs/documentacao_web.pdf)

Ela detalha tecnologias, fontes de dados, arquitetura, cada visualizacao, efeitos, interacoes, performance e limitacoes.

Para recompilar:

```bash
pdflatex -interaction=nonstopmode -halt-on-error -output-directory docs docs/documentacao_web.tex
```

## Regras metodologicas

- Chave principal: `iso_code` + `year`.
- Apenas codigos ISO3 validos entram na base principal.
- Agregados regionais e globais sem ISO3 valido foram removidos.
- Valores ausentes foram mantidos como vazios/NaN.
- Nao houve interpolacao nem imputacao.
- CSVs finais usam UTF-8 e colunas em `snake_case`.
- Expectativa de vida prioriza UNDP, com fallback World Bank.
- Populacao prioriza World Bank, com fallback OWID e depois UNDP.

## Limitacoes

- As fontes nao cobrem exatamente os mesmos paises e territorios.
- A cobertura de CO2 por consumo e menor que a cobertura de CO2 territorial.
- A geometria mundial e simplificada.
- O mapa de instalacoes usa os maiores emissores baixados do Climate TRACE, nao inventario completo de todos os ativos do mundo.
- Globos 3D dependem de WebGL e podem ser pesados em maquinas antigas.

## Autoria

Visualizacao de Dados, Universidade Federal do Ceara, 2026.1.

Autores:

- Jose Henrique Viana Santos
- Maria Carolina Maximo Viana
