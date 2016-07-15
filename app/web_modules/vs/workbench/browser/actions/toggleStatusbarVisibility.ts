/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {Action} from 'vs/base/common/actions';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IWorkbenchActionRegistry, Extensions} from 'vs/workbench/common/actionRegistry';
import {IPartService} from 'vs/workbench/services/part/common/partService';

export class ToggleStatusbarVisibilityAction extends Action {

	public static ID = 'workbench.action.toggleStatusbarVisibility';
	public static LABEL = nls.localize('toggleStatusbar', "Toggle Status Bar Visibility");

	constructor(id: string, label: string, @IPartService private partService: IPartService) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {
		let hideStatusbar = !this.partService.isStatusBarHidden();
		this.partService.setStatusBarHidden(hideStatusbar);

		return TPromise.as(null);
	}
}

let registry = <IWorkbenchActionRegistry>Registry.as(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleStatusbarVisibilityAction, ToggleStatusbarVisibilityAction.ID, ToggleStatusbarVisibilityAction.LABEL), 'View: Toggle Status Bar Visibility', nls.localize('view', "View"));