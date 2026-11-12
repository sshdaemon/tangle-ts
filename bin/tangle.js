#!/usr/bin/env node
import { main } from '../src/cli/main.ts';

try {
  process.exit(await main(process.argv.slice(2)));
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
