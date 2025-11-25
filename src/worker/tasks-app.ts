import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { z } from "zod";
import { CreateTaskSchema, type TaskStatus } from "../types/task-schemas";

// Response schemas for OpenCode API
const OpenCodeSessionResponseSchema = z.object({
	id: z.string(),
});

const OpenCodeErrorResponseSchema = z.object({
	error: z.string().optional(),
	message: z.string().optional(),
});

const app = new Hono<{ Bindings: Env }>();

/**
 * Execute a curl command inside the sandbox and parse JSON response
 */
async function curlJson<T>(
	sandbox: Sandbox,
	method: string,
	url: string,
	body?: unknown,
	context?: string
): Promise<{ data: T | null; raw: string; error: string | null }> {
	const curlArgs = [
		"curl",
		"-s", // Silent mode
		"-X",
		method,
		"-H",
		"'Content-Type: application/json'",
	];

	if (body) {
		// Escape single quotes in the JSON body
		const jsonBody = JSON.stringify(body).replace(/'/g, "'\\''");
		curlArgs.push("-d", `'${jsonBody}'`);
	}

	curlArgs.push(`'${url}'`);

	const command = curlArgs.join(" ");
	console.log(`[${context || "curl"}] Executing: ${command}`);

	const result = await sandbox.exec(command);

	console.log(`[${context || "curl"}] Exit code: ${result.exitCode}`);
	console.log(`[${context || "curl"}] Stdout: ${result.stdout}`);
	if (result.stderr) {
		console.log(`[${context || "curl"}] Stderr: ${result.stderr}`);
	}

	if (!result.success) {
		return {
			data: null,
			raw: result.stderr || "",
			error: `curl failed: ${result.stderr}`,
		};
	}

	try {
		const json = JSON.parse(result.stdout);
		return { data: json as T, raw: result.stdout, error: null };
	} catch (e) {
		return {
			data: null,
			raw: result.stdout,
			error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
		};
	}
}

/**
 * Wait for OpenCode server to be ready
 */
async function waitForOpenCode(
	sandbox: Sandbox,
	maxAttempts: number = 30,
	intervalMs: number = 1000
): Promise<boolean> {
	for (let i = 0; i < maxAttempts; i++) {
		console.log(`[waitForOpenCode] Attempt ${i + 1}/${maxAttempts}...`);

		const result = await sandbox.exec(
			"curl -sf http://localhost:4096/session || echo 'not ready'"
		);

		if (result.success && !result.stdout.includes("not ready")) {
			console.log("[waitForOpenCode] OpenCode server is ready!");
			return true;
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	console.log("[waitForOpenCode] Timeout waiting for OpenCode server");
	return false;
}

// Create a new task
app.post("", zValidator("json", CreateTaskSchema), async (c) => {
	try {
		const { repoUrl, branch, prompt } = c.req.valid("json");

		// Generate task ID
		const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
		const createdAt = new Date().toISOString();

		console.log(`[Task ${taskId}] Creating task for: ${repoUrl}`);

		// Get sandbox instance using the SDK helper
		const sandbox = getSandbox(c.env.SANDBOX, taskId);

		// Clone repository using git
		console.log(`[Task ${taskId}] Cloning repository: ${repoUrl}`);

		const cloneResult = await sandbox.exec(
			`git clone --branch ${branch} --single-branch ${repoUrl} /workspace/repo`
		);

		if (!cloneResult.success) {
			throw new Error(`Failed to clone repository: ${cloneResult.stderr}`);
		}

		console.log(`[Task ${taskId}] Repository cloned`);

		// Start OpenCode server
		console.log(`[Task ${taskId}] Starting OpenCode server...`);

		const opencodeProcess = await sandbox.startProcess(
			"opencode serve --port 4096 --hostname 0.0.0.0",
			{
				cwd: "/workspace/repo",
				env: {
					PATH: "/usr/local/bin:/usr/bin:/bin",
					HOME: "/root",
					// SSL certificate handling for WARP/proxy environments
					NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/Cloudflare_CA.pem",
					// Required for OpenCode to make API calls through corporate proxies
					// with self-signed certificates (e.g., Cloudflare WARP)
					NODE_TLS_REJECT_UNAUTHORIZED: "0",
				},
			}
		);

		console.log(
			`[Task ${taskId}] OpenCode started (ID: ${opencodeProcess.id}, PID: ${opencodeProcess.pid})`
		);

		// Wait for OpenCode to be ready
		console.log(`[Task ${taskId}] Waiting for OpenCode server to be ready...`);
		const isReady = await waitForOpenCode(sandbox);

		if (!isReady) {
			throw new Error("OpenCode server failed to start within timeout");
		}

		// Create OpenCode session directly using curl inside container
		console.log(`[Task ${taskId}] Creating OpenCode session...`);
		const sessionResult = await curlJson<{ id: string }>(
			sandbox,
			"POST",
			"http://localhost:4096/session",
			{ title: `Task: ${prompt.substring(0, 50)}...` },
			`Task ${taskId} - Create Session`
		);

		if (sessionResult.error) {
			throw new Error(`Failed to create session: ${sessionResult.error}`);
		}

		// Validate the response shape
		const parsedSession = OpenCodeSessionResponseSchema.safeParse(
			sessionResult.data
		);

		if (!parsedSession.success) {
			// Check if it's an error response
			const errorParsed = OpenCodeErrorResponseSchema.safeParse(
				sessionResult.data
			);
			if (
				errorParsed.success &&
				(errorParsed.data.error || errorParsed.data.message)
			) {
				throw new Error(
					`OpenCode API error: ${errorParsed.data.error || errorParsed.data.message}`
				);
			}
			console.error(
				`[Task ${taskId}] Unexpected response shape:`,
				JSON.stringify(sessionResult.data, null, 2)
			);
			throw new Error(
				`Unexpected session response format: ${JSON.stringify(sessionResult.data)}`
			);
		}

		const sessionId = parsedSession.data.id;
		const startedAt = new Date().toISOString();

		console.log(`[Task ${taskId}] Session created: ${sessionId}`);

		// Send the prompt to start the agent (non-blocking)
		console.log(`[Task ${taskId}] Sending prompt to agent...`);

		// Send message using startProcess so it doesn't block
		// The /session/:id/message endpoint blocks until the agent completes,
		// so we fire-and-forget and rely on SSE events for progress updates
		const messageBody = JSON.stringify({
			parts: [{ type: "text", text: prompt }],
		}).replace(/'/g, "'\\''");

		await sandbox.startProcess(
			`curl -s -X POST -H 'Content-Type: application/json' -d '${messageBody}' 'http://localhost:4096/session/${sessionId}/message'`,
			{ cwd: "/workspace/repo" }
		);

		console.log(`[Task ${taskId}] Message sent, agent is working (non-blocking)`);

		return c.json(
			{
				data: {
					id: taskId,
					status: "running" as TaskStatus,
					repoUrl,
					branch,
					prompt,
					sessionId,
					createdAt,
					startedAt,
				},
			},
			201
		);
	} catch (error) {
		console.error("[Task Creation Error]", error);
		return c.json(
			{
				error: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

// Subscribe to task events (SSE) - Using execStream with curl
app.get("/:id/events", async (c) => {
	const taskId = c.req.param("id");

	// Get sandbox and stream events using curl
	const sandbox = getSandbox(c.env.SANDBOX, taskId);

	// Use execStream to stream curl output
	const stream = await sandbox.execStream(
		"curl -N -H 'Accept: text/event-stream' 'http://localhost:4096/event'"
	);

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
});

// Get task diff
app.get("/:id/diff", async (c) => {
	const taskId = c.req.param("id");

	const sandbox = getSandbox(c.env.SANDBOX, taskId);

	const result = await sandbox.exec("git diff HEAD", {
		cwd: "/workspace/repo",
	});

	return c.json({
		data: {
			diff: result.stdout || "",
			taskId,
		},
	});
});

// Abort task - requires sessionId as query param since we don't store state
app.post("/:id/abort", async (c) => {
	const taskId = c.req.param("id");
	const sessionId = c.req.query("sessionId");

	if (!sessionId) {
		return c.json({ error: "sessionId query parameter required" }, 400);
	}

	const sandbox = getSandbox(c.env.SANDBOX, taskId);

	// Call OpenCode abort endpoint using curl inside container
	await curlJson<unknown>(
		sandbox,
		"POST",
		`http://localhost:4096/session/${sessionId}/abort`,
		undefined,
		`Task ${taskId} - Abort`
	);

	return c.json({
		data: {
			success: true,
			taskId,
		},
	});
});

export default app;
