import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REQUIRED_DESTINATION_HINTS = [
  "restore",
  "staging",
  "test",
  "validation",
  "isolated",
  "r52",
  "drill",
];

const PRISMA_CLI = join("node_modules", "prisma", "build", "index.js");

const redact = (value) =>
  String(value || "")
    .replace(/\/\/([^:]+):([^@]+)@/g, "//$1:***@")
    .replace(/(password=)[^&\s]+/gi, "$1***");

const parseArgs = (argv) => {
  const args = {
    source: process.env.SOURCE_DATABASE_URL || "",
    restore: process.env.RESTORE_DATABASE_URL || "",
    expectedTables: ["Campania", "Maestro", "Escaneo", "Actualizacion"],
    keepDump: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--keep-dump") {
      args.keepDump = true;
      continue;
    }
    if (arg === "--source") {
      args.source = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--restore") {
      args.restore = argv[i + 1] || "";
      i += 1;
      continue;
    }
  }
  return args;
};

const ensureSafeUrls = ({ source, restore }) => {
  if (!source || !restore) {
    throw new Error("SOURCE_DATABASE_URL and RESTORE_DATABASE_URL are required");
  }
  if (source === restore) {
    throw new Error("Source and restore URLs must be different");
  }
  const lowerRestore = restore.toLowerCase();
  if (!REQUIRED_DESTINATION_HINTS.some((hint) => lowerRestore.includes(hint))) {
    throw new Error(
      `Restore destination must clearly be isolated: include one of ${REQUIRED_DESTINATION_HINTS.join(", ")}`,
    );
  }
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      const result = { command, code, stdout, stderr };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`${command} exited with ${code}`), result));
    });
  });

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  ensureSafeUrls(args);

  const workdir = await mkdtemp(join(tmpdir(), "control-atributos-r52-"));
  const dumpPath = join(workdir, "backup.dump");
  const manifestPath = join(workdir, "restore-drill.json");
  const startedAt = new Date().toISOString();
  const manifest = {
    startedAt,
    source: redact(args.source),
    restore: redact(args.restore),
    dumpPath: args.keepDump ? dumpPath : null,
    checks: [],
  };

  try {
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", dumpPath, args.source]);
    manifest.checks.push({ name: "pg_dump", ok: true });

    await run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--dbname", args.restore, dumpPath]);
    manifest.checks.push({ name: "pg_restore", ok: true });

    const tableRows = await run(
      "psql",
      [
        args.restore,
        "--set",
        "ON_ERROR_STOP=1",
        "--tuples-only",
        "--no-align",
        "--command",
        "select table_name from information_schema.tables where table_schema='public' order by table_name;",
      ],
      { env: { PSQL_PAGER: "off" } },
    );
    const tables = tableRows.stdout.split(/\r?\n/).filter(Boolean);
    const missingTables = args.expectedTables.filter((table) => !tables.includes(table));
    manifest.checks.push({ name: "expected_tables", ok: missingTables.length === 0, missingTables });
    if (missingTables.length) {
      throw new Error(`Missing restored tables: ${missingTables.join(", ")}`);
    }

    const migrateStatus = await run(process.execPath, [PRISMA_CLI, "migrate", "status", "--schema", "prisma/schema.prisma"], {
      env: { DATABASE_URL: args.restore },
    });
    manifest.checks.push({ name: "prisma_migrate_status", ok: true, output: migrateStatus.stdout.trim() });

    manifest.finishedAt = new Date().toISOString();
    manifest.ok = true;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    if (!args.keepDump) {
      await rm(workdir, { recursive: true, force: true });
    } else {
      console.error(`Restore drill artifacts kept at ${workdir}`);
    }
  }
};

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, source: redact(process.env.SOURCE_DATABASE_URL), restore: redact(process.env.RESTORE_DATABASE_URL) }, null, 2));
  process.exitCode = 1;
});
