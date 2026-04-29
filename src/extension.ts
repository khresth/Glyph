import * as vscode from 'vscode';
import { KeyStore } from './storage/secrets';
import { GlyphPanel } from './webview/panel';
import { callActiveModel } from './providers';
import { BrainBuilder } from './brain/builder';

export function activate(context: vscode.ExtensionContext) {
	console.log('Glyph extension is now active');

	const keyStore = new KeyStore(context);
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
	
	console.log('Workspace root:', workspaceRoot);
	
	if (!workspaceRoot) {
		vscode.window.showErrorMessage('Glyph requires a workspace folder to be open');
		return;
	}

	let brainBuilder: BrainBuilder | null = null;
	try {
		brainBuilder = new BrainBuilder(workspaceRoot, keyStore);
	} catch (error) {
		console.error('Failed to initialize brain builder:', error);
		vscode.window.showWarningMessage('Brain builder disabled due to initialization error');
	}

	const startCommand = vscode.commands.registerCommand('glyph.start', () => {
		try {
			GlyphPanel.show(context.extensionUri, keyStore, workspaceRoot);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to start Glyph: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});

	const buildBrainCommand = vscode.commands.registerCommand('glyph.buildBrain', async () => {
		if (!brainBuilder) {
			vscode.window.showErrorMessage('Brain builder not available');
			return;
		}
		try {
			await brainBuilder.buildBrain();
		} catch (error) {
			vscode.window.showErrorMessage(`Brain build failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});

	const rebuildBrainCommand = vscode.commands.registerCommand('glyph.rebuildBrain', async () => {
		if (!brainBuilder) {
			vscode.window.showErrorMessage('Brain builder not available');
			return;
		}
		const choice = await vscode.window.showWarningMessage(
			'This will rebuild your brain file. Any manual edits will be lost.',
			'Rebuild',
			'Cancel'
		);
		if (choice === 'Rebuild') {
			try {
				await brainBuilder.buildBrain();
			} catch (error) {
				vscode.window.showErrorMessage(`Brain rebuild failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}
	});

	const viewBrainCommand = vscode.commands.registerCommand('glyph.viewBrain', async () => {
		if (!brainBuilder) {
			vscode.window.showErrorMessage('Brain builder not available');
			return;
		}
		try {
			const brainContent = await brainBuilder.loadBrain();
			if (brainContent) {
				const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), '.glyph', 'brain.md'));
				await vscode.window.showTextDocument(doc);
			} else {
				vscode.window.showInformationMessage('No brain file found. Build one first with "Glyph: Build Brain"');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to view brain: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});

	const planCommand = vscode.commands.registerCommand('glyph.plan', async () => {
		const task = await vscode.window.showInputBox({
			prompt: 'Enter task to plan',
			placeHolder: 'e.g., Add error handling to the main function'
		});
		if (task) {
			try {
				GlyphPanel.show(context.extensionUri, keyStore, workspaceRoot);
				setTimeout(() => {
					const panel = GlyphPanel['currentPanel'];
					if (panel) {
						panel['handlePlanTask'](task);
					}
				}, 500);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to plan task: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}
	});

	const executeCommand = vscode.commands.registerCommand('glyph.execute', async () => {
		try {
			const panel = GlyphPanel['currentPanel'];
			if (panel) {
				await panel['handleExecutePlan']();
			} else {
				vscode.window.showInformationMessage('No active Glyph panel. Use "Glyph: Plan Task" first.');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to execute plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});

	const configureKeysCommand = vscode.commands.registerCommand('glyph.configureKeys', async () => {
		const selected = await vscode.window.showQuickPick(
			['NVIDIA', 'OpenAI', 'Anthropic', 'Ollama URL'],
			{ placeHolder: 'Select which key to configure' }
		);

		if (selected === 'NVIDIA') {
			vscode.commands.executeCommand('glyph.configureNvidiaKey');
		} else if (selected === 'OpenAI') {
			vscode.commands.executeCommand('glyph.configureOpenAIKey');
		} else if (selected === 'Anthropic') {
			vscode.commands.executeCommand('glyph.configureAnthropicKey');
		} else if (selected === 'Ollama URL') {
			vscode.commands.executeCommand('glyph.configureOllamaUrl');
		}
	});

	const configureNvidiaCommand = vscode.commands.registerCommand('glyph.configureNvidiaKey', async () => {
		const key = await vscode.window.showInputBox({
			prompt: 'Enter your NVIDIA NIM API key',
			password: true
		});
		if (key) {
			await keyStore.set('nvidia', key);
			vscode.window.showInformationMessage('NVIDIA key saved');
		}
	});

	const configureOpenAICommand = vscode.commands.registerCommand('glyph.configureOpenAIKey', async () => {
		const key = await vscode.window.showInputBox({
			prompt: 'Enter your OpenAI API key',
			password: true
		});
		if (key) {
			await keyStore.set('openai', key);
			vscode.window.showInformationMessage('OpenAI key saved');
		}
	});

	const configureAnthropicCommand = vscode.commands.registerCommand('glyph.configureAnthropicKey', async () => {
		const key = await vscode.window.showInputBox({
			prompt: 'Enter your Anthropic API key',
			password: true
		});
		if (key) {
			await keyStore.set('anthropic', key);
			vscode.window.showInformationMessage('Anthropic key saved');
		}
	});

	const configureOllamaCommand = vscode.commands.registerCommand('glyph.configureOllamaUrl', async () => {
		const url = await vscode.window.showInputBox({
			prompt: 'Enter Ollama URL',
			value: 'http://localhost:11434'
		});
		if (url) {
			await keyStore.set('ollama', url);
			vscode.window.showInformationMessage('Ollama URL saved');
		}
	});

	context.subscriptions.push(
		startCommand,
		buildBrainCommand,
		rebuildBrainCommand,
		viewBrainCommand,
		planCommand,
		executeCommand,
		configureKeysCommand,
		configureNvidiaCommand,
		configureOpenAICommand,
		configureAnthropicCommand,
		configureOllamaCommand
	);

	if (brainBuilder) {
		brainBuilder.brainExists().then(async (hasBrain: boolean) => {
			if (!hasBrain) {
				vscode.window.showInformationMessage(
					'No project brain found. Build one to give Glyph context about your codebase.',
					'Build Now',
					'Later'
				).then(selection => {
					if (selection === 'Build Now') {
						vscode.commands.executeCommand('glyph.buildBrain');
					}
				});
			}
		}).catch(error => {
			console.error('Error checking brain existence:', error);
		});
	}

	keyStore.hasAny().then(hasKeys => {
		if (!hasKeys) {
			vscode.window.showWarningMessage(
				'No API keys configured. Glyph needs at least one API key to work.',
				'Configure Keys'
			).then(selection => {
				if (selection === 'Configure Keys') {
					vscode.commands.executeCommand('glyph.configureKeys');
				}
			});
		}
	});
}

export function deactivate() {}
