/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/terminal';
import 'vs/css!./media/xterm';
import * as panel from 'vs/workbench/browser/panel';
import * as platform from 'vs/base/common/platform';
import nls = require('vs/nls');
import {Extensions, IConfigurationRegistry} from 'vs/platform/configuration/common/configurationRegistry';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {ITerminalService, KEYBINDING_CONTEXT_TERMINAL_FOCUS, TERMINAL_PANEL_ID, TERMINAL_DEFAULT_SHELL_LINUX, TERMINAL_DEFAULT_SHELL_OSX, TERMINAL_DEFAULT_SHELL_WINDOWS} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {KillTerminalAction, CopyTerminalSelectionAction, CreateNewTerminalAction, FocusTerminalAction, FocusNextTerminalAction, FocusPreviousTerminalAction, RunSelectedTextInTerminalAction, TerminalPasteAction, ToggleTerminalAction} from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import {Registry} from 'vs/platform/platform';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {TerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminalService';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';

let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'terminal',
	'order': 100,
	'title': nls.localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	'type': 'object',
	'properties': {
		'terminal.integrated.shell.linux': {
			'description': nls.localize('terminal.integrated.shell.linux', "The path of the shell that the terminal uses on Linux."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_LINUX
		},
		'terminal.integrated.shellArgs.linux': {
			'description': nls.localize('terminal.integrated.shellArgs.linux', "The command line arguments to use when on the Linux terminal."),
			'type': 'array',
			'items': {
				'type': 'string'
			},
			'default': []
		},
		'terminal.integrated.shell.osx': {
			'description': nls.localize('terminal.integrated.shell.osx', "The path of the shell that the terminal uses on OS X."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_OSX
		},
		'terminal.integrated.shellArgs.osx': {
			'description': nls.localize('terminal.integrated.shellArgs.osx', "The command line arguments to use when on the OS X terminal."),
			'type': 'array',
			'items': {
				'type': 'string'
			},
			'default': []
		},
		'terminal.integrated.shell.windows': {
			'description': nls.localize('terminal.integrated.shell.windows', "The path of the shell that the terminal uses on Windows. When using shells shipped with Windows (cmd, PowerShell or Bash on Ubuntu), prefer C:\\Windows\\sysnative over C:\\Windows\\System32 to use the 64-bit versions."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_WINDOWS
		},
		'terminal.integrated.fontFamily': {
			'description': nls.localize('terminal.integrated.fontFamily', "Controls the font family of the terminal, this defaults to editor.fontFamily's value."),
			'type': 'string'
		},
		'terminal.integrated.fontLigatures': {
			'description': nls.localize('terminal.integrated.fontLigatures', "Controls whether font ligatures are enabled in the terminal."),
			'type': 'boolean',
			'default': false
		},
		'terminal.integrated.fontSize': {
			'description': nls.localize('terminal.integrated.fontSize', "Controls the font size of the terminal, this defaults to editor.fontSize's value."),
			'type': 'number',
			'default': 0
		},
		'terminal.integrated.lineHeight': {
			'description': nls.localize('terminal.integrated.lineHeight', "Controls the line height of the terminal, this number is multipled by the terminal font size to get the actual line-height in pixels."),
			'type': 'number',
			'default': 1.2
		},
		'terminal.integrated.cursorBlinking': {
			'description': nls.localize('terminal.integrated.cursorBlinking', "Controls whether the terminal cursor blinks."),
			'type': 'boolean',
			'default': true
		},
		'terminal.integrated.setLocaleVariables': {
			'description': nls.localize('terminal.integrated.setLocaleVariables', "Controls whether locale variables are set at startup of the terminal, this defaults to true on OS X, false on other platforms."),
			'type': 'boolean',
			'default': platform.isMacintosh
		}
	}
});

registerSingleton(ITerminalService, TerminalService);

(<panel.PanelRegistry>Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/terminal/electron-browser/terminalPanel',
	'TerminalPanel',
	TERMINAL_PANEL_ID,
	nls.localize('terminal', "Terminal"),
	'terminal'
));

// On mac cmd+` is reserved to cycle between windows, that's why the keybindings use WinCtrl
let actionRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.LABEL), KillTerminalAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CopyTerminalSelectionAction, CopyTerminalSelectionAction.ID, CopyTerminalSelectionAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C,
	// Don't apply to Mac since cmd+c works
	mac: { primary: null }
}, KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_TERMINAL_FOCUS))), CopyTerminalSelectionAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKTICK,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_BACKTICK }
}), CreateNewTerminalAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusTerminalAction, FocusTerminalAction.ID, FocusTerminalAction.LABEL), FocusTerminalAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextTerminalAction, FocusNextTerminalAction.ID, FocusNextTerminalAction.LABEL), KillTerminalAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousTerminalAction, FocusPreviousTerminalAction.ID, FocusPreviousTerminalAction.LABEL), KillTerminalAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(TerminalPasteAction, TerminalPasteAction.ID, TerminalPasteAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V,
	// Don't apply to Mac since cmd+v works
	mac: { primary: null }
}, KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_TERMINAL_FOCUS))), CopyTerminalSelectionAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(RunSelectedTextInTerminalAction, RunSelectedTextInTerminalAction.ID, RunSelectedTextInTerminalAction.LABEL), RunSelectedTextInTerminalAction.LABEL);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleTerminalAction, ToggleTerminalAction.ID, ToggleTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.US_BACKTICK,
	mac: { primary: KeyMod.WinCtrl | KeyCode.US_BACKTICK }
}), 'View: ' + ToggleTerminalAction.LABEL, nls.localize('viewCategory', "View"));
