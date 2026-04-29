import * as vscode from 'vscode';
import { callModel as callNvidia, ModelOptions } from './nvidia';
import { callModel as callOllama } from './local';
import { KeyStore } from '../storage/secrets';

export async function callActiveModel(
	keyStore: KeyStore,
	system: string,
	user: string,
	options?: Partial<ModelOptions>
): Promise<string> {
	const config = vscode.workspace.getConfiguration('glyph');
	const provider = config.get<string>('defaultProvider', 'ollama');
	const model = config.get<string>('defaultModel', 'codellama');

	const opts: ModelOptions = {
		model,
		maxTokens: 1000,
		stream: false,
		...options
	};

	if (provider === 'nvidia') {
		const apiKey = await keyStore.get('nvidia');
		if (!apiKey) {
			throw new Error('NVIDIA API key not configured. Please run "Glyph: Configure NVIDIA Key"');
		}
		return await callNvidia(apiKey, system, user, opts);
	}

	if (provider === 'ollama') {
		const ollamaUrl = await keyStore.get('ollama');
		if (!ollamaUrl) {
			throw new Error('Ollama URL not configured. Please run "Glyph: Configure Ollama URL"');
		}
		return await callOllama(ollamaUrl, system, user, opts);
	}

	throw new Error(`Provider ${provider} not supported`);
}
