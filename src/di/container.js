export const createDIContainer = (init) => {
    const _services = {};
    if (init) {
        attachServiceCollection(_services)(init)
    }
    const _id = Symbol("di");

    const returnSelf = overrideReturn(() => self)
    const self = {
        addCollection: returnSelf(attachServiceCollection(_services)),
        add: returnSelf(attachService(_services)),
        resolve: tryResolveService(_services, _id),
        injectFunction: createDiInjectedFunction(_services, _id),
        ...devOnlyObject({
            _services,
            _getSelfResolvers: getSelfResolvers(_services, _id),
            _getNamedResolver: createServiceGetter(_services, _id),
        })
    }

    return self
}

const attachServiceCollection = services => collection => Object.entries(collection).forEach(value => attachService(services)(...value));

const attachService = (services) => (serviceKey, serviceValue) => {
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

const tryResolveService = (services, id) => name => {
    const service = services[name];

    if (!service) {
        throw new DIError(DIError.Code.NotRegistered, name);
    }

    if (service.value === null) {
        const factory = service.factory;
        try {
            service.value = factory.__diId === id ? factory() : factory(getSelfResolvers(services)());
        } catch (e) {
            if (e instanceof DIError) throw e;

            throw new DIError(DIError.Code.CouldNotResolveDeps, name);
        }
    }

    return service.value;
};

const createServiceGetter = (services, id) => name => ({ get: () => tryResolveService(services, id)(name) });

const getSelfResolvers = (services, id) => without => {
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

    constructor(code, message) {
        super(`${code}, ${message}`);
        this.code = code;
    }
}

const createDiInjectedFunction = (services, id) => fun => {
    const funWithDI = (params, ...rest) => fun(getSelfResolvers(services, id)(params), ...rest);
    funWithDI.__diId = id;

    return funWithDI;
};

const overrideReturn = (subject) => (fn) => (...args) => {
    const result = fn(...args)
    return subject(result)
}

const devOnlyObject = ['test', 'development'].includes(process.env.NODE_ENV) ? (source) => source : () => ({})