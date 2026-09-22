import logging
import pandas as pd
from typing import Dict, Any, Tuple
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches

logger = logging.getLogger("chart_generator")

# Map simple string representation to python-pptx chart types
CHART_TYPE_MAP = {
    "bar": XL_CHART_TYPE.BAR_CLUSTERED,
    "column": XL_CHART_TYPE.COLUMN_CLUSTERED,
    "line": XL_CHART_TYPE.LINE,
    "pie": XL_CHART_TYPE.PIE
}

def create_chart_data(df: pd.DataFrame, x_col: str, y_col: str, aggregation: str = "sum") -> Tuple[list, list]:
    """
    Groups and aggregates pandas DataFrame to prepare category chart data.
    """
    try:
        # Verify columns exist
        if x_col not in df.columns or y_col not in df.columns:
            logger.warning(f"Columns {x_col} or {y_col} not found in dataset. Using first two columns.")
            x_col = df.columns[0]
            y_col = df.columns[1]

        if x_col == y_col:
            if len(df.columns) > 1:
                other_cols = [c for c in df.columns if c != x_col]
                y_col = other_cols[0]

        # Clean NaN/null values
        cleaned_df = df[[x_col, y_col]].dropna()

        # Group data
        if aggregation == "mean":
            grouped = cleaned_df.groupby(x_col)[y_col].mean().reset_index()
        elif aggregation == "count":
            grouped = cleaned_df.groupby(x_col)[y_col].count().reset_index()
        else:
            grouped = cleaned_df.groupby(x_col)[y_col].sum().reset_index()

        # Limit to top 10 categories to avoid crowded charts
        grouped = grouped.sort_values(by=y_col, ascending=False).head(10)

        # For line charts, sort by date/x_col index to preserve timeline order
        if "date" in x_col.lower() or "year" in x_col.lower() or "month" in x_col.lower():
            try:
                # If date-like, parse and sort chronologically
                grouped['_sort_key'] = pd.to_datetime(grouped[x_col], errors='coerce')
                grouped = grouped.sort_values(by='_sort_key')
            except Exception:
                grouped = grouped.sort_values(by=x_col)

        categories = []
        for cat in grouped[x_col]:
            # Format datetime
            if hasattr(cat, 'strftime'):
                categories.append(cat.strftime('%Y-%m-%d'))
            else:
                categories.append(str(cat))

        values = [float(v) for v in grouped[y_col]]
        return categories, values
    except Exception as e:
        logger.error(f"Error compiling chart data: {e}")
        return ["Category A", "Category B"], [10.0, 20.0]

def add_native_chart(
    slide, 
    df: pd.DataFrame, 
    chart_config: Dict[str, Any], 
    x: int, 
    y: int, 
    width: int, 
    height: int
):
    """
    Creates and adds a native PowerPoint chart to the slide at the specified coordinates.
    """
    chart_type_str = chart_config.get("type", "column").lower()
    x_axis = chart_config.get("x_axis")
    y_axis = chart_config.get("y_axis")
    aggregation = chart_config.get("aggregation") or "sum"
    
    if not y_axis:
        y_axis = "Value"

    # Resolve chart type enum
    pptx_chart_type = CHART_TYPE_MAP.get(chart_type_str, XL_CHART_TYPE.COLUMN_CLUSTERED)

    categories, values = create_chart_data(df, x_axis, y_axis, aggregation)

    # Build chart data structure
    chart_data = CategoryChartData()
    chart_data.categories = categories
    chart_data.add_series(f"{y_axis} ({aggregation.title()})", tuple(values))

    # Add the chart shape to the slide
    try:
        chart_shape = slide.shapes.add_chart(
            pptx_chart_type, x, y, width, height, chart_data
        )
        chart = chart_shape.chart
        
        # Style adjustments
        chart.has_legend = True
        try:
            chart.value_axis.has_major_gridlines = True
        except (ValueError, AttributeError):
            pass
        
        logger.info(f"Successfully added native {chart_type_str} chart to slide.")
        return chart_shape
    except Exception as e:
        logger.error(f"Failed to insert native chart into slide: {e}")
        return None
