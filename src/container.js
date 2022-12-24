import {devOnlyObject} from "./utils/devOnlyObject";

export const createDIContainer = (init) => {
    const _injectables = {};
    if (init) {
        attachInjectableCollection(_injectables)(init)
    }
    const _id = Symbol("di");

    const returnSelf = overrideReturn(() => self)
    const self = {
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

const attachInjectableCollection = services => collection => Object.entries(collection).forEach(value => attachInjectable(services)(...value));

const attachInjectable = (services) => (serviceKey, serviceValue) => {
    services[serviceKey] = {
        value: null,
        ...getNormalizedServiceInitObject(serviceValue)
    };
};

const getNormalizedServiceInitObject = value => {
    if (isInitObject(value)) {
        return value;
    }

    if (typeof value === "function") {
        return { factory: value };
    }

    return { value };
};

const isInitObject = init => "factory" in init || "value" in init;

const tryResolveInjectable = (services, id) => name => {
    const service = services[name];

    if (!service) {
        throw new DIError(DIError.Code.NotRegistered, name);
    }

    if (service.value === null) {
        const factory = service.factory;
        try {
            service.value = factory.__diId === id ? factory() : factory(createResolverObject(services, id)());
        } catch (error) {
            if (error instanceof DIError) throw error;

            throw new DIError(DIError.Code.CouldNotResolveDeps, name, error);
        }
    }

    return service.value;
};

const createServiceGetter = (services, id) => name => ({ get: () => tryResolveInjectable(services, id)(name) });

const createResolverObject = (services, id) => without => {
    const skipKeys = without ? Object.keys(without) : [];

    return Object.defineProperties(
        without ?? {},
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

    constructor(code, message, error) {
        super(`${code}, ${message}`);
        this.code = code;
        this.innerError = error;
    }
}

const createDiInjectedFunction = (services, id) => fun => {
    const funWithDI = (params, ...rest) => fun(createResolverObject(services, id)(params), ...rest);
    funWithDI.__diId = id;

    return funWithDI;
};

const overrideReturn = (subject) => (fn) => (...args) => {
    const result = fn(...args)
    return subject(result)
}
