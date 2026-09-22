import json
import logging
from typing import Dict, Any, List
from ..services.groq_service import GroqService

logger = logging.getLogger("intent_agent")

SYSTEM_PROMPT = """You are an AI Presentation Consultant.
Your responsibility is to analyze presentation slide decks and classify each slide's purpose (intent).

Available slide intents (taxonomies) are:
- executive_summary: High-level findings, general overview, summary metrics.
- revenue_analysis: Revenue performance, sales figures, monetary metrics.
- regional_analysis: Geographic comparisons, regional breakdowns.
- trends: Time-based analysis, performance over days/months/years.
- risks: Drawbacks, concerns, challenges, bottlenecks.
- recommendations: Suggested actions, strategic roadmap, next steps.
- kpi_dashboard: Core operational numbers, dashboard KPIs.
- general: Any slide that doesn't fit the above categories.

You must output a valid JSON object matching the following structure:
{
  "slides": [
    {
      "slide_index": 1,
      "slide_title": "Slide Title Here",
      "intent": "executive_summary"
    }
  ]
}
"""

class IntentAgent:
    def __init__(self, groq_service: GroqService):
        self.groq_service = groq_service

    def determine_intents(self, slides: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyzes the list of parsed slides and returns the classified intent for each slide.
        """
        if not slides:
            return []

        # Build user prompt
        user_data = []
        for s in slides:
            user_data.append({
                "index": s["index"],
                "title": s["title"],
                "layout_name": s["layout_name"],
                "placeholders": [
                    {"idx": p.get("placeholder_idx"), "type": p.get("placeholder_type"), "text": p.get("text")}
                    for p in s.get("placeholders", [])
                ]
            })

        user_prompt = f"Please classify the following slides:\n{json.dumps(user_data, indent=2)}"
        
        # If in mock mode, generate smart fallback responses
        if self.groq_service.is_mock_mode():
            logger.info("Groq is in mock mode. Using local rule-based intent classification.")
            result_slides = []
            for s in slides:
                title_lower = (s.get("title") or "").lower()
                layout_lower = (s.get("layout_name") or "").lower()
                
                # Rule-based intent detection
                if "summary" in title_lower or "executive" in title_lower:
                    intent = "executive_summary"
                elif "revenue" in title_lower or "sales" in title_lower or "financial" in title_lower or "revenue" in layout_lower:
                    intent = "revenue_analysis"
                elif "region" in title_lower or "geography" in title_lower or "territory" in title_lower:
                    intent = "regional_analysis"
                elif "trend" in title_lower or "timeline" in title_lower or "growth" in title_lower or "history" in title_lower:
                    intent = "trends"
                elif "risk" in title_lower or "challenge" in title_lower or "threat" in title_lower:
                    intent = "risks"
                elif "recommend" in title_lower or "action" in title_lower or "strategy" in title_lower or "next steps" in title_lower:
                    intent = "recommendations"
                elif "kpi" in title_lower or "dashboard" in title_lower or "metrics" in title_lower:
                    intent = "kpi_dashboard"
                else:
                    intent = "general"
                
                s_copy = s.copy()
                s_copy["slide_index"] = s["index"]
                s_copy["slide_title"] = s["title"] or f"Slide {s['index']}"
                s_copy["intent"] = intent
                result_slides.append(s_copy)
            return result_slides

        try:
            raw_response = self.groq_service.query(SYSTEM_PROMPT, user_prompt, json_mode=True)
            response_json = json.loads(raw_response)
            
            # Map back to ensure formatting aligns with input slides
            classified = {item["slide_index"]: item["intent"] for item in response_json.get("slides", [])}
            
            result_slides = []
            for s in slides:
                idx = s["index"]
                intent = classified.get(idx, "general")
                s_copy = s.copy()
                s_copy["slide_index"] = idx
                s_copy["slide_title"] = s["title"] or f"Slide {idx}"
                s_copy["intent"] = intent
                result_slides.append(s_copy)
            return result_slides
        except Exception as e:
            logger.error(f"IntentAgent classification failed, falling back to general: {e}")
            fallback_slides = []
            for s in slides:
                s_copy = s.copy()
                s_copy["slide_index"] = s["index"]
                s_copy["slide_title"] = s["title"] or f"Slide {s['index']}"
                s_copy["intent"] = "general"
                fallback_slides.append(s_copy)
            return fallback_slides
