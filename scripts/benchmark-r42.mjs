import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { RevisionesController } from "../src/controllers/revisiones.controller.js";
import { CONSENSUS_FIELDS, buildConsensusReport } from "../src/services/consenso.service.js";

const DEFAULTS = {
  skus: 7594,
  branches: 7,
  runs: 20,
  warmup: 3,
  thresholdMs: 2000,
  concurrentSessions: 21,
  campaniaId: 4202,
};

const parseArgs = (argv) => {
  const args = { ...DEFAULTS, out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === "out") {
      args.out = next || "";
      i += 1;
      continue;
    }
    if (Object.hasOwn(args, key)) {
      const value = Number(next);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid value for --${key}`);
      }
      args[key] = value;
      i += 1;
    }
  }
  return args;
};

const padSku = (n) => `TEST-R42-${String(n).padStart(5, "0")}`;
const pad2 = (n) => String(n).padStart(2, "0");

const generateFixture = ({ skus, branches, campaniaId }) => {
  const branchNames = Array.from({ length: branches }, (_, i) => `SUC-${pad2(i + 1)}`);
  const snapshots = [];
  const maestro = [];
  const escaneos = [];
  const actualizaciones = [];
  let scanId = 1;
  let actId = 1;
  const baseTime = Date.UTC(2026, 9, 1, 12, 0, 0);

  for (let i = 1; i <= skus; i += 1) {
    const sku = padSku(i);
    const snapshot = {
      id: i,
      campaniaId,
      sku,
      descripcion: `Producto ficticio ${i}`,
      categoria_cod: pad2((i % 51) + 1),
      tipo_cod: pad2((i % 28) + 1),
      clasif_cod: pad2((i % 16) + 1),
    };
    snapshots.push(snapshot);
    maestro.push({ ...snapshot });

    for (let b = 0; b < branchNames.length; b += 1) {
      const branch = branchNames[b];
      const categoryShift = (i + b) % 5 === 0 ? 1 : 0;
      const typeShift = (i + b) % 7 === 0 ? 1 : 0;
      const classShift = (i + b) % 11 === 0 ? 1 : 0;
      escaneos.push({
        id: scanId,
        campaniaId,
        sku,
        sucursal: branch,
        email: `${branch.toLowerCase()}@test.local`,
        asum_categoria_cod: pad2(((Number(snapshot.categoria_cod) + categoryShift - 1) % 99) + 1),
        asum_tipo_cod: pad2(((Number(snapshot.tipo_cod) + typeShift - 1) % 99) + 1),
        asum_clasif_cod: pad2(((Number(snapshot.clasif_cod) + classShift - 1) % 99) + 1),
        ts: new Date(baseTime + scanId * 1000),
      });
      scanId += 1;
    }

    if (i % 13 === 0) {
      actualizaciones.push({
        id: actId,
        campaniaId,
        sku,
        estado: i % 26 === 0 ? "aplicada" : "pendiente",
        archivada: false,
        decidedBy: "r42@test.local",
        decidedAt: new Date(baseTime + i * 1000),
        ts: new Date(baseTime + i * 1000),
        new_categoria_cod: pad2(((Number(snapshot.categoria_cod) + 1 - 1) % 99) + 1),
        new_tipo_cod: "",
        new_clasif_cod: "",
      });
      actId += 1;
    }
  }

  return {
    campaniaId,
    branchNames,
    snapshots,
    maestro,
    escaneos,
    actualizaciones,
    unknownSkus: [],
    stages: [],
  };
};

const byCampania = (rows, campaniaId) => rows.filter((row) => Number(row.campaniaId) === Number(campaniaId));

const filterSkuIn = (rows, where = {}) => {
  const skuIn = where?.sku?.in;
  if (!Array.isArray(skuIn)) return rows;
  const set = new Set(skuIn);
  return rows.filter((row) => set.has(row.sku));
};

const sortByOrder = (rows, orderBy) => {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [[key, dir]] = Object.entries(order);
      const av = a[key] instanceof Date ? a[key].getTime() : a[key];
      const bv = b[key] instanceof Date ? b[key].getTime() : b[key];
      if (av === bv) continue;
      const result = av > bv ? 1 : -1;
      return dir === "desc" ? -result : result;
    }
    return 0;
  });
};

const createFakePrisma = (fixture) => ({
  campania: {
    findFirst: async ({ where } = {}) => (where?.activa ? { id: fixture.campaniaId, activa: true } : null),
  },
  escaneo: {
    findMany: async ({ where = {}, orderBy } = {}) =>
      sortByOrder(byCampania(fixture.escaneos, where.campaniaId), orderBy),
  },
  campaniaMaestro: {
    findMany: async ({ where = {} } = {}) => byCampania(fixture.snapshots, where.campaniaId),
  },
  maestro: {
    findMany: async ({ where = {} } = {}) => filterSkuIn(fixture.maestro, where),
  },
  unknownSku: {
    findMany: async ({ where = {} } = {}) => byCampania(fixture.unknownSkus, where.campaniaId),
  },
  skuStage: {
    findMany: async ({ where = {} } = {}) => byCampania(fixture.stages, where.campaniaId),
  },
  actualizacion: {
    findMany: async ({ where = {}, orderBy } = {}) => {
      let rows = byCampania(fixture.actualizaciones, where.campaniaId);
      if (where.archivada !== undefined) rows = rows.filter((row) => row.archivada === where.archivada);
      if (where.estado?.in) rows = rows.filter((row) => where.estado.in.includes(row.estado));
      return sortByOrder(rows, orderBy);
    },
  },
});

const createResponse = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  send(body) {
    this.body = body;
    return this;
  },
  setHeader(key, value) {
    this.headers[key] = value;
    return this;
  },
});

const invoke = async (handler, query) => {
  const res = createResponse();
  await handler({ query, id: "benchmark-r42" }, res);
  if (res.statusCode >= 400) {
    throw new Error(`Handler failed with ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
};

const percentile = (values, pct) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
};

