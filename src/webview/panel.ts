import * as vscode from 'vscode';
import { KeyStore } from '../storage/secrets';
import { callActiveModel } from '../providers';
import { AgentLoop } from '../agent/loop';
import { BrainBuilder } from '../brain/builder';

export class GlyphPanel {
	private static currentPanel: GlyphPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];
	private keyStore: KeyStore;
	private abortController: AbortController | null = null;
	private static lastPlan: any = null;
	private workspaceRoot: string;

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, keyStore: KeyStore, workspaceRoot: string) {
		this.panel = panel;
		this.keyStore = keyStore;
		this.workspaceRoot = workspaceRoot;
		const brainBuilder = new BrainBuilder(workspaceRoot, keyStore);
		const agentLoop = new AgentLoop(workspaceRoot, keyStore, brainBuilder);

		this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.panel.webview.onDidReceiveMessage(
			message => {
				switch (message.type) {
					case 'runTask':
						this.handleRunTask(message.text);
						break;
					case 'planTask':
						this.handlePlanTask(message.text);
						break;
					case 'executePlan':
						this.handleExecutePlan();
						break;
					case 'cancelTask':
						this.handleCancelTask();
						break;
				}
			},
			null,
			this.disposables
		);
	}

	public static show(extensionUri: vscode.Uri, keyStore: KeyStore, workspaceRoot: string) {
		const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

		if (GlyphPanel.currentPanel) {
			GlyphPanel.currentPanel.panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'glyph',
			'Glyph',
			column,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'ui')]
			}
		);

		GlyphPanel.currentPanel = new GlyphPanel(panel, extensionUri, keyStore, workspaceRoot);
	}

	private getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Glyph</title>
	<link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'ui', 'style.css'))}">
	<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
	<div class="container">
		<div class="header">
			<div class="logo">glyph</div>
			<div class="brain-status">
				<span class="status-dot"></span>
				<span class="status-text">no brain</span>
			</div>
		</div>
		<div class="messages" id="messages"></div>
		<div class="input-area">
			<textarea id="input" placeholder="Describe your task..." rows="1"></textarea>
			<button id="run">Run</button>
		</div>
	</div>
	<script src="${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'src', 'webview', 'ui', 'client.js'))}"></script>
</body>
</html>`;
	}

	private async handleRunTask(text: string) {
		this.abortController = new AbortController();

		try {
			const isCodingTask = this.detectCodingTask(text);
			
			if (isCodingTask) {
				const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
				const brainBuilder = new BrainBuilder(workspaceRoot, this.keyStore);
				const agentLoop = new AgentLoop(workspaceRoot, this.keyStore, brainBuilder);

				const result = await agentLoop.executeTask(
					text,
					(progress) => this.postMessage({ type: 'stream', chunk: progress }),
					(chunk) => this.postMessage({ type: 'stream', chunk })
				);

				this.postMessage({ type: 'done', summary: result });
			} else {
				const config = vscode.workspace.getConfiguration('glyph');
				const provider = config.get<string>('defaultProvider', 'ollama');
				this.postMessage({ type: 'stream', chunk: `Using ${provider}... Thinking...` });

				const response = await callActiveModel(
					this.keyStore,
					'You are Glyph, a helpful AI coding assistant. Respond concisely and helpfully.',
					text,
					{ maxTokens: 500, stream: false }
				);

				this.postMessage({ type: 'done', summary: response });
			}
		} catch (error) {
			this.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
		} finally {
			this.abortController = null;
		}
	}

	private detectCodingTask(text: string): boolean {
		const codingKeywords = [
			'add', 'create', 'implement', 'fix', 'update', 'modify', 'change', 'write', 'build',
			'refactor', 'delete', 'remove', 'move', 'rename', 'edit', 'code', 'function', 'class',
			'method', 'variable', 'file', 'test', 'bug', 'error', 'feature', 'component'
		];

		return codingKeywords.some(keyword => 
			text.toLowerCase().includes(keyword.toLowerCase())
		);
	}

	private handleCancelTask() {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		this.postMessage({ type: 'error', message: 'Task cancelled' });
	}

	private async handlePlanTask(text: string) {
		this.abortController = new AbortController();

		try {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
			const brainBuilder = new BrainBuilder(workspaceRoot, this.keyStore);
			const agentLoop = new AgentLoop(workspaceRoot, this.keyStore, brainBuilder);

			this.postMessage({ type: 'stream', chunk: 'Loading project brain...' });
			const brain = await agentLoop['loadBrain']();

			this.postMessage({ type: 'stream', chunk: 'Planning task...' });
			const plan = await agentLoop['generatePlan'](brain, text);
			
			GlyphPanel.lastPlan = plan;
			this.postMessage({ type: 'stream', chunk: 'Plan generated! Use "glyph-execute" to run it.' });
			this.postMessage({ type: 'done', summary: JSON.stringify(plan, null, 2) });
		} catch (error) {
			this.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
		} finally {
			this.abortController = null;
		}
	}

	private async handleExecutePlan() {
		if (!GlyphPanel.lastPlan) {
			this.postMessage({ type: 'error', message: 'No plan to execute. Use "glyph-plan" first.' });
			return;
		}

		this.abortController = new AbortController();

		try {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
			const brainBuilder = new BrainBuilder(workspaceRoot, this.keyStore);
			const agentLoop = new AgentLoop(workspaceRoot, this.keyStore, brainBuilder);

			const result = await agentLoop['executePlan'](
				GlyphPanel.lastPlan,
				(progress) => this.postMessage({ type: 'stream', chunk: progress }),
				(chunk) => this.postMessage({ type: 'stream', chunk })
			);

			this.postMessage({ type: 'done', summary: result.summary });
			GlyphPanel.lastPlan = null;
		} catch (error) {
			this.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
		} finally {
			this.abortController = null;
		}
	}

	private postMessage(message: any) {
		this.panel.webview.postMessage(message);
	}

	public dispose() {
		GlyphPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}
