import { Hono } from "hono";
import { getSandbox } from "@cloudflare/sandbox";
import TasksApp from "./tasks-app";

// Re-export Sandbox class from the SDK for Durable Object binding
export { Sandbox } from "@cloudflare/sandbox";

const app = new Hono<{ Bindings: Env }>();

// Mount task management routes - pass getSandbox helper
app.route("/api/tasks", TasksApp);

// Health check endpoint
app.get("/api/health", (c) => {
	return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;

// Export getSandbox for use in tasks-app
export { getSandbox };
