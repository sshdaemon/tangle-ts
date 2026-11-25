// None of this should be reported.
declare const store: { write(x: unknown): Promise<boolean>; setActive(a: boolean): void };
declare const emitter: { on(event: string, run: () => void): void };

interface TempDirRequest<T> {
  prefix: string;
  mode: number;
  run: (dir: string) => Promise<T>;
}

export class Workspace {
  private active = false;

  // Execute-around: one required callback, in an options object or as its own parameter.
  async withTempDir<T>({ prefix, mode, run }: TempDirRequest<T>): Promise<T> {
    console.log(prefix, mode);
    return run(`/tmp/${prefix}`);
  }

  async withSpan<T>(name: string, kind: string, fn: () => Promise<T>): Promise<T> {
    console.log(name, kind);
    return fn();
  }

  // Booleans stored or passed on are data, not selectors.
  setActive(active: boolean) {
    this.active = active;
    store.setActive(active);
  }

  toJson(id: string, archived: boolean) {
    return { id, archived };
  }

  describe(id: string, active: boolean) {
    return active === this.active ? id : '';
  }

  // Unused flags select nothing.
  touch(id: string, _force: boolean) {
    return id;
  }

  // Private and protected methods are not the class's API.
  private pick(id: string, all: boolean) {
    return all ? [] : [id];
  }

  protected pickToo(id: string, all: boolean) {
    return all ? [] : [id];
  }

  // A callback in an object with nothing else is a callback parameter.
  only({ onDone }: { onDone?: () => void }) {
    onDone?.();
  }

  // Required callbacks next to options are execute-around too.
  each(items: string[], opts: { limit: number; visit: (item: string) => void }) {
    items.slice(0, opts.limit).forEach(opts.visit);
  }

  async resultReturned(id: string) {
    const written = await this.withSpan(id, 'write', () => store.write(id));
    return written && this.pick(id, false);
  }
}

// Components and hooks take props with optional handlers by design.
export function Button({ onClick, disabled = false }: { onClick?: () => void; disabled?: boolean }) {
  return disabled ? null : onClick;
}

export function useToggle({ onChange, initial = false }: { onChange?: (v: boolean) => void; initial?: boolean }) {
  return initial ? onChange : undefined;
}

function helper(id: string, all: boolean) {
  return all ? [] : [id];
}

export async function accumulate(items: string[]) {
  // Loop accumulators and counters.
  let total = 0;
  for (const item of items) total += item.length;
  let seen = 0;
  await Promise.all(items.map(async (item) => {
    seen += 1;
    await store.write(item);
  }));
  await forEachPage(async (page) => {
    total += page.length;
  });
  // An event handler is not awaited.
  let done = false;
  emitter.on('end', () => {
    done = true;
  });
  // The handler sits inside the executor of an awaited promise, not in an awaited call.
  let finished = false;
  await new Promise<void>((resolve) => {
    emitter.on('end', () => {
      finished = true;
      resolve();
    });
  });
  // Shadowed inside the callback.
  let local = 0;
  await forEachPage(async () => {
    let local2 = 1;
    local2 = 2;
    return local2;
  });
  // A handler that reads the variable keeps state between calls.
  let lastReported = 0;
  await forEachPage(async (page) => {
    if (page.length - lastReported > 10) lastReported = page.length;
  });
  // The callback declares its own variable of the same name.
  await forEachPage(async () => {
    let local = 3;
    local = 4;
    return local;
  });
  for (let i = 0; i < 3; i++) await forEachPage(async () => { /* empty */ });
  return [total, seen, done, finished, local, lastReported, helper('x', true)];
}

declare function forEachPage(run: (page: string[]) => Promise<unknown>): Promise<void>;
