import {describe, expect, it, vi} from "vitest";
import {interceptReturn} from ".";

describe(interceptReturn.name, () => {
    it('should execute function', () => {
        const spy = vi.fn()
        const overridden = interceptReturn(() => null)(spy)

        overridden()

        expect(spy).toBeCalledTimes(1)
    })

    it('should return override', function () {
        const overridden = interceptReturn(() => 1)(() => 2)

        const result = overridden()

        expect(result).toEqual(1)
    });

    it('should pass return result to interceptor', function () {
        const overridden = interceptReturn((returns) => returns + 1)(() => 2)

        const result = overridden()

        expect(result).toEqual(3)
    });
})