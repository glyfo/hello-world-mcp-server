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
      // Log environment variables to debug
      console.log('Environment keys:', Object.keys(this.env || {}));
      
      // Check for API key with more detailed logging
      if (!this.env?.RESEND_API_KEY) {
        console.error('API key missing in environment');
        return this.errorResponse('Resend API key not configured', 500);
      }
      
      console.log('API key found, length:', this.env.RESEND_API_KEY.length);

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
      
      console.log('Sending email with options:', JSON.stringify({
        ...emailOptions,
        apiKeyPresent: !!this.env.RESEND_API_KEY
      }));
      
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
      console.error('Error sending email:', error);
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