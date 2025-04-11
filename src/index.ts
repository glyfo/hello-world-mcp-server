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

export default class ImageEnhancementWorker extends WorkerEntrypoint<Env> {

  // Other methods remain unchanged...

  /**
   * Send a simple email using Resend
   * @param params Object containing email parameters
   * @returns {Promise<Response>} Response containing the email send status
   */
  async sendEmail(params: {
    to: string | string[],
    subject: string,
    body: string,
    htmlBody?: string,
    from?: string
  }): Promise<Response> {
    // Extract parameters from the params object
    const { to, subject, body, htmlBody, from = "hello@example.com" } = params;
    
    // Validate environment and input parameters
    if (!this.env?.RESEND_API_KEY) {
      return new Response('Resend API key not configured', { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return new Response(JSON.stringify({ error: 'Recipient(s) cannot be empty' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!subject || subject.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Subject cannot be empty' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    try {
      // Initialize Resend with the API key
      const resend = new Resend(this.env.RESEND_API_KEY);
      
      // Ensure the email is correctly formatted
      const formattedTo = Array.isArray(to) 
        ? to.map(email => email.trim()) 
        : to.trim();
      
      // Prepare email options
      const emailOptions: {
        from: string;
        to: string | string[];
        subject: string;
        text?: string;
        html?: string;
      } = {
        from: from.trim(),
        to: formattedTo,
        subject: subject.trim(),
      };
      
      // Add text content if provided
      if (body && body.trim().length > 0) {
        emailOptions.text = body.trim();
      }
      
      // Add HTML content if provided (prioritize this over plain text if both are given)
      if (htmlBody && htmlBody.trim().length > 0) {
        emailOptions.html = htmlBody.trim();
      }
      
      // Send the email using Resend
      const { data, error } = await resend.emails.send(emailOptions);
      
      // Handle error from Resend
      if (error) {
        throw new Error(error.message || 'Unknown Resend error');
      }
      
      // Return success response
      return new Response(JSON.stringify({ 
        success: true,
        data: data
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error sending email with Resend:', error);
      
      // Structured error response
      return new Response(JSON.stringify({ 
        error: 'Email sending failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * @ignore
   */
  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request);
  }
}