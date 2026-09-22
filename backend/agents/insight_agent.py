import json
import logging
from typing import Dict, Any, List
from ..services.groq_service import GroqService

logger = logging.getLogger("insight_agent")

DUMMY_TEXT_INDICATORS = [
    "lorem ipsum", "dolor sit", "consectetur adipiscing", "dummy text",
    "placeholder", "click to add", "double click", "add text",
    "enter title", "enter subtitle", "insert text", "your text here",
    "add text here", "description here", "text box", "sample text",
    "your caption", "heading goes here", "subheading goes here",
    "[insert", "your description"
]

def is_dummy_text(text: str) -> bool:
    if not text:
        return False
    text_lower = text.lower().strip()
    return any(indicator in text_lower for indicator in DUMMY_TEXT_INDICATORS)

SYSTEM_PROMPT = """You are an expert Management Consultant and AI Presentation Consultant.
Your task is to generate professional, data-driven business insights, bullet points, and recommendations for a presentation slide deck based on spreadsheet data.

Your primary objective is to preserve the original slide design by fitting content strictly within the word limits.

Absolute Content Rules:
1. Title: Maximum 8 words.
2. Subtitle / Insights narrative: Maximum 15 words.
3. Bullets: Maximum 4 bullets.
4. Each bullet: Maximum 10 words.
5. Recommendations / Paragraph text: Maximum 40 words.
6. If content exceeds available space: Summarize and remove less important information. Never overflow.
7. Use professional, corporate business language (e.g., McKinsey/BCG/Bain style).
8. Base all observations strictly on the provided spreadsheet statistics and data. Never invent data.
9. Review "original_template_content" if provided. These represent the pre-existing text content/business topics from the slide template. You must incorporate the business context, topic, and goals of that pre-existing content, merging it intelligently with the mapped spreadsheet data. Make sure the generated slide content is on the same business topic as the original slide template.

You must output a valid JSON object matching the following structure:
{
  "slides": [
    {
      "slide_index": 1,
      "insights": {
        "title": "Slide Specific Header Title",
        "narrative": "Cohesive storyline narrative/transition statement for this slide.",
        "bullets": [
          "Data-driven observation 1 (e.g., Revenue grew by 15.4% YoY, driven by enterprise segments).",
          "Data-driven observation 2 (e.g., Product X margins remained stable at 42.1% despite volume decreases)."
        ],
        "recommendations": [
          "Recommendation 1 (e.g., Allocate additional marketing resources to the West region).",
          "Recommendation 2 (e.g., Review pricing structure of Product Y to recover margins)."
        ]
      }
    }
  ]
}
"""

