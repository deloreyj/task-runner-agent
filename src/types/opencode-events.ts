// OpenCode SSE event types

// Part types that can be streamed
export interface TextPart {
	type: "text";
	text: string;
}

export interface ToolPart {
	type: "tool";
	tool: string;
	input?: Record<string, unknown>;
	output?: unknown;
}

export interface ReasoningPart {
	type: "reasoning";
	text: string;
}

export type MessagePart = TextPart | ToolPart | ReasoningPart;

// Event properties
export interface EventProperties {
	sessionId: string;
	messageId?: string;
	part?: MessagePart;
	[key: string]: unknown;
}

// OpenCode event structure
export interface OpenCodeEvent {
	type: OpenCodeEventType;
	properties: EventProperties;
}

// Event types emitted by OpenCode
export type OpenCodeEventType =
	| "message.start"
	| "message.updated"
	| "message.part.updated"
	| "message.part.delta"
	| "message.part.done"
	| "message.end"
	| "tool.start"
	| "tool.end"
	| "session.status"
	| "session.updated"
	| "session.diff"
	| "session.idle"
	| "error";

// Task event (used in React components)
export interface TaskEvent {
	type: string;
	properties: {
		sessionId?: string;
		sessionID?: string; // OpenCode uses camelCase sessionID
		messageId?: string;
		messageID?: string; // OpenCode uses camelCase messageID
		delta?: string; // Incremental text delta
		part?: {
			id?: string;
			type: string;
			text?: string;
			tool?: string;
			input?: Record<string, unknown>;
			output?: unknown;
			sessionID?: string;
			messageID?: string;
		};
		info?: {
			id?: string;
			sessionID?: string;
			role?: string;
			finish?: string;
			time?: {
				created?: number;
				completed?: number;
			};
		};
		status?: {
			type: string;
		};
		diff?: Array<{
			file: string;
			before: string;
			after: string;
			additions: number;
			deletions: number;
		}>;
		[key: string]: unknown;
	};
}

// Session types for OpenCode API
export interface OpenCodeSession {
	id: string;
	title?: string;
	createdAt: string;
	updatedAt?: string;
}

export interface OpenCodeMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: string;
}

// OpenCode session create request
export interface CreateSessionRequest {
	title?: string;
}

// OpenCode prompt request
export interface PromptRequest {
	parts: Array<{ type: "text"; text: string }>;
}
