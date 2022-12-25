import {devOnlyObject, overrideReturn} from "./utils";
import {DevOnly} from "./utils/devOnlyObject";

type DIContainer<T extends ExtendableOnlyInjectables> = {
    resolve: <K extends keyof T>(name: K) => T[K]
    addCollection: (collection: { [K in keyof T]?: InjectableInit<T, T[K]> }) => DIContainer<T>
    add: <K extends keyof T>(name: K, value: T[K]) => DIContainer<T>
    injectFunction: <Fn extends (deps?: Partial<T>, ...args: any[]) => any>(fn: Fn) => DiInjectedFunction<T, Fn>
} & DevOnly<{
    injectables: Injectables<T>
}>

type DiInjectedFunction<T extends ExtendableOnlyInjectables, Fn extends (deps: Partial<T>, ...args: any[]) => any> =
    ((...args: Parameters<Fn> extends [infer F] ? ([Exclude<F, T> & Partial<T> | undefined] | []) : Parameters<Fn> extends [infer F, ...infer R] ? [(Exclude<F, T> & Partial<T>) | undefined, ...R] : never) => ReturnType<Fn>)
    & { __diId: Symbol }

type ExtendableOnlyInjectables = Record<string, unknown>

type Injectable<T extends ExtendableOnlyInjectables, R> = LazyInjectable<T, R> | EagerInjectable<R>

type LazyInjectable<T extends ExtendableOnlyInjectables, R> = { factory: InjectableInitFactory<T, R>; value: R | null }

type EagerInjectable<T> = { value: T }

type Injectables<T extends ExtendableOnlyInjectables> = { [K in keyof T]: Injectable<T, T[K]> }

type InjectableInit<T extends ExtendableOnlyInjectables, R> = InjectableInitObject<T, R> | InjectableInitFactory<T, R> | InjectableInitValue<R>

type InjectableInitObject<T extends ExtendableOnlyInjectables, R> = { factory: InjectableInitFactory<T, R> }

type InjectableInitFactory<T extends ExtendableOnlyInjectables, R> = ((deps: Partial<T>) => R) | DiInjectedFunction<T, (deps: Partial<T>) => R>

type InjectableInitValue<T> = { value: T }

export const createDIContainer = <T extends ExtendableOnlyInjectables>(init: { [K in keyof T]?: InjectableInit<T, T[K]> }): DIContainer<T> => {
    const _injectables = {} as Injectables<T>;
    if (init) {
        attachInjectableCollection(_injectables)(init)
    }
    const _id = Symbol("di");

    const returnSelf = overrideReturn(() => self)
    const self: DIContainer<T> = {
        addCollection: returnSelf(attachInjectableCollection(_injectables)),
        add: returnSelf(attachInjectable(_injectables)),
        resolve: tryResolveInjectable(_injectables, _id),
        injectFunction: createDiInjectedFunction(_injectables, _id),
        ...devOnlyObject({
            injectables: _injectables,
            createResolverObject: createResolverObject(_injectables, _id),
            createServiceGetter: createServiceGetter(_injectables, _id),
        })
    }

    return self
}

const attachInjectableCollection = <T extends ExtendableOnlyInjectables>(services: Partial<Injectables<T>>) => (collection: { [K in keyof T]?: InjectableInit<T, T[K]> }) => Object.entries(collection).forEach(value => attachInjectable(services)(...value));

const attachInjectable = <T extends ExtendableOnlyInjectables>(services: Partial<Injectables<T>>) => <K extends keyof T>(serviceKey: K, serviceValue: InjectableInit<T, T[K]>) => {
    services[serviceKey] = createInjectable(serviceValue);
};

const createInjectable = <T extends ExtendableOnlyInjectables, R>(value: InjectableInit<T, R>): Injectable<T, R> => {
    if (typeof value === "function") {
        return { factory: value, value: null };
    }

    if ('value' in value) {
        return { value: value.value };
    }

    if ('factory' in value) {
        return { factory: value.factory, value: null }
    }

    return { value }
};

const tryResolveInjectable = <T extends ExtendableOnlyInjectables>(services: Injectables<T>, id: Symbol) => <K extends keyof T>(name: K): T[K] => {
    const service = services[name];

    if (typeof service !== 'object') {
        throw new DIError(DIError.Code.NotRegistered, name);
    }

    if (service.value !== null) {
        return service.value
    }

    if (!('factory' in service)) {
        throw new DIError(DIError.Code.CouldNotResolveDeps, name)
    }

    const factory = service.factory;
    try {
        const result = ('__diId' in factory && factory.__diId === id) ? factory() : factory(createResolverObject(services, id)());
        service.value = result
        return result
    } catch (error) {
        if (error instanceof DIError) throw error;

        throw new DIError(DIError.Code.CouldNotResolveDeps, name, error);
    }
};

const createServiceGetter = <T extends ExtendableOnlyInjectables>(services: Injectables<T>, id: Symbol) => (name: keyof T) => ({ get: () => tryResolveInjectable(services, id)(name) });

const createResolverObject = <T extends ExtendableOnlyInjectables>(services: Injectables<T>, id: Symbol) => <P extends Partial<T>>(without?: P): Exclude<P, T> & Partial<T> => {
    const skipKeys = without ? Object.keys(without) : [];

    const accumulator = (without ?? {}) as Exclude<P, T> & Partial<T>
    return Object.defineProperties(
        accumulator,
        Object.keys(services)
            .filter(prop => !skipKeys.includes(prop))
            .reduce(
                (acc, key) => ({
                    ...acc,
                    [key]: createServiceGetter(services, id)(key)
                }),
                {}
            )
    );
};

export class DIError extends Error {
    static Code = {
        NotRegistered: "NotRegistered",
        CouldNotResolveDeps: "CouldNotResolveDeps"
    };

    constructor(public code: string, public _message: string | number | symbol, public innerError?: unknown | Error) {
        super(`${code}, ${_message.toString()}`);
    }
}

const createDiInjectedFunction =
    <T extends ExtendableOnlyInjectables>(services: Injectables<T>, id: Symbol) =>
        <Fn extends (deps?: Partial<T>, ...args: any[]) => any>(fun: Fn): DiInjectedFunction<T, Fn> => {
            const funWithDI: DiInjectedFunction<T, Fn> = (params?: Parameters<Fn>[0], ...rest: any[] /** TODO: no any */) => fun(createResolverObject(services, id)(params), ...rest);
            funWithDI.__diId = id;

            return funWithDI;
        };
