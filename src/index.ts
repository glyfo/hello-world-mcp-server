import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";
import { Resend } from "resend";

// Environment interface with necessary bindings
export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  AI: any; // AI binding from your wrangler.toml
  RESEND_API_KEY: string;
}

type Bindings = Env & {
  RESEND_API_KEY: string;
};

// Props passed to the Durable Object
type Props = {
  bearerToken: string;
};

// State maintained by the Durable Object
type State = null;

// Logger utility for consistent logging
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error instanceof Error ? error.stack : JSON.stringify(error));
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${message}`, data ? JSON.stringify(data) : '');
  },
  debug: (message: string, data?: any) => {
    console.debug(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  }
};

// Define the Durable Object class that will handle MCP functionality
export class MyMCP extends McpAgent<Bindings, State, Props> {
  server = new McpServer({
    name: "Demo",
    version: "1.0.0",
  });
  
  // This constructor is required for Durable Objects
  constructor(state: DurableObjectState, env: Bindings, ctx: ExecutionContext) {
    super(state, env, ctx);
    logger.info("MyMCP Durable Object constructed", { 
      objectId: state.id.toString(),
      hasResendKey: !!env.RESEND_API_KEY
    });
  }

  async init() {
    logger.info("Initializing MyMCP server");
    
    // Email sending tool only
    this.server.tool(
      "sendEmail", 
      {
        to: z.string().email(),
        subject: z.string(),
        body: z.string()
      }, 
      async ({ to, subject, body }) => {
        logger.info("sendEmail tool called", { to, subject, bodyLength: body.length });
        
        try {
          // Create Resend instance
          const resend = new Resend(this.env.RESEND_API_KEY);
          logger.debug("Resend instance created");
          
          // Send the email
          logger.info("Attempting to send email", { to, from: "noreply@send.glyfo.com" });
          const startTime = Date.now();
          
          const { data, error } = await resend.emails.send({
            from: "noreply@send.glyfo.com",
            to,
            subject,
            text: body,
          });
          
          const duration = Date.now() - startTime;
          logger.info(`Email API call completed in ${duration}ms`);
          
          if (error) {
            logger.error("Email sending failed", error);
            return {
              content: [{ type: "text", text: `Failed to send email: ${error.message}` }],
            };
          }
          
          // Fix: Add null check for data before accessing data.id
          if (!data) {
            logger.warn("Email sent but no ID was returned");
            return {
              content: [{ type: "text", text: `Email sent but no ID was returned` }],
            };
          }
          
          logger.info("Email sent successfully", { emailId: data.id });
          return {
            content: [{ type: "text", text: `Email sent successfully! Email ID: ${data.id}` }],
          };
        } catch (err) {
          logger.error("Exception during email sending", err);
          return {
            content: [{ type: "text", text: `Error sending email: ${err instanceof Error ? err.message : String(err)}` }],
          };
        }
      }
    );
    
    logger.info("MyMCP server initialization complete");
  }
  
  // Override the fetch method to add request logging
  async fetch(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    
    logger.info(`Handling request ${requestId}`, {
      method: request.method,
      path: url.pathname,
      searchParams: Object.fromEntries(url.searchParams.entries()),
      headers: Object.fromEntries(
        Array.from(request.headers.entries())
          .filter(([key]) => !key.toLowerCase().includes('authorization')) // Don't log auth headers
      )
    });
    
    const startTime = Date.now();
    
    try {
      const response = await super.fetch(request);
      
      const duration = Date.now() - startTime;
      logger.info(`Request ${requestId} completed in ${duration}ms`, {
        status: response.status,
        statusText: response.statusText,
      });
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Request ${requestId} failed after ${duration}ms`, error);
      throw error;
    }
  }
}

// Create Hono app for handling HTTP requests
const app = new Hono<{
  Bindings: Bindings;
}>();

// Add middleware for request logging
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info(`HTTP Request ${requestId} started`, {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('user-agent'),
    contentType: c.req.header('content-type'),
  });
  
  await next();
  
  const duration = Date.now() - startTime;
  logger.info(`HTTP Request ${requestId} completed in ${duration}ms`, {
    status: c.res.status,
  });
});

// Render a basic homepage placeholder
app.get("/", async (c) => {
  logger.info("Serving homepage");
  return c.html(`
    <html>
      <head>
        <title>MCP Email Demo - Home</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
          h1 { color: #333; }
        </style>
      </head>
      <body>
        <h1>MCP Email Demo</h1>
        <p>Server is up and running.</p>
      </body>
    </html>
  `);
});

// Mount the MCP agent at the SSE endpoint with auth check
app.mount("/", (req, env, ctx) => {
  // Check authorization header
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    logger.warn("Unauthorized request rejected - missing authorization header");
    return new Response("Unauthorized", { status: 401 });
  }

  logger.info("Request authorized, mounting MCP agent");
  ctx.props = {
    bearerToken: authHeader,
  };

  return MyMCP.mount("/sse").fetch(req, env, ctx);
});

// Export the Durable Object class and app for Cloudflare Workers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    logger.info("Worker received request", { 
      url: request.url,
      method: request.method,
    });
    
    try {
      return await app.fetch(request, env, ctx);
    } catch (error) {
      logger.error("Unhandled exception in worker", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};