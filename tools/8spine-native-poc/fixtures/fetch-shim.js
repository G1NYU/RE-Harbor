// This minimal fetch-shaped shim lives only in the compiled broker fixture.
(() => {
  "use strict";
  const bridge = globalThis.__fixtureBroker;
  delete globalThis.__fixtureBroker;
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const freeze = Object.freeze;
  Object.defineProperty(globalThis, "fetch", {
    configurable: false,
    writable: false,
    value: async (url, options = {}) => {
      if (
        typeof url !== "string" ||
        options === null ||
        typeof options !== "object" ||
        Object.keys(options).some((key) => key !== "method")
      ) {
        throw new Error("invalid-request");
      }
      const reply = parse(bridge(stringify({ url, method: options.method ?? "GET" })));
      if (!reply.ok) throw new Error(reply.error);
      const { status, body } = reply.response;
      return freeze({
        status,
        ok: status >= 200 && status < 300,
        text: async () => body,
        json: async () => parse(body),
      });
    },
  });
})();
