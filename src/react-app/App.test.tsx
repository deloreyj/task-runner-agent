import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App component", () => {
	it("renders the main heading", () => {
		render(<App />);
		expect(screen.getByText(/Agentic Task Runner/i)).toBeInTheDocument();
	});

	it("renders the create task form", () => {
		render(<App />);
		expect(screen.getByText(/Create New Task/i)).toBeInTheDocument();
		expect(
			screen.getByLabelText(/GitHub Repository URL/i)
		).toBeInTheDocument();
		expect(screen.getByLabelText(/Branch/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/Task Description/i)).toBeInTheDocument();
	});

	it("renders the run task button", () => {
		render(<App />);
		expect(
			screen.getByRole("button", { name: /Run Task/i })
		).toBeInTheDocument();
	});
});
