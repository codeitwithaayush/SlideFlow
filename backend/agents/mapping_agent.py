import json
import logging
from typing import Dict, Any, List
from ..services.groq_service import GroqService

logger = logging.getLogger("mapping_agent")

SYSTEM_PROMPT = """You are an AI Presentation Consultant.
Your task is to map data columns from a spreadsheet to slides based on the slides' titles, intents, and the columns' definitions.

Mapping Rules to respect:
- Columns containing Revenue or Sales values map to Revenue Analysis or Financial Performance slides.
- Columns showing Growth, time periods, or dates map to Trend or Timeline slides.
- Columns showing Regions, Countries, or Cities map to Regional Analysis slides.
- Columns showing Profit, Net Income, margins, or KPIs map to KPI/Financial slides.
- Columns containing Customer, Client, Segment data map to Customer/Market slides.
- Columns containing Expense, Cost, Spend map to Expense/Cost slides.

You must output a valid JSON object matching the following structure:
{
  "mappings": [
    {
      "slide_index": 1,
      "slide_title": "Slide Title Here",
      "relevant_columns": ["Column Name A", "Column Name B"],
      "explanation": "Brief explanation of why these columns were chosen"
    }
  ]
}
"""

class MappingAgent:
    def __init__(self, groq_service: GroqService):
        self.groq_service = groq_service

    def map_columns(self, slides_with_intents: List[Dict[str, Any]], excel_schema: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Maps Excel schema columns to slides.
        """
        if not slides_with_intents:
            return []

        # If mock mode, perform smart rule-based matching
        if self.groq_service.is_mock_mode():
            logger.info("Groq is in mock mode. Using local rule-based column mapping.")
            result_mappings = []
            columns = [col["name"] for col in excel_schema.get("columns", [])]
            col_lower = [c.lower() for c in columns]
            
            for s in slides_with_intents:
                intent = s.get("intent")
                title = s.get("slide_title", "")
                mapped = []
                
                # Rule-based column matcher
                if intent == "revenue_analysis":
                    # find revenue, sales, profit
                    for col in columns:
                        cl = col.lower()
                        if "rev" in cl or "sale" in cl or "turnover" in cl:
                            mapped.append(col)
                elif intent == "regional_analysis":
                    # find region, state, country, city
                    for col in columns:
                        cl = col.lower()
                        if "region" in cl or "state" in cl or "country" in cl or "city" in cl or "geo" in cl or "zone" in cl:
                            mapped.append(col)
                elif intent == "trends":
                    # find date, time, year, month, quarter, week
                    for col in columns:
                        cl = col.lower()
                        if "date" in cl or "year" in cl or "month" in cl or "quarter" in cl or "time" in cl:
                            mapped.append(col)
                elif intent == "kpi_dashboard" or intent == "executive_summary":
                    # find profit, margin, total, net
                    for col in columns:
                        cl = col.lower()
                        if "profit" in cl or "margin" in cl or "income" in cl or "cost" in cl or "expense" in cl or "total" in cl:
                            mapped.append(col)
                elif intent == "recommendations" or intent == "risks":
                    # map overall key numeric and categorical columns
                    for col in columns:
                        cl = col.lower()
                        if "profit" in cl or "rev" in cl or "region" in cl or "date" in cl:
                            mapped.append(col)
                
                # Fallback if nothing mapped
                if not mapped and columns:
                    # Map the first 2 columns as a default fallback
                    mapped = columns[:2]
                    
                result_mappings.append({
                    "slide_index": s["slide_index"],
                    "slide_title": title,
                    "relevant_columns": mapped,
                    "explanation": f"Automatically mapped based on slide intent '{intent}'."
                })
            return result_mappings

        # Call Groq API
        user_prompt = f"""
Slides to map:
{json.dumps(slides_with_intents, indent=2)}

Excel spreadsheet schema:
{json.dumps(excel_schema, indent=2)}
"""
        try:
            raw_response = self.groq_service.query(SYSTEM_PROMPT, user_prompt, json_mode=True)
            response_json = json.loads(raw_response)
            
            # Map index to config for fast lookup
            mapped_lookup = {item["slide_index"]: item for item in response_json.get("mappings", [])}
            
            result_mappings = []
            for s in slides_with_intents:
                idx = s["slide_index"]
                mapping_item = mapped_lookup.get(idx, {})
                result_mappings.append({
                    "slide_index": idx,
                    "slide_title": s["slide_title"],
                    "relevant_columns": mapping_item.get("relevant_columns", []),
                    "explanation": mapping_item.get("explanation", "Default mapping mapping applied.")
                })
            return result_mappings
        except Exception as e:
            logger.error(f"MappingAgent mapping failed, falling back: {e}")
            # Fallback mapping
            columns = [col["name"] for col in excel_schema.get("columns", [])]
            return [
                {
                    "slide_index": s["slide_index"],
                    "slide_title": s["slide_title"],
                    "relevant_columns": columns[:2] if columns else [],
                    "explanation": "Fallback mapping applied due to API error."
                }
                for s in slides_with_intents
            ]
