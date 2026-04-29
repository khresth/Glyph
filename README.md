# Glyph

Persistent project context for AI coding agents. BYOK (Bring Your Own Key).

## Features

- **Local-First AI**: Support for Ollama and NVIDIA NIM with no cloud dependencies
- **Persistent Project Context**: Brain files that understand your codebase structure and conventions
- **Agentic Coding**: Plan → Act → Verify workflow with user approval
- **Smart Mode Detection**: Automatic switching between chat and agent modes
- **File Operations**: Read, edit, create, delete with diff approval
- **Session History**: SQLite-based task tracking

## Quick Start

1. Install the extension
2. Configure your AI provider (Ollama or NVIDIA)
3. Build your project brain: `Ctrl+Shift+P` → "Glyph: Build Brain"
4. Start coding: `Ctrl+Shift+K` to open Glyph panel

## Commands

- `Ctrl+Shift+K` - Open Glyph panel
- `Ctrl+Shift+P` → "Glyph: Build Brain" - Analyze your project
- `Ctrl+Shift+P` → "Glyph: Plan Task" - Plan without executing
- `Ctrl+Shift+P` → "Glyph: Execute Plan" - Execute saved plan

## Configuration

Set your preferred AI provider in VS Code settings:
- `glyph.defaultProvider` - "ollama" or "nvidia"
- `glyph.defaultModel` - Model name to use
- `glyph.maxSteps` - Maximum steps per task (default: 10)

## License

MIT
