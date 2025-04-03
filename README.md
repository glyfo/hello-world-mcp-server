# Workers MCP Image Generation Service & Hello World 

## Overview
This project implements a Cloudflare Worker that uses the Model Completion Protocol (MCP) to provide a simple API for image generation. The worker exposes two main endpoints:
- `sayHello`: A simple greeting function
- `generateImage`: An endpoint that leverages Cloudflare's AI capabilities to generate images using the flux-1-schnell model

## Features
- Text-to-image generation using Flux model
- Configurable diffusion steps for quality control
- Simple API interface
- Built on Cloudflare Workers platform

## Requirements
- Cloudflare Workers account
- AI binding configuration in your Cloudflare environment

## Installation
1. Clone this repository
2. Install dependencies:
```
pnpm install
```
3. Configure your wrangler.toml file with the necessary AI bindings:
```toml
[[ai_bindings]]
name = "AI"
```

## Usage
Once deployed, you can interact with the API using the following endpoints:

### Say Hello
```
POST /sayHello
{
  "name": "Your Name"
}
```

### Generate Image
```
POST /generateImage
{
  "prompt": "A detailed description of the image you want to generate",
  "steps": 30
}
```

The `steps` parameter controls the number of diffusion steps. Higher values (20-50) will produce better quality images but take longer to generate.

## Code Structure
- Uses the Workers MCP framework for handling API requests
- Implements TypeScript interfaces for environment variables
- Leverages Cloudflare's AI platform for image generation
- Converts base64 image data to binary for proper image serving

## Error Handling
The code includes error handling for:
- Missing AI binding configuration
- Failed image generation requests
- Other runtime errors

## Development
To run this project locally:
```
pnpm run dev
```

To deploy to production:
```
pnpm run deploy
```
