import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { callActiveModel } from '../providers';
import { KeyStore } from '../storage/secrets';

export class BrainUpdater {
	private workspaceRoot: string;
	private keyStore: KeyStore;

	constructor(workspaceRoot: string, keyStore: KeyStore) {
		this.workspaceRoot = workspaceRoot;
		this.keyStore = keyStore;
	}

	async updateBrain(taskSummary: string, filesChanged: string[]): Promise<void> {
		try {
			const brainPath = path.join(this.workspaceRoot, '.glyph', 'brain.md');
			
			let currentBrain = '';
			if (fs.existsSync(brainPath)) {
				currentBrain = fs.readFileSync(brainPath, 'utf-8');
			}

			const systemPrompt = `You maintain a project.brain file. Given a completed task, 
update ONLY the "Past Decisions" and "Key Files" sections if needed. 
Return the FULL updated brain.md. Keep it under 1500 tokens total.

Current brain:
${currentBrain}

Completed task: ${taskSummary}. Files changed: ${filesChanged.join(', ')}.
`;

			const updatedBrain = await callActiveModel(
				this.keyStore,
				systemPrompt,
				'',
				{ maxTokens: 1500, stream: false }
			);

			if (updatedBrain.length > 2000) {
				const lines = updatedBrain.split('\n');
				const pastDecisionsStart = lines.findIndex(line => line.startsWith('## Past Decisions'));
				if (pastDecisionsStart > 0) {
					lines.splice(pastDecisionsStart + 2, 0);
				}
				lines.push('');
				fs.writeFileSync(brainPath, lines.join('\n'), 'utf-8');
			} else {
				fs.writeFileSync(brainPath, updatedBrain, 'utf-8');
			}

		} catch (error) {
			console.error('Failed to update brain:', error);
		}
	}
}
