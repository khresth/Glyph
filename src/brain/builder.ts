import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectCrawler, FileInfo } from './crawler';
import { callActiveModel } from '../providers';
import { KeyStore } from '../storage/secrets';

export class BrainBuilder {
	private workspaceRoot: string;
	private keyStore: KeyStore;

	constructor(workspaceRoot: string, keyStore: KeyStore) {
		this.workspaceRoot = workspaceRoot;
		this.keyStore = keyStore;
	}

	async buildBrain(): Promise<void> {
		const progress = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Building project brain...",
				cancellable: true
			},
			async (progress, token) => {
				progress.report({ increment: 0, message: "Crawling files..." });

				if (token.isCancellationRequested) {
					throw new Error("Brain build cancelled");
				}

				const crawler = new ProjectCrawler(this.workspaceRoot);
				const files = await crawler.crawl();
				
				progress.report({ increment: 30, message: `Found ${files.length} files...` });

				progress.report({ increment: 50, message: "Analyzing with AI..." });
				
				const brainContent = await this.generateBrainContent(files);
				
				progress.report({ increment: 80, message: "Saving brain..." });
				
				await this.saveBrainFiles(brainContent, files.length);
				
				progress.report({ increment: 100, message: "Done!" });
			}
		);

		vscode.window.showInformationMessage(
			'Brain built! Glyph now knows your project.',
			'View Brain',
			'Open .glyph folder'
		).then(selection => {
			if (selection === 'View Brain') {
				vscode.commands.executeCommand('glyph.viewBrain');
			} else if (selection === 'Open .glyph folder') {
				vscode.commands.executeCommand('revealFileInOS', vscode.Uri.joinPath(vscode.Uri.file(this.workspaceRoot), '.glyph'));
			}
		});
	}

	private async generateBrainContent(files: FileInfo[]): Promise<string> {
		const fileSummary = files.map(file => {
			return `${file.path} (${file.lines} lines, ${file.extension}):\n${file.summary}\n---`;
		}).join('\n\n');

		const systemPrompt = `You are a codebase analyst. Given a list of files with their content snippets, produce a compressed project.brain document in this exact format:

## Stack
[languages, frameworks, key dependencies in 2-3 lines]

## Architecture  
[how the project is structured, key patterns, in 3-5 lines]

## Conventions
[naming, file organization, patterns to follow when editing]

## Key Files
[list the 10 most important files with one-line descriptions]
[flag any files marked as fragile or not to be modified]

## Past Decisions
[leave empty on first run]

## Open Questions
[leave empty on first run]

Keep the entire output under 1500 tokens. Be dense, not verbose.`;

		try {
			const brainContent = await callActiveModel(
				this.keyStore,
				systemPrompt,
				fileSummary,
				{ maxTokens: 1500, stream: false }
			);

			return brainContent;
		} catch (error) {
			return this.createFallbackBrain(files);
		}
	}

	private createFallbackBrain(files: FileInfo[]): string {
		const languages = [...new Set(files.map(f => f.extension).filter(e => e && e.length > 1))];
		const keyFiles = files.slice(0, 10).map(f => `${f.path}: ${f.lines} lines`).join('\n');

		return `## Stack
${languages.join(', ')} project

## Architecture
Project with ${files.length} files organized in standard structure

## Conventions
Standard file organization and naming conventions

## Key Files
${keyFiles}

## Past Decisions
[leave empty on first run]

## Open Questions
[leave empty on first run]`;
	}

	private async saveBrainFiles(brainContent: string, fileCount: number): Promise<void> {
		const glyphDir = path.join(this.workspaceRoot, '.glyph');
		
		if (!fs.existsSync(glyphDir)) {
			fs.mkdirSync(glyphDir, { recursive: true });
		}

		const brainPath = path.join(glyphDir, 'brain.md');
		fs.writeFileSync(brainPath, brainContent, 'utf-8');

		const metadata = {
			builtAt: new Date().toISOString(),
			fileCount,
			workspaceRoot: this.workspaceRoot
		};
		
		const metaPath = path.join(glyphDir, 'meta.json');
		fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');

		const configPath = path.join(glyphDir, 'config.json');
		if (!fs.existsSync(configPath)) {
			const config = {
				provider: vscode.workspace.getConfiguration('glyph').get('defaultProvider', 'ollama'),
				model: vscode.workspace.getConfiguration('glyph').get('defaultModel', 'codellama'),
				maxSteps: 10,
				autoUpdateBrain: true,
				streamResponses: true
			};
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
		}
	}

	async loadBrain(): Promise<string | null> {
		const brainPath = path.join(this.workspaceRoot, '.glyph', 'brain.md');
		
		if (fs.existsSync(brainPath)) {
			return fs.readFileSync(brainPath, 'utf-8');
		}
		
		return null;
	}

	async brainExists(): Promise<boolean> {
		const brainPath = path.join(this.workspaceRoot, '.glyph', 'brain.md');
		return fs.existsSync(brainPath);
	}
}
