type DevOnlyObject = (<T>(object: T) => DevOnly<T>) | (() => {})

export type DevOnly<T> = { __DEV__?: T }

export const devOnlyObject: DevOnlyObject = ['test', 'development'].includes(process.env.NODE_ENV ?? '') ? (source) => ({ __DEV__: source }) : () => ({})