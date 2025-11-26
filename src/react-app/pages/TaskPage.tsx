import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { useAbortTask } from "@/react-app/hooks/use-task";
import {
	useTaskEvents,
	type DerivedStatus,
} from "@/react-app/hooks/use-task-events";
import { useTaskDiff } from "@/react-app/hooks/use-task-diff";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Diff, Hunk } from "@/components/ui/diff";
import { parseDiff } from "@/components/ui/diff/utils/parse";
import type { TaskCreationResponse } from "@/types/task-schemas";
import type { TaskEvent } from "@/types/opencode-events";

// Consolidate events for display - combines consecutive text deltas into single entries
interface DisplayEvent {
	label: string;
	detail: string;
	color: string;
	index: number;
}

function consolidateEvents(
	events: TaskEvent[],
	formatEvent: (event: TaskEvent) => { label: string; detail: string; color: string }
): DisplayEvent[] {
	const result: DisplayEvent[] = [];
	let textAccumulator = "";
	let textStartIndex = -1;

	for (let i = 0; i < events.length; i++) {
		const event = events[i];
		const formatted = formatEvent(event);
		
		// Check if this is a text event
		if (formatted.label === "text" && formatted.detail) {
			if (textStartIndex === -1) {
				textStartIndex = i;
			}
			textAccumulator += formatted.detail;
		} else {
			// Flush accumulated text if any
			if (textAccumulator) {
				result.push({
					label: "text",
					detail: textAccumulator,
					color: "text-foreground",
					index: textStartIndex,
				});
				textAccumulator = "";
				textStartIndex = -1;
			}
			
			// Add non-text event if it has content
			if (formatted.label || formatted.detail) {
				result.push({
					...formatted,
					index: i,
				});
			}
		}
	}

	// Flush any remaining text
	if (textAccumulator) {
		result.push({
			label: "text",
			detail: textAccumulator,
			color: "text-foreground",
			index: textStartIndex,
		});
	}

	return result;
}

