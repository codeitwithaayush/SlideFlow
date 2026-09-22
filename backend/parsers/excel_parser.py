import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, List

logger = logging.getLogger("excel_parser")

def clean_value(val):
    """Helper to convert numpy types/NaN to JSON-serializable Python types."""
    if pd.isna(val):
        return None
    if isinstance(val, (np.integer, np.int64, np.int32)):
        return int(val)
    if isinstance(val, (np.floating, np.float64, np.float32)):
        return float(val)
    if isinstance(val, (np.bool_)):
        return bool(val)
    if isinstance(val, (pd.Timestamp, np.datetime64)):
        return val.isoformat()
    return str(val)

def parse_excel_file(file_path: str) -> Dict[str, Any]:
    """
    Reads an Excel (.xlsx) or CSV file and extracts sheet details, column types,
    statistics, and sample data.
    """
    try:
        if file_path.endswith(".csv"):
            df = pd.read_csv(file_path)
        else:
            # default to excel
            df = pd.read_excel(file_path)
    except Exception as e:
        logger.error(f"Failed to read dataset file {file_path}: {e}")
        raise ValueError(f"Invalid Excel/CSV dataset file: {e}")

    row_count = len(df)
    columns_info = []

    for col in df.columns:
        series = df[col]
        dtype = str(series.dtype)
        
        # Determine logical type
        logical_type = "string"
        if pd.api.types.is_numeric_dtype(series):
            if pd.api.types.is_integer_dtype(series):
                logical_type = "integer"
            else:
                logical_type = "float"
        elif pd.api.types.is_datetime64_any_dtype(series) or "date" in col.lower():
            # Try to convert to datetime to see if it works
            try:
                temp_series = pd.to_datetime(series, errors='coerce')
                if temp_series.notna().sum() > 0.5 * len(series):
                    series = temp_series
                    logical_type = "datetime"
            except Exception:
                pass

        # Compute stats
        stats = {
            "missing_count": int(series.isna().sum()),
            "missing_pct": float(series.isna().mean() * 100)
        }

        if logical_type in ("integer", "float") and series.notna().sum() > 0:
            stats.update({
                "min": clean_value(series.min()),
                "max": clean_value(series.max()),
                "mean": clean_value(series.mean()),
                "sum": clean_value(series.sum()),
                "std": clean_value(series.std()) if len(series) > 1 else 0
            })
        elif logical_type == "datetime" and series.notna().sum() > 0:
            stats.update({
                "min": clean_value(series.min()),
                "max": clean_value(series.max())
            })
        
        # Categorical statistics (Top values)
        non_null_series = series.dropna()
        if len(non_null_series) > 0:
            val_counts = non_null_series.value_counts().head(5)
            stats["top_values"] = [
                {"value": clean_value(val), "count": int(count), "pct": float(count / len(df) * 100)}
                for val, count in val_counts.items()
            ]
            stats["unique_count"] = int(non_null_series.nunique())
        else:
            stats["top_values"] = []
            stats["unique_count"] = 0

        # Sample values
        sample_vals = [clean_value(v) for v in series.head(10).tolist()]

        columns_info.append({
            "name": str(col),
            "type": logical_type,
            "sample_values": sample_vals,
            "stats": stats
        })

    return {
        "columns": columns_info,
        "row_count": row_count
    }
