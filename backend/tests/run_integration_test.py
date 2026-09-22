import os
import sys
import json

# Add parent directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.parsers.ppt_parser import parse_ppt_file
from backend.parsers.excel_parser import parse_excel_file
from backend.services.groq_service import GroqService
from backend.agents.intent_agent import IntentAgent
from backend.agents.mapping_agent import MappingAgent
from backend.agents.insight_agent import InsightAgent
from backend.agents.chart_agent import ChartAgent
from backend.generators.ppt_generator import generate_presentation

def test_integration():
    print("--- Starting Pipeline Integration Test ---")
    
    # 1. Parsing PowerPoint
    print("\n1. Parsing PPTX template...")
    ppt_info = parse_ppt_file("test_assets/template.pptx")
    print(f"Parsed {len(ppt_info['slides'])} slides.")
    for s in ppt_info['slides']:
        print(f"  - Slide {s['index']}: Layout: {s['layout_name']}, Title: '{s['title']}'")
        
    # 2. Parsing Excel
    print("\n2. Parsing Excel dataset...")
    excel_info = parse_excel_file("test_assets/data.xlsx")
    print(f"Parsed {excel_info['row_count']} rows and {len(excel_info['columns'])} columns.")
    for c in excel_info['columns']:
        print(f"  - Column '{c['name']}' ({c['type']})")
        
    # 3. Running Intent Agent
    print("\n3. Classifying slide intents using mock AI mode...")
    groq_service = GroqService()  # Mock mode since GROQ_API_KEY is not set
    intent_agent = IntentAgent(groq_service)
    slides_with_intents = intent_agent.determine_intents(ppt_info["slides"])
    for s in slides_with_intents:
        print(f"  - Slide {s['slide_index']}: '{s['slide_title']}' classified as intent '{s['intent']}'")
        
    # 4. Running Mapping Agent
    print("\n4. Mapping Excel columns to slides...")
    mapping_agent = MappingAgent(groq_service)
    slides_with_mappings = mapping_agent.map_columns(slides_with_intents, excel_info)
    for s in slides_with_mappings:
        print(f"  - Slide {s['slide_index']}: mapped columns: {s['relevant_columns']}")
        
    # 5. Running Insight Agent
    print("\n5. Generating business insights...")
    insight_agent = InsightAgent(groq_service)
    slides_with_insights = insight_agent.generate_insights(slides_with_mappings, excel_info)
    for s in slides_with_insights:
        print(f"  - Slide {s['slide_index']}: title: '{s['insights']['title']}'")
        print(f"    Bullets: {s['insights']['bullets']}")
        print(f"    Recommendations: {s['insights']['recommendations']}")
        
    # 6. Running Chart Agent
    print("\n6. Selecting chart configurations...")
    chart_agent = ChartAgent(groq_service)
    slides_with_charts = chart_agent.determine_charts(slides_with_insights, excel_info)
    for s in slides_with_charts:
        print(f"  - Slide {s['slide_index']}: Chart: {s['chart']}")
        
    # 7. Running PowerPoint compilation
    print("\n7. Compiling final PowerPoint presentation...")
    output_path = "test_assets/output.pptx"
    result_path = generate_presentation(
        template_path="test_assets/template.pptx",
        output_path=output_path,
        dataset_path="test_assets/data.xlsx",
        slides_config=slides_with_charts
    )
    
    if os.path.exists(result_path):
        print(f"\nSuccess! Presentation successfully saved to: {result_path}")
        print(f"Size: {os.path.getsize(result_path)} bytes.")
    else:
        print("\nFailed! Final presentation file was not written.")
        sys.exit(1)
        
    print("\n--- Integration Test Completed Successfully ---")

if __name__ == "__main__":
    test_integration()
