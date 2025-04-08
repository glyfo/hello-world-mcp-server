import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';

// Define your environment interface
interface Env {
  AI: {
    run: (model: string, options: any) => Promise<{ image: string } | { response: string }>
  }
}

export default class MyWorker extends WorkerEntrypoint<Env> {
  /**
   * A warm, friendly greeting from your new Workers MCP server.
   * @param name {string} the name of the person we are greeting.
   * @return {string} the contents of our greeting.
   */
  sayHello(name: string): string {
    return `Hello from an MCP Worker, ${name}!`;
  }

  /**
   * Generate an image using the flux-1-schnell model.
   * @param prompt {string} A text description of the image you want to generate.
   * @param steps {number} The number of diffusion steps; higher values can improve quality but take longer.
   * @return {Promise<Response>} Response containing the generated image or error message.
   */
  async generateImage(prompt: string, steps: number = 30): Promise<Response> {
    // Make sure env.AI exists before trying to use it
    if (!this.env || !this.env.AI) {
      return new Response('AI binding not found in environment', { status: 500 });
    }
    
    try {
      // Enhance the prompt for better image quality
      const enhancedPrompt = await this.enhanceImagePrompt(prompt);
      
      // Use the enhanced prompt in the API call
      const response = await this.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: enhancedPrompt,
        steps,
      }) as { image: string };
      
      // Convert from base64 string
      const binaryString = atob(response.image);
      // Create byte representation
      const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0)!);
      
      return new Response(img, {
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });
    } catch (error: any) {
      console.error('Error generating image:', error);
      return new Response(`Error generating image: ${error.message}`, { status: 500 });
    }
  }

  /**
   * Enhance the image prompt to produce better quality images
   * @param basePrompt The user's original prompt
   * @returns Enhanced prompt with quality improvements
   */
  async enhanceImagePrompt(basePrompt: string): Promise<string> {
    const promptEnhancementSystem = `You are an expert image prompt engineer. 
Your task is to enhance image prompts for AI image generation.
Keep the original intent but add details for higher quality results.
Be concise and focused, adding at most 2-3 quality terms.
If the prompt is already detailed (>100 chars or has quality terms), keep it as is.`;

    try {
      // For very simple prompts, use the quick enhancement without AI
      if (basePrompt.trim().length < 30 && !/high resolution|detailed|professional|4K/i.test(basePrompt)) {
        return `${basePrompt.trim()}, high resolution, detailed, professional quality`;
      }
      
      // For more complex prompts, use AI to enhance them intelligently
      const { response: enhancedPrompt } = await this.env.AI.run(
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        {
          messages: [
            { role: "system", content: promptEnhancementSystem },
            { role: "user", content: `Enhance this image prompt: "${basePrompt.trim()}"` },
          ],
          stream: false,
          max_tokens: 150 // Limit token usage for efficiency
        }
      ) as { response: string };
      
      return enhancedPrompt.trim();
    } catch (error) {
      // Fallback to basic enhancement if AI enhancement fails
      console.error('Error enhancing prompt with AI:', error);
      return basePrompt.trim().length > 100 || 
             /high resolution|detailed|professional|4K/i.test(basePrompt) 
             ? basePrompt.trim() 
             : `${basePrompt.trim()}, high resolution, detailed, professional quality`;
    }
  }

  /**
   * @ignore
   */
  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request);
  }
}