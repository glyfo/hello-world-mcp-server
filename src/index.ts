import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';
import { Resend } from "resend";

// Define your environment interface with proper typing
interface Env {
  AI: {
    run: (model: string, options: any) => Promise<any>
  },
  RESEND_API_KEY: string
}

export default class EmailWorker extends WorkerEntrypoint<Env> {
  /**
   * Send a simple email using Resend
   * Simplified to accept basic parameters directly
   */
  async sendEmail(params: {
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    from?: string;
  } = {}): Promise<Response> {
    try {
      // Check for API key
      if (!this.env?.RESEND_API_KEY) {
        return this.errorResponse('Resend API key not configured', 500);
      }

      // Set defaults and validate required fields
      const to = params.to || "alex@glyfo.com";
      if (!to) {
        return this.errorResponse('Recipient email is required', 400);
      }

      // Initialize Resend
      const resend = new Resend(this.env.RESEND_API_KEY);
      
      // Prepare email with defaults
      const emailOptions = {
        from: params.from || "noreply@send.glyfo.com",
        to,
        subject: params.subject || "No Subject",
        text: params.text || "",
        html: params.html || ""
      };
      
      console.log('Sending email to:', to);
      
      // Send email
      const { data, error } = await resend.emails.send(emailOptions);
      
      if (error) {
        console.error('Resend error:', error);
        return this.errorResponse(error.message || 'Email sending failed', 400);
      }
      
      return new Response(JSON.stringify({ 
        success: true,
        data
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error:', error);
      return this.errorResponse(
        error instanceof Error ? error.message : 'Unknown error', 
        500
      );
    }
  }

  // Helper method for error responses
  private errorResponse(message: string, status: number): Response {
    return new Response(JSON.stringify({
      success: false,
      error: message
    }), { 
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request);
  }
}