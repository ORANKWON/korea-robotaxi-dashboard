/**
 * scripts/build-zones.ts — Build zones.json from zones.source.json + 행정동 GeoJSON union.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (zone-polygons-v1 plan, Phase 1).
 *
 * Usage:
 *   bun scripts/build-zones.ts             # build + write data/zones.json
 *   bun scripts/build-zones.ts --check     # build to memory, diff against existing → exit 1 if drift
 *   bun scripts/build-zones.ts --fixture   # MultiPolygon spike (Phase 1 Action Item #1)
 *
 * Pipeline per zone:
 *   1. Read dong_codes from zones.source.json (10-digit BJDONG codes, matches vuski adm_cd2)
 *   2. Filter admin-dong features by code (missing code → exit 1 with the offending zone id)
 *   3. turf.union all matched features → Polygon | MultiPolygon (turf returns whichever fits)
 *   4. turf.simplify(0.0001) — Visvalingam, ~1km tolerance at Korean latitudes
 *   5. Compute area via turf.area, compare to declared area_km2 (>5% drift → WARN, no exit)
 *   6. Convert GeoJSON [lng, lat] → Leaflet [lat, lng] for the boundary field
 *   7. Atomic write to data/zones.json (write to .tmp, fsync, rename)
 *
 * Zones without dong_codes keep their existing boundary verbatim — partial migration safe.
 *
 * Non-deterministic risks I've already burned and fixed:
 *   - JSON.stringify spaces: locked to 2 to match the pre-existing data files
 *   - feature ordering inside union: dong_codes order is preserved → union is order-stable
 *   - simplify can introduce floating-point dust at the 6th decimal → rounded to 6dp
 *
 * Why this lives in scripts/ (not src/lib/): Vercel only runs `next build`,
 * which inlines `data/zones.json` as-is. This script runs locally + in CI when
 * a contributor edits zones.source.json.
 */
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { area, featureCollection, simplify, union } from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

// ─── Paths ──────────────────────────────────────────────────────────────────
// Resolved against the repo root so it works from any cwd.

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const ADMIN_DONG_GZ = path.join(DATA_DIR, "admin-dong.geojson.gz");
const ADMIN_DONG_LOCK = path.join(DATA_DIR, "admin-dong.geojson.lock.json");
const ZONES_SOURCE = path.join(DATA_DIR, "zones.source.json");
const ZONES_OUT = path.join(DATA_DIR, "zones.json");

// ─── CLI ────────────────────────────────────────────────────────────────────

const argv = new Set(process.argv.slice(2));
const CHECK_MODE = argv.has("--check");
const FIXTURE_MODE = argv.has("--fixture");

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * The minimal shape the script touches. Other fields (status, companies,
 * description, ...) are passed through verbatim. Keeping this loose so
 * adding fields to zones.source.json doesn't require touching this script.
 */
interface ZoneSource {
  id: number;
  name: string;
  area_km2: number;
  /** Optional during migration — zones without this keep their hand-drawn boundary. */
  dong_codes?: string[];
  /** Hand-drawn boundary fallback. Only used if dong_codes is missing/empty. */
  boundary?: number[][] | number[][][];
  // pass-through:
  [key: string]: unknown;
}

interface AdminDongProps {
  /** 10-digit BJDONG code, e.g. "1168068000". This is what dong_codes references. */
  adm_cd2: string;
  /** 8-digit short form. Don't use for joining. */
  adm_cd: string;
  /** Korean name, e.g. "서울특별시 강남구 역삼1동". Used in error messages. */
  adm_nm: string;
}

type AdminDongFeature = Feature<Polygon | MultiPolygon, AdminDongProps>;
type AdminDongCollection = FeatureCollection<
  Polygon | MultiPolygon,
  AdminDongProps
>;

// ─── Lockfile checksum verification ─────────────────────────────────────────

interface AdminDongLock {
  source: string;
  version: string;
  vuski_commit: string;
  raw_sha256: string;
  gz_sha256: string;
  feature_count: number;
}

