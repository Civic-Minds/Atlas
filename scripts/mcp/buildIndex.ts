/**
 * Builds the Atlas Studio MCP server's agency index (rank_agencies reads it): every available agency's routes and their
 * waitMinutes per period and day type, from the route files the server reads, with the same functions. Run once after
 * the release cache changes, throttled:
 *
 *   nice -n 15 npx tsx scripts/mcp/buildIndex.ts
 */
export {};
console.log = (...args: unknown[]) => console.error(...args);
const data = await import('./atlasData');
const out = data.buildIndex((done, total) => { if (done % 50 === 0 || done === total) console.error(`${done}/${total}`); });
console.error(`Wrote ${data.indexFile()}: ${out.length} agencies`);
