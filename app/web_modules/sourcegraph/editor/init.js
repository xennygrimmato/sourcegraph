// This module takes the place of vs/editor/editor.main and vs/editor/browser/editor.all.
// We import a subset of the modules those files import, to reduce the bundle size in
// the browser (and because we don't need all of the functionality included by default).
import 'vs/editor/browser/widget/codeEditorWidget';
import 'vs/editor/contrib/clipboard/browser/clipboard';
import 'vs/editor/contrib/contextmenu/browser/contextmenu';
import 'vs/editor/contrib/find/browser/find';
import 'vs/editor/contrib/goToDeclaration/browser/goToDeclaration';
import 'vs/editor/contrib/hover/browser/hover';
import 'vs/editor/contrib/links/browser/links';
import 'vs/editor/contrib/referenceSearch/browser/referenceSearch';
import 'vs/editor/contrib/toggleWordWrap/common/toggleWordWrap';
import 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter.css';
import 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
//import 'vs/editor/contrib/defineKeybinding/browser/defineKeybinding';

// include these in the editor bundle because they are widely used by many languages
import 'vs/editor/common/languages.common';

import * as go from "./go";

import {createMonacoBaseAPI} from "vs/editor/common/standalone/standaloneBase";
import {createMonacoEditorAPI} from "vs/editor/browser/standalone/standaloneEditor";
import {createMonacoLanguagesAPI} from "vs/editor/browser/standalone/standaloneLanguages";
import {DefaultConfig} from "vs/editor/common/config/defaultConfig";

// Set defaults for standalone editor
DefaultConfig.editor.wrappingIndent = "none";
DefaultConfig.editor.folding = false;

const monaco = {
	...createMonacoBaseAPI(),
	editor: createMonacoEditorAPI(),
	languages: createMonacoLanguagesAPI(),
};
export default monaco;

// Set Sourcegraph-specific settings
monaco.languages.register({id: "go"});
monaco.languages.setLanguageConfiguration("go", go.conf);
monaco.languages.setMonarchTokensProvider("go", go.language);
