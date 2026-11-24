declare module 'rxjs' {
  export class Observable<T = unknown> {
    pipe(...operators: unknown[]): Observable<unknown>;
  }
  export function throwError(errorFactory: () => unknown): Observable<never>;
}

declare module 'rxjs/operators' {
  export function tap<T>(callback: ((value: T) => unknown) | { next?: (value: T) => unknown }): (source: unknown) => unknown;
  export function catchError<T, O extends Observable<unknown>>(selector: (err: unknown, caught: Observable<T>) => O): (source: unknown) => unknown;
}
