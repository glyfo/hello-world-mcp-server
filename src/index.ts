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

// Define email data interface for type safety
interface EmailData {
  subject: string;
  body: string;
  htmlBody: string;
  from: string;
  to?: string; // Made optional since we have a default
}

export default class ImageEnhancementWorker extends WorkerEntrypoint<Env> {
  /**
   * Send a simple email using Resend
   */
  async sendEmail(emailData: EmailData): Promise<Response> {
    // Default recipient if not provided
    const to = emailData.to || "alex@glyfo.com";
    
    try {
      // Validate environment
      if (!this.env?.RESEND_API_KEY) {
        return new Response(JSON.stringify({
          error: 'Configuration error',
          message: 'Resend API key not configured'
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Initialize Resend with the API key
      const resend = new Resend(this.env.RESEND_API_KEY);
      
      // Prepare email options with defaults for any missing fields
      const emailOptions = {
        from: emailData.from || "noreply@send.glyfo.com",
        to,
        subject: emailData.subject || "No Subject",
        text: emailData.body || "",
        html: emailData.htmlBody || ""
      };
      
      console.log('Sending email with options:', JSON.stringify({
        to: emailOptions.to,
        from: emailOptions.from,
        subject: emailOptions.subject,
        // Don't log full body content for privacy
        textLength: emailOptions.text.length,
        htmlLength: emailOptions.html.length
      }));
      
      // Send the email using Resend
      const { data, error } = await resend.emails.send(emailOptions);
      
      if (error) {
        console.error('Resend API error:', error);
        return new Response(JSON.stringify({ 
          success: false,
          error: error.message || 'Unknown Resend error'
        }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ 
        success: true,
        data
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error sending email with Resend:', error);
      
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Email sending failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Handle the fetch request using MCP
   */
  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request);
  }
}