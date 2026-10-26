// Library entrypoint: permissionless zhixu descriptor records and wallet identity claims, no HTTP/UI.

export * from "./types.js";
export * from "./errors.js";
export * from "./canonical.js";
export * from "./verify.js";
export * from "./store.js";
export * from "./postgres/migrate.js";
export { PostgresZhixuRegistryStore } from "./postgres/store.js";
export type { PostgresZhixuRegistryStoreOptions } from "./postgres/store.js";
