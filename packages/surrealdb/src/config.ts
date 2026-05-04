import type { Surreal } from 'surrealdb';

export interface SurrealDBBaseConfig {
  id: string;
  namespace?: string;
  database?: string;
  disableInit?: boolean;
}

export interface SurrealDBUrlConfig extends SurrealDBBaseConfig {
  url: string;
  username: string;
  password: string;
}

export interface SurrealDBTokenConfig extends SurrealDBBaseConfig {
  url: string;
  token: string;
}

export interface SurrealDBInstanceConfig extends SurrealDBBaseConfig {
  db: Surreal;
}

export type SurrealDBStoreConfig =
  | SurrealDBUrlConfig
  | SurrealDBTokenConfig
  | SurrealDBInstanceConfig;

export function isUrlConfig(cfg: SurrealDBStoreConfig): cfg is SurrealDBUrlConfig {
  return 'username' in cfg && 'password' in cfg;
}

export function isTokenConfig(cfg: SurrealDBStoreConfig): cfg is SurrealDBTokenConfig {
  return 'token' in cfg && !('username' in cfg);
}

export function isInstanceConfig(cfg: SurrealDBStoreConfig): cfg is SurrealDBInstanceConfig {
  return 'db' in cfg;
}