function verifyLockfile(): AdminDongLock {
  const lock = JSON.parse(readFileSync(ADMIN_DONG_LOCK, "utf8")) as AdminDongLock;
  const actualGz = createHash("sha256")
    .update(readFileSync(ADMIN_DONG_GZ))
    .digest("hex");
  if (actualGz !== lock.gz_sha256) {
    console.error(
      `\n[×] admin-dong.geojson.gz checksum mismatch.\n` +
        `    expected: ${lock.gz_sha256}\n` +
        `    actual:   ${actualGz}\n\n` +
        `    If this change is intentional (vuski version bump):\n` +
        `      1. update data/admin-dong.geojson.lock.json with the new sha256\n` +
        `      2. update version + vuski_commit + downloaded_at fields\n` +
        `      3. re-run this script to regenerate zones.json\n\n` +
        `    Otherwise restore the file: git restore data/admin-dong.geojson.gz\n`,
    );
    process.exit(1);
  }
  return lock;
}

// ─── GeoJSON load ───────────────────────────────────────────────────────────

function loadAdminDong(): AdminDongCollection {
  const gz = readFileSync(ADMIN_DONG_GZ);
  const raw = gunzipSync(gz).toString("utf8");
  const fc = JSON.parse(raw) as AdminDongCollection;
  if (!fc?.features || !Array.isArray(fc.features)) {
    throw new Error("admin-dong.geojson did not parse to a FeatureCollection");
  }
  return fc;
}

function indexByDongCode(
  fc: AdminDongCollection,
): Map<string, AdminDongFeature> {
  const map = new Map<string, AdminDongFeature>();
  for (const f of fc.features) {
    const code = f.properties?.adm_cd2;
    if (!code) continue;
    map.set(code, f);
  }
  return map;
}

// ─── Coord helpers ──────────────────────────────────────────────────────────

const COORD_PRECISION = 6;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Convert a GeoJSON ring (`[lng, lat][]`) to a Leaflet ring (`[lat, lng][]`)
 * with 6-decimal rounding to suppress floating-point dust from simplify().
 */
function ringToLeaflet(ring: Position[]): [number, number][] {
  return ring.map(([lng, lat]) => [round6(lat), round6(lng)] as [number, number]);
}

/**
 * Build the `boundary` payload for a Zone. Polygon → single ring (legacy
 * shape). MultiPolygon → array of rings (new shape, see types.ts ZoneBoundary).
 *
 * We only emit the OUTER ring of each polygon. Holes (inner rings) are rare
 * for 행정동 boundaries and Leaflet's <Polygon> handles them clumsily. If a
 * zone genuinely has a hole, we'd revisit (no current case in 29 zones).
 */
function geometryToBoundary(
  g: Polygon | MultiPolygon,
): [number, number][] | [number, number][][] {
  if (g.type === "Polygon") {
    return ringToLeaflet(g.coordinates[0]);
  }
  // MultiPolygon
  return g.coordinates.map((poly) => ringToLeaflet(poly[0]));
}

// ─── Per-zone build ─────────────────────────────────────────────────────────

interface BuildResult {
  zone_id: number;
  zone_name: string;
  /** "union" if rebuilt from dong_codes, "manual" if preserved hand-drawn. */
  source: "union" | "manual";
  dong_count: number;
  point_count: number;
  is_multipolygon: boolean;
  area_km2_computed: number;
  area_km2_declared: number;
  /** Signed % delta: (computed - declared) / declared. */
  area_drift_pct: number;
  /** WARN messages for the build report. */
  warnings: string[];
}

