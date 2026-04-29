import * as vscode from 'vscode';
import * as path from 'path';
import { callActiveModel } from '../providers';
import { KeyStore } from '../storage/secrets';
import { BrainBuilder } from '../brain/builder';

export interface PlanStep {
	type: 'read' | 'edit' | 'create' | 'delete';
	file: string;
	reason: string;
	instruction?: string;
}

export interface AgentPlan {
	task: string;
	steps: PlanStep[];
	risks: string[];
	confidence: number;
}

export class AgentLoop {
	private workspaceRoot: string;
	private keyStore: KeyStore;
	private brainBuilder: BrainBuilder;
	private abortController: AbortController | null = null;

	constructor(workspaceRoot: string, keyStore: KeyStore, brainBuilder: BrainBuilder) {
		this.workspaceRoot = workspaceRoot;
		this.keyStore = keyStore;
		this.brainBuilder = brainBuilder;
	}

	async executeTask(task: string, onProgress?: (message: string) => void, onStream?: (chunk: string) => void): Promise<string> {
		this.abortController = new AbortController();

		try {
			onProgress?.('Loading project brain...');
			const brain = await this.loadBrain();

			onProgress?.('Planning task...');
			const plan = await this.generatePlan(brain, task);
			onStream?.(JSON.stringify(plan, null, 2));

			onProgress?.(`Executing ${plan.steps.length} steps...`);
			const results = await this.executePlan(plan, onProgress, onStream);

			onProgress?.('Task completed successfully');
			return results.summary;

		} catch (error) {
			if (error instanceof Error && error.message === 'Task cancelled') {
				onProgress?.('Task cancelled');
				throw error;
			}
			onProgress?.(`Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			throw error;
		} finally {
			this.abortController = null;
		}
	}

	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
	}

	private async loadBrain(): Promise<string> {
		const brain = await this.brainBuilder.loadBrain();
		if (!brain) {
			return 'No brain file available. Proceed without project context.';
		}
		return brain;
	}

	private async generatePlan(brain: string, task: string): Promise<AgentPlan> {
		const systemPrompt = `${brain}

You are Glyph, an expert coding agent. Given a task, respond ONLY with a JSON plan:
{
  "task": "description",
  "steps": [
    { "type": "read", "file": "src/auth.ts", "reason": "understand current auth" },
    { "type": "edit", "file": "src/auth.ts", "instruction": "add refresh token logic" },
    { "type": "create", "file": "src/tokens.ts", "instruction": "new token utility" }
  ],
  "risks": ["might break existing sessions"],
  "confidence": 0.8
}

Only respond with JSON. No explanation.`;

		const response = await callActiveModel(
			this.keyStore,
			systemPrompt,
			task,
			{ maxTokens: 1000, stream: false }
		);

		try {
			const plan = JSON.parse(response) as AgentPlan;
			
			if (!plan.task || !Array.isArray(plan.steps) || plan.steps.length === 0) {
				throw new Error('Invalid plan structure');
			}

			if (plan.steps.length > 10) {
				plan.steps = plan.steps.slice(0, 10);
			}

			return plan;

		} catch (error) {
			throw new Error(`Failed to parse AI plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	private async executePlan(plan: AgentPlan, onProgress?: (message: string) => void, onStream?: (chunk: string) => void): Promise<{ summary: string; changedFiles: string[] }> {
		const changedFiles: string[] = [];
		const context: Record<string, string> = {};

		for (let i = 0; i < plan.steps.length; i++) {
			const step = plan.steps[i];
			onProgress?.(`Step ${i + 1}/${plan.steps.length}: ${step.type} ${step.file}`);

			if (this.abortController?.signal.aborted) {
				throw new Error('Task cancelled');
			}

			switch (step.type) {
				case 'read':
					await this.executeRead(step, context, onStream);
					break;
				case 'edit':
					const edited = await this.executeEdit(step, context, onStream);
					if (edited) {
						changedFiles.push(step.file);
					}
					break;
				case 'create':
					const created = await this.executeCreate(step, context, onStream);
					if (created) {
						changedFiles.push(step.file);
					}
					break;
				case 'delete':
					const deleted = await this.executeDelete(step, onStream);
					if (deleted) {
						changedFiles.push(step.file);
					}
					break;
				default:
					throw new Error(`Unknown step type: ${step.type}`);
			}
		}

		return {
			summary: `Completed task: ${plan.task}. Changed ${changedFiles.length} files: ${changedFiles.join(', ')}`,
			changedFiles
		};
	}

	private async executeRead(step: PlanStep, context: Record<string, string>, onStream?: (chunk: string) => void): Promise<void> {
		const filePath = this.resolvePath(step.file);
		const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
		const text = Buffer.from(content).toString('utf-8');
		context[step.file] = text;
		onStream?.(`\n\n// Read ${step.file}\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
	}

	private async executeEdit(step: PlanStep, context: Record<string, string>, onStream?: (chunk: string) => void): Promise<boolean> {
		const filePath = this.resolvePath(step.file);
		
		const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
		const currentText = Buffer.from(content).toString('utf-8');

		const editedText = await this.generateEdit(currentText, step.instruction || '', context, onStream);

		const verified = await this.verifyEdit(currentText, editedText, step.instruction || '');
		if (!verified.ok) {
			onStream?.(`\n\n// Edit verification failed: ${verified.issue}`);
			return false;
		}

		const approved = await this.showDiffAndApprove(filePath, currentText, editedText);
		if (!approved) {
			onStream?.(`\n\n// Edit rejected by user`);
			return false;
		}

		await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(editedText));
		onStream?.(`\n\n// Edited ${step.file}`);
		return true;
	}

	private async executeCreate(step: PlanStep, context: Record<string, string>, onStream?: (chunk: string) => void): Promise<boolean> {
		const filePath = this.resolvePath(step.file);

		const content = await this.generateContent(step.instruction || '', context, onStream);

		const approved = await this.showContentAndApprove(filePath, content);
		if (!approved) {
			onStream?.(`\n\n// File creation rejected by user`);
			return false;
		}

		await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content));
		onStream?.(`\n\n// Created ${step.file}`);
		return true;
	}

