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
   * Generate an image using the flux-1-schnell model.
   * @param prompt {string} A text description of the image you want to generate.
   * @param steps {number} The number of diffusion steps; higher values can improve quality but take longer.
   */
  async generateImage(prompt: string, steps: number): Promise<Response> {
    // Make sure env.AI exists before trying to use it
    if (!this.env || !this.env.AI) {
      return new Response('AI binding not found in environment', { status: 500 });
    }
    
    try {
      const response = await this.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt,
        steps,
      });
      
      // Convert from base64 string
      const binaryString = atob(response.image);
      // Create byte representation
      const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0)!);
      
      return new Response(img, {
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });
    } catch (error:any) {
      console.error('Error generating image:', error);
      return new Response(`Error generating image: ${error.message}`, { status: 500 });
    }
  }

  /**
   * @ignore
   */
  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request)
  }
}
