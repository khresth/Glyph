import * as vscode from 'vscode';

export class KeyStore {
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	async get(provider: 'nvidia' | 'openai' | 'anthropic' | 'ollama'): Promise<string | undefined> {
		return await this.context.secrets.get(`glyph.${provider}`);
	}

	async set(provider: string, value: string): Promise<void> {
		await this.context.secrets.store(`glyph.${provider}`, value);
	}

	async delete(provider: string): Promise<void> {
		await this.context.secrets.delete(`glyph.${provider}`);
	}

	async hasAny(): Promise<boolean> {
		const nvidia = await this.get('nvidia');
		const openai = await this.get('openai');
		const anthropic = await this.get('anthropic');
		const ollama = await this.get('ollama');
		return !!(nvidia || openai || anthropic || ollama);
	}
}
