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

type Injectables<T extends ExtendableOnlyInjectables> = { [K in keyof T]: Injectable<T, T[K]> }

type Injectable<T extends ExtendableOnlyInjectables, R> = LazyInjectable<T, R> | EagerInjectable<R>

type LazyInjectable<T extends ExtendableOnlyInjectables, R> = { factory: InjectableInitFactory<T, R>; value: R | null }

type EagerInjectable<T> = { value: T }

type InjectableInitCollection<T extends ExtendableOnlyInjectables> = { [K in keyof T]?: InjectableInit<T, T[K]> }

type InjectableInit<T extends ExtendableOnlyInjectables, R> = InjectableInitObject<T, R> | InjectableInitFactory<T, R> | InjectableInitValue<R>

type InjectableInitObject<T extends ExtendableOnlyInjectables, R> = { factory: InjectableInitFactory<T, R> }

type InjectableInitFactory<T extends ExtendableOnlyInjectables, R> = ((deps: Partial<T>) => R) | DiInjectedFunction<T, (deps: Partial<T>) => R>

type InjectableInitValue<T> = { value: T }

export const createDIContainer = <T extends ExtendableOnlyInjectables>(init: InjectableInitCollection<T>): DIContainer<T> => {
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
            createInjectableGetter: createInjectableGetter(_injectables, _id),
        })
    }

    return self
}

const attachInjectableCollection = <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>) => (collection: InjectableInitCollection<T>) => Object.entries(collection).forEach(value => attachInjectable(injectables)(...value));

const attachInjectable = <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>) => <K extends keyof T>(name: K, config: InjectableInit<T, T[K]>) => {
    injectables[name] = createInjectable(config);
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

const tryResolveInjectable = <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>, id: symbol) => <K extends keyof T>(name: K): T[K] => {
    const injectable = injectables[name];

    if (typeof injectable !== 'object') {
        throw new DIError(DIError.Code.NotRegistered, name.toString());
    }

    if (injectable.value !== null) {
        return injectable.value
    }

    if (!('factory' in injectable)) {
        throw new DIError(DIError.Code.CouldNotResolveDeps, name.toString())
    }

    const factory = injectable.factory;
    try {
        const result = ('__diId' in factory && factory.__diId === id) ? factory() : factory(createResolverObject(injectables, id)());
        injectable.value = result
        return result
    } catch (error) {
        if (error instanceof DIError) throw error;

        throw new DIError(DIError.Code.CouldNotResolveDeps, name.toString(), error);
    }
};

const createInjectableGetter = <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>, id: symbol) => (name: keyof T) => ({ get: () => tryResolveInjectable(injectables, id)(name) });

const createResolverObject = <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>, id: symbol) => <P extends Partial<T>>(without?: P): Exclude<P, T> & Partial<T> => {
    const skipKeys = without ? Object.keys(without) : [];

    const accumulator = (without ?? {}) as Exclude<P, T> & Partial<T>
    return Object.defineProperties(
        accumulator,
        Object.fromEntries(
            Object.keys(injectables)
                .filter(prop => !skipKeys.includes(prop))
                .map((key) => [key, createInjectableGetter(injectables, id)(key)])
        )
    );
};

export class DIError extends Error {
    static Code = {
        NotRegistered: "NotRegistered",
        CouldNotResolveDeps: "CouldNotResolveDeps"
    };

    constructor(public code: string, public message: string, public innerError?: unknown | Error) {
        super(`${code}, ${message}`);
    }
}

const createDiInjectedFunction =
    <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>, id: symbol) =>
        <Fn extends (deps?: Partial<T>, ...args: any[]) => any>(fun: Fn): DiInjectedFunction<T, Fn> => {
            const funWithDI: DiInjectedFunction<T, Fn> = (params?: Parameters<Fn>[0], ...rest: unknown[]) => fun(createResolverObject(injectables, id)(params), ...rest);
            funWithDI.__diId = id;

            return funWithDI;
        };
