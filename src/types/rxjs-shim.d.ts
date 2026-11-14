declare module 'rxjs' {
  export class Observable<T = unknown> {
    pipe(...operators: unknown[]): Observable<unknown>;
  }
}

declare module 'rxjs/operators' {
  export function tap<T>(callback: ((value: T) => unknown) | { next?: (value: T) => unknown }): (source: unknown) => unknown;
}