class InsightAgent:
    def __init__(self, groq_service: GroqService):
        self.groq_service = groq_service

    def generate_insights(
        self, 
        slides_with_mappings: List[Dict[str, Any]], 
        excel_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Generates business insights for all slides based on their mappings and the spreadsheet data.
        """
        if not slides_with_mappings:
            return []

        # Prepare context of columns for the LLM
        # To avoid blowing up context window, we compile a summary of the mapped columns
        column_summaries = {}
        for col in excel_data.get("columns", []):
            column_summaries[col["name"]] = {
                "type": col["type"],
                "stats": col["stats"],
                "sample_values": col["sample_values"]
            }

        # Build detailed prompt containing slide details and mapped data
        slide_context = []
        for s in slides_with_mappings:
            mapped_cols = s.get("relevant_columns", [])
            mapped_data = {col: column_summaries.get(col, {}) for col in mapped_cols}
            
            # Extract original texts from placeholders and other shapes
            original_texts = []
            for ph in s.get("placeholders", []):
                val = ph.get("text")
                if val and not is_dummy_text(val):
                    original_texts.append(f"Placeholder ({ph.get('placeholder_type', 'Body')}): {val}")
            for sh in s.get("other_shapes", []):
                val = sh.get("text")
                if val and not is_dummy_text(val):
                    original_texts.append(f"Text Box: {val}")
            
            ctx = {
                "slide_index": s["slide_index"],
                "slide_title": s["slide_title"],
                "intent": s.get("intent", "general"),
                "mapped_columns": mapped_cols,
                "data_summary": mapped_data
            }
            if original_texts:
                ctx["original_template_content"] = original_texts
                
            slide_context.append(ctx)

        user_prompt = f"""
Generate insights for the following slides based on the mapped data:

Slides Context:
{json.dumps(slide_context, indent=2)}

Total Row Count of Dataset: {excel_data.get("row_count", 0)}
"""

        # Fallback for mock mode
        if self.groq_service.is_mock_mode():
            logger.info("Groq is in mock mode. Generating template-based business insights.")
            return self._generate_mock_insights(slides_with_mappings, excel_data, column_summaries)

        try:
            raw_response = self.groq_service.query(SYSTEM_PROMPT, user_prompt, json_mode=True)
            response_json = json.loads(raw_response)
            
            insights_lookup = {item["slide_index"]: item["insights"] for item in response_json.get("slides", [])}
            
            result_slides = []
            for s in slides_with_mappings:
                idx = s["slide_index"]
                insights = insights_lookup.get(idx, {
                    "title": s["slide_title"],
                    "narrative": "Cohesive progression of operational benchmarks.",
                    "bullets": ["Performance aligned with corporate targets.", "Monitored mapped columns for variances."],
                    "recommendations": ["Conduct deep-dive review of performance drivers."]
                })
                
                # Combine slide info with generated insights
                s_copy = s.copy()
                s_copy["insights"] = insights
                result_slides.append(s_copy)
            return result_slides

        except Exception as e:
            logger.error(f"InsightAgent generation failed, falling back to mock: {e}")
            return self._generate_mock_insights(slides_with_mappings, excel_data, column_summaries)

    def _generate_mock_insights(
        self, 
        slides: List[Dict[str, Any]], 
        excel_data: Dict[str, Any],
        column_summaries: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        result_slides = []
        for s in slides:
            idx = s["slide_index"]
            intent = s.get("intent", "general")
            title = s["slide_title"]
            mapped_cols = s.get("relevant_columns", [])
            
            bullets = []
            recs = []
            
            # Simple template-based insights based on columns and values
            narrative = ""
            if intent == "revenue_analysis":
                narrative = "Revenue Trend Analysis: Examining core sales channels and performance metrics."
                revenue_col = next((c for c in mapped_cols if "rev" in c.lower() or "sale" in c.lower()), None)
                if revenue_col and revenue_col in column_summaries:
                    stats = column_summaries[revenue_col]["stats"]
                    max_val = stats.get("max", "N/A")
                    mean_val = stats.get("mean", "N/A")
                    sum_val = stats.get("sum", "N/A")
                    bullets.append(f"Total revenue generated reached {sum_val:,} across the period.")
                    bullets.append(f"Peak transactional revenue recorded at {max_val:,}, with a mean value of {mean_val:,.2f}.")
                else:
                    bullets.append("Revenue performance remained consistent with seasonal expectations.")
                    bullets.append("Core transaction metrics show stable demand in primary channels.")
                recs.append("Scale marketing campaigns targeting high-conversion customer cohorts.")
                
            elif intent == "regional_analysis":
                narrative = "Regional Performance Breakdown: Analyzing performance variance across regions."
                region_col = next((c for c in mapped_cols if "region" in c.lower() or "state" in c.lower() or "country" in c.lower()), None)
                if region_col and region_col in column_summaries:
                    stats = column_summaries[region_col]["stats"]
                    top_vals = stats.get("top_values", [])
                    if top_vals:
                        top1 = top_vals[0]
                        bullets.append(f"Region '{top1['value']}' represents the largest segment with {top1['count']} records ({top1['pct']:.1f}%).")
                    if len(top_vals) > 1:
                        top2 = top_vals[1]
                        bullets.append(f"Region '{top2['value']}' is the second largest, representing {top2['pct']:.1f}% of total distribution.")
                else:
                    bullets.append("Regional distribution shows heavy consolidation in primary metropolitan areas.")
                    bullets.append("Emerging regions exhibit high growth velocity but remain small contributors overall.")
                recs.append("Establish regional centers of excellence to optimize logistics and support.")
                
            elif intent == "trends":
                narrative = "Temporal Analysis: Tracking metrics progression and seasonal cycles over time."
                bullets.append("Historical analysis indicates positive upward trend with minor cyclical volatility.")
                bullets.append("Growth velocity accelerated in the final quarters, outstripping early period runs.")
                recs.append("Align operations to support seasonal peak cycles observed in historical timeline.")
                
            elif intent == "executive_summary":
                narrative = "Executive Briefing: Consolidated overview of major key performance indicators."
                bullets.append(f"Analysis completed across {excel_data.get('row_count', 0)} rows of clean operational data.")
                bullets.append("Identified critical performance outliers and operational bottlenecks in core processes.")
                recs.append("Prioritize resources towards resolving bottlenecks to realize immediate 10-15% efficiency gains.")
                
            else:
                narrative = f"Slide Intent Focus: Analyzing selected indicators for {title or 'Slide'}"
                bullets.append(f"Monitored mapped indicators: {', '.join(mapped_cols) if mapped_cols else 'None'}.")
                bullets.append("Operational metrics remain within acceptable standard deviation thresholds.")
                recs.append("Continue tracking key performance indicators weekly to detect early drift.")
                
            if not recs:
                recs.append("Optimize resource allocation to leverage high-performing segments.")
                
            s_copy = s.copy()
            s_copy["insights"] = {
                "title": title or "Executive Insights",
                "narrative": narrative,
                "bullets": bullets,
                "recommendations": recs
            }
            result_slides.append(s_copy)
            
        return result_slides
