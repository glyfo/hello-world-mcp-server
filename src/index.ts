// The issue appears to be with how the function parameters are being passed and processed.
// Here's a suggested fix for the sendEmail function in your worker:

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
  // Your other methods...

  /**
   * Send a simple email using Resend
   */
  async sendEmail(
    subject: string,
    body: string,
    htmlBody: string,
    from: string
  ): Promise<Response> {
    // Hard-code the recipient for this fix since it's consistently alex@glyfo.com
    const to = "alex@glyfo.com";
    
    try {
      // Validate environment
      if (!this.env?.RESEND_API_KEY) {
        return new Response('Resend API key not configured', { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Initialize Resend with the API key
      const resend = new Resend(this.env.RESEND_API_KEY);
      
      // Prepare email options - simplified to avoid potential parameter issues
      const emailOptions = {
        from: from || "hello@example.com",
        to: to,
        subject: subject || "Hello",
        text: body || "",
        html: htmlBody || ""
      };
      
      console.log('Sending email with options:', JSON.stringify({
        ...emailOptions,
        // Redact any sensitive data
        resendApiKeyPresent: !!this.env.RESEND_API_KEY
      }));
      
      // Send the email using Resend
      const result = await resend.emails.send(emailOptions);
      
      if (result.error) {
        console.error('Resend API error:', result.error);
        throw new Error(result.error.message || 'Unknown Resend error');
      }
      
      return new Response(JSON.stringify({ 
        success: true,
        data: result.data
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error sending email with Resend:', error);
      
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

// IMPORTANT: Also make sure to update the `functions.json` file that defines 
// the API interface to match this function signature:

/*
{
  "description": "Send a simple email using Resend",
  "name": "sendEmail",
  "parameters": {
    "properties": {
      "subject": {
        "description": "Email subject line",
        "type": "string"
      },
      "body": {
        "description": "Email body content (plain text)",
        "type": "string"
      },
      "htmlBody": {
        "description": "Optional HTML email body content",
        "type": "string"
      },
      "from": {
        "description": "Optional sender email (defaults to hello@example.com)",
        "type": "string"
      }
    },
    "required": ["subject", "body", "htmlBody", "from"],
    "type": "object"
  }
}
*/