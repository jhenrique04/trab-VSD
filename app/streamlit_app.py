from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st
import streamlit.components.v1 as components


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = PROJECT_DIR / "data" / "streamlit" / "dev_planet_streamlit_wide.csv"
LATEST_PATH = PROJECT_DIR / "data" / "streamlit" / "dev_planet_streamlit_latest.csv"
NULL_REPORT_PATH = PROJECT_DIR / "data" / "streamlit" / "dev_planet_streamlit_null_report.csv"

MAP_INDICATORS = {
    "hdi": "IDH",
    "co2_per_capita": "CO2 per capita",
    "gdp_per_capita_ppp_constant": "PIB per capita PPP constante",
    "life_expectancy": "Expectativa de vida",
    "mean_years_schooling": "Anos medios de escolaridade",
    "population": "Populacao",
}

SCATTER_INDICATORS = {
    "hdi": "IDH",
    "co2_per_capita": "CO2 per capita",
    "gdp_per_capita_ppp_constant": "PIB per capita PPP constante",
    "life_expectancy": "Expectativa de vida",
    "mean_years_schooling": "Anos medios de escolaridade",
    "expected_years_schooling": "Anos esperados de escolaridade",
    "population": "Populacao",
    "total_ghg": "GEE total",
    "ghg_per_capita": "GEE per capita",
}

RANKING_INDICATORS = {
    **MAP_INDICATORS,
    "hdi_rank": "Ranking IDH",
    "gni_per_capita": "RNB per capita",
    "co2_total_mt": "CO2 total",
    "total_ghg": "GEE total",
    "ghg_per_capita": "GEE per capita",
}

LINE_INDICATORS = {
    **RANKING_INDICATORS,
    "expected_years_schooling": "Anos esperados de escolaridade",
    "consumption_co2": "CO2 baseado em consumo",
    "consumption_co2_per_capita": "CO2 consumo per capita",
}

PARALLEL_COLUMNS = [
    "hdi",
    "life_expectancy",
    "mean_years_schooling",
    "gdp_per_capita_ppp_constant",
    "co2_per_capita",
]

PARALLEL_LABELS = {
    "hdi": "IDH",
    "life_expectancy": "Expectativa de vida",
    "mean_years_schooling": "Escolaridade media",
    "gdp_per_capita_ppp_constant": "PIB per capita PPP",
    "co2_per_capita": "CO2 per capita",
}

DEFAULT_COUNTRIES = ["Brazil", "United States", "China", "India", "Germany", "France", "Japan", "South Africa"]


st.set_page_config(
    page_title="Desenvolvimento e Planeta",
    layout="wide",
)


@st.cache_data(show_spinner=False)
def load_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    df = pd.read_csv(DATA_PATH, encoding="utf-8", low_memory=False)
    latest = pd.read_csv(LATEST_PATH, encoding="utf-8", low_memory=False)
    nulls = pd.read_csv(NULL_REPORT_PATH, encoding="utf-8", low_memory=False)

    numeric_columns = set(MAP_INDICATORS) | set(SCATTER_INDICATORS) | set(RANKING_INDICATORS) | set(LINE_INDICATORS)
    numeric_columns.update(PARALLEL_COLUMNS)
    numeric_columns.add("year")
    for frame in (df, latest):
        for column in numeric_columns:
            if column in frame.columns:
                frame[column] = pd.to_numeric(frame[column], errors="coerce").replace([np.inf, -np.inf], np.nan)
        if "year" in frame.columns:
            frame["year"] = pd.to_numeric(frame["year"], errors="coerce").astype("Int64")

    for frame in (df, latest):
        for column in ["country", "region", "income_group", "iso_code"]:
            if column in frame.columns:
                frame[column] = frame[column].astype("string")

    return df, latest, nulls


def apply_dimension_filters(
    data: pd.DataFrame,
    selected_regions: list[str],
    selected_income_groups: list[str],
    selected_countries: list[str],
) -> pd.DataFrame:
    filtered = data.copy()
    if selected_regions:
        filtered = filtered[filtered["region"].isin(selected_regions)]
    if selected_income_groups:
        filtered = filtered[filtered["income_group"].isin(selected_income_groups)]
    if selected_countries:
        filtered = filtered[filtered["country"].isin(selected_countries)]
    return filtered


