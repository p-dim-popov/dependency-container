export const interceptReturn = <Fn extends (...args: any[]) => any, R>(
    intercept: (returns: ReturnType<Fn>) => R
) => (
    fn: Fn
): (...args: Parameters<Fn>) => R => (...args) => intercept(fn(...args))
