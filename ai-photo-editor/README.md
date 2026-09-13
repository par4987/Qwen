# AI Photo Editor - Fullstack RAW Editor with AI Agent

A professional photo editing application with AI-powered features, similar to Lightroom but simplified. Works locally on your PC with cloud AI services for advanced processing.

## Features

### Core Editing
- **RAW Support**: Full support for all major camera brands (Canon .CR3, Nikon .NEF, Sony .ARW, Fujifilm .RAF, Olympus .ORF, Panasonic .RW2)
- **Professional Tools**: Histogram, tone curves, HSL adjustments, selective adjustments, masks
- **Transform Tools**: Crop, rotate, straighten, perspective correction
- **Non-destructive Editing**: All adjustments are stored as metadata

### AI-Powered Features
- **Smart Masks**: Automatic selection of people, animals, plants, background, landscape
- **AI Agent**: Chat-based interface to request edits in natural language
  - Example: "Highlight the bee on the flower, remove lens dirt spots, remove people in background, enhance flower colors"
- **Object Removal**: Remove unwanted objects, people, or defects
- **Enhancement**: Auto-enhance colors, lighting, and details

### Organization
- **EXIF GPS**: Extract location data from photos when available
- **Visual Recognition**: Infer location based on visual elements (beach, mountain, city)
- **Auto-tagging**: Suggest tags for easy photo organization
- **Search**: Find photos by content, tags, or location

### Privacy & Storage
- **Local-First**: Photos stay on your PC
- **Cloud AI**: Only send images to cloud when AI processing is required
- **Multiple AI Options**: Support for OpenAI GPT-4, Claude, Deepseek, Qwen, Kimi, or local models

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: TailwindCSS
- **Image Processing**: WebAssembly, WebGL, Canvas API
- **RAW Processing**: rawpy (Python backend) or libraw WASM
- **AI Integration**: REST APIs for cloud services
- **State Management**: React Context + Hooks

## Setup

### Installation

```bash
npm install
npm run dev
```

### Configuration

Create a `.env` file in the root directory:

```env
VITE_OPENAI_API_KEY=your_openai_key_here
VITE_CLAUDE_API_KEY=your_claude_key_here
VITE_REPLICATE_API_KEY=your_replicate_key_here
```

## Cost Estimates

Based on typical usage (100 photos/month with AI editing):

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| OpenAI GPT-4 | ~$5-10 | For chat agent & complex edits |
| Claude API | ~$5-10 | Alternative to GPT-4 |
| Replicate (SAM/SDXL) | ~$2-5 | For segmentation & generation |
| **Total** | **~$12-25** | Varies by usage |

## License

MIT License - Personal Project