def usable_rows(data: pd.DataFrame, required_columns: list[str]) -> tuple[pd.DataFrame, int]:
    before = data["iso_code"].nunique()
    cleaned = data.replace([np.inf, -np.inf], np.nan).dropna(subset=required_columns).copy()
    for column in required_columns:
        if column in cleaned.columns and pd.api.types.is_numeric_dtype(cleaned[column]):
            cleaned = cleaned[np.isfinite(cleaned[column])]
    after = cleaned["iso_code"].nunique()
    return cleaned, max(before - after, 0)


def format_missing_warning(chart_name: str, missing_count: int) -> None:
    if missing_count:
        st.caption(f"{chart_name}: {missing_count} pais(es) ficaram fora por ausencia de dados necessarios.")
    else:
        st.caption(f"{chart_name}: todos os paises filtrados tinham os dados necessarios.")


def indicator_label(indicator: str) -> str:
    return LINE_INDICATORS.get(indicator) or RANKING_INDICATORS.get(indicator) or SCATTER_INDICATORS.get(indicator) or indicator


def build_line_trace_figure(data: pd.DataFrame, y_column: str, title: str):
    fig = px.line(
        data.sort_values(["country", "year"]),
        x="year",
        y=y_column,
        color="country",
        markers=True,
        labels={"year": "Ano", y_column: indicator_label(y_column), "country": "Pais"},
        title=title,
    )
    fig.update_layout(height=420, margin=dict(l=0, r=0, t=48, b=0))
    return fig


df, latest_df, null_report = load_data()

st.title("Desenvolvimento e Planeta")
st.markdown(
    "Painel interativo para explorar associacoes visuais entre desenvolvimento humano, renda, educacao, "
    "expectativa de vida, populacao e emissoes de CO2. A leitura e exploratoria: os graficos nao afirmam causalidade."
)
st.caption(
    "Fontes: UNDP Human Development Reports, World Bank World Development Indicators e Our World in Data. "
    "Valores ausentes nao foram preenchidos automaticamente, imputados ou interpolados."
)

years = sorted(df["year"].dropna().astype(int).unique().tolist())
regions = sorted(df["region"].dropna().astype(str).unique().tolist())
income_groups = sorted(df["income_group"].dropna().astype(str).unique().tolist())
countries = sorted(df["country"].dropna().astype(str).unique().tolist())

with st.sidebar:
    st.header("Filtros")
    selected_year = st.selectbox("Ano", years, index=len(years) - 1)
    selected_regions = st.multiselect("Regiao", regions, default=regions)
    selected_income_groups = st.multiselect("Grupo de renda", income_groups, default=income_groups)
    selected_countries = st.multiselect("Paises", countries, default=[])

    st.divider()
    map_indicator = st.selectbox(
        "Indicador do mapa",
        list(MAP_INDICATORS),
        index=list(MAP_INDICATORS).index("co2_per_capita"),
        format_func=lambda value: MAP_INDICATORS[value],
    )
    ranking_indicator = st.selectbox(
        "Indicador do ranking",
        list(RANKING_INDICATORS),
        index=list(RANKING_INDICATORS).index("co2_per_capita"),
        format_func=lambda value: RANKING_INDICATORS[value],
    )
    ranking_top_n = st.radio("Top ranking", [10, 20, 30], index=1, horizontal=True)
    ranking_order = st.radio("Ordem", ["Descendente", "Ascendente"], horizontal=True)

    st.divider()
    scatter_x = st.selectbox(
        "Eixo X do scatterplot",
        list(SCATTER_INDICATORS),
        index=list(SCATTER_INDICATORS).index("hdi"),
        format_func=lambda value: SCATTER_INDICATORS[value],
    )
    scatter_y = st.selectbox(
        "Eixo Y do scatterplot",
        list(SCATTER_INDICATORS),
        index=list(SCATTER_INDICATORS).index("co2_per_capita"),
        format_func=lambda value: SCATTER_INDICATORS[value],
    )
    scatter_color = st.radio("Cor do scatterplot", ["region", "income_group"], format_func=lambda x: "Regiao" if x == "region" else "Grupo de renda")

    st.divider()
    line_indicator = st.selectbox(
        "Indicador da linha temporal",
        list(LINE_INDICATORS),
        index=list(LINE_INDICATORS).index("hdi"),
        format_func=lambda value: LINE_INDICATORS[value],
    )
    line_mode = st.radio(
        "Modo da linha temporal",
        ["Comparar IDH e CO2", "Indicador unico"],
        horizontal=True,
    )
    default_line_countries = [country for country in DEFAULT_COUNTRIES if country in countries]
    selected_line_countries = st.multiselect(
        "Paises da linha temporal, ate 8",
        countries,
        default=default_line_countries,
        max_selections=8,
    )
    parallel_color = st.radio(
        "Cor nas coordenadas paralelas",
        ["co2_per_capita", "hdi"],
        format_func=lambda value: PARALLEL_LABELS[value],
        horizontal=True,
    )
    parallel_focus = st.radio(
        "Foco das coordenadas",
        ["Maiores CO2", "Maiores IDH", "Todos filtrados"],
        horizontal=True,
    )

