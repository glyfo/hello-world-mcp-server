// Make sure to export the Durable Object class as wellimport { McpAgent } from "agents/mcp";
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
  
  constructor(state: DurableObjectState, env: Bindings, ctx: ExecutionContext) {
    super(state, env, ctx);
    
    // More robust check for API key existence
    const hasResendKey = typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.trim() !== '';
    
    logger.info("MyMCP Durable Object constructed", { 
      objectId: state.id.toString(),
      hasResendKey
    });
    
    // Optional: Add validation and error handling
    if (!hasResendKey) {
      logger.warn("RESEND_API_KEY is missing or empty - email functionality may not work");
    }
  }

  async init() {
    logger.info("Initializing MyMCP server");
    
    try {
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
    } catch (error) {
      logger.error("Failed to initialize MyMCP server", error);
      throw error; // Re-throw to properly handle initialization failure
    }
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

// Add a health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
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
        <p>MCP endpoint available at <code>/sse</code>.</p>
      </body>
    </html>
  `);
});

// Mount the MCP agent at the SSE endpoint with auth check
app.all("/sse*", async (c) => {
  const env = c.env;
  const ctx = c.executionCtx;
  const req = c.req.raw;
  
  // Check authorization header
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    logger.warn("Unauthorized request rejected - missing authorization header");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    logger.info("Request authorized, mounting MCP agent");
    
    // Important: Use a stable ID for the durable object to maintain state
    // Using a static string ensures the same Durable Object instance is used for all requests
    const id = env.MCP_OBJECT.idFromName("mcp-agent-instance");
    const stub = env.MCP_OBJECT.get(id);
    
    // Create props object to pass to the Durable Object
    const props = {
      bearerToken: authHeader,
    };
    
    // Pass the request to the Durable Object with props
    return await stub.fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      // We need to use the correct property for passing props
      cf: {
        // Pass props via custom Cloudflare property
        mcpProps: props
      }
    });
  } catch (error) {
    logger.error("Failed to handle MCP request", error);
    return new Response(`Internal Server Error: ${error instanceof Error ? error.message : String(error)}`, { 
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
});

// Export the Durable Object class and app for Cloudflare Workers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    logger.info("Worker received request", { 
      url: request.url,
      method: request.method,
    });
    
    // Add CORS headers for better interoperability
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    
    // Handle OPTIONS requests (CORS preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }
    
    try {
      const response = await app.fetch(request, env, ctx);
      
      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      logger.error("Unhandled exception in worker", error);
      
      // Return a detailed error response
      return new Response(
        JSON.stringify({ 
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        }),
        { 
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
  }
};