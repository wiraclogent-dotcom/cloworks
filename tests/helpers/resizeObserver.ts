// jsdom has no ResizeObserver. Radix Checkbox, Switch and RadioGroup measure their hidden form input with one
// whenever they sit inside a <form>, so every test that renders such a control needs this no-op.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
