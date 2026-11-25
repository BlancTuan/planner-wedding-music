import { describe, expect, it } from "vitest";
import { errorResponse } from "@/server/http";

describe("errorResponse", () => {
  it("answers 404 when a path id is not a valid identifier", async () => {
    const response = errorResponse(Object.assign(new Error('invalid input syntax for type uuid: "x"'), { code: "22P02" }));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("still answers 500 for other database errors", () => {
    const response = errorResponse(Object.assign(new Error("boom"), { code: "XX000" }));

    expect(response.status).toBe(500);
  });
});
