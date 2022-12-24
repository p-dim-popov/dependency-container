export const overrideReturn = <Fn extends (...args: unknown[]) => any, R>(getReturn: (returns: ReturnType<Fn>) => R) => (fn: Fn): (...args: Parameters<Fn>) => R => (...args) => {
    const result = fn(...args)
    return getReturn(result)
}
