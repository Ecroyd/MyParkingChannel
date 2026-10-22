// Ambient type references so `tsc --noEmit` passes in CI, where the
// gitignored next-env.d.ts (and .next/types) do not exist.

// Static image imports (e.g. `import markerPin from '/public/marker-pin.png'`).
// Same declarations next-env.d.ts pulls in; referencing twice is harmless.
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Vitest runs with `globals: true` (vitest.config.ts); expose describe/it/expect types.
/// <reference types="vitest/globals" />
