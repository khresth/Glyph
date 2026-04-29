export interface ModelOptions {
	model: string;
	maxTokens: number;
	stream: boolean;
}

export async function callModel(
	apiKey: string,
	systemPrompt: string,
	userMessage: string,
	options: ModelOptions
): Promise<string> {
	const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: options.model || 'meta/llama-3.1-70b-instruct',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage }
			],
			max_tokens: options.maxTokens || 1000,
			stream: options.stream || false
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`NVIDIA API error: ${response.status} - ${error}`);
	}

	const data = await response.json() as { choices: Array<{ message: { content: string } }> };
	return data.choices[0].message.content;
}
