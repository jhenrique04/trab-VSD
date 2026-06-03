# Fontes e metodologia

Data de acesso: 2026-05-11.

## UNDP / Human Development Reports

Uso no projeto:

- Human Development Index (`hdi`)
- life expectancy at birth (`life_expectancy_undp`)
- expected years of schooling
- mean years of schooling
- gross national income per capita
- HDI rank 2023
- grupo de desenvolvimento humano e regiao UNDP, quando disponiveis

URLs:

- https://hdr.undp.org/data-center
- https://hdr.undp.org/data-center/documentation-and-downloads
- https://hdr.undp.org/data-center/human-development-index
- https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv

Arquivo usado:

- `data/raw/undp/HDR25_Composite_indices_complete_time_series.csv`

Tratamento:

- O arquivo bruto foi lido com fallback de encoding `latin1`, pois contem caracteres fora de UTF-8.
- As colunas anuais foram transformadas de formato largo para pais-ano.
- Foram mantidos apenas codigos ISO3 validos.
- Os CSVs finais foram salvos em UTF-8.

## World Bank / World Development Indicators

Uso no projeto:

- `NY.GDP.PCAP.PP.KD`: GDP per capita, PPP, constant 2021 international $
- `SP.POP.TOTL`: Population, total
- `SP.DYN.LE00.IN`: Life expectancy at birth, total, years
- classificacao regional
- classificacao por grupo de renda

URLs:

- https://api.worldbank.org/v2/
- https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
- https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.PP.KD?format=json
- https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json
- https://api.worldbank.org/v2/country/all/indicator/SP.DYN.LE00.IN?format=json
- https://api.worldbank.org/v2/country?format=json

Arquivos usados:

- `data/raw/worldbank/NY.GDP.PCAP.PP.KD.csv`
- `data/raw/worldbank/SP.POP.TOTL.csv`
- `data/raw/worldbank/SP.DYN.LE00.IN.csv`
- `data/raw/worldbank/worldbank_indicators_long.csv`
- `data/raw/worldbank/worldbank_countries.csv`

Tratamento:

- Download via API paginada, com `per_page=1000`.
- O primeiro teste com `per_page=20000` retornou erro HTTP 502, entao o script usa paginacao menor e retry.
- Registros com `region = Aggregates` foram removidos da classificacao de paises.
- Dados foram pivotados para formato largo em `data/interim/worldbank_clean.csv`.

## Our World in Data / CO2 and Greenhouse Gas Emissions

Uso no projeto:

- CO2 total
- CO2 per capita
- CO2 acumulado
- CO2 baseado em consumo
- CO2 baseado em consumo per capita
- total greenhouse gases
- greenhouse gases per capita
- populacao e PIB auxiliares para validacao

URLs:

- https://github.com/owid/co2-data
- https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv
- https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-codebook.csv

Arquivos usados:

- `data/raw/owid/owid-co2-data.csv`
- `data/raw/owid/owid-co2-codebook.csv`

Tratamento:

- Filtrados anos de 1990 a 2023.
- Removidos registros sem ISO3 valido.
- Agregados OWID com codigos especiais, como `OWID_WRL`, nao entram na base principal porque nao passam na regra ISO3.

## Integracao

Chave:

- `iso_code`
- `year`

Prioridades:

- Nome do pais: UNDP, World Bank, OWID.
- Expectativa de vida final: UNDP, com fallback World Bank.
- Populacao final: World Bank, com fallback OWID e depois UNDP.
- GNI per capita: UNDP.
- GDP per capita PPP constante: World Bank.
- Indicadores de emissao: OWID.

Nao foram aplicadas interpolacao, imputacao ou preenchimento automatico de indicadores ausentes.

## Saidas de qualidade

- `data/tableau/dev_planet_quality_report.csv`
- `data/tableau/unmatched_iso_codes.csv`
- `data/tableau/dev_planet_key_country_check.csv`

Esses arquivos documentam cobertura temporal, ausencias, paises por indicador, codigos sem pareamento completo entre fontes e verificacao dos paises-chave do projeto.