year_df = df[df["year"].eq(selected_year)].copy()
year_df = apply_dimension_filters(year_df, selected_regions, selected_income_groups, selected_countries)
time_df = apply_dimension_filters(df, selected_regions, selected_income_groups, selected_countries)

metric_a, metric_b, metric_c, metric_d = st.columns(4)
metric_a.metric("Ano selecionado", selected_year)
metric_b.metric("Paises no filtro", year_df["iso_code"].nunique())
metric_c.metric("Periodo da base", f"{min(years)}-{max(years)}")
metric_d.metric("Base latest", f"{latest_df['iso_code'].nunique()} paises")

st.subheader("Mapa-mundi: desenvolvimento e emissao")
st.caption("Use o primeiro modo para comparar a distribuicao espacial de CO2 per capita e IDH no mesmo ano.")
map_compare_tab, map_custom_tab = st.tabs(["Comparacao CO2 x IDH", "Mapa por indicador"])

with map_compare_tab:
    map_left, map_right = st.columns(2)
    with map_left:
        co2_map_data, co2_map_missing = usable_rows(year_df, ["iso_code", "country", "co2_per_capita"])
        format_missing_warning("Mapa CO2", co2_map_missing)
        if co2_map_data.empty:
            st.warning("Sem dados suficientes para CO2 per capita com os filtros atuais.")
        else:
            fig_co2_map = px.choropleth(
                co2_map_data,
                locations="iso_code",
                locationmode="ISO-3",
                color="co2_per_capita",
                hover_name="country",
                hover_data={
                    "iso_code": True,
                    "region": True,
                    "income_group": True,
                    "hdi": ":.3f",
                    "co2_per_capita": ":.3f",
                },
                color_continuous_scale="YlOrRd",
                labels={"co2_per_capita": "CO2 per capita"},
                title=f"CO2 per capita, {selected_year}",
            )
            fig_co2_map.update_layout(margin=dict(l=0, r=0, t=48, b=0), height=470)
            st.plotly_chart(fig_co2_map, width="stretch")
    with map_right:
        hdi_map_data, hdi_map_missing = usable_rows(year_df, ["iso_code", "country", "hdi"])
        format_missing_warning("Mapa IDH", hdi_map_missing)
        if hdi_map_data.empty:
            st.warning("Sem dados suficientes para IDH com os filtros atuais.")
        else:
            fig_hdi_map = px.choropleth(
                hdi_map_data,
                locations="iso_code",
                locationmode="ISO-3",
                color="hdi",
                hover_name="country",
                hover_data={
                    "iso_code": True,
                    "region": True,
                    "income_group": True,
                    "hdi": ":.3f",
                    "co2_per_capita": ":.3f",
                },
                color_continuous_scale="Viridis",
                labels={"hdi": "IDH"},
                title=f"IDH, {selected_year}",
            )
            fig_hdi_map.update_layout(margin=dict(l=0, r=0, t=48, b=0), height=470)
            st.plotly_chart(fig_hdi_map, width="stretch")

