import { useEffect, useState, useCallback, useMemo } from "react";
import type { TaskEvent } from "../../types/opencode-events";

interface UseTaskEventsOptions {
	enabled?: boolean;
}

// Derived status from event stream
export type DerivedStatus = "idle" | "busy" | "completed" | "error" | "unknown";

interface UseTaskEventsReturn {
	events: TaskEvent[];
	isConnected: boolean;
	error: Error | null;
	clearEvents: () => void;
	/** Status derived from session.status and session.idle events */
	derivedStatus: DerivedStatus;
	/** Whether the agent has finished (received session.idle) */
	isComplete: boolean;
}

/**
 * Hook to subscribe to SSE events from a running task
 */
export function useTaskEvents(
	taskId: string | undefined,
	sessionId: string | undefined,
	options: UseTaskEventsOptions = {}
): UseTaskEventsReturn {
	const { enabled = true } = options;

	const [events, setEvents] = useState<TaskEvent[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const clearEvents = useCallback(() => {
		setEvents([]);
	}, []);

	useEffect(() => {
		if (!taskId || !sessionId || !enabled) return;

		const eventSource = new EventSource(`/api/tasks/${taskId}/events`);

		eventSource.onopen = () => {
			setIsConnected(true);
			setError(null);
		};

		eventSource.onmessage = (event) => {
			try {
				// The event stream from execStream wraps the actual SSE data
				// Format: {"type":"stdout","data":"data: {...}\n","timestamp":"..."}
				const wrapper = JSON.parse(event.data) as {
					type: string;
					data: string;
					timestamp: string;
				};

				// Only process stdout events
				if (wrapper.type !== "stdout" || !wrapper.data) return;

				// The inner data is an SSE line like "data: {...}\n"
				// Extract the JSON from the "data: " prefix
				const sseData = wrapper.data.trim();
				if (!sseData.startsWith("data: ")) return;

				const jsonStr = sseData.slice(6); // Remove "data: " prefix
				if (!jsonStr || jsonStr === "") return;

				const openCodeEvent = JSON.parse(jsonStr) as {
					type: string;
					properties: Record<string, unknown>;
				};

				// Map OpenCode event format to TaskEvent format
				const taskEvent: TaskEvent = {
					type: openCodeEvent.type,
					properties: {
						sessionId:
							(openCodeEvent.properties.sessionID as string) ||
							(openCodeEvent.properties.part as { sessionID?: string })
								?.sessionID,
						messageId:
							(openCodeEvent.properties.messageID as string) ||
							(openCodeEvent.properties.part as { messageID?: string })
								?.messageID,
						part: openCodeEvent.properties.part as TaskEvent["properties"]["part"],
						...openCodeEvent.properties,
					},
				};

				// Filter events for this session
				if (
					!taskEvent.properties.sessionId ||
					taskEvent.properties.sessionId === sessionId
				) {
					setEvents((prev) => [...prev, taskEvent]);
				}
			} catch (e) {
				// Ignore parse errors for empty lines or malformed data
				if (event.data && event.data.trim()) {
					console.debug("Failed to parse event:", e, event.data);
				}
			}
		};

		eventSource.onerror = () => {
			setIsConnected(false);
			setError(new Error("Connection lost"));
			eventSource.close();
		};

		return () => {
			eventSource.close();
			setIsConnected(false);
		};
	}, [taskId, sessionId, enabled]);

	// Derive status from events
	const { derivedStatus, isComplete } = useMemo(() => {
		let status: DerivedStatus = "unknown";
		let complete = false;

		// Process events in order to get final status
		for (const event of events) {
			if (event.type === "session.status") {
				const statusType = event.properties.status?.type;
				if (statusType === "busy") {
					status = "busy";
				} else if (statusType === "idle") {
					status = "idle";
				}
			} else if (event.type === "session.idle") {
				status = "completed";
				complete = true;
			} else if (event.type === "error") {
				status = "error";
				complete = true;
			}
		}

		return { derivedStatus: status, isComplete: complete };
	}, [events]);

	return {
		events,
		isConnected,
		error,
		clearEvents,
		derivedStatus,
		isComplete,
	};
}

/**
 * Extract assistant text from events
 * OpenCode sends "message.part.updated" events with a "delta" property for incremental text
 */
export function getAssistantTextFromEvents(events: TaskEvent[]): string {
	const textParts: string[] = [];

	for (const event of events) {
		// Handle message.part.updated events with delta (incremental text)
		if (event.type === "message.part.updated") {
			const delta = event.properties.delta as string | undefined;
			if (delta) {
				textParts.push(delta);
			}
		}
		// Also handle legacy message.part.delta format
		else if (
			event.type === "message.part.delta" &&
			event.properties.part?.type === "text" &&
			event.properties.part?.text
		) {
			textParts.push(event.properties.part.text);
		}
	}

	return textParts.join("");
}

/**
 * Extract tool usage from events
 */
export function getToolUsageFromEvents(
	events: TaskEvent[]
): Array<{ tool: string; input?: Record<string, unknown>; output?: unknown }> {
	const tools: Array<{
		tool: string;
		input?: Record<string, unknown>;
		output?: unknown;
	}> = [];

	let currentTool: {
		tool: string;
		input?: Record<string, unknown>;
		output?: unknown;
	} | null = null;

	for (const event of events) {
		if (event.type === "tool.start" && event.properties.part?.tool) {
			currentTool = {
				tool: event.properties.part.tool,
				input: event.properties.part.input,
			};
		} else if (event.type === "tool.end" && currentTool) {
			currentTool.output = event.properties.part?.output;
			tools.push(currentTool);
			currentTool = null;
		}
	}

	return tools;
}
