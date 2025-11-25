import { useMutation } from "@tanstack/react-query";
import type { ApiResponse, TaskDiffResponse } from "../../types/task-schemas";

/**
 * Fetch the diff for a task
 */
async function fetchTaskDiff(taskId: string): Promise<string> {
	const response = await fetch(`/api/tasks/${taskId}/diff`);
	if (!response.ok) {
		throw new Error("Failed to fetch diff");
	}

	const result = (await response.json()) as ApiResponse<TaskDiffResponse>;
	if (result.error) {
		throw new Error(result.error);
	}

	return result.data?.diff || "";
}

/**
 * Hook to fetch the git diff from a task
 * Uses mutation instead of query because we want to fetch on-demand
 */
export function useTaskDiff() {
	return useMutation({
		mutationFn: fetchTaskDiff,
	});
}
