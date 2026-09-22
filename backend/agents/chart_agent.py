import json
import logging
from typing import Dict, Any, List, Optional
from ..services.groq_service import GroqService

logger = logging.getLogger("chart_agent")

SYSTEM_PROMPT = """You are an AI Presentation Consultant.
Your task is to review a slide's intent, mapped columns, data statistics, and slide shapes to determine if it requires a chart.

Rules for Chart Generation:
1. Charts may only be inserted if:
   - A chart placeholder (e.g., 'CHART' type) exists on the slide.
   - OR a dedicated empty area exists (e.g., no body text placeholders block the layout).
2. If no suitable space exists on the slide for a chart, DO NOT GENERATE A CHART. Return:
   {
     "chart": "skip"
   }
3. If no chart is relevant to the data, return:
   {
     "chart": null
   }
4. Otherwise, if a chart can fit and is relevant, specify the chart type based on:
   - Category + Numeric Value -> Bar Chart (or Column Chart)
   - Date/Time + Numeric Value -> Line Chart
   - Percentage distribution -> Pie Chart
   - Ranking lists -> Horizontal Bar Chart

You must output a valid JSON object matching the following structure:
{
  "chart": {
    "type": "bar", 
    "x_axis": "Column Name for Category/Time (X-Axis)",
    "y_axis": "Column Name for Metric/Values (Y-Axis)",
    "aggregation": "sum"
  }
}
"""

class ChartAgent:
    def __init__(self, groq_service: GroqService):
        self.groq_service = groq_service

    def determine_charts(self, slides_with_insights: List[Dict[str, Any]], excel_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Determines the chart requirement, chart type, and data mapping for each slide.
        """
        if not slides_with_insights:
            return []

        column_summaries = {}
        for col in excel_data.get("columns", []):
            column_summaries[col["name"]] = {
                "type": col["type"],
                "stats": col["stats"]
            }

        # If mock mode, perform local rule-based selection
        if self.groq_service.is_mock_mode():
            logger.info("Groq is in mock mode. Determining charts via rule-based heuristics.")
            result_slides = []
            for s in slides_with_insights:
                s_copy = s.copy()
                s_copy["chart"] = self._mock_determine_chart(s, column_summaries)
                result_slides.append(s_copy)
            return result_slides

        result_slides = []
        for s in slides_with_insights:
            mapped_cols = s.get("relevant_columns", [])
            mapped_data = {col: column_summaries.get(col, {}) for col in mapped_cols}
            
            # Format slide placeholders and shapes to send to LLM
            placeholders = []
            for ph in s.get("placeholders", []):
                placeholders.append(f"Type: {ph.get('placeholder_type')}, Index: {ph.get('placeholder_idx')}, Text: {ph.get('text')}")
            
            other_shapes = []
            for sh in s.get("other_shapes", []):
                other_shapes.append(f"Name: {sh.get('name')}, Type: {sh.get('type')}, Text: {sh.get('text')}")
            
            user_prompt = f"""
Slide Index: {s["slide_index"]}
Slide Title: {s["slide_title"]}
Slide Intent: {s.get("intent", "general")}
Placeholders on Slide: {placeholders}
Other Shapes on Slide: {other_shapes}
Mapped Columns: {mapped_cols}
Columns Statistics:
{json.dumps(mapped_data, indent=2)}
"""
            try:
                raw_response = self.groq_service.query(SYSTEM_PROMPT, user_prompt, json_mode=True)
                response_json = json.loads(raw_response)
                
                s_copy = s.copy()
                s_copy["chart"] = response_json.get("chart")
                result_slides.append(s_copy)
            except Exception as e:
                logger.error(f"ChartAgent selection failed for slide {s['slide_index']}: {e}")
                s_copy = s.copy()
                s_copy["chart"] = self._mock_determine_chart(s, column_summaries)
                result_slides.append(s_copy)

        return result_slides

    def _mock_determine_chart(self, slide: Dict[str, Any], columns_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Fallback rule-based chart determination."""
        intent = slide.get("intent")
        mapped_cols = slide.get("relevant_columns", [])
        
        if not mapped_cols or len(mapped_cols) < 2:
            return None
            
        if intent in ("executive_summary", "risks", "recommendations"):
            return None  # Text heavy slides usually do not need charts
            
        # Find categorical/date column (x-axis)
        x_axis = None
        y_axis = None
        
        # Look for dates
        for col in mapped_cols:
            info = columns_info.get(col, {})
            if info.get("type") == "datetime" or "date" in col.lower() or "year" in col.lower() or "month" in col.lower():
                x_axis = col
                break
                
        # Look for categorical if date not found
        if not x_axis:
            for col in mapped_cols:
                info = columns_info.get(col, {})
                if info.get("type") in ("string", "categorical") or "region" in col.lower() or "state" in col.lower() or "country" in col.lower() or "city" in col.lower() or "category" in col.lower():
                    x_axis = col
                    break
                    
        # Find numeric column (y-axis)
        for col in mapped_cols:
            if col == x_axis:
                continue
            info = columns_info.get(col, {})
            if info.get("type") in ("integer", "float") or "revenue" in col.lower() or "sale" in col.lower() or "profit" in col.lower() or "value" in col.lower() or "count" in col.lower():
                y_axis = col
                break
                
        # Fallbacks
        if not x_axis and len(mapped_cols) >= 1:
            x_axis = mapped_cols[0]
        if not y_axis and len(mapped_cols) >= 2:
            y_axis = mapped_cols[1] if mapped_cols[1] != x_axis else mapped_cols[0]
            
        if not x_axis or not y_axis:
            return None
            
        # Determine chart type based on rules
        x_info = columns_info.get(x_axis, {})
        chart_type = "column"
        
        if x_info.get("type") == "datetime" or "date" in x_axis.lower() or "year" in x_axis.lower() or "month" in x_axis.lower():
            chart_type = "line"
        elif "pct" in y_axis.lower() or "percent" in y_axis.lower() or "margin" in y_axis.lower():
            chart_type = "pie"
        elif "region" in x_axis.lower() or "state" in x_axis.lower():
            chart_type = "bar"
            
        return {
            "type": chart_type,
            "x_axis": x_axis,
            "y_axis": y_axis,
            "aggregation": "sum" if "revenue" in y_axis.lower() or "sales" in y_axis.lower() or "profit" in y_axis.lower() else "mean"
        }
