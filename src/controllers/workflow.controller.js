import { pad2 } from "../utils/sku.js";
import { ActualizacionesService } from "../services/actualizaciones.service.js";

export function WorkflowController(prisma) {
  const { applyUpdates } = ActualizacionesService(prisma);
  const allowedStages = new Set(["evaluate", "confirm", "consolidate", "unknown"]);
  const ensureModel = (model, name, res) => {
    if (!model) {
      res.status(500).json({ error: `Prisma client missing ${name}. Run prisma:generate.` });
      return null;
    }
    return model;
  };

  const normalizeCode = (value) => {
    if (value === undefined || value === null) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    return pad2(trimmed);
  };

  const resolveCampaignId = async (candidate) => {
    const campaniaId = Number(candidate || 0);
    if (campaniaId) return campaniaId;
    const activa = await prisma.campania.findFirst({
      where: { activa: true },
    });
    return activa?.id || 0;
  };

  const upsertStage = async ({ campaniaId, sku, stage, updatedBy }) =>
    prisma.skuStage.upsert({
      where: { campaniaId_sku: { campaniaId, sku } },
      create: {
        campaniaId,
        sku,
        stage,
        updatedBy,
      },
      update: {
        stage,
        updatedBy,
        updatedAt: new Date(),
      },
    });

  const buildChangeSet = ({ decision, maestro }) => {
    const changes = {};
    const verified = {};
    const fields = [
      { key: "categoria_cod", newKey: "new_categoria_cod" },
      { key: "tipo_cod", newKey: "new_tipo_cod" },
      { key: "clasif_cod", newKey: "new_clasif_cod" },
    ];
    for (const field of fields) {
      const oldValue = maestro?.[field.key] ?? decision?.[`old_${field.key}`] ?? "";
      const newValue = decision?.[field.newKey] ?? "";
      if (newValue && String(newValue) !== String(oldValue)) {
        changes[field.key] = newValue;
      } else {
        verified[field.key] = oldValue || newValue || "";
      }
    }
    return { changes, verified };
  };

  const buildSummary = async (campaniaId) => {
    const totalSkus = await prisma.campaniaMaestro.count({ where: { campaniaId } });
    const actualizaciones = await prisma.actualizacion.findMany({
      where: { campaniaId, estado: "aplicada" },
    });
    const skuWithChanges = [];
    const perUser = new Map();
    let updated = 0;
    let verified = 0;

    for (const act of actualizaciones) {
      const hasChange =
        (act.new_categoria_cod && act.new_categoria_cod !== act.old_categoria_cod) ||
        (act.new_tipo_cod && act.new_tipo_cod !== act.old_tipo_cod) ||
        (act.new_clasif_cod && act.new_clasif_cod !== act.old_clasif_cod);
      if (hasChange) {
        updated += 1;
        skuWithChanges.push({
          sku: act.sku,
          categoria_cod: act.new_categoria_cod || act.old_categoria_cod || "",
          tipo_cod: act.new_tipo_cod || act.old_tipo_cod || "",
          clasif_cod: act.new_clasif_cod || act.old_clasif_cod || "",
        });
      } else {
        verified += 1;
      }
      const user = act.decidedBy || "unknown";
      perUser.set(user, (perUser.get(user) || 0) + 1);
    }

    const statsByUserArray = Array.from(perUser.entries()).map(
      ([user, count]) => ({
        user,
        count,
      })
    );
    const statsByUser = Object.fromEntries(perUser.entries());

    return {
      totalSkus,
      updated,
      verified,
      updatedSkus: updated,
      verifiedSkus: verified,
      statsByUser,
      statsByUserArray,
      skusWithChanges: skuWithChanges,
    };
  };

  return {
    listConfirmations: async (req, res) => {
      const campaniaId = await resolveCampaignId(req.query.campaniaId);
      if (!campaniaId)
        return res.status(400).json({ error: "campaniaId requerido" });

      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!skuStage) return;
      const stages = await skuStage.findMany({
        where: { campaniaId, stage: "confirm" },
      });
      const skus = stages.map((row) => row.sku);
      if (!skus.length) return res.json({ items: [] });

      const [decisions, snapshots] = await Promise.all([
        prisma.actualizacion.findMany({
          where: {
            campaniaId,
            sku: { in: skus },
            estado: "pendiente",
            archivada: false,
          },
          orderBy: { ts: "desc" },
        }),
        prisma.campaniaMaestro.findMany({
          where: { campaniaId, sku: { in: skus } },
        }),
      ]);
      const snapshotBySku = new Map(snapshots.map((snap) => [snap.sku, snap]));
      const decisionBySku = new Map();
      for (const decision of decisions) {
        if (!decisionBySku.has(decision.sku)) {
          decisionBySku.set(decision.sku, decision);
        }
      }

      const items = skus.map((sku) => {
        const decision = decisionBySku.get(sku) || null;
        const maestro = snapshotBySku.get(sku) || null;
        const { changes, verified } = buildChangeSet({ decision, maestro });
        return {
          sku,
          maestro: maestro
            ? {
                categoria_cod: maestro.categoria_cod,
                tipo_cod: maestro.tipo_cod,
                clasif_cod: maestro.clasif_cod,
              }
            : null,
          changes,
          verified,
          decision: decision
            ? {
                id: decision.id,
                estado: decision.estado,
                decidedBy: decision.decidedBy,
                decidedAt: decision.decidedAt,
              }
            : null,
        };
      });

      res.json({ items });
    },

    moveStage: async (req, res) => {
      const { campaniaId, sku, stage, updatedBy } = req.body || {};
      if (!campaniaId || !sku || !stage)
        return res.status(400).json({ error: "Faltan campos" });
      if (!allowedStages.has(stage))
        return res.status(400).json({ error: "stage inválido" });

      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!skuStage) return;
      await upsertStage({
        campaniaId: Number(campaniaId),
        sku,
        stage,
        updatedBy: updatedBy || null,
      });
      res.json({ ok: true });
    },

    listUnknowns: async (req, res) => {
      const campaniaId = await resolveCampaignId(req.query.campaniaId);
      if (!campaniaId)
        return res.status(400).json({ error: "campaniaId requerido" });
      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      if (!unknownSku) return;
      const items = await unknownSku.findMany({
        where: { campaniaId },
        orderBy: { updatedAt: "desc" },
      });
      res.json({ items });
    },

    updateUnknown: async (req, res) => {
      const campaniaId = Number(req.body?.campaniaId || 0);
      const sku = String(req.params?.sku || "").trim();
      if (!campaniaId || !sku)
        return res.status(400).json({ error: "campaniaId y sku requeridos" });

      const descripcion = req.body?.descripcion ?? null;
      const categoria_cod = normalizeCode(req.body?.categoria_cod);
      const tipo_cod = normalizeCode(req.body?.tipo_cod);
      const clasif_cod = normalizeCode(req.body?.clasif_cod);
      const updatedBy = req.body?.updatedBy || null;

      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      const record = await unknownSku.upsert({
        where: { campaniaId_sku: { campaniaId, sku } },
        create: {
          campaniaId,
          sku,
          descripcion,
          categoria_cod,
          tipo_cod,
          clasif_cod,
          status: "edited",
          updatedBy,
        },
        update: {
          descripcion,
          categoria_cod,
          tipo_cod,
          clasif_cod,
          status: "edited",
          updatedBy,
          updatedAt: new Date(),
        },
      });

      await upsertStage({
        campaniaId,
        sku,
        stage: "unknown",
        updatedBy,
      });

      res.json({ ok: true, item: record });
    },

    confirmUnknown: async (req, res) => {
      const campaniaId = Number(req.body?.campaniaId || 0);
      const sku = String(req.params?.sku || "").trim();
      const updatedBy = req.body?.updatedBy || null;
      if (!campaniaId || !sku)
        return res.status(400).json({ error: "campaniaId y sku requeridos" });

      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      const unknown = await unknownSku.findUnique({
        where: { campaniaId_sku: { campaniaId, sku } },
      });
      if (!unknown)
        return res.status(404).json({ error: "Unknown SKU no encontrado" });

      const categoria_cod = normalizeCode(unknown.categoria_cod);
      const tipo_cod = normalizeCode(unknown.tipo_cod);
      const clasif_cod = normalizeCode(unknown.clasif_cod);
      if (!categoria_cod || !tipo_cod || !clasif_cod) {
        return res
          .status(400)
          .json({ error: "categoría/tipo/clasif requeridos" });
      }

      const [dicCat, dicTipo, dicClasif, camp] = await Promise.all([
        prisma.dicCategoria.findUnique({ where: { cod: categoria_cod } }),
        prisma.dicTipo.findUnique({ where: { cod: tipo_cod } }),
        prisma.dicClasif.findUnique({ where: { cod: clasif_cod } }),
        prisma.campania.findUnique({ where: { id: campaniaId } }),
      ]);

      if (!dicCat || !dicTipo || !dicClasif) {
        return res.status(400).json({ error: "Diccionarios inválidos" });
      }
      if (!camp) {
        return res.status(404).json({ error: "Campaña no encontrada" });
      }

      const descripcion = unknown.descripcion || "";

      await prisma.$transaction(async (tx) => {
        await tx.maestro.upsert({
          where: { sku },
          create: {
            sku,
            descripcion,
            categoria_cod,
            tipo_cod,
            clasif_cod,
          },
          update: {
            descripcion,
            categoria_cod,
            tipo_cod,
            clasif_cod,
          },
        });
        await tx.campaniaMaestro.upsert({
          where: { campaniaId_sku: { campaniaId, sku } },
          create: {
            campaniaId,
            sku,
            descripcion,
            categoria_cod,
            tipo_cod,
            clasif_cod,
          },
          update: {
            descripcion,
            categoria_cod,
            tipo_cod,
            clasif_cod,
          },
        });
        await tx.unknownSku.update({
          where: { campaniaId_sku: { campaniaId, sku } },
          data: {
            status: "confirmed",
            updatedBy,
          },
        });
        await tx.skuStage.upsert({
          where: { campaniaId_sku: { campaniaId, sku } },
          create: {
            campaniaId,
            sku,
            stage: "confirm",
            updatedBy,
          },
          update: {
            stage: "confirm",
            updatedBy,
            updatedAt: new Date(),
          },
        });
      });

      res.json({ ok: true });
    },

    listConsolidationChanges: async (req, res) => {
      const campaniaId = await resolveCampaignId(req.query.campaniaId);
      if (!campaniaId)
        return res.status(400).json({ error: "campaniaId requerido" });

      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!skuStage) return;
      const stages = await skuStage.findMany({
        where: { campaniaId, stage: "consolidate" },
      });
      const skus = stages.map((row) => row.sku);
      if (!skus.length) return res.json({ items: [] });

      const [decisions, snapshots] = await Promise.all([
        prisma.actualizacion.findMany({
          where: {
            campaniaId,
            sku: { in: skus },
          },
          orderBy: { ts: "desc" },
        }),
        prisma.campaniaMaestro.findMany({
          where: { campaniaId, sku: { in: skus } },
        }),
      ]);
      const snapshotBySku = new Map(snapshots.map((snap) => [snap.sku, snap]));
      const decisionBySku = new Map();
      for (const decision of decisions) {
        if (!decisionBySku.has(decision.sku)) {
          decisionBySku.set(decision.sku, decision);
        }
      }

      const items = skus
        .map((sku) => {
          const decision = decisionBySku.get(sku) || null;
          const maestro = snapshotBySku.get(sku) || null;
          const { changes } = buildChangeSet({ decision, maestro });
          if (!Object.keys(changes).length) return null;
          return {
            sku,
            maestro: maestro
              ? {
                  categoria_cod: maestro.categoria_cod,
                  tipo_cod: maestro.tipo_cod,
                  clasif_cod: maestro.clasif_cod,
                }
              : {
                  categoria_cod: "",
                  tipo_cod: "",
                  clasif_cod: "",
                },
            propuestas: [],
            decision: decision
              ? {
                  id: decision.id,
                  estado: decision.estado,
                  decidedBy: decision.decidedBy,
                  decidedAt: decision.decidedAt,
                }
              : null,
            changes,
          };
        })
        .filter(Boolean);

      res.json({ items });
    },

    consolidationSummary: async (req, res) => {
      const campaniaId = await resolveCampaignId(req.query.campaniaId);
      if (!campaniaId)
        return res.status(400).json({ error: "campaniaId requerido" });
      const summary = await buildSummary(campaniaId);
      res.json({ summary });
    },

    closeCampaign: async (req, res) => {
      const campaniaId = Number(req.params?.id || 0);
      if (!campaniaId)
        return res.status(400).json({ error: "campaniaId requerido" });

      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      if (!skuStage || !unknownSku) return;
      const stages = await skuStage.findMany({
        where: { campaniaId, stage: "consolidate" },
        select: { sku: true },
      });
      const consolidateSkus = stages.map((row) => row.sku);

      const ids = (
        await prisma.actualizacion.findMany({
          where: { campaniaId, estado: "pendiente" },
          select: { id: true, sku: true },
        })
      ).map((row) => row.id);

      const { count } = await applyUpdates({
        ids,
        decidedBy: req.body?.decidedBy || "admin",
      });

      await prisma.campania.update({
        where: { id: campaniaId },
        data: { activa: false },
      });

      if (ids.length) {
        const skus = await prisma.actualizacion.findMany({
          where: { id: { in: ids } },
          select: { sku: true },
        });
        await skuStage.updateMany({
          where: { campaniaId, sku: { in: skus.map((row) => row.sku) } },
          data: { stage: "consolidate", updatedAt: new Date() },
        });
      }

      if (consolidateSkus.length) {
        const unknowns = await unknownSku.findMany({
          where: {
            campaniaId,
            sku: { in: consolidateSkus },
            status: "confirmed",
          },
        });
        if (unknowns.length) {
          await prisma.$transaction(async (tx) => {
            for (const item of unknowns) {
              await tx.maestro.upsert({
                where: { sku: item.sku },
                create: {
                  sku: item.sku,
                  descripcion: item.descripcion || "",
                  categoria_cod: item.categoria_cod || "",
                  tipo_cod: item.tipo_cod || "",
                  clasif_cod: item.clasif_cod || "",
                },
                update: {
                  descripcion: item.descripcion || "",
                  categoria_cod: item.categoria_cod || "",
                  tipo_cod: item.tipo_cod || "",
                  clasif_cod: item.clasif_cod || "",
                },
              });
              await tx.campaniaMaestro.upsert({
                where: { campaniaId_sku: { campaniaId, sku: item.sku } },
                create: {
                  campaniaId,
                  sku: item.sku,
                  descripcion: item.descripcion || "",
                  categoria_cod: item.categoria_cod || "",
                  tipo_cod: item.tipo_cod || "",
                  clasif_cod: item.clasif_cod || "",
                },
                update: {
                  descripcion: item.descripcion || "",
                  categoria_cod: item.categoria_cod || "",
                  tipo_cod: item.tipo_cod || "",
                  clasif_cod: item.clasif_cod || "",
                },
              });
            }
          });
        }
      }

      const summary = await buildSummary(campaniaId);
      const query = `campaniaId=${campaniaId}`;
      res.json({
        ok: true,
        applied: count,
        summary,
        exports: {
          applied: {
            categoria: `/api/admin/export/txt/categoria?${query}&scope=applied`,
            tipo: `/api/admin/export/txt/tipo?${query}&scope=applied`,
            clasif: `/api/admin/export/txt/clasif?${query}&scope=applied`,
          },
          unknown: {
            categoria: `/api/admin/export/txt/categoria?${query}&scope=unknown`,
            tipo: `/api/admin/export/txt/tipo?${query}&scope=unknown`,
            clasif: `/api/admin/export/txt/clasif?${query}&scope=unknown`,
          },
          summaryTxt: `/api/admin/export/txt/summary?${query}`,
        },
      });
    },
  };
}
