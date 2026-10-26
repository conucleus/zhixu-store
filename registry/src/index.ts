// Library entrypoint: permissionless zhixu descriptor records and wallet identity claims, no HTTP/UI.

export * from "./types";
export * from "./errors";
export * from "./canonical";
export * from "./eip712";
export * from "./verify";
export * from "./store";
export * from "./postgres/migrate";
export { PostgresZhixuRegistryStore } from "./postgres/store";
export type { PostgresZhixuRegistryStoreOptions } from "./postgres/store";
