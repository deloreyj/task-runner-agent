import { useMutation } from "@tanstack/react-query";
import type {
	CreateTaskRequest,
	TaskCreationResponse,
	TaskAbortResponse,
	ApiResponse,
} from "../../types/task-schemas";

/**
 * Create a new task
 */
async function createTask(data: CreateTaskRequest): Promise<TaskCreationResponse> {
	const response = await fetch("/api/tasks", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});

	if (!response.ok) {
		const errorResult = await response.json();
		throw new Error(errorResult.error || "Failed to create task");
	}

	const result = (await response.json()) as ApiResponse<TaskCreationResponse>;
	if (result.error) {
		throw new Error(result.error);
	}
	return result.data!;
}

/**
 * Abort a task
 */
async function abortTask({
	taskId,
	sessionId,
}: {
	taskId: string;
	sessionId: string;
}): Promise<TaskAbortResponse> {
	const response = await fetch(
		`/api/tasks/${taskId}/abort?sessionId=${encodeURIComponent(sessionId)}`,
		{ method: "POST" }
	);

	if (!response.ok) {
		throw new Error("Failed to abort task");
	}

	const result = (await response.json()) as ApiResponse<TaskAbortResponse>;
	if (result.error) {
		throw new Error(result.error);
	}
	return result.data!;
}

/**
 * Hook to create a new task
 */
export function useCreateTask() {
	return useMutation({
		mutationFn: createTask,
	});
}

/**
 * Hook to abort a task
 */
export function useAbortTask() {
	return useMutation({
		mutationFn: abortTask,
	});
}
