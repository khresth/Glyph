(function() {
	const vscode = acquireVsCodeApi();
	const input = document.getElementById('input');
	const runButton = document.getElementById('run');
	const messages = document.getElementById('messages');
	let currentAgentMessage = null;

	function addMessage(type, text) {
		const message = document.createElement('div');
		message.className = `message ${type}`;
		message.textContent = text;
		messages.appendChild(message);
		messages.scrollTop = messages.scrollHeight;
		return message;
	}

	function handleRun() {
		const text = input.value.trim();
		if (!text) return;

		addMessage('user', text);
		input.value = '';
		input.style.height = 'auto';
		runButton.disabled = true;

		vscode.postMessage({
			type: 'runTask',
			text: text
		});
	}

	runButton.addEventListener('click', handleRun);

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleRun();
		}
	});

	input.addEventListener('input', () => {
		input.style.height = 'auto';
		input.style.height = Math.min(input.scrollHeight, 120) + 'px';
	});

	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.type) {
			case 'stream':
				if (!currentAgentMessage) {
					currentAgentMessage = addMessage('agent', '');
				}
				currentAgentMessage.textContent += message.chunk;
				messages.scrollTop = messages.scrollHeight;
				break;
			case 'done':
				if (currentAgentMessage) {
					currentAgentMessage.textContent = message.summary;
				} else {
					addMessage('agent', message.summary);
				}
				currentAgentMessage = null;
				runButton.disabled = false;
				break;
			case 'error':
				addMessage('system', message.message);
				currentAgentMessage = null;
				runButton.disabled = false;
				break;
		}
	});

	vscode.postMessage({
		type: 'ready'
	});
})();