with map_custom_tab:
    map_data, map_missing = usable_rows(year_df, ["iso_code", "country", map_indicator])
    format_missing_warning("Mapa por indicador", map_missing)
    if map_data.empty:
        st.warning("Sem dados suficientes para o mapa com os filtros atuais.")
    else:
        fig_map = px.choropleth(
            map_data,
            locations="iso_code",
            locationmode="ISO-3",
            color=map_indicator,
            hover_name="country",
            hover_data={
                "iso_code": True,
                "region": True,
                "income_group": True,
                "hdi": ":.3f",
                "co2_per_capita": ":.3f",
                map_indicator: ":,.3f",
            },
            color_continuous_scale="YlOrRd" if "co2" in map_indicator or "ghg" in map_indicator else "Viridis",
            labels={map_indicator: MAP_INDICATORS[map_indicator]},
            title=f"{MAP_INDICATORS[map_indicator]} por pais, {selected_year}",
        )
        fig_map.update_layout(margin=dict(l=0, r=0, t=48, b=0), height=520)
        st.plotly_chart(fig_map, width="stretch")

left_col, right_col = st.columns(2)

with left_col:
    st.subheader("Scatterplot")
    scatter_required = ["iso_code", "country", scatter_x, scatter_y, "population"]
    scatter_data, scatter_missing = usable_rows(year_df, scatter_required)
    scatter_data = scatter_data[scatter_data["population"].gt(0)]
    scatter_missing = max(year_df["iso_code"].nunique() - scatter_data["iso_code"].nunique(), 0)
    format_missing_warning("Scatterplot", scatter_missing)
    if scatter_data.empty:
        st.warning("Sem dados suficientes para o scatterplot com os filtros atuais.")
    else:
        fig_scatter = px.scatter(
            scatter_data,
            x=scatter_x,
            y=scatter_y,
            size="population",
            color=scatter_color,
            hover_name="country",
            hover_data={
                "year": True,
                "hdi": ":.3f",
                "co2_per_capita": ":.3f",
                "gdp_per_capita_ppp_constant": ":,.0f",
                "life_expectancy": ":.1f",
                "population": ":,.0f",
                "region": True,
                "income_group": True,
            },
            labels={
                scatter_x: SCATTER_INDICATORS[scatter_x],
                scatter_y: SCATTER_INDICATORS[scatter_y],
                "population": "Populacao",
                "region": "Regiao",
                "income_group": "Grupo de renda",
            },
            title=f"{SCATTER_INDICATORS[scatter_x]} x {SCATTER_INDICATORS[scatter_y]}, {selected_year}",
        )
        fig_scatter.update_traces(marker=dict(opacity=0.72, line=dict(width=0.5, color="white")))
        fig_scatter.update_layout(height=520, margin=dict(l=0, r=0, t=48, b=0))
        st.plotly_chart(fig_scatter, width="stretch")

with right_col:
    st.subheader("Ranking")
    ranking_data, ranking_missing = usable_rows(year_df, ["country", ranking_indicator])
    ascending = ranking_order == "Ascendente"
    ranking_data = (
        ranking_data.sort_values(ranking_indicator, ascending=ascending)
        .head(ranking_top_n)
        .sort_values(ranking_indicator, ascending=not ascending)
    )
    format_missing_warning("Ranking", ranking_missing)
    if ranking_data.empty:
        st.warning("Sem dados suficientes para o ranking com os filtros atuais.")
    else:
        fig_rank = px.bar(
            ranking_data,
            x=ranking_indicator,
            y="country",
            orientation="h",
            color="region",
            hover_data=["income_group"],
            labels={ranking_indicator: RANKING_INDICATORS[ranking_indicator], "country": "Pais"},
            title=f"Top {ranking_top_n} - {RANKING_INDICATORS[ranking_indicator]}, {selected_year}",
        )
        fig_rank.update_layout(height=520, margin=dict(l=0, r=0, t=48, b=0), yaxis_title="")
        st.plotly_chart(fig_rank, width="stretch")

st.subheader("Linha temporal por pais")
if not selected_line_countries:
    st.info("Selecione ate 8 paises na barra lateral para exibir a linha temporal.")
