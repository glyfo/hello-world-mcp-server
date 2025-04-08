import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';

// Define your environment interface with proper typing
interface Env {
  AI: {
    run: (model: string, options: any) => Promise<any>
  }
}

export default class ImageEnhancementWorker extends WorkerEntrypoint<Env> {

  /**
   * Generate an image using the flux-1-schnell model.
   * @param prompt {string} A text description of the image you want to generate.
   * @param steps {number} The number of diffusion steps; higher values can improve quality but take longer.
   * @returns {Promise<Response>} Response containing the generated image or an error
   */
  async generateImage(prompt: string, steps: number = 30): Promise<Response> {
    // Validate environment and input parameters
    if (!this.env?.AI) {
      return new Response('AI binding not configured', { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!prompt || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Prompt cannot be empty' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    try {
      // Enhance the prompt for better image quality
      const enhancedPrompt = await this.enhancePrompt(prompt);
      
      // Use the enhanced prompt in the API call
      const response = await this.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: enhancedPrompt,
        steps: Math.min(Math.max(1, steps), 100), // Ensure steps is between 1 and 100
      });
      
      // Handle missing image in response
      if (!response.image) {
        throw new Error('No image data in response');
      }
      
      // Convert from base64 string to binary for response
      const binaryString = atob(response.image);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return new Response(bytes, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        },
      });
    } catch (error) {
      console.error('Error generating image:', error);
      
      // Structured error response
      return new Response(JSON.stringify({ 
        error: 'Image generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Enhance the  prompt to produce better prompt quality 
   * @param basePrompt {string} The user's original prompt
   * @returns {Promise<string>} Enhanced prompt with quality improvements
   */
  async enhancePrompt(basePrompt: string): Promise<string> {
    const systemPrompt = `You are an expert image prompt engineer specializing in photorealistic detail. 
    Your task is to enhance image prompts for AI image generation with 150 character as a minimum.
    Include specific photorealistic details like texture, lighting conditions, perspective, depth of field, and atmospheric elements.
    Specify high-resolution rendering terms (8K, hyperdetailed), professional photography techniques (RAW, sharp focus), and realistic lighting (volumetric, golden hour, studio lighting).
    Keep the original intent but strategically add quality-enhancing elements.`;

    
    const sanitizedPrompt = basePrompt.trim();
    
    try {
  
      
      // For medium complexity prompts, use AI to enhance them intelligently
      const response = await this.env.AI.run(
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Enhance this image prompt: "${sanitizedPrompt}"` },
          ],
          stream: false,
          max_tokens: 150 // Limit token usage for efficiency
        }
      );
      
      return response.response && response.response.trim() || sanitizedPrompt;
    } catch (error) {
      // Log error details for debugging
      console.error('Error enhancing prompt with AI:', error);
    }
  }

  /**
   * @ignore
   */
  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request)
  }
}