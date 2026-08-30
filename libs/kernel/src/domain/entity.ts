export abstract class Entity<TId> {
  protected constructor(public readonly id: TId) {}
}
