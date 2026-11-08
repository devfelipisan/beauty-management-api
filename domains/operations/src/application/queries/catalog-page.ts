export type CatalogKind = 'customers' | 'professionals' | 'services';
export type CatalogRow = { id: string; tenantId: string } & Record<
  string,
  unknown
>;
export interface CatalogReadRepository {
  list(
    kind: CatalogKind,
    tenantId: string,
    limit: number,
    after?: string,
    professionalId?: string,
  ): Promise<CatalogRow[]>;
}
export interface CatalogAuthority {
  tenantId: string;
  actorId?: string;
  mode?: 'selector';
  permissions: readonly string[];
  professionalId?: string;
  selectedRole?: string;
}
const permissions = {
  customers: 'customer.read',
  professionals: 'professional.read',
  services: 'service.read',
};
export class ReadCatalogPage {
  constructor(private readonly repository: CatalogReadRepository) {}
  async execute(
    kind: CatalogKind,
    input: { limit?: string; cursor?: string },
    authority: CatalogAuthority,
  ) {
    if (
      (!authority.actorId && authority.mode !== 'selector') ||
      !authority.tenantId ||
      !authority.permissions.includes(permissions[kind])
    )
      throw new Error('PERMISSION_DENIED');
    const limit = input.limit === undefined ? 20 : Number(input.limit);
    if (
      (input.limit !== undefined && !/^[1-9]\d*$/.test(input.limit)) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error('VALIDATION_ERROR');
    const scope = JSON.stringify([
      kind,
      authority.tenantId,
      authority.mode === 'selector' ? ['selector'] : authority.actorId,
      authority.selectedRole ?? null,
      authority.professionalId ?? null,
      [...authority.permissions].sort(),
    ]);
    let after: string | undefined;
    if (input.cursor !== undefined) {
      try {
        const value: unknown = JSON.parse(
          decodeURIComponent(atob(input.cursor)),
        );
        if (
          !value ||
          typeof value !== 'object' ||
          !('scope' in value) ||
          value.scope !== scope ||
          !('id' in value) ||
          typeof value.id !== 'string' ||
          !value.id
        )
          throw new Error();
        after = value.id;
      } catch {
        throw new Error('VALIDATION_ERROR');
      }
    }
    const rows = await this.repository.list(
      kind,
      authority.tenantId,
      limit + 1,
      after,
      authority.professionalId,
    );
    if (rows.some((row) => row.tenantId !== authority.tenantId))
      throw new Error('TENANT_ACCESS_DENIED');
    const data = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      data,
      page: {
        hasMore,
        nextCursor: hasMore
          ? btoa(
              encodeURIComponent(
                JSON.stringify({ scope, id: data.at(-1)!.id }),
              ),
            )
          : null,
      },
    };
  }
}
