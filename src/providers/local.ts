export interface ModelOptions {
	model: string;
	maxTokens: number;
	stream: boolean;
}

export async function callModel(
	ollamaUrl: string,
	systemPrompt: string,
	userMessage: string,
	options: ModelOptions
): Promise<string> {
	const response = await fetch(`${ollamaUrl}/api/chat`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: options.model || 'codellama',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			options: {
				num_predict: options.maxTokens || 1000
			},
			stream: options.stream || false
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Ollama API error: ${response.status} - ${error}`);
	}

	const data = await response.json() as { message: { content: string } };
	return data.message.content;
}
