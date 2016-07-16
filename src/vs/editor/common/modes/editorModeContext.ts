/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import * as modes from 'vs/editor/common/modes';
import {ICommonCodeEditor, ModeContextKeys} from 'vs/editor/common/editorCommon';

export class EditorModeContext {

	private _disposables: IDisposable[] = [];
	private _editor: ICommonCodeEditor;

	private _hasCompletionItemProvider: IKeybindingContextKey<boolean>;
	private _hasCodeActionsProvider: IKeybindingContextKey<boolean>;
	private _hasCodeLensProvider: IKeybindingContextKey<boolean>;
	private _hasDefinitionProvider: IKeybindingContextKey<boolean>;
	private _hasHoverProvider: IKeybindingContextKey<boolean>;
	private _hasDocumentHighlightProvider: IKeybindingContextKey<boolean>;
	private _hasDocumentSymbolProvider: IKeybindingContextKey<boolean>;
	private _hasReferenceProvider: IKeybindingContextKey<boolean>;
	private _hasRenameProvider: IKeybindingContextKey<boolean>;
	private _hasFormattingProvider: IKeybindingContextKey<boolean>;
	private _hasSignatureHelpProvider: IKeybindingContextKey<boolean>;

	constructor(
		editor: ICommonCodeEditor,
		keybindingService: IKeybindingService
	) {
		this._editor = editor;

		this._hasCompletionItemProvider = keybindingService.createKey(ModeContextKeys.hasCompletionItemProvider, undefined);
		this._hasCodeActionsProvider = keybindingService.createKey(ModeContextKeys.hasCodeActionsProvider, undefined);
		this._hasCodeLensProvider = keybindingService.createKey(ModeContextKeys.hasCodeLensProvider, undefined);
		this._hasDefinitionProvider = keybindingService.createKey(ModeContextKeys.hasDefinitionProvider, undefined);
		this._hasHoverProvider = keybindingService.createKey(ModeContextKeys.hasHoverProvider, undefined);
		this._hasDocumentHighlightProvider = keybindingService.createKey(ModeContextKeys.hasDocumentHighlightProvider, undefined);
		this._hasDocumentSymbolProvider = keybindingService.createKey(ModeContextKeys.hasDocumentSymbolProvider, undefined);
		this._hasReferenceProvider = keybindingService.createKey(ModeContextKeys.hasReferenceProvider, undefined);
		this._hasRenameProvider = keybindingService.createKey(ModeContextKeys.hasRenameProvider, undefined);
		this._hasFormattingProvider = keybindingService.createKey(ModeContextKeys.hasFormattingProvider, undefined);
		this._hasSignatureHelpProvider = keybindingService.createKey(ModeContextKeys.hasSignatureHelpProvider, undefined);

		// update when model/mode changes
		this._disposables.push(editor.onDidChangeModel(() => this._update()));
		this._disposables.push(editor.onDidChangeModelMode(() => this._update()));

		// update when registries change
		modes.SuggestRegistry.onDidChange(this._update, this, this._disposables);
		modes.CodeActionProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.CodeLensProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DefinitionProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.HoverProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentHighlightProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentSymbolProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.ReferenceProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.RenameProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentFormattingEditProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.DocumentRangeFormattingEditProviderRegistry.onDidChange(this._update, this, this._disposables);
		modes.SignatureHelpProviderRegistry.onDidChange(this._update, this, this._disposables);

		this._update();
	}

	dispose() {
		this._disposables = dispose(this._disposables);
	}

	reset() {
		this._hasCompletionItemProvider.reset();
		this._hasCodeActionsProvider.reset();
		this._hasCodeLensProvider.reset();
		this._hasDefinitionProvider.reset();
		this._hasHoverProvider.reset();
		this._hasDocumentHighlightProvider.reset();
		this._hasDocumentSymbolProvider.reset();
		this._hasReferenceProvider.reset();
		this._hasRenameProvider.reset();
		this._hasFormattingProvider.reset();
		this._hasSignatureHelpProvider.reset();
	}

	private _update() {
		const model = this._editor.getModel();
		if (!model) {
			this.reset();
			return;
		}
		this._hasCompletionItemProvider.set(modes.SuggestRegistry.has(model));
		this._hasCodeActionsProvider.set(modes.CodeActionProviderRegistry.has(model));
		this._hasCodeLensProvider.set(modes.CodeLensProviderRegistry.has(model));
		this._hasDefinitionProvider.set(modes.DefinitionProviderRegistry.has(model));
		this._hasHoverProvider.set(modes.HoverProviderRegistry.has(model));
		this._hasDocumentHighlightProvider.set(modes.DocumentHighlightProviderRegistry.has(model));
		this._hasDocumentSymbolProvider.set(modes.DocumentSymbolProviderRegistry.has(model));
		this._hasReferenceProvider.set(modes.ReferenceProviderRegistry.has(model));
		this._hasRenameProvider.set(modes.RenameProviderRegistry.has(model));
		this._hasSignatureHelpProvider.set(modes.SignatureHelpProviderRegistry.has(model));
		this._hasFormattingProvider.set(modes.DocumentFormattingEditProviderRegistry.has(model) || modes.DocumentRangeFormattingEditProviderRegistry.has(model));
	}
}
