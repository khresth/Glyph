import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface FileInfo {
	path: string;
	summary: string;
	lines: number;
	size: number;
	extension: string;
}

export class ProjectCrawler {
	private workspaceRoot: string;
	private excludePatterns = [
		'node_modules',
		'.git',
		'dist',
		'build',
		'.next',
		'__pycache__',
		'.vscode',
		'.glyph',
		'coverage',
		'.nyc_output',
		'target',
		'bin',
		'obj'
	];

	private excludeExtensions = [
		'.lock',
		'.log',
		'.tmp',
		'.cache',
		'.swp',
		'.swo',
		'.DS_Store'
	];

	constructor(workspaceRoot: string) {
		this.workspaceRoot = workspaceRoot;
	}

	async crawl(): Promise<FileInfo[]> {
		const files: FileInfo[] = [];
		await this.crawlDirectory(this.workspaceRoot, files);
		
		files.sort((a, b) => {
			const aPriority = this.getFilePriority(a.path);
			const bPriority = this.getFilePriority(b.path);
			return bPriority - aPriority;
		});

		return files.slice(0, 200);
	}

	private async crawlDirectory(dir: string, files: FileInfo[]): Promise<void> {
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				const relativePath = path.relative(this.workspaceRoot, fullPath);

				if (entry.isDirectory() && this.excludePatterns.some(pattern => 
					relativePath.includes(pattern) || entry.name === pattern
				)) {
					continue;
				}

				if (entry.isDirectory()) {
					await this.crawlDirectory(fullPath, files);
				} else if (entry.isFile()) {
					const fileInfo = await this.analyzeFile(fullPath, relativePath);
					if (fileInfo) {
						files.push(fileInfo);
					}
				}
			}
		} catch (error) {
		}
	}

	private async analyzeFile(fullPath: string, relativePath: string): Promise<FileInfo | null> {
		try {
			const stats = fs.statSync(fullPath);
			const extension = path.extname(fullPath);
			
			if (this.excludeExtensions.some(ext => relativePath.endsWith(ext)) || 
				stats.size > 1024 * 1024) {
				return null;
			}

			const content = fs.readFileSync(fullPath, 'utf-8');
			const lines = content.split('\n').slice(0, 50);
			const summary = lines.join('\n').substring(0, 1000);

			return {
				path: relativePath,
				summary,
				lines: content.split('\n').length,
				size: stats.size,
				extension
			};
		} catch (error) {
			return null;
		}
	}

	private getFilePriority(filePath: string): number {
		if (filePath.startsWith('src/')) return 10;
		if (filePath.startsWith('lib/')) return 9;
		if (filePath.startsWith('app/')) return 9;
		if (!filePath.includes('/')) return 8;
		if (filePath.includes('test')) return 3;
		if (filePath.includes('spec')) return 3;
		return 5;
	}
}
