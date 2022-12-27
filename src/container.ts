import {devOnlyObject, overrideReturn} from "./utils";
import {DevOnly} from "./utils/devOnlyObject";

type DIContainer<T extends ExtendableOnlyInjectables> = {
    resolve: <K extends keyof T>(name: K) => T[K]
    addCollection: (collection: { [K in keyof T]?: InjectableInit<T, T[K]> }) => DIContainer<T>
    add: <K extends keyof T>(name: K, value: InjectableInit<T, T[K]>) => DIContainer<T>
    injectFunction: <Fn extends (...args: any[]) => any>(fn: Fn) => DiInjectedFunction<T, Fn>
} & DevOnly<{
    injectables: Injectables<T>
    createInjectableGetter: <K extends keyof T>(name: K) => { get: () => T[K] }
}>

type DiInjectedFunction<T extends ExtendableOnlyInjectables, Fn extends (...args: any[]) => any> =
    (Parameters<Fn> extends []
        ? () => ReturnType<Fn>
        : Parameters<Fn> extends [infer F]
            ? (deps?: DiInjectedParam<T, F> | undefined) => ReturnType<Fn>
            : Parameters<Fn> extends [infer F, ...infer R]
                ? (deps: (DiInjectedParam<T, F>) | undefined, ...rest: R) => ReturnType<Fn>
                : never)
    & { __diId: Symbol }

type DiInjectedParam<T extends ExtendableOnlyInjectables, P> = Omit<P, keyof T> & Partial<Pick<T, keyof P & keyof T>>

type ExtendableOnlyInjectables = Record<string, unknown>

type Injectables<T extends ExtendableOnlyInjectables> = { [K in keyof T]: Injectable<T, T[K]> }

type Injectable<T extends ExtendableOnlyInjectables, R> = LazyInjectable<T, R> | EagerInjectable<R>

type LazyInjectable<T extends ExtendableOnlyInjectables, R> = { factory: InjectableInitFactory<T, R>; value: R | null }

type EagerInjectable<T> = { value: T }

type InjectableInitCollection<T extends ExtendableOnlyInjectables> = { [K in keyof T]?: InjectableInit<T, T[K]> }

type InjectableInit<T extends ExtendableOnlyInjectables, R> = InjectableInitObject<T, R> | InjectableInitFactory<T, R> | InjectableInitValue<R>

type InjectableInitObject<T extends ExtendableOnlyInjectables, R> = { factory: InjectableInitFactory<T, R> }

type InjectableInitFactory<T extends ExtendableOnlyInjectables, R> = ((deps: T) => R) | (() => R) | DiInjectedFunction<T, (deps: T) => R>

type InjectableInitValue<T> = { value: T }

export const createDIContainer = <T extends ExtendableOnlyInjectables>(init?: InjectableInitCollection<T>): DIContainer<T> => {
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
        const result = ('__diId' in factory && typeof factory.__diId === 'symbol')
            ? factory()
            : (() => {
                const deps = createResolverObject(injectables, id)();
                return factory(deps);
            })();
        injectable.value = result
        return result
    } catch (error) {
        if (error instanceof DIError) throw error;

        throw new DIError(DIError.Code.CouldNotResolveDeps, name.toString(), error);
    }
};

const createInjectableGetter = <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>, id: symbol) => (name: keyof T) => ({ get: () => tryResolveInjectable(injectables, id)(name) });

const createResolverObject = <T extends ExtendableOnlyInjectables>(injectables: Injectables<T>, id: symbol) => <Deps>(without?: Deps | undefined): Deps & T => {
    const skipKeys = without ? Object.keys(without) : [];

    const accumulator = (without ?? {}) as Deps & T

    if (typeof Proxy !== 'undefined') {
        return new Proxy(accumulator, {
            get: (target, prop) => target[prop as keyof typeof target] ?? tryResolveInjectable(injectables, id)(prop as keyof T)
        })
    }

    // This is less safe way to do that because if the service is not defined
    // it won't throw not found error as we won't know which property is tried to be accessed,
    // and it'll probably throw TypeError (cannot access property X of undefined) just before use
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
        <Fn extends (...args: any[]) => any>(fun: Fn): DiInjectedFunction<T, Fn> => {
            const funWithDI = ((deps: unknown, ...rest: unknown[]) => {
                const injectedDeps = createResolverObject(injectables, id)(deps)
                return fun(injectedDeps, ...rest);
            }) as DiInjectedFunction<T, Fn>;
            funWithDI.__diId = id;

            return funWithDI;
        };