const summarize = (samples) => ({
  runs: samples.length,
  minMs: Number(Math.min(...samples).toFixed(2)),
  medianMs: Number(percentile(samples, 50).toFixed(2)),
  p95Ms: Number(percentile(samples, 95).toFixed(2)),
  maxMs: Number(Math.max(...samples).toFixed(2)),
});

const time = async (fn) => {
  const start = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - start };
};

const runMeasured = async ({ name, warmup, runs, fn }) => {
  for (let i = 0; i < warmup; i += 1) await fn();
  const samples = [];
  let lastValue = null;
  for (let i = 0; i < runs; i += 1) {
    const { value, ms } = await time(fn);
    samples.push(ms);
    lastValue = value;
  }
  return { name, ...summarize(samples), lastValue };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const fixture = generateFixture(args);
  const prisma = createFakePrisma(fixture);
  const controller = RevisionesController(prisma);
  const query = { campaniaId: String(args.campaniaId) };

  const expected = {
    scanEvents: args.skus * args.branches,
    latestObservations: args.skus * args.branches * CONSENSUS_FIELDS.length,
    items: args.skus,
  };

  const directConsensus = await time(() =>
    Promise.resolve(
      buildConsensusReport({
        escaneos: fixture.escaneos,
        snapshots: fixture.snapshots,
      }),
    ),
  );

  const logicalChecks = {
    scanEvents: fixture.escaneos.length,
    latestObservations: directConsensus.value.latestObservations.length,
    items: directConsensus.value.items.length,
    consensusPctWithinRange: directConsensus.value.items.every((item) =>
      item.atributosConsenso.every((attr) => attr.consensoPorcentaje >= 0 && attr.consensoPorcentaje <= 100),
    ),
  };

  const checksPass =
    logicalChecks.scanEvents === expected.scanEvents &&
    logicalChecks.latestObservations === expected.latestObservations &&
    logicalChecks.items === expected.items &&
    logicalChecks.consensusPctWithinRange;

  const endpointSpecs = [
    ["revisiones.listar", () => invoke(controller.listar, { ...query, soloConDiferencias: "false" })],
    ["revisiones.discrepancias", () => invoke(controller.discrepancias, query)],
    ["revisiones.discrepanciasSuc", () => invoke(controller.discrepanciasSuc, query)],
    ["revisiones.resumenAuditoria", () => invoke(controller.resumenAuditoria, query)],
  ];

  const endpoints = [];
  for (const [name, fn] of endpointSpecs) {
    const result = await runMeasured({ name, warmup: args.warmup, runs: args.runs, fn });
    const responseShape = result.lastValue?.items
      ? { items: result.lastValue.items.length }
      : { kpis: result.lastValue?.kpis || null, consenso: result.lastValue?.consenso || null };
    delete result.lastValue;
    endpoints.push({ ...result, responseShape, passP95: result.p95Ms < args.thresholdMs });
  }

  const concurrentStart = performance.now();
  await Promise.all(
    Array.from({ length: args.concurrentSessions }, () => invoke(controller.resumenAuditoria, query)),
  );
  const concurrentWallMs = Number((performance.now() - concurrentStart).toFixed(2));

  const result = {
    generatedAt: new Date().toISOString(),
    scope: "R4.2 local in-memory benchmark; no real DB, no secrets, no remote writes",
    node: process.version,
    platform: process.platform,
    dataset: {
      skus: args.skus,
      branches: args.branches,
      scanEvents: fixture.escaneos.length,
      snapshots: fixture.snapshots.length,
      decisions: fixture.actualizaciones.length,
      attributesPerScan: CONSENSUS_FIELDS.length,
    },
    thresholdMs: args.thresholdMs,
    expected,
    logicalChecks,
    checksPass,
    directConsensus: {
      elapsedMs: Number(directConsensus.ms.toFixed(2)),
    },
    endpoints,
    concurrentHotAudit: {
      sessions: args.concurrentSessions,
      endpoint: "revisiones.resumenAuditoria",
      wallMs: concurrentWallMs,
      averageWallPerSessionMs: Number((concurrentWallMs / args.concurrentSessions).toFixed(2)),
      passAverageUnderThreshold: concurrentWallMs / args.concurrentSessions < args.thresholdMs,
    },
    pass: checksPass && endpoints.every((endpoint) => endpoint.passP95),
  };

  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true });
    await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
