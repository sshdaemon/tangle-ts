// Each line marked with a hit comment holds the start of exactly one finding of the rule it names.
declare const store: { put(key: string, body: unknown): Promise<string>; gzip(id: string): Promise<Uint8Array>; plain(id: string): Promise<Uint8Array>; purge(id: string): Promise<void>; purgeAll(id: string): Promise<void> };
declare function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T>;
declare function withRetry(url: string, opts: { onUploaded?: (etag: string) => Promise<unknown>; attempts: number }): Promise<void>;

export class Reports {
  // A flag that picks a branch, and an optional callback next to it.
  async exportReport(
    id: string,
    {
      onProgress,
      compressed = false, // hit: tangle/selector-parameter
    }: { onProgress?: (done: number) => void; compressed?: boolean } = {}, // hit: tangle/callback-in-options
  ) {
    return withSpan('export', async () => {
      onProgress?.(0);
      const body = compressed ? await store.gzip(id) : await store.plain(id);
      return store.put(id, body);
    });
  }

  format(id: string, verbose: boolean) { // hit: tangle/selector-parameter
    if (!verbose) return id;
    return `${id} (full)`;
  }

  publish(id: string, opts: PublishOptions) { // hit: tangle/callback-in-options
    return opts.onPublished ? id : '';
  }

  trace(id: string, silent = false) { // hit: tangle/selector-parameter
    silent || console.log(id);
  }
}

interface PublishOptions {
  target: string;
  onPublished?(id: string): void;
}

export async function purgeCache(key: string, { everything }: { everything?: boolean }) { // hit: tangle/selector-parameter
  if (everything) await store.purgeAll(key);
  else await store.purge(key);
}

export async function uploadArchive(url: string) {
  let uploaded = false;
  await withRetry(url, {
    attempts: 3,
    onUploaded: async (etag) => {
      uploaded = (await store.put(url, etag)).length > 0; // hit: tangle/result-out-of-closure
    },
  });
  let size;
  await withSpan('measure', async () => {
    size = (await store.plain(url)).length; // hit: tangle/result-out-of-closure
  });
  return uploaded && size;
}
