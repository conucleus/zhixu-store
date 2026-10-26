// Named registry failures: invalid input, unverifiable wallet signature, conflicting immutable entry.

export class RegistryValidationError extends Error {
  override readonly name = "RegistryValidationError";
  readonly code = "registry_input_invalid";
}

export class RegistrySignatureError extends Error {
  override readonly name = "RegistrySignatureError";
  readonly code = "registry_signature_invalid";

  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
  }
}

export class RegistryEntryConflictError extends Error {
  override readonly name = "RegistryEntryConflictError";
  readonly code = "registry_entry_conflict";

  constructor(message: string, readonly key: Readonly<Record<string, string | number>>) {
    super(message);
  }
}
