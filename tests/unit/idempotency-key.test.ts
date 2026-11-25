import { afterEach, describe, expect, it } from "vitest";
import { newIdempotencyKey } from "@/components/idempotency-key";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newIdempotencyKey", () => {
  const original = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
  });

  it("uses crypto.randomUUID when the browser provides it", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    });
    expect(newIdempotencyKey()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("builds a uuid from getRandomValues when randomUUID is missing", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues(bytes: Uint8Array) {
          bytes.set([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
          return bytes;
        },
      },
    });
    expect(newIdempotencyKey()).toBe("00112233-4455-4677-8899-aabbccddeeff");
    expect(newIdempotencyKey()).toMatch(UUID_V4);
  });
});