function buildZoneFromDongs(
  zone: ZoneSource,
  dongIndex: Map<string, AdminDongFeature>,
  boundarySource: string,
  builtAt: string,
): { zone: Record<string, unknown>; result: BuildResult } {
  const dongCodes = zone.dong_codes ?? [];
  const features: AdminDongFeature[] = [];
  for (const code of dongCodes) {
    const f = dongIndex.get(code);
    if (!f) {
      console.error(
        `\n[×] zone id=${zone.id} (${zone.name}): dong_code "${code}" not found ` +
          `in vuski geojson. Check the 10-digit BJDONG code (adm_cd2). ` +
          `Tip: vuski uses adm_cd2 (10-digit), not adm_cd (8-digit).\n`,
      );
      process.exit(1);
    }
    features.push(f);
  }

  if (features.length === 0) {
    throw new Error(
      `zone id=${zone.id}: dong_codes was empty after lookup — should have ` +
        `been routed through preserveExisting() instead`,
    );
  }

  // turf v7: union takes a FeatureCollection. For a single feature we just
  // pass it through (no merge needed). The v6→v7 API change tripped me up
  // initially — leaving the comment so future me doesn't repeat the spike.
  let merged: Feature<Polygon | MultiPolygon>;
  if (features.length === 1) {
    merged = features[0] as Feature<Polygon | MultiPolygon>;
  } else {
    const fc = featureCollection(
      features as Feature<Polygon | MultiPolygon>[],
    );
    const result = union(fc);
    if (!result) {
      throw new Error(
        `zone id=${zone.id}: turf.union returned null. Likely invalid geometry ` +
          `in one of: ${features.map((f) => f.properties.adm_nm).join(", ")}.`,
      );
    }
    merged = result as Feature<Polygon | MultiPolygon>;
  }

  // Simplify. ~0.0001° ≈ 11m at Seoul latitude. Visvalingam preserves area
  // better than Douglas-Peucker for our use case.
  const simplified = simplify(merged, {
    tolerance: 0.0001,
    highQuality: true,
  }) as Feature<Polygon | MultiPolygon>;

  const geom = simplified.geometry;
  const boundary = geometryToBoundary(geom);
  const isMultipolygon = geom.type === "MultiPolygon";
  const pointCount = countBoundaryPoints(boundary);

  const computedM2 = area(simplified);
  const computedKm2 = round6(computedM2 / 1_000_000);
  const declared = zone.area_km2;
  const drift = ((computedKm2 - declared) / declared) * 100;

  const warnings: string[] = [];
  if (Math.abs(drift) > 5) {
    warnings.push(
      `area drift ${drift > 0 ? "+" : ""}${drift.toFixed(1)}% (computed ${computedKm2} km² vs declared ${declared} km²). ` +
        `Likely cause: missing/extra dong_codes, or 공식 area_km2 is approximate.`,
    );
  }

  // Build the output zone. We pass through everything the source had EXCEPT
  // the build-managed fields, then layer those on top.
  const out: Record<string, unknown> = { ...zone };
  delete out.dong_codes; // moved below in canonical order
  out.dong_codes = dongCodes;
  out.boundary = boundary;
  out.boundary_source = boundarySource;
  out.boundary_built_at = builtAt;
  out.area_km2_computed = computedKm2;

  const result: BuildResult = {
    zone_id: zone.id,
    zone_name: zone.name,
    source: "union",
    dong_count: dongCodes.length,
    point_count: pointCount,
    is_multipolygon: isMultipolygon,
    area_km2_computed: computedKm2,
    area_km2_declared: declared,
    area_drift_pct: drift,
    warnings,
  };

  return { zone: out, result };
}

function preserveExisting(zone: ZoneSource): {
  zone: Record<string, unknown>;
  result: BuildResult;
} {
  if (!zone.boundary) {
    throw new Error(
      `zone id=${zone.id} (${zone.name}): no dong_codes AND no fallback boundary. ` +
        `One of them is required.`,
    );
  }
  const point_count = countBoundaryPoints(zone.boundary as [number, number][]);
  const result: BuildResult = {
    zone_id: zone.id,
    zone_name: zone.name,
    source: "manual",
    dong_count: 0,
    point_count,
    is_multipolygon: Array.isArray(
      (zone.boundary as number[][][])[0]?.[0],
    )
      ? typeof (zone.boundary as number[][][])[0][0][0] !== "number"
      : false,
    area_km2_computed: zone.area_km2,
    area_km2_declared: zone.area_km2,
    area_drift_pct: 0,
    warnings: [],
  };
  return { zone: { ...zone }, result };
}

function countBoundaryPoints(
  b: [number, number][] | [number, number][][] | number[][] | number[][][],
): number {
  if (b.length === 0) return 0;
  // [number, number][][] (MultiPolygon)
  if (Array.isArray(b[0]) && Array.isArray((b[0] as unknown[])[0])) {
    return (b as [number, number][][]).reduce((sum, ring) => sum + ring.length, 0);
  }
  return b.length;
}

