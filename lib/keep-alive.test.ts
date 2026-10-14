import { describe, expect, it } from "vitest";
import { buildKeepAliveRequest } from "./keep-alive";

describe("buildKeepAliveRequest", () => {
  it("targets a minimal read on the leads table with apikey only", () => {
    const req = buildKeepAliveRequest(
      "https://xyz.supabase.co/",
      "test-anon-key",
    );
    expect(req.url).toBe(
      "https://xyz.supabase.co/rest/v1/consultation_requests?select=id&limit=1",
    );
    expect(req.headers.apikey).toBe("test-anon-key");
    // Same rule as the consultation insert: publishable keys are not JWTs,
    // and sending one as Bearer breaks PostgREST role resolution.
    expect(req.headers.Authorization).toBeUndefined();
  });
});
