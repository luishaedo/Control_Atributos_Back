import { pad2, cleanSku } from "../utils/sku.js";
import { ActualizacionesService } from "../services/actualizaciones.service.js";
import { sendAdminError } from "../utils/http.js";

export function WorkflowController(prisma) {
  const { applyUpdates } = ActualizacionesService(prisma);
  const allowedStages = new Set(["evaluate", "confirm", "consolidate", "unknown"]);
  const ensureModel = (model, name, res) => {
    if (!model) {
      sendAdminError(res, 500, `Prisma client missing ${name}. Run prisma:generate.`);
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

  const applyUnknownToMaestro = async ({
    tx,
    unknown,
    campaniaId,
    appliedBy,
  }) => {
    if (unknown.appliedToMaestroAt) return;
    await tx.maestro.upsert({
      where: { sku: unknown.sku },
      create: {
        sku: unknown.sku,
        descripcion: unknown.descripcion || "",
        categoria_cod: unknown.categoria_cod || "",
        tipo_cod: unknown.tipo_cod || "",
        clasif_cod: unknown.clasif_cod || "",
      },
      update: {
        descripcion: unknown.descripcion || "",
        categoria_cod: unknown.categoria_cod || "",
        tipo_cod: unknown.tipo_cod || "",
        clasif_cod: unknown.clasif_cod || "",
      },
    });
    await tx.campaniaMaestro.upsert({
      where: { campaniaId_sku: { campaniaId, sku: unknown.sku } },
      create: {
        campaniaId,
        sku: unknown.sku,
        descripcion: unknown.descripcion || "",
        categoria_cod: unknown.categoria_cod || "",
        tipo_cod: unknown.tipo_cod || "",
        clasif_cod: unknown.clasif_cod || "",
      },
      update: {
        descripcion: unknown.descripcion || "",
        categoria_cod: unknown.categoria_cod || "",
        tipo_cod: unknown.tipo_cod || "",
        clasif_cod: unknown.clasif_cod || "",
      },
    });
    await tx.unknownSku.update({
      where: { campaniaId_sku: { campaniaId, sku: unknown.sku } },
      data: {
        appliedToMaestroAt: new Date(),
        appliedToMaestroBy: appliedBy || null,
      },
    });
  };

  const validateUnknownDictionaries = async ({
    categoria_cod,
    tipo_cod,
    clasif_cod,
  }) => {
    if (!categoria_cod || !tipo_cod || !clasif_cod) {
      return { ok: false, message: "categoría/tipo/clasif requeridos" };
    }
    const [dicCat, dicTipo, dicClasif] = await Promise.all([
      prisma.dicCategoria.findUnique({ where: { cod: categoria_cod } }),
      prisma.dicTipo.findUnique({ where: { cod: tipo_cod } }),
      prisma.dicClasif.findUnique({ where: { cod: clasif_cod } }),
    ]);
    if (!dicCat || !dicTipo || !dicClasif) {
      return { ok: false, message: "Diccionarios inválidos" };
    }
    return { ok: true };
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

  const buildChangeSetFromDecisions = ({ decisions, maestro }) => {
    if (!decisions?.length) return { changes: {}, verified: {} };
    const fields = [
      { key: "categoria_cod", newKey: "new_categoria_cod", oldKey: "old_categoria_cod" },
      { key: "tipo_cod", newKey: "new_tipo_cod", oldKey: "old_tipo_cod" },
      { key: "clasif_cod", newKey: "new_clasif_cod", oldKey: "old_clasif_cod" },
    ];
    const latestByField = {};
    for (const field of fields) {
      const found = decisions.find((d) => d?.[field.newKey]);
      if (found) latestByField[field.key] = found;
    }

    const changes = {};
    const verified = {};
    for (const field of fields) {
      const decision = latestByField[field.key] || null;
      const oldValue = maestro?.[field.key] ?? decision?.[field.oldKey] ?? "";
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
        return sendAdminError(res, 400, "campaniaId requerido");

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
      const unknownBySku = new Map(
        (await prisma.unknownSku.findMany({ where: { campaniaId, sku: { in: skus } } }))
          .map((u) => [u.sku, u])
      )
      const decisionsBySku = new Map();
      for (const decision of decisions) {
        const list = decisionsBySku.get(decision.sku) || [];
        list.push(decision);
        decisionsBySku.set(decision.sku, list);
      }

      const items = skus.map((sku) => {
        const skuDecisions = decisionsBySku.get(sku) || [];
        const decision = skuDecisions[0] || null;
        const maestro = snapshotBySku.get(sku) || null;
        const unknown = unknownBySku.get(sku) || null;
        let changes = {};
        let verified = {};
        if (skuDecisions.length) {
          ({ changes, verified } = buildChangeSetFromDecisions({ decisions: skuDecisions, maestro }));
        } else if (unknown) {
          changes = {
            categoria_cod: unknown.categoria_cod || "",
            tipo_cod: unknown.tipo_cod || "",
            clasif_cod: unknown.clasif_cod || "",
          };
        }
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
          skuType: unknown ? "UNKNOWN" : "KNOWN",
          unknown: unknown
            ? {
                id: unknown.id,
                categoria_cod: unknown.categoria_cod || "",
                tipo_cod: unknown.tipo_cod || "",
                clasif_cod: unknown.clasif_cod || "",
                status: unknown.status || null,
              }
            : null,
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
        return sendAdminError(res, 400, "Faltan campos");
      if (!allowedStages.has(stage))
        return sendAdminError(res, 400, "stage inválido");

      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!skuStage) return;
      await upsertStage({
        campaniaId: Number(campaniaId),
        sku,
        stage,
        updatedBy: updatedBy || null,
      });

      if (stage === "consolidate") {
        const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
        if (!unknownSku) return;
        const unknown = await unknownSku.findUnique({
          where: { campaniaId_sku: { campaniaId: Number(campaniaId), sku } },
        });
        if (unknown && unknown.status !== "APPROVED") {
          await unknownSku.update({
            where: { id: unknown.id },
            data: {
              status: "APPROVED",
              decidedBy: updatedBy || null,
              decidedAt: new Date(),
            },
          });
        }
      }
      res.json({ ok: true });
    },

    listUnknowns: async (req, res) => {
      const campaniaId = await resolveCampaignId(req.query.campaniaId);
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");
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
      const skuNormalized = cleanSku(req.params?.sku || "");
      if (!campaniaId || !skuNormalized)
        return sendAdminError(res, 400, "campaniaId y sku requeridos");

      const descripcion = req.body?.descripcion ?? null;
      const categoria_cod = normalizeCode(req.body?.categoria_cod);
      const tipo_cod = normalizeCode(req.body?.tipo_cod);
      const clasif_cod = normalizeCode(req.body?.clasif_cod);
      const updatedBy = req.body?.updatedBy || null;

      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      const record = await unknownSku.upsert({
        where: { campaniaId_sku: { campaniaId, sku: skuNormalized } },
        create: {
          campaniaId,
          sku: skuNormalized,
          skuNormalized,
          descripcion,
          categoria_cod,
          tipo_cod,
          clasif_cod,
          status: "PENDING",
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          updatedBy,
        },
        update: {
          descripcion,
          categoria_cod,
          tipo_cod,
          clasif_cod,
          status: "PENDING",
          updatedBy,
          updatedAt: new Date(),
        },
      });

      await upsertStage({
        campaniaId,
        sku: skuNormalized,
        stage: "unknown",
        updatedBy,
      });

      res.json({ ok: true, item: record });
    },

    confirmUnknown: async (req, res) => {
      const campaniaId = Number(req.body?.campaniaId || 0);
      const skuNormalized = cleanSku(req.params?.sku || "");
      const updatedBy = req.body?.updatedBy || null;
      if (!campaniaId || !skuNormalized)
        return sendAdminError(res, 400, "campaniaId y sku requeridos");

      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      const unknown = await unknownSku.findUnique({
        where: { campaniaId_sku: { campaniaId, sku: skuNormalized } },
      });
      if (!unknown)
        return sendAdminError(res, 404, "Unknown SKU no encontrado");

      const categoria_cod = normalizeCode(unknown.categoria_cod);
      const tipo_cod = normalizeCode(unknown.tipo_cod);
      const clasif_cod = normalizeCode(unknown.clasif_cod);
      const camp = await prisma.campania.findUnique({ where: { id: campaniaId } });
      if (!camp) {
        return sendAdminError(res, 404, "Campaña no encontrada");
      }
      const dictValidation = await validateUnknownDictionaries({
        categoria_cod,
        tipo_cod,
        clasif_cod,
      });
      if (!dictValidation.ok) {
        return sendAdminError(res, 400, dictValidation.message);
      }

      const descripcion = unknown.descripcion || "";

      await prisma.$transaction(async (tx) => {
        const updatedUnknown = await tx.unknownSku.update({
          where: { campaniaId_sku: { campaniaId, sku: skuNormalized } },
          data: {
            status: "APPROVED",
            decidedBy: updatedBy || null,
            decidedAt: new Date(),
            updatedBy,
          },
        });
        await applyUnknownToMaestro({
          tx,
          unknown: {
            ...updatedUnknown,
            descripcion,
            categoria_cod,
            tipo_cod,
            clasif_cod,
          },
          campaniaId,
          appliedBy: updatedBy,
        });
        await tx.skuStage.upsert({
          where: { campaniaId_sku: { campaniaId, sku: skuNormalized } },
          create: {
            campaniaId,
            sku: skuNormalized,
            stage: "consolidate",
            updatedBy,
          },
          update: {
            stage: "consolidate",
            updatedBy,
            updatedAt: new Date(),
          },
        });
      });

      res.json({ ok: true });
    },

    approveUnknownById: async (req, res) => {
      const unknownId = Number(req.params?.id || 0);
      const decidedBy = req.body?.decidedBy || null;
      if (!unknownId) return sendAdminError(res, 400, "id requerido");
      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      const unknown = await unknownSku.findUnique({ where: { id: unknownId } });
      if (!unknown) return sendAdminError(res, 404, "Unknown SKU no encontrado");

      const categoria_cod = normalizeCode(unknown.categoria_cod);
      const tipo_cod = normalizeCode(unknown.tipo_cod);
      const clasif_cod = normalizeCode(unknown.clasif_cod);
      const dictValidation = await validateUnknownDictionaries({
        categoria_cod,
        tipo_cod,
        clasif_cod,
      });
      if (!dictValidation.ok) {
        return sendAdminError(res, 400, dictValidation.message);
      }

      const updated = await unknownSku.update({
        where: { id: unknownId },
        data: {
          status: "APPROVED",
          decidedBy,
          decidedAt: new Date(),
        },
      });
      await upsertStage({
        campaniaId: updated.campaniaId,
        sku: updated.sku,
        stage: "consolidate",
        updatedBy: decidedBy,
      });
      res.json({ ok: true, item: updated });
    },

    rejectUnknownById: async (req, res) => {
      const unknownId = Number(req.params?.id || 0);
      const decidedBy = req.body?.decidedBy || null;
      const reason = req.body?.reason || null;
      if (!unknownId) return sendAdminError(res, 400, "id requerido");
      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      const unknown = await unknownSku.findUnique({ where: { id: unknownId } });
      if (!unknown) return sendAdminError(res, 404, "Unknown SKU no encontrado");

      const updated = await unknownSku.update({
        where: { id: unknownId },
        data: {
          status: "REJECTED",
          decidedBy,
          decidedAt: new Date(),
          decisionReason: reason,
        },
      });
      await upsertStage({
        campaniaId: updated.campaniaId,
        sku: updated.sku,
        stage: "consolidate",
        updatedBy: decidedBy,
      });
      res.json({ ok: true, item: updated });
    },

    mergeUnknownById: async (req, res) => {
      const unknownId = Number(req.params?.id || 0);
      const decidedBy = req.body?.decidedBy || null;
      const mergedIntoSku = cleanSku(req.body?.mergedIntoSku || "");
      if (!unknownId) return sendAdminError(res, 400, "id requerido");
      if (!mergedIntoSku) return sendAdminError(res, 400, "mergedIntoSku requerido");
      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      const unknown = await unknownSku.findUnique({ where: { id: unknownId } });
      if (!unknown) return sendAdminError(res, 404, "Unknown SKU no encontrado");
      const target = await prisma.maestro.findUnique({ where: { sku: mergedIntoSku } });
      if (!target) return sendAdminError(res, 404, "SKU destino no encontrado");

      const updated = await unknownSku.update({
        where: { id: unknownId },
        data: {
          status: "MERGED",
          mergedIntoSku,
          decidedBy,
          decidedAt: new Date(),
        },
      });
      await upsertStage({
        campaniaId: updated.campaniaId,
        sku: updated.sku,
        stage: "consolidate",
        updatedBy: decidedBy,
      });
      res.json({ ok: true, item: updated });
    },

    listConsolidationChanges: async (req, res) => {
      const campaniaId = await resolveCampaignId(req.query.campaniaId);
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");

      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!skuStage) return;
      const stages = await skuStage.findMany({
        where: { campaniaId, stage: "consolidate" },
      });
      const skus = stages.map((row) => row.sku);
      if (!skus.length) return res.json({ items: [] });

      const [decisions, snapshots, unknowns] = await Promise.all([
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
        prisma.unknownSku.findMany({ where: { campaniaId, sku: { in: skus } } }),
      ]);
      const snapshotBySku = new Map(snapshots.map((snap) => [snap.sku, snap]));
      const unknownBySku = new Map(unknowns.map((u) => [u.sku, u]));
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
          const unknown = unknownBySku.get(sku) || null;
          let changes = {};
          if (decision) {
            ({ changes } = buildChangeSet({ decision, maestro }));
          } else if (unknown) {
            changes = {
              categoria_cod: unknown.categoria_cod || "",
              tipo_cod: unknown.tipo_cod || "",
              clasif_cod: unknown.clasif_cod || "",
            };
          }
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
            skuType: unknown ? "UNKNOWN" : "KNOWN",
          };
        })
        .filter(Boolean);

      res.json({ items });
    },

    consolidationSummary: async (req, res) => {
      const campaniaId = await resolveCampaignId(req.query.campaniaId);
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");
      const summary = await buildSummary(campaniaId);
      res.json({ summary });
    },

    closeCampaign: async (req, res) => {
      const campaniaId = Number(req.params?.id || 0);
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");

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
            OR: [
              { status: "APPROVED" },
              { status: "confirmed" },
              { status: "CONFIRMED" },
            ],
            appliedToMaestroAt: null,
          },
        });
        if (unknowns.length) {
          await prisma.$transaction(async (tx) => {
            for (const item of unknowns) {
              await applyUnknownToMaestro({
                tx,
                unknown: item,
                campaniaId,
                appliedBy: req.body?.decidedBy || "admin",
              });
            }
          });
        }
      }

      await unknownSku.deleteMany({
        where: {
          campaniaId,
          status: "REJECTED",
        },
      });

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