// ─── Pretty serialization ───────────────────────────────────────────────────
//
// Default JSON.stringify(_, _, 2) explodes every array to multi-line. For
// zones.json that produces 2.9k+ line diffs for cosmetic-only changes, which
// destroys reviewability. The original hand-formatted file used:
//   - inline arrays of primitives (companies, dong_codes)
//   - one [lat, lng] pair per line inside boundary
// We replicate that here. Output stays valid JSON (parsed → re-stringified
// → identical structure as the default formatter would have produced).

const INLINE_MAX_LEN = 100;

function isPrimitive(v: unknown): boolean {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function isCoordPair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number"
  );
}

function prettyStringify(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (isPrimitive(value)) return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";

    // Case 1: array of primitives — inline if it fits.
    if (value.every(isPrimitive)) {
      const inline = "[" + value.map((v) => JSON.stringify(v)).join(", ") + "]";
      if (inline.length <= INLINE_MAX_LEN) return inline;
    }

    // Case 2: array of [number, number] coord pairs — one pair per line.
    if (value.every(isCoordPair)) {
      const pairs = (value as [number, number][]).map(
        ([a, b]) => `${padInner}[${a}, ${b}]`,
      );
      return "[\n" + pairs.join(",\n") + "\n" + pad + "]";
    }

    // Case 3: array of arrays of coord pairs (MultiPolygon rings).
    if (
      value.every(
        (ring) => Array.isArray(ring) && (ring as unknown[]).every(isCoordPair),
      )
    ) {
      const rings = (value as [number, number][][]).map((ring) => {
        const pairs = ring.map(([a, b]) => `${"  ".repeat(indent + 2)}[${a}, ${b}]`);
        return `${padInner}[\n` + pairs.join(",\n") + `\n${padInner}]`;
      });
      return "[\n" + rings.join(",\n") + "\n" + pad + "]";
    }

    // Case 4: general fallback — multi-line.
    const items = value.map((v) => padInner + prettyStringify(v, indent + 1));
    return "[\n" + items.join(",\n") + "\n" + pad + "]";
  }

  // Object
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";
  const lines = keys.map(
    (k) =>
      `${padInner}${JSON.stringify(k)}: ${prettyStringify(obj[k], indent + 1)}`,
  );
  return "{\n" + lines.join(",\n") + "\n" + pad + "}";
}

// ─── Atomic write ───────────────────────────────────────────────────────────

