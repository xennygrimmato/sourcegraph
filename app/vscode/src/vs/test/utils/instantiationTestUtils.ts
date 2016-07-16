/*---------------------------------------------------------------------------------------------
	*  Copyright (c) Microsoft Corporation. All rights reserved.
	*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import { TPromise } from 'vs/base/common/winjs.base';
import { SimpleMap } from 'vs/base/common/map';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

// Known services
import {IEventService} from 'vs/platform/event/common/event';
import {EventService} from 'vs/platform/event/common/eventService';
import { ITelemetryService, NullTelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ISearchService } from 'vs/platform/search/common/search';
import { SearchService } from 'vs/workbench/services/search/node/searchService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { HistoryService } from 'vs/workbench/services/history/browser/history';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { SimpleExtensionService } from 'vs/editor/browser/standalone/simpleServices';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { ReplaceService } from 'vs/workbench/parts/search/browser/replaceService';

interface IServiceMock<T> {
	id: ServiceIdentifier<T>;
	service: any;
}

export class TestInstantiationService extends InstantiationService {

	private _servciesMap: SimpleMap<ServiceIdentifier<any>, any>;

	constructor(private _serviceCollection: ServiceCollection = new ServiceCollection()) {
		super(_serviceCollection);

		this._servciesMap= new SimpleMap<ServiceIdentifier<any>, any>();
		this._servciesMap.set(ITelemetryService, NullTelemetryService);
		this._servciesMap.set(IEventService, EventService);
		this._servciesMap.set(ISearchService, SearchService);
		this._servciesMap.set(IHistoryService, HistoryService);
		this._servciesMap.set(IModeService, ModeServiceImpl);
		this._servciesMap.set(IExtensionService, SimpleExtensionService);
		this._servciesMap.set(IMarkerService, MarkerService);
		this._servciesMap.set(IReplaceService, ReplaceService);
	}

	public mock<T>(service:ServiceIdentifier<T>): T | sinon.SinonMock {
		return <T>this._create(service, {mock: true});
	}

	public stub<T>(service?:ServiceIdentifier<T>, ctor?: any): T
	public stub<T>(service?:ServiceIdentifier<T>, obj?: any): T
	public stub<T>(service?:ServiceIdentifier<T>, ctor?: any, fnProperty?: string, value?: any): sinon.SinonStub
	public stub<T>(service?:ServiceIdentifier<T>, obj?: any, fnProperty?: string, value?: any): sinon.SinonStub
	public stub<T>(service?:ServiceIdentifier<T>, fnProperty?: string, value?: any): sinon.SinonStub
	public stub<T>(serviceIdentifier?: ServiceIdentifier<T>, arg2?: any, arg3?: string, arg4?: any): sinon.SinonStub {
		let service= typeof arg2 !== 'string' ? arg2 : void 0;
		let serviceMock: IServiceMock<any>=  {id: serviceIdentifier, service: service};
		let fnProperty= typeof arg2 === 'string' ? arg2 : arg3;
		let value= typeof arg2 === 'string' ? arg3 : arg4;

		let stubObject= <any>this._create(serviceMock, {stub: true});
		if (fnProperty) {
			if (stubObject[fnProperty].hasOwnProperty('restore')) {
				stubObject[fnProperty].restore();
			}
			if (typeof value === 'function') {
				stubObject[fnProperty] = value;
			} else {
				let stub = value ? sinon.stub().returns(value) : sinon.stub();
				stubObject[fnProperty] = stub;
				return stub;
			}
		}
		return stubObject;
	}

	public stubPromise<T>(service?:ServiceIdentifier<T>, fnProperty?: string, value?: any): T | sinon.SinonStub
	public stubPromise<T>(service?:ServiceIdentifier<T>, ctor?: any, fnProperty?: string, value?: any): sinon.SinonStub
	public stubPromise<T>(service?:ServiceIdentifier<T>, obj?: any, fnProperty?: string, value?: any): sinon.SinonStub
	public stubPromise<T>(arg1?:any, arg2?: any, arg3?: any, arg4?: any): sinon.SinonStub {
		arg3= typeof arg2 === 'string' ? TPromise.as(arg3) : arg3;
		arg4= typeof arg2 !== 'string' && typeof arg3 === 'string' ? TPromise.as(arg4) : arg4;
		return this.stub(arg1, arg2, arg3, arg4);
	}

	public spy<T>(service:ServiceIdentifier<T>, fnProperty: string): sinon.SinonSpy {
		let spy= sinon.spy();
		this.stub(service, fnProperty, spy);
		return spy;
	}

	private _create<T>(serviceMock: IServiceMock<T>, options: SinonOptions): any
	private _create<T>(ctor: any, options: SinonOptions): any
	private _create<T>(arg1: any, options: SinonOptions): any {
		if (this.isServiceMock(arg1)) {
			let service= this._getOrCreateService(arg1, options);
			this._serviceCollection.set(arg1.id, service);
			return service;
		}
		return options.mock ? sinon.mock(arg1) : this._createStub(arg1);
	}

	private _getOrCreateService<T>(serviceMock: IServiceMock<T>, opts: SinonOptions): any {
		let service:any = this._serviceCollection.get(serviceMock.id);
		if (service) {
			if (opts.mock && service['sinonOptions'] && !!service['sinonOptions'].mock) {
				return service;
			}
			if (opts.stub && service['sinonOptions'] && !!service['sinonOptions'].stub) {
				return service;
			}
		}
		return this._createService(serviceMock, opts);
	}

	private _createService(serviceMock: IServiceMock<any>, opts: SinonOptions): any {
		serviceMock.service= serviceMock.service ? serviceMock.service : this._servciesMap.get(serviceMock.id);
		let service= opts.mock ? sinon.mock(serviceMock.service) : this._createStub(serviceMock.service);
		service['sinonOptions']= opts;
		return service;
	}

	private _createStub(arg: any): any {
		return typeof arg === 'object' ? arg : sinon.createStubInstance(arg);
	}

	private isServiceMock(arg1: any): boolean {
		return typeof arg1 === 'object' && arg1.hasOwnProperty('id');
	}
}

interface SinonOptions {
	mock?: boolean;
	stub?: boolean;
}