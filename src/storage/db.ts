import * as vscode from 'vscode';

export interface Session {
	id: string;
	projectRoot: string;
	startedAt: number;
	endedAt?: number;
}

export interface Task {
	id: string;
	sessionId: string;
	userInput: string;
	planJson: string;
	outcome: 'success' | 'partial' | 'aborted';
	filesChanged: string[];
	tokensUsed: number;
	createdAt: number;
}

export class GlyphDB {
	private workspaceRoot: string;

	constructor(workspaceRoot: string) {
		this.workspaceRoot = workspaceRoot;
	}

	async startSession(): Promise<string> {
		return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	async endSession(sessionId: string): Promise<void> {
	}

	async logTask(sessionId: string, userInput: string, planJson: string): Promise<string> {
		return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	async completeTask(taskId: string, outcome: 'success' | 'partial' | 'aborted', filesChanged: string[], tokensUsed: number): Promise<void> {
	}

	async getRecentTasks(limit: number = 10): Promise<Task[]> {
		return [];
	}

	async getTasksForFile(filePath: string): Promise<Task[]> {
		return [];
	}

	close(): void {
	}
}
