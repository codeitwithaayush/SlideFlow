import os
import json
import logging
from groq import Groq
from ..config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger("groq_service")

class GroqService:
    def __init__(self):
        self.api_key = GROQ_API_KEY
        if not self.api_key:
            logger.warning("GROQ_API_KEY is not set. System will run in MOCK mode.")
            self.client = None
        else:
            self.client = Groq(api_key=self.api_key)

    def is_mock_mode(self) -> bool:
        return self.client is None

    def query(self, system_prompt: str, user_prompt: str, json_mode: bool = True) -> str:
        """Queries Groq API, with mock fallback if API key is not configured."""
        if self.is_mock_mode():
            logger.info("Running query in mock mode.")
            return self._generate_mock_response(system_prompt, user_prompt)

        try:
            response_format = {"type": "json_object"} if json_mode else None
            
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=GROQ_MODEL,
                response_format=response_format,
                temperature=0.2
            )
            return chat_completion.choices[0].message.content
        except Exception as e:
            logger.error(f"Groq API query failed: {e}")
            raise RuntimeError(f"Groq service error: {e}")

    def _generate_mock_response(self, system_prompt: str, user_prompt: str) -> str:
        """Generates smart mocked response data based on prompts when API key is missing."""
        lower_system = system_prompt.lower()
        lower_user = user_prompt.lower()
        
        # 1. Intent mapping mock
        if "intent" in lower_system or "classify" in lower_system:
            # Check user prompt for slide details
            mock_data = {"slides": []}
            try:
                # Basic parsing to see slide details from user prompt
                # If we find slides in the prompt, try to output intents
                if "revenue" in lower_user:
                    mock_data["slides"].append({
                        "slide_index": 1,
                        "slide_title": "Revenue Analysis",
                        "intent": "revenue_analysis"
                    })
                else:
                    mock_data["slides"].append({
                        "slide_index": 1,
                        "slide_title": "Executive Summary",
                        "intent": "executive_summary"
                    })
            except Exception:
                pass
            return json.dumps(mock_data)
            
        # 2. Column mapping mock
        elif "mapping" in lower_system or "map columns" in lower_system:
            mock_data = {"mappings": []}
            return json.dumps(mock_data)
            
        # 3. Insights mock
        elif "insight" in lower_system or "consultant" in lower_system:
            mock_data = {
                "insights": {
                    "bullets": [
                        "Performance increased compared to the previous period.",
                        "Identified growth opportunities in core product areas.",
                        "Recommend optimizing cost structure to increase operating margin."
                    ],
                    "recommendations": [
                        "Reallocate budget to higher yielding marketing channels.",
                        "Consolidate redundant cloud systems to save 12% in administrative costs."
                    ]
                }
            }
            return json.dumps(mock_data)
            
        # 4. Chart mock
        elif "chart" in lower_system:
            mock_data = {
                "chart": {
                    "type": "bar",
                    "x_axis": "Category",
                    "y_axis": "Value"
                }
            }
            return json.dumps(mock_data)
            
        return "{}"
