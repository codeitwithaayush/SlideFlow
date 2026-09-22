# System Architecture

User Upload
    ↓
PPT Parser
    ↓
Excel Parser
    ↓
Slide Intent Agent
    ↓
Column Mapping Agent
    ↓
Insight Agent
    ↓
Chart Agent
    ↓
PPT Generator
    ↓
Download

---

## Components

### PPT Parser

Responsible for:
- Reading slide titles
- Reading placeholders
- Detecting layouts

### Excel Parser

Responsible for:
- Column extraction
- Data typing
- Statistics generation

### Intent Agent

Determines:
- Slide purpose
- Content type

### Mapping Agent

Matches:
- Columns
- Metrics
- Tables

### Insight Agent

Generates:
- Business observations
- Summaries

### Chart Agent

Generates:
- Chart type
- Data mapping

### PPT Generator

Uses python-pptx to fill slides.