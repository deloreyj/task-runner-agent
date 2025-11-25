import { z } from "zod";

// Task status enum
export const TaskStatusSchema = z.enum([
	"initializing",
	"cloning",
	"starting",
	"running",
	"completed",
	"error",
	"aborted",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// Task request schema for creating a new task
export const CreateTaskSchema = z.object({
	repoUrl: z.string().url("Must be a valid repository URL"),
	branch: z.string().optional().default("main"),
	prompt: z.string().min(1, "Prompt is required"),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;

// API response wrapper
export interface ApiResponse<T> {
	data?: T;
	error?: string;
}

// Task creation response
export interface TaskCreationResponse {
	id: string;
	status: TaskStatus;
	repoUrl: string;
	branch: string;
	prompt: string;
	sessionId?: string;
	createdAt: string;
	startedAt?: string;
}

// Task diff response
export interface TaskDiffResponse {
	diff: string;
	taskId: string;
}

// Task abort response
export interface TaskAbortResponse {
	success: boolean;
	taskId: string;
}
