import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateTask } from "@/react-app/hooks/use-task";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function HomePage() {
	const navigate = useNavigate();
	const [repoUrl, setRepoUrl] = useState("");
	const [branch, setBranch] = useState("main");
	const [prompt, setPrompt] = useState("");

	const createTask = useCreateTask();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		createTask.mutate(
			{ repoUrl, branch, prompt },
			{
				onSuccess: (task) => {
					// Pass task data via router state since we don't have server-side storage
					navigate(`/task/${task.id}`, { state: { task } });
				},
			}
		);
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto max-w-2xl py-12 px-4">
				<div className="space-y-8">
					<div className="text-center space-y-2">
						<h1 className="text-4xl font-bold tracking-tight">
							Agentic Task Runner
						</h1>
						<p className="text-muted-foreground">
							Run AI coding agents on any GitHub repository
						</p>
					</div>

					<Card>
						<CardHeader>
							<CardTitle>Create New Task</CardTitle>
							<CardDescription>
								Provide a GitHub repository and describe what you want the AI
								agent to do
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleSubmit} className="space-y-6">
								<div className="space-y-2">
									<Label htmlFor="repoUrl">GitHub Repository URL</Label>
									<Input
										id="repoUrl"
										type="url"
										value={repoUrl}
										onChange={(e) => setRepoUrl(e.target.value)}
										placeholder="https://github.com/user/repo"
										required
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="branch">Branch</Label>
									<Input
										id="branch"
										type="text"
										value={branch}
										onChange={(e) => setBranch(e.target.value)}
										placeholder="main"
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="prompt">Task Description</Label>
									<Textarea
										id="prompt"
										value={prompt}
										onChange={(e) => setPrompt(e.target.value)}
										placeholder="Describe what you want the AI agent to do..."
										className="min-h-32"
										required
									/>
								</div>

								{createTask.isError && (
									<Alert variant="destructive">
										<AlertDescription>
											{createTask.error.message}
										</AlertDescription>
									</Alert>
								)}

								<Button
									type="submit"
									className="w-full"
									size="lg"
									disabled={createTask.isPending}
								>
									{createTask.isPending ? "Creating Task..." : "Run Task"}
								</Button>
							</form>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-lg">How it works</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm text-muted-foreground">
							<p>
								<strong>1.</strong> Enter a GitHub repository URL
							</p>
							<p>
								<strong>2.</strong> Describe the task you want the AI to perform
							</p>
							<p>
								<strong>3.</strong> The agent clones the repo in an isolated
								sandbox
							</p>
							<p>
								<strong>4.</strong> Watch the agent work in real-time
							</p>
							<p>
								<strong>5.</strong> Review the changes and download the diff
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
