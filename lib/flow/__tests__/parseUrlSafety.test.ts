import { assertSafePublicUrl } from "../parseUrl";

describe("link preview URL safety", () => {
  it("allows ordinary public http and https URLs", () => {
    expect(() =>
      assertSafePublicUrl("https://example.com/article"),
    ).not.toThrow();
    expect(() =>
      assertSafePublicUrl("http://example.com/article"),
    ).not.toThrow();
  });

  it.each([
    "http://localhost/",
    "http://app.localhost/",
    "http://router.local/",
    "http://service.internal/",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/",
    "http://0.0.0.0/",
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:7f00:1]/",
  ])("blocks private or local destination %s", (url) => {
    expect(() => assertSafePublicUrl(url)).toThrow();
  });

  it("blocks non-http protocols, credentials, and unusual ports", () => {
    expect(() => assertSafePublicUrl("file:///etc/passwd")).toThrow();
    expect(() =>
      assertSafePublicUrl("https://user:pass@example.com/"),
    ).toThrow();
    expect(() =>
      assertSafePublicUrl("http://example.com:8080/"),
    ).toThrow();
  });
});
