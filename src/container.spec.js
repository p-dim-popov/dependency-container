import { createDIContainer, DIError } from "./container";

describe("di container", function() {
    it("should instantiate with services", function() {
        const dateServiceFactory = () => Date;
        const container = createDIContainer({
            dateService: dateServiceFactory,
            serializer: {
                factory: () => {}
            }
        });

        expect(container.__DEV__.injectables).toEqual(
            expect.objectContaining({
                dateService: {
                    factory: dateServiceFactory,
                    value: null
                },
                serializer: {
                    factory: expect.any(Function),
                    value: null
                }
            })
        );
    });

    it("should re-trow caught and throw custom error when cannot resolve dependencies", function() {
        const container = createDIContainer({
            service: ({ unknown }) => unknown().build()
        });

        expect(() => container.__DEV__.createResolverObject().service).toThrowError(
            new DIError(DIError.Code.CouldNotResolveDeps, "service")
        );
    });

    it("should throw when circular dependency is found", async function () {
        const container = createDIContainer({
            service1: ({service2}) => service2().build(),
            service2: ({service1}) => service1().build(),
        });

        const resolve = (async () => container.resolve('service1'))()
        await expect(resolve).rejects.toEqual(
            new DIError(DIError.Code.CouldNotResolveDeps, "service1")
        );
        await expect(resolve).rejects.toHaveProperty('innerError', new RangeError('Maximum call stack size exceeded'))
    });

    describe("resolve", () => {
        it("should resolve service with dependencies when requested", function() {
            const container = createDIContainer({
                dateService: () => Date,
                serializer: {
                    factory: ({ dateService }) => ({
                        parse: str => ({
                            ...JSON.parse(str),
                            _time: dateService.now()
                        })
                    })
                }
            });

            const serializer = container.resolve("serializer");
            const dummyData = JSON.stringify({ name: "Josh" });
            const result = serializer.parse(dummyData);
            expect(result).toHaveProperty("name", "Josh");
            expect(result).toHaveProperty("_time", expect.any(Number));
        });

        it("should resolve service when requested", function() {
            const container = createDIContainer({ dateService: () => Date });

            expect(container.resolve("dateService")).toEqual(Date);
        });

        it("should inject dependencies if factory is not using injection", function() {
            const dateNowSpy = vi.spyOn(Date, "now");
            const container = createDIContainer({
                service1: () => Date,
                service2: ({ service1 }) => ({
                    now: service1.now
                })
            });

            container.resolve("service2").now();

            expect(dateNowSpy).toBeCalled();
        });

        it("should not inject dependencies if factory is using injection", function() {
            const dateNowSpy = vi.spyOn(Date, "now");
            const container = createDIContainer({
                service1: () => Date
            });
            container.add(
                "service2",
                container.injectFunction(({ service1 }) => ({
                    now: service1.now
                }))
            );

            container.resolve("service2").now();

            expect(dateNowSpy).toBeCalled();
        });

        it("should throw error if requested service is not registered", function() {
            const container = createDIContainer();

            expect(() => container.resolve("unknown")).toThrowError(new DIError(DIError.Code.NotRegistered, "unknown"));
        });
    });

    describe("injectFunction", function() {
        const getInjectedDateNow = () => {
            const container = createDIContainer({ service1: () => ({ now: () => 1 }) });

            return container.injectFunction(({ service1 }) => service1.now());
        };

        it("should define dynamic properties for container services access to first param of injected function", function() {
            const getDateNow = getInjectedDateNow();

            expect(getDateNow()).toEqual(1);
        });

        it("should not override passed dependencies", function() {
            const getDateNow = getInjectedDateNow();

            expect(getDateNow({ service1: { now: () => 2 } })).toEqual(2);
        });
    });

    describe("createInjectableGetter", function() {
        const service1 = { now: () => 1 };

        it("should return function for resolving single service", function() {
            const container = createDIContainer({ service1 });

            const resolver = container.__DEV__.createInjectableGetter("service1");

            expect(resolver.get()).toEqual(service1);
        });

        it("should re-throw if caught error is DIError", function() {
            const container = createDIContainer({ service1 });

            const resolver = container.__DEV__.createInjectableGetter("service2");

            expect(resolver.get).toThrowError(new DIError(DIError.Code.NotRegistered, "service2"));
        });

        it("should throw DIError if caught any error", function() {
            const container = createDIContainer({
                service1: () => {
                    throw new TypeError();
                }
            });

            const resolver = container.__DEV__.createInjectableGetter("service1");

            expect(resolver.get).toThrowError(new DIError(DIError.Code.CouldNotResolveDeps, "service1"));
        });
    });
});