else:
    line_base = time_df[time_df["country"].isin(selected_line_countries)].copy()
    if line_mode == "Comparar IDH e CO2":
        hdi_line_data, _ = usable_rows(line_base, ["country", "year", "hdi"])
        co2_line_data, _ = usable_rows(line_base, ["country", "year", "co2_per_capita"])
        countries_with_both = set(hdi_line_data["country"].dropna().astype(str)) & set(
            co2_line_data["country"].dropna().astype(str)
        )
        countries_out = len(set(selected_line_countries) - countries_with_both)
        format_missing_warning("Linha temporal IDH + CO2", countries_out)
        if hdi_line_data.empty and co2_line_data.empty:
            st.warning("Sem dados suficientes para IDH e CO2 per capita com os filtros atuais.")
        else:
            st.caption("As escalas sao diferentes, por isso IDH e CO2 per capita aparecem em graficos separados.")
            line_left, line_right = st.columns(2)
            with line_left:
                if hdi_line_data.empty:
                    st.warning("Sem dados suficientes para IDH.")
                else:
                    st.plotly_chart(
                        build_line_trace_figure(hdi_line_data, "hdi", "Evolucao do IDH"),
                        width="stretch",
                    )
            with line_right:
                if co2_line_data.empty:
                    st.warning("Sem dados suficientes para CO2 per capita.")
                else:
                    st.plotly_chart(
                        build_line_trace_figure(co2_line_data, "co2_per_capita", "Evolucao do CO2 per capita"),
                        width="stretch",
                    )
    else:
        line_data, _ = usable_rows(line_base, ["country", "year", line_indicator])
        countries_with_line = set(line_data["country"].dropna().astype(str).unique())
        countries_out = len(set(selected_line_countries) - countries_with_line)
        format_missing_warning("Linha temporal", countries_out)
        if line_data.empty:
            st.warning("Sem dados suficientes para a linha temporal com os filtros atuais.")
        else:
            st.plotly_chart(
                build_line_trace_figure(line_data, line_indicator, f"Evolucao temporal - {LINE_INDICATORS[line_indicator]}"),
                width="stretch",
            )

st.subheader("Coordenadas paralelas")
parallel_data, parallel_missing = usable_rows(year_df, ["country", *PARALLEL_COLUMNS])
format_missing_warning("Coordenadas paralelas", parallel_missing)
if parallel_data.empty:
    st.warning("Sem paises completos para as variaveis das coordenadas paralelas com os filtros atuais.")
else:
    st.caption(
        "Cada linha e um pais completo nas cinco variaveis. O ultimo eixo e CO2 per capita, para comparar desenvolvimento e pressao ambiental."
    )
    if parallel_focus == "Maiores CO2":
        parallel_data = parallel_data.sort_values("co2_per_capita", ascending=False).head(80)
        st.caption("Mostrando ate 80 paises com maior CO2 per capita entre os filtros atuais.")
    elif parallel_focus == "Maiores IDH":
        parallel_data = parallel_data.sort_values("hdi", ascending=False).head(80)
        st.caption("Mostrando ate 80 paises com maior IDH entre os filtros atuais.")
    elif len(parallel_data) > 120:
        parallel_data = parallel_data.sort_values("co2_per_capita", ascending=False).head(120)
        st.caption("Mostrando os 120 paises com maior CO2 per capita para preservar a legibilidade.")
    fig_parallel = px.parallel_coordinates(
        parallel_data,
        dimensions=PARALLEL_COLUMNS,
        color=parallel_color,
        color_continuous_scale=px.colors.sequential.Viridis,
        labels=PARALLEL_LABELS,
        title=f"Coordenadas paralelas, {selected_year}",
    )
    fig_parallel.update_layout(height=560, margin=dict(l=40, r=40, t=48, b=40))
    st.plotly_chart(fig_parallel, width="stretch")

with st.expander("Relatorio simples de nulos por coluna"):
    st.dataframe(null_report, width="stretch", hide_index=True)

st.subheader("Globo 3D")
st.caption(
    "Prova de conceito em Three.js. Para exibir aqui, rode `python -m http.server 8000` na raiz do projeto."
)
components.html(
    """
    <iframe
      src="http://localhost:8000/web/threejs-globe/"
      title="Globo 3D coroplético"
      style="width:100%; height:720px; border:0; border-radius:8px; background:#07111f;"
      loading="lazy"
    ></iframe>
    """,
    height=740,
)
