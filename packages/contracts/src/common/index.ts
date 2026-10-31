export type EmptyContract = Record<string, never>;

export interface UserRpcAuthorityV1 {
  version: 1;
  kind: 'user';
  token: string;
}
export type AuthorizedRpcRequest<T> = T & { rpcAuthority: UserRpcAuthorityV1 };

export interface WorkspaceOption {
  id: string;
  displayName: string;
  status: string;
  roles: {
    code: 'administrator' | 'reception' | 'professional';
    label: string;
    professionals?: { id: string; displayName: string }[];
  }[];
}
export interface MyWorkspacesResponse {
  tenants: WorkspaceOption[];
}
export interface MyContextResponse {
  actorId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  professionalId?: string;
}
