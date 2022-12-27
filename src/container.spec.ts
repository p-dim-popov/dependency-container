import { createDIContainer, DIError } from "./container";
import { describe, it, expect, vi } from "vitest";

describe("di container", function() {
    it("should instantiate with services", function() {
        const dateServiceFactory = () => Date;
        const container = createDIContainer({
            dateService: dateServiceFactory,
            serializer: {
                factory: () => {}
            }
        });

        expect(container.__DEV__?.injectables).toEqual(
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

    it("should throw not registered error when dependency is not declared", function() {
        type Fake = { build: () => string }
        type Services = {
            service: () => string;
            known: Fake;
        }
        const container = createDIContainer<Services>({
            service: ({ known }: { known: Fake }) => () => known.build(),
        });

        expect(() => container.resolve('service')).toThrowError(
            new DIError(DIError.Code.NotRegistered, "known")
        );
    });

    it("should throw when circular dependency is found", async function () {
        type Service = () => { build: () => string }
        type Services = {
            service1: Service
            service2: Service
        }
        const container = createDIContainer<Services>({
            service1: ({service2}: { service2: Service }) => () => ({ build: service2().build }),
            service2: ({service1}: { service1: Service }) => () => ({ build: service1().build }),
        });

        const resolve = (async () => container.resolve('service1'))()
        await expect(resolve).rejects.toEqual(
            new DIError(DIError.Code.CouldNotResolveDeps, "service1")
        );
        await expect(resolve).rejects.toHaveProperty('innerError', new RangeError('Maximum call stack size exceeded'))
    });

    it("should resolve service when requested", function() {
        const container = createDIContainer({ dateService: () => Date });

        expect(container.resolve("dateService")).toEqual(Date);
    });

    it("should resolve service with dependencies when requested", function() {
        type Serializer = { parse: <T>(string: string) => T & { _time: number } }
        type Services = {
            dateService: DateConstructor
            serializer: Serializer
        }
        const container = createDIContainer<Services>({
            dateService: () => Date,
            serializer: {
                factory: ({ dateService }: { dateService: DateConstructor }): Serializer => ({
                    parse: (string: string) => ({
                        ...JSON.parse(string),
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

    it("should inject dependencies if factory is not using injection", function() {
        const dateNowSpy = vi.spyOn(Date, "now");
        const container = createDIContainer({
            service1: () => Date,
            service2: ({ service1 }: { service1: DateConstructor }) => ({
                now: service1.now
            })
        });

        container.resolve("service2").now();

        expect(dateNowSpy).toBeCalled();
    });

    it("should not inject dependencies if factory is using injection", function() {
        const dateNowSpy =  vi.spyOn(Date, "now");

        type Services = {
            service1: DateConstructor
            service2: { now: () => number }
        }
        const container = createDIContainer<Services>({
            service1: () => Date
        });

        const createNowService = ({ service1 }: { service1: DateConstructor }) => ({ now: service1.now })
        const injectedCreateNowService = container.injectFunction(createNowService)
        container.add("service2", injectedCreateNowService);

        container.resolve("service2").now();

        expect(dateNowSpy).toBeCalled();
        // TODO: better test
    });

    {
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
    }

    describe("createInjectableGetter", function() {
        const service1 = { now: () => 1 };

        it("should return function for resolving single service", function() {
            const container = createDIContainer({ service1: { value: service1 } });

            const resolver = container.__DEV__?.createInjectableGetter("service1");

            expect(resolver?.get()).toEqual(service1);
        });

        it("should re-throw if caught error is DIError", function() {
            const container = createDIContainer({ service1: { value: service1 } });

            const resolver = container.__DEV__?.createInjectableGetter("service2" as 'service1');

            expect(resolver?.get).toThrowError(new DIError(DIError.Code.NotRegistered, "service2"));
        });

        it("should throw DIError if caught any error", function() {
            const container = createDIContainer({
                service1: () => {
                    throw new TypeError();
                }
            });

            const resolver = container.__DEV__?.createInjectableGetter("service1");

            expect(resolver?.get).toThrowError(new DIError(DIError.Code.CouldNotResolveDeps, "service1"));
        });
    });
});
