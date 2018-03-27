/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class InMemoryDocument implements vscode.TextDocument {
	private readonly _lines: string[];

	constructor(
		public readonly uri: vscode.Uri,
		private readonly _contents: string
	) {
		this._lines = this._contents.split(/\n/g);
	}

	fileName: string = '';
	isUntitled: boolean = false;
	languageId: string = '';
	version: number = 1;
	isDirty: boolean = false;
	isClosed: boolean = false;
	eol: vscode.EndOfLine = vscode.EndOfLine.LF;

	get lineCount(): number {
		return this._lines.length;
	}

	lineAt(line: any): vscode.TextLine {
		return {
			lineNumber: line,
			text: this._lines[line],
			range: new vscode.Range(0, 0, 0, 0),
			firstNonWhitespaceCharacterIndex: 0,
			rangeIncludingLineBreak: new vscode.Range(0, 0, 0, 0),
			isEmptyOrWhitespace: false
		};
	}
	offsetAt(_position: vscode.Position): never {
		throw new Error('Method not implemented.');
	}
	positionAt(_offset: number): never {
		throw new Error('Method not implemented.');
	}
	getText(_range?: vscode.Range | undefined): string {
		return this._contents;
	}
	getWordRangeAtPosition(_position: vscode.Position, _regex?: RegExp | undefined): never {
		throw new Error('Method not implemented.');
	}
	validateRange(_range: vscode.Range): never {
		throw new Error('Method not implemented.');
	}
	validatePosition(_position: vscode.Position): never {
		throw new Error('Method not implemented.');
	}
	save(): never {
		throw new Error('Method not implemented.');
	}
}