function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, content, "utf8");
  // fsync the file before rename so a crash mid-write can't leave a partial.
  const fd = openSync(tmp, "r");
  fsyncSync(fd);
  closeSync(fd);
  renameSync(tmp, filePath);
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function printReport(results: BuildResult[]): void {
  const widthName = Math.max(...results.map((r) => r.zone_name.length), 20);
  for (const r of results) {
    const status = r.warnings.length > 0 ? "[⚠]" : "[✓]";
    const driftStr =
      r.source === "manual"
        ? "  manual  "
        : `${r.area_drift_pct >= 0 ? "+" : ""}${r.area_drift_pct.toFixed(1)}%`;
    const multi = r.is_multipolygon ? " MP" : "   ";
    console.log(
      `${status} id=${String(r.zone_id).padStart(2)} ` +
        `${r.zone_name.padEnd(widthName)} ` +
        `${String(r.dong_count).padStart(3)} dong → ` +
        `${String(r.point_count).padStart(4)} pts${multi} → ` +
        `${r.area_km2_computed.toFixed(2).padStart(6)} km² ` +
        `(decl ${r.area_km2_declared.toFixed(2)}, ${driftStr})`,
    );
    for (const w of r.warnings) {
      console.log(`     ${w}`);
    }
  }
  const unionCount = results.filter((r) => r.source === "union").length;
  const manualCount = results.filter((r) => r.source === "manual").length;
  const warnCount = results.filter((r) => r.warnings.length > 0).length;
  console.log(
    `\n— ${results.length} zones (${unionCount} from dong_codes, ${manualCount} preserved manual)` +
      (warnCount > 0 ? `, ${warnCount} with warnings` : ""),
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  if (FIXTURE_MODE) {
    runFixture();
    return;
  }

  const lock = verifyLockfile();
  const fc = loadAdminDong();
  const dongIndex = indexByDongCode(fc);
  console.log(
    `Loaded ${fc.features.length} 행정동 from vuski/admdongkor ${lock.version}.`,
  );

  const sources = JSON.parse(readFileSync(ZONES_SOURCE, "utf8")) as ZoneSource[];
  const builtAt = new Date().toISOString();
  const boundarySource = `행정동 union (vuski/admdongkor ${lock.version})`;

  const outputZones: Record<string, unknown>[] = [];
  const results: BuildResult[] = [];

  for (const zone of sources) {
    const dongCodes = zone.dong_codes ?? [];
    const built =
      dongCodes.length > 0
        ? buildZoneFromDongs(zone, dongIndex, boundarySource, builtAt)
        : preserveExisting(zone);
    outputZones.push(built.zone);
    results.push(built.result);
  }

  // Custom serializer: matches the original hand-formatted file's style
  // (inline short arrays, one [lat, lng] pair per line). Reviewability >>
  // raw `JSON.stringify(_, _, 2)` blowing every array out to multi-line.
  const serialized = prettyStringify(outputZones) + "\n";

  if (CHECK_MODE) {
    // boundary_built_at is set to `new Date()` per run, so two builds at
    // different wall-clock times produce different bytes even with identical
    // dong_codes. Strip the timestamp from both sides before comparing —
    // the whole point of --check is "did the source/data change?", not
    // "did time pass?".
    const stripBuiltAt = (s: string): string =>
      s.replace(/"boundary_built_at": "[^"]+",?\n\s*/g, "");
    const existing = readFileSync(ZONES_OUT, "utf8");
    if (stripBuiltAt(existing) !== stripBuiltAt(serialized)) {
      console.error(
        `\n[×] data/zones.json is out of date.\n` +
          `    Run: bun scripts/build-zones.ts\n` +
          `    Then commit the updated data/zones.json.\n`,
      );
      process.exit(1);
    }
    console.log("[✓] zones.json matches build output (timestamp ignored).");
  } else {
    atomicWrite(ZONES_OUT, serialized);
    console.log(`[✓] wrote ${ZONES_OUT}`);
  }

  printReport(results);
}

// ─── MultiPolygon spike fixture ─────────────────────────────────────────────
//
// Locked-in by /plan-eng-review 2026-04-17 (Action Item #1). Synthesizes a
// zone spanning 강남구 역삼1동 + 종로구 종로1·2·3·4가동 — guaranteed
// non-adjacent → turf.union returns MultiPolygon. Writes to a side file,
// NOT zones.json, so it can be inspected without polluting prod data.

function runFixture(): void {
  verifyLockfile();
  const fc = loadAdminDong();
  const dongIndex = indexByDongCode(fc);

  // 역삼1동 + 종로1·2·3·4가동 — pulled from vuski adm_cd2 lookups.
  const FIXTURE_DONGS = ["1168064000", "1111051500"];
  const fixtureZone: ZoneSource = {
    id: 9999,
    name: "MultiPolygon spike (역삼1동 + 종로1·2·3·4가동)",
    region: "spike",
    lat: 37.55,
    lng: 127.0,
    area_km2: 99.9,
    status: "spike",
    companies: [],
    description: "synthetic non-adjacent fixture for MapView verification",
    dong_codes: FIXTURE_DONGS,
  } as unknown as ZoneSource;

  const built = buildZoneFromDongs(
    fixtureZone,
    dongIndex,
    "fixture",
    new Date().toISOString(),
  );
  const out = path.join(REPO_ROOT, "data", "zones.fixture.json");
  atomicWrite(out, prettyStringify([built.zone]) + "\n");
  console.log(`[✓] wrote fixture: ${out}`);
  console.log(
    `    is_multipolygon=${built.result.is_multipolygon}, ` +
      `points=${built.result.point_count}`,
  );
  if (!built.result.is_multipolygon) {
    console.error(
      `\n[×] Spike expected MultiPolygon, got Polygon. The two fixture dongs ` +
        `may be adjacent in this vuski version. Pick another non-adjacent pair.\n`,
    );
    process.exit(1);
  }
}

main();
