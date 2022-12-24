export class DIContainer {
    static #isInitObject = init => "factory" in init || "value" in init;

    services = {};
    #id = Symbol("di");

    constructor(init) {
        if (init) {
            this.addCollection(init);
        }

        if (process.env.NODE_ENV === "test") {
            this._getNamedResolver = this.#getNamedResolver;
        }
    }

    #getNormalizedServiceInitObject = value => {
        if (DIContainer.#isInitObject(value)) {
            return value;
        }

        if (typeof value === "function") {
            return { factory: value };
        }

        return { value };
    };

    add = (serviceKey, serviceValue) => {
        const service = this.#getNormalizedServiceInitObject(serviceValue);

        this.services[serviceKey] = {
            value: null,
            ...service
        };

        return this;
    };

    addCollection = collection => {
        Object.entries(collection).forEach(value => this.add(...value));
        return this;
    };

    resolve = name => {
        const service = this.services[name];

        if (!service) {
            throw new DIError(DIError.Code.NotRegistered, name);
        }

        if (service.value === null) {
            const factory = service.factory;
            service.value = factory.__diId === this.#id ? factory() : factory(this.getSelfResolvers());
        }

        return service.value;
    };

    #getNamedResolver = key => ({
        get: () => {
            try {
                return this.resolve(key);
            } catch (e) {
                if (e instanceof DIError) throw e;

                console.error(e);
                throw new DIError(DIError.Code.CouldNotResolveDeps, key);
            }
        }
    });

    getSelfResolvers = without => {
        const skipKeys = without ? Object.keys(without) : [];

        return Object.defineProperties(
            without ?? {},
            Object.keys(this.services)
                .filter(prop => !skipKeys.includes(prop))
                .reduce(
                    (acc, key) => ({
                        ...acc,
                        [key]: this.#getNamedResolver(key)
                    }),
                    {}
                )
        );
    };

    injectFunction = fun => {
        const funWithDI = (params, ...rest) => fun(this.getSelfResolvers(params), ...rest);
        funWithDI.__diId = this.#id;

        return funWithDI;
    };
}

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
