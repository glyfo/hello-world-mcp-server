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

// Define the Durable Object class that will handle MCP functionality
export class MyMCP extends McpAgent<Bindings, State, Props> {
  server = new McpServer({
    name: "Demo",
    version: "1.0.0",
  });
  
  // This constructor is required for Durable Objects
  constructor(state: DurableObjectState, env: Bindings, ctx: ExecutionContext) {
    super(state, env, ctx);
    
    // Initialize your state if needed
    // this.state will be available from McpAgent
  }

  async init() {
    // Email sending tool only
    this.server.tool(
      "sendEmail", 
      {
        to: z.string().email(),
        subject: z.string(),
        body: z.string()
      }, 
      async ({ to, subject, body }) => {
        try {
          // Create Resend instance
          const resend = new Resend(this.env.RESEND_API_KEY);
          
          // Send the email
          const { data, error } = await resend.emails.send({
            from: "noreply@yourdomain.com",
            to,
            subject,
            text: body,
          });
          
          if (error) {
            return {
              content: [{ type: "text", text: `Failed to send email: ${error.message}` }],
            };
          }
          
          // Fix: Add null check for data before accessing data.id
          if (!data) {
            return {
              content: [{ type: "text", text: `Email sent but no ID was returned` }],
            };
          }
          
          return {
            content: [{ type: "text", text: `Email sent successfully! Email ID: ${data.id}` }],
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error sending email: ${err instanceof Error ? err.message : String(err)}` }],
          };
        }
      }
    );
  }
}

// Create Hono app for handling HTTP requests
const app = new Hono<{
  Bindings: Bindings;
}>();

// Render a basic homepage placeholder
app.get("/", async (c) => {
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
    return new Response("Unauthorized", { status: 401 });
  }

  ctx.props = {
    bearerToken: authHeader,
  };

  return MyMCP.mount("/sse").fetch(req, env, ctx);
});

// Export the Durable Object class and app for Cloudflare Workers
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  }
};