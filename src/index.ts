import { WorkerEntrypoint } from 'cloudflare:workers'
import { ProxyToSelf } from 'workers-mcp'

// Define your environment interface
interface Env {
  AI: {
    run: (model: string, options: any) => Promise<{ image: string }>
  }
}

export default class MyWorker extends WorkerEntrypoint<Env> {
  /**
   * A warm, friendly greeting from your new Workers MCP server.
   * @param name {string} the name of the person we are greeting.
   * @return {string} the contents of our greeting.
   */
  sayHello(name: string) {
    return `Hello from an MCP Worker, ${name}!`
  }

  /**
   * Generate an image using the Stable Diffusion inpainting model.
   * @param prompt {string} A text description of the image you want to generate.
   * @param steps {number} The number of diffusion steps; higher values can improve quality but take longer.
   */
  async generateImage(prompt: string, steps: number = 40): Promise<Response> {
    // Validate inputs
    if (!prompt) {
      return new Response('Prompt is required', { status: 400 });
    }

    // Ensure steps is within a reasonable range
    steps = Math.min(Math.max(steps, 10), 50);

    // Make sure env.AI exists before trying to use it
    if (!this.env?.AI) {
      return new Response('AI binding not found in environment', { status: 500 });
    }
    
    try {
      const response = await this.env.AI.run('@cf/runwayml/stable-diffusion-v1-5-inpainting', {
        prompt, 
        steps, 
        image: null, 
        mask: null, 
        strength: 1.0, 
        guidance: 7.5, 
      });
      
      // Validate response
      if (!response?.image) {
        throw new Error('No image generated');
      }

      // Convert from base64 string
      const binaryString = atob(response.image);
      
      // Create byte representation
      const img = Uint8Array.from(binaryString, (m) => {
        const code = m.codePointAt(0);
        if (code === undefined) {
          throw new Error('Invalid character in image data');
        }
        return code;
      });
      
      return new Response(img, {
        headers: {
          'Content-Type': 'image/png', // or 'image/jpeg' depending on output
          'Cache-Control': 'no-cache', // Prevent caching of generated images
        },
      });
    } catch (error: any) {
      console.error('Error generating image:', error);
      return new Response(`Error generating image: ${error.message}`, { 
        status: error instanceof TypeError ? 400 : 500 
      });
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request)
  }
}