// Auto-scrolling event log component
function EventLog({ 
	events, 
	isRunning, 
	formatEvent 
}: { 
	events: TaskEvent[]; 
	isRunning: boolean;
	formatEvent: (event: TaskEvent) => { label: string; detail: string; color: string };
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	
	// Auto-scroll to bottom when new events arrive
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [events.length]);

	const displayEvents = consolidateEvents(events, formatEvent);

	if (events.length === 0) {
		return (
			<div className="h-96 w-full rounded-md border bg-muted/50 p-4 flex items-center justify-center">
				<p className="text-muted-foreground text-sm">
					{isRunning ? "Waiting for agent output..." : "No activity recorded"}
				</p>
			</div>
		);
	}

	return (
		<div 
			ref={scrollRef}
			className="h-96 w-full rounded-md border bg-muted/50 overflow-y-auto font-mono text-xs"
		>
			<div className="p-2 space-y-0.5">
				{displayEvents.map((event, i) => (
					<div key={i} className="flex gap-2 py-0.5 border-b border-border/30 last:border-0">
						<span className="text-muted-foreground shrink-0 w-6 text-right">
							{i + 1}
						</span>
						<span className={`shrink-0 w-44 truncate ${event.color}`}>
							[{event.label}]
						</span>
						<span className="text-foreground/90 break-words flex-1 whitespace-pre-wrap">
							{event.detail}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// Diff display component using the unified diff viewer
function DiffDisplay({ diff }: { diff: string }) {
	const files = parseDiff(diff);

	if (files.length === 0) {
		return (
			<div className="p-4 text-muted-foreground text-sm">
				No changes detected
			</div>
		);
	}

	return (
		<div className="space-y-4 max-h-[600px] overflow-y-auto">
			{files.map((file, index) => (
				<div key={index} className="rounded-md border overflow-hidden">
					<div className="bg-muted px-3 py-2 text-sm font-mono border-b">
						{file.newPath || file.oldPath || "Unknown file"}
					</div>
					<Diff hunks={file.hunks} type={file.type}>
						{file.hunks.map((hunk, hunkIndex) => (
							<Hunk key={hunkIndex} hunk={hunk} />
						))}
					</Diff>
				</div>
			))}
		</div>
	);
}

function getStatusColor(status: string): string {
	switch (status) {
		case "running":
		case "busy":
			return "bg-blue-500";
		case "completed":
		case "idle":
			return "bg-green-500";
		case "error":
			return "bg-red-500";
		case "aborted":
			return "bg-yellow-500";
		default:
			return "bg-gray-500";
	}
}

function getDisplayStatus(
	serverStatus: string,
	derivedStatus: DerivedStatus,
	isComplete: boolean
): string {
	// If we have a definitive completion from events, use that
	if (isComplete) {
		return derivedStatus === "error" ? "error" : "completed";
	}
	// If events say we're busy, show running
	if (derivedStatus === "busy") {
		return "running";
	}
	// Fall back to server status
	return serverStatus;
}

export function TaskPage() {
	const { taskId } = useParams<{ taskId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const [diff, setDiff] = useState<string>("");

	// Get task data from router state (passed from HomePage on creation)
	const task = location.state?.task as TaskCreationResponse | undefined;

	// Mutations
	const abortTask = useAbortTask();
	const fetchDiff = useTaskDiff();

	// Subscribe to events - always enabled once we have a sessionId
	const {
		events,
		isConnected,
		error: eventsError,
		derivedStatus,
		isComplete,
	} = useTaskEvents(taskId, task?.sessionId, {
		enabled: !!task?.sessionId,
	});

	// Compute display status from events (more reliable than server)
	const displayStatus = getDisplayStatus(
		task?.status || "unknown",
		derivedStatus,
		isComplete
	);
	const isRunning = displayStatus === "running";

	const handleAbort = () => {
		if (taskId && task?.sessionId) {
			abortTask.mutate({ taskId, sessionId: task.sessionId });
		}
	};

	const handleFetchDiff = () => {
		if (taskId) {
			fetchDiff.mutate(taskId, {
				onSuccess: (data) => setDiff(data),
			});
		}
	};

	if (!task) {
		return (
			<div className="min-h-screen bg-background p-8">
				<Alert variant="destructive">
					<AlertDescription>
						Task not found. Please create a new task from the home page.
					</AlertDescription>
				</Alert>
				<Button className="mt-4" onClick={() => navigate("/")}>
					Back to Home
				</Button>
			</div>
		);
	}

	// Format event for display
	const formatEvent = (event: TaskEvent): { label: string; detail: string; color: string } => {
		const type = event.type;
		
		switch (type) {
			case "message.part.updated":
				const delta = event.properties.delta as string | undefined;
				if (delta) {
					return { label: "text", detail: delta.slice(0, 100) + (delta.length > 100 ? "..." : ""), color: "text-foreground" };
				}
				return { label: type, detail: "", color: "text-muted-foreground" };
			
			case "session.status":
				const status = event.properties.status?.type || "unknown";
				return { 
					label: "status", 
					detail: status, 
					color: status === "busy" ? "text-blue-500" : "text-green-500" 
				};
			
			case "session.idle":
				return { label: "idle", detail: "Agent finished", color: "text-green-500" };
			
			case "session.error":
				const error = event.properties.error as { name?: string; data?: { message?: string } } | undefined;
				return { 
					label: "error", 
					detail: error?.data?.message || error?.name || "Unknown error", 
					color: "text-red-500" 
				};
			
			case "tool.start":
				const tool = event.properties.part?.tool || "unknown";
				return { label: "tool", detail: `Starting: ${tool}`, color: "text-yellow-500" };
			
			case "tool.end":
				const endTool = event.properties.part?.tool || "unknown";
				return { label: "tool", detail: `Completed: ${endTool}`, color: "text-yellow-500" };
			
			case "message.updated":
				const info = event.properties.info;
				if (info?.role === "assistant" && info?.time?.completed) {
					return { label: "message", detail: "Assistant response complete", color: "text-blue-500" };
				}
				if (info?.role === "user") {
					return { label: "message", detail: "User message sent", color: "text-purple-500" };
				}
				return { label: type, detail: info?.role || "", color: "text-muted-foreground" };
			
			case "session.updated":
				return { label: "session", detail: "Session updated", color: "text-muted-foreground" };
			
			case "session.diff":
				const diffCount = (event.properties.diff as unknown[])?.length || 0;
				return { 
					label: "diff", 
					detail: diffCount > 0 ? `${diffCount} file(s) changed` : "No changes", 
					color: diffCount > 0 ? "text-orange-500" : "text-muted-foreground" 
				};
			
			case "server.connected":
				return { label: "connected", detail: "Connected to agent", color: "text-green-500" };
			
			default:
				return { label: type, detail: "", color: "text-muted-foreground" };
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto max-w-6xl py-8 px-4">
				<div className="space-y-6">
					{/* Header */}
					<div className="flex items-center justify-between">
						<div>
							<Link
								to="/"
								className="text-sm text-muted-foreground hover:text-foreground mb-2 block"
							>
								&larr; Back to Home
							</Link>
							<h1 className="text-2xl font-bold">Task Details</h1>
							<p className="text-muted-foreground text-sm mt-1">
								ID: {task.id}
							</p>
						</div>
						<div className="flex items-center gap-3">
							<Badge className={getStatusColor(displayStatus)}>
								{displayStatus}
							</Badge>
							{isConnected && (
								<Badge variant="outline" className="text-green-500">
									Live
								</Badge>
							)}
						</div>
					</div>

					{/* Task Info */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Task Information</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div>
								<p className="text-sm text-muted-foreground">Repository</p>
								<p className="font-mono text-sm">{task.repoUrl}</p>
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Branch</p>
								<p className="font-mono text-sm">{task.branch}</p>
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Prompt</p>
								<p className="text-sm">{task.prompt}</p>
							</div>
							<Separator />
							<div className="flex gap-2">
								{isRunning && (
									<Button
										variant="destructive"
										onClick={handleAbort}
										disabled={abortTask.isPending}
									>
										{abortTask.isPending ? "Aborting..." : "Abort Task"}
									</Button>
								)}
								<Button
									variant="outline"
									onClick={handleFetchDiff}
									disabled={fetchDiff.isPending}
								>
									{fetchDiff.isPending ? "Loading..." : "View Diff"}
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Errors */}
					{eventsError && (
						<Alert variant="destructive">
							<AlertDescription>
								Event stream error: {eventsError.message}
							</AlertDescription>
						</Alert>
					)}

					{/* Agent Activity */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Agent Activity</CardTitle>
							<CardDescription>
								Live event stream from the AI agent ({events.length} events)
							</CardDescription>
						</CardHeader>
						<CardContent>
							<EventLog events={events} isRunning={isRunning} formatEvent={formatEvent} />
						</CardContent>
					</Card>

					{/* Diff Viewer */}
					{diff && (
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">Changes</CardTitle>
								<CardDescription>
									Git diff of modifications made by the agent
								</CardDescription>
							</CardHeader>
							<CardContent>
								<DiffDisplay diff={diff} />
							</CardContent>
						</Card>
					)}
				</div>
			</div>
		</div>
	);
}
