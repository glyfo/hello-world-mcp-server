# AI-Powered Image Generation Worker

## Overview

This project implements a Cloudflare Worker that uses advanced AI models to provide enhanced image generation capabilities. The worker leverages the Model Completion Protocol (MCP) and exposes a sophisticated image generation API that combines two AI models to produce high-quality results.

## Key Features

- **Intelligent Prompt Enhancement**: Automatically improves user prompts using LLaMA 4 to optimize image generation results
- **Text-to-Image Generation**: Creates images using the flux-1-schnell model from Black Forest Labs
- **Quality Control**: Configurable diffusion steps parameter (1-100) for balancing quality and generation speed
- **Error Handling**: Comprehensive validation and error reporting
- **Optimized Delivery**: Proper image format handling with caching for performance

## How It Works

1. The user submits a text prompt describing the desired image
2. The worker enhances the prompt using LLaMA 4 to add photorealistic details
3. The enhanced prompt is sent to the flux-1-schnell model to generate the image
4. The result is converted to proper binary format and returned with appropriate headers

## Requirements

- Cloudflare Workers account
- AI binding configuration in your Cloudflare environment

## Installation

1. Clone this repository
2. Install dependencies:

```bash
pnpm install
```
