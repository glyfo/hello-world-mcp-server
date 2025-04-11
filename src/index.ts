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
    try {
      // Extract parameters from the params object with validation
      const subject = params.subject?.trim() || '';
      const body = params.body?.trim() || '';
      const htmlBody = params.htmlBody?.trim();
      const from = params.from?.trim() || "hello@example.com";
      
      // Extra careful validation for the 'to' field
      let to = params.to;
      if (!to) {
        return new Response(JSON.stringify({ error: 'Recipient(s) cannot be empty' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Validate environment
      if (!this.env?.RESEND_API_KEY) {
        return new Response('Resend API key not configured', { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (subject.length === 0) {
        return new Response(JSON.stringify({ error: 'Subject cannot be empty' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Initialize Resend with the API key
      const resend = new Resend(this.env.RESEND_API_KEY);
      
      // Format and validate email addresses - this is key to fixing the error
      let formattedTo: string | string[];
      if (Array.isArray(to)) {
        if (to.length === 0) {
          return new Response(JSON.stringify({ error: 'Recipient(s) cannot be empty' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        formattedTo = to.map(email => email?.trim()).filter(Boolean);
      } else {
        formattedTo = to.trim();
        
        // Validate email format to prevent the 'names' error
        if (!formattedTo.includes('@') || formattedTo.split('@')[1].indexOf('.') === -1) {
          return new Response(JSON.stringify({ 
            error: 'Email sending failed',
            details: 'Invalid email format. Email must be in the format: user@domain.com'
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Prepare email options
      const emailOptions: {
        from: string;
        to: string | string[];
        subject: string;
        text?: string;
        html?: string;
      } = {
        from,
        to: formattedTo,
        subject,
      };
      
      // Add text content if provided
      if (body.length > 0) {
        emailOptions.text = body;
      }
      
      // Add HTML content if provided
      if (htmlBody && htmlBody.length > 0) {
        emailOptions.html = htmlBody;
      }
      
      // Debug logs to identify issues
      console.log('Sending email with options:', JSON.stringify({
        ...emailOptions,
        // Redact any sensitive data like API keys
        resendApiKeyPresent: !!this.env.RESEND_API_KEY
      }));
      
      // Send the email using Resend
      const result = await resend.emails.send(emailOptions);
      
      // Check for errors in the Resend response
      if (result.error) {
        console.error('Resend API error:', result.error);
        throw new Error(result.error.message || 'Unknown Resend error');
      }
      
      // Return success response
      return new Response(JSON.stringify({ 
        success: true,
        data: result.data
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error sending email with Resend:', error);
      
      // Structured error response with more detailed information
      return new Response(JSON.stringify({ 
        error: 'Email sending failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
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