	private async executeDelete(step: PlanStep, onStream?: (chunk: string) => void): Promise<boolean> {
		const filePath = this.resolvePath(step.file);

		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
		} catch {
			onStream?.(`\n\n// File ${step.file} does not exist`);
			return false;
		}

		const approved = await this.showDeleteConfirmation(filePath);
		if (!approved) {
			onStream?.(`\n\n// File deletion rejected by user`);
			return false;
		}

		await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
		onStream?.(`\n\n// Deleted ${step.file}`);
		return true;
	}

	private async generateEdit(currentContent: string, instruction: string, context: Record<string, string>, onStream?: (chunk: string) => void): Promise<string> {
		const prompt = `Given this file content and instruction, provide the complete edited file:

Current content:
${currentContent}

Instruction: ${instruction}

Context from other files:
${Object.entries(context).map(([file, content]) => `// ${file}\n${content.substring(0, 200)}...`).join('\n\n')}

Return only the complete edited file content, no explanations.`;

		const response = await callActiveModel(
			this.keyStore,
			'You are a code editor. Return only the complete edited file content.',
			prompt,
			{ maxTokens: 2000, stream: false }
		);

		return response;
	}

	private async generateContent(instruction: string, context: Record<string, string>, onStream?: (chunk: string) => void): Promise<string> {
		const prompt = `Create a new file with this instruction:

Instruction: ${instruction}

Context from other files:
${Object.entries(context).map(([file, content]) => `// ${file}\n${content.substring(0, 200)}...`).join('\n\n')}

Return only the complete file content, no explanations.`;

		const response = await callActiveModel(
			this.keyStore,
			'You are a code generator. Return only the complete file content.',
			prompt,
			{ maxTokens: 2000, stream: false }
		);

		return response;
	}

	private async verifyEdit(original: string, edited: string, instruction: string): Promise<{ ok: boolean; issue?: string }> {
		const prompt = `Compare these file versions and verify the edit was successful:

Original:
${original}

Edited:
${edited}

Instruction: ${instruction}

Respond with JSON: { "ok": true } or { "ok": false, "issue": "description" }`;

		try {
			const response = await callActiveModel(
				this.keyStore,
				'You are a code reviewer. Verify edits match instructions.',
				prompt,
				{ maxTokens: 500, stream: false }
			);

			const result = JSON.parse(response);
			return result;
		} catch (error) {
			return { ok: false, issue: 'Failed to verify edit' };
		}
	}

	private async showDiffAndApprove(filePath: string, original: string, edited: string): Promise<boolean> {
		const uri = vscode.Uri.file(filePath);
		const originalUri = uri.with({ scheme: 'original' });
		const editedUri = uri.with({ scheme: 'edited' });

		// Show diff
		const diff = await vscode.workspace.openTextDocument(editedUri);
		await vscode.window.showTextDocument(diff, vscode.ViewColumn.Two);

		const choice = await vscode.window.showInformationMessage(
			`Review changes to ${filePath}`,
			'Approve',
			'Reject'
		);

		return choice === 'Approve';
	}

	private async showContentAndApprove(filePath: string, content: string): Promise<boolean> {
		const choice = await vscode.window.showInformationMessage(
			`Create new file ${filePath}?\n\nPreview:\n${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`,
			'Create',
			'Cancel'
		);

		return choice === 'Create';
	}

	private async showDeleteConfirmation(filePath: string): Promise<boolean> {
		const choice = await vscode.window.showWarningMessage(
			`Delete file ${filePath}? This action cannot be undone.`,
			'Delete',
			'Cancel'
		);

		return choice === 'Delete';
	}

	private resolvePath(filePath: string): string {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}
		return path.join(this.workspaceRoot, filePath);
	}
}
