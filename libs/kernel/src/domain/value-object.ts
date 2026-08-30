export abstract class ValueObject<T> {
  protected constructor(protected readonly props: T) {}
}
