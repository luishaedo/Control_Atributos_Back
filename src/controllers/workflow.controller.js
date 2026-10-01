import { pad2, cleanSku, parseCode } from "../utils/sku.js";
import { CampaignClosureService } from "../services/campaignClosure.service.js";
import { sendAdminError } from "../utils/http.js";

export function WorkflowController(prisma) {
  const closureService = CampaignClosureService(prisma);
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

  const validateUnknownDictionaries = async ({
    categoria_cod,
    tipo_cod,
    clasif_cod,
  }, db = prisma) => {
    if (!categoria_cod || !tipo_cod || !clasif_cod) {
      return { ok: false, message: "categoría/tipo/clasif requeridos" };
    }
    const [dicCat, dicTipo, dicClasif] = await Promise.all([
      db.dicCategoria.findUnique({ where: { cod: categoria_cod } }),
      db.dicTipo.findUnique({ where: { cod: tipo_cod } }),
      db.dicClasif.findUnique({ where: { cod: clasif_cod } }),
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
      if (found && found.estado !== 'rechazada') latestByField[field.key] = found;
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
    const skuWithChanges = new Map();
    const perUser = new Map();

    for (const act of actualizaciones) {
      const hasChange =
        (act.new_categoria_cod && act.new_categoria_cod !== act.old_categoria_cod) ||
        (act.new_tipo_cod && act.new_tipo_cod !== act.old_tipo_cod) ||
        (act.new_clasif_cod && act.new_clasif_cod !== act.old_clasif_cod);
      if (hasChange) {
        const previous = skuWithChanges.get(act.sku) || { sku: act.sku };
        skuWithChanges.set(act.sku, {
          ...previous,
          sku: act.sku,
          ...(act.new_categoria_cod ? { categoria_cod: act.new_categoria_cod } : {}),
          ...(act.new_tipo_cod ? { tipo_cod: act.new_tipo_cod } : {}),
          ...(act.new_clasif_cod ? { clasif_cod: act.new_clasif_cod } : {}),
        });
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
    const updated = skuWithChanges.size;
    const verified = Math.max(0, totalSkus - updated);

    return {
      totalSkus,
      updated,
      verified,
      updatedSkus: updated,
      verifiedSkus: verified,
      statsByUser,
      statsByUserArray,
      skusWithChanges: [...skuWithChanges.values()],
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
      const campaignId = Number(campaniaId || 0);
      const normalizedSku = cleanSku(sku || '');
      if (!campaignId || !normalizedSku || !stage)
        return sendAdminError(res, 400, "Faltan campos");
      if (!allowedStages.has(stage))
        return sendAdminError(res, 400, "stage inválido");
      try {
        await prisma.$transaction(async tx => {
          const campaign = await tx.campania.findUnique({ where: { id: campaignId } });
          if (!campaign?.activa || (campaign.estado && campaign.estado !== 'ACTIVA')) {
            throw Object.assign(new Error('La campaña no está activa'), { status: 409, code: 'CAMPAIGN_NOT_ACTIVE' });
          }
          const key = { campaniaId: campaignId, sku: normalizedSku };
          const [current, unknown] = await Promise.all([
            tx.skuStage.findUnique({ where: { campaniaId_sku: key } }),
            tx.unknownSku.findUnique({ where: { campaniaId_sku: key } }),
          ]);
          const currentStage = current?.stage || (unknown ? 'unknown' : 'evaluate');
          if (currentStage === 'consolidate' && stage !== 'consolidate') {
            throw Object.assign(new Error('Una consolidación no puede retroceder'), { status: 409, code: 'INVALID_STAGE_TRANSITION' });
          }
          const allowed = unknown
            ? { unknown: new Set(['unknown', 'confirm']), confirm: new Set(['unknown', 'confirm', 'consolidate']), consolidate: new Set(['consolidate']) }
            : { evaluate: new Set(['evaluate', 'confirm']), confirm: new Set(['evaluate', 'confirm', 'consolidate']), consolidate: new Set(['consolidate']) };
          if (!allowed[currentStage]?.has(stage)) {
            throw Object.assign(new Error(`Transición inválida: ${currentStage} → ${stage}`), { status: 409, code: 'INVALID_STAGE_TRANSITION' });
          }
          if (unknown) {
            const status = String(unknown.status || 'PENDING').toUpperCase();
            if (['REJECTED', 'MERGED'].includes(status) && stage !== currentStage) {
              throw Object.assign(new Error('Un desconocido rechazado o fusionado no puede aprobarse moviendo su etapa'), {
                status: 409, code: 'INVALID_UNKNOWN_TRANSITION',
              });
            }
            if (stage === 'consolidate') {
              const validation = await validateUnknownDictionaries({
                categoria_cod: normalizeCode(unknown.categoria_cod),
                tipo_cod: normalizeCode(unknown.tipo_cod),
                clasif_cod: normalizeCode(unknown.clasif_cod),
              }, tx);
              if (!validation.ok) {
                throw Object.assign(new Error(validation.message), { status: 422, code: 'INVALID_DICTIONARY' });
              }
              if (status === 'PENDING') {
                await tx.unknownSku.update({ where: { id: unknown.id }, data: {
                  status: 'APPROVED', decidedBy: updatedBy || null, decidedAt: new Date(),
                } });
              } else if (status !== 'APPROVED') {
                throw Object.assign(new Error('El desconocido no está aprobado'), { status: 409, code: 'INVALID_UNKNOWN_TRANSITION' });
              }
            }
          }
          await tx.skuStage.upsert({
            where: { campaniaId_sku: key },
            create: { ...key, stage, updatedBy: updatedBy || null },
            update: { stage, updatedBy: updatedBy || null, updatedAt: new Date() },
          });
        }, { isolationLevel: 'Serializable' });
        res.json({ ok: true });
      } catch (error) {
        if (error?.status) return res.status(error.status).json({ error: error.message, code: error.code, requestId: req.id });
        if (error?.code === 'P2034') return res.status(409).json({ error: 'La etapa cambió en simultáneo', code: 'STAGE_CONFLICT', requestId: req.id });
        throw error;
      }
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
      const parsedCodes = {
        categoria_cod: parseCode(req.body?.categoria_cod),
        tipo_cod: parseCode(req.body?.tipo_cod),
        clasif_cod: parseCode(req.body?.clasif_cod),
      };
      const invalidFields = Object.entries(parsedCodes).filter(([, parsed]) => !parsed.valid).map(([field]) => field);
      if (invalidFields.length)
        return sendAdminError(res, 422, `Códigos inválidos: ${invalidFields.join(', ')}; no se truncaron`);
      const categoria_cod = parsedCodes.categoria_cod.normalized;
      const tipo_cod = parsedCodes.tipo_cod.normalized;
      const clasif_cod = parsedCodes.clasif_cod.normalized;
      const updatedBy = req.body?.updatedBy || null;

      const unknownSku = ensureModel(prisma.unknownSku, "unknownSku", res);
      const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
      if (!unknownSku || !skuStage) return;
      try {
        const record = await prisma.$transaction(async tx => {
          const campaign = await tx.campania.findUnique({ where: { id: campaniaId } });
          if (!campaign?.activa || (campaign.estado && campaign.estado !== 'ACTIVA')) {
            throw Object.assign(new Error('La campaña no está activa'), { status: 409, code: 'CAMPAIGN_NOT_ACTIVE' });
          }
          const dictValidation = await validateUnknownDictionaries({ categoria_cod, tipo_cod, clasif_cod }, tx);
          if (!dictValidation.ok) {
            throw Object.assign(new Error(dictValidation.message), { status: 422, code: 'INVALID_DICTIONARY' });
          }
          const key = { campaniaId, sku: skuNormalized };
          const current = await tx.unknownSku.findUnique({ where: { campaniaId_sku: key } });
          if (['REJECTED', 'MERGED'].includes(String(current?.status || '').toUpperCase())) {
            throw Object.assign(new Error('El desconocido rechazado o fusionado no puede editarse'), {
              status: 409, code: 'INVALID_UNKNOWN_TRANSITION',
            });
          }
          const item = await tx.unknownSku.upsert({
            where: { campaniaId_sku: key },
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
          await tx.skuStage.upsert({
            where: { campaniaId_sku: key },
            create: { ...key, stage: 'unknown', updatedBy },
            update: { stage: 'unknown', updatedBy, updatedAt: new Date() },
          });
          return item;
        }, { isolationLevel: 'Serializable' });
        res.json({ ok: true, item: record });
      } catch (error) {
        if (error?.status) return res.status(error.status).json({ error: error.message, code: error.code, requestId: req.id });
        if (error?.code === 'P2034') return res.status(409).json({ error: 'El desconocido cambió en simultáneo', code: 'UNKNOWN_CONFLICT', requestId: req.id });
        throw error;
      }
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
      if (!camp.activa || (camp.estado && camp.estado !== 'ACTIVA')) {
        return res.status(409).json({ error: 'La campaña no está activa', code: 'CAMPAIGN_NOT_ACTIVE', requestId: req.id });
      }
      if (['REJECTED', 'MERGED'].includes(String(unknown.status || '').toUpperCase())) {
        return res.status(409).json({ error: 'El desconocido rechazado o fusionado no puede confirmarse', code: 'INVALID_UNKNOWN_TRANSITION', requestId: req.id });
      }
      const dictValidation = await validateUnknownDictionaries({
        categoria_cod,
        tipo_cod,
        clasif_cod,
      });
      if (!dictValidation.ok) {
        return sendAdminError(res, 400, dictValidation.message);
      }

      await prisma.$transaction(async (tx) => {
        await tx.unknownSku.update({
          where: { campaniaId_sku: { campaniaId, sku: skuNormalized } },
          data: {
            status: "APPROVED",
            decidedBy: updatedBy || null,
            decidedAt: new Date(),
            updatedBy,
          },
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
      }, { isolationLevel: 'Serializable' });

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
      const campaign = await prisma.campania.findUnique({ where: { id: unknown.campaniaId } });
      if (!campaign?.activa || (campaign.estado && campaign.estado !== 'ACTIVA')) {
        return res.status(409).json({ error: 'La campaña no está activa', code: 'CAMPAIGN_NOT_ACTIVE', requestId: req.id });
      }
      if (['REJECTED', 'MERGED'].includes(String(unknown.status || '').toUpperCase())) {
        return res.status(409).json({ error: 'El desconocido rechazado o fusionado no puede aprobarse', code: 'INVALID_UNKNOWN_TRANSITION', requestId: req.id });
      }

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

      const updated = await prisma.$transaction(async tx => {
        const item = await tx.unknownSku.update({
          where: { id: unknownId },
          data: { status: "APPROVED", decidedBy, decidedAt: new Date() },
        });
        await tx.skuStage.upsert({
          where: { campaniaId_sku: { campaniaId: item.campaniaId, sku: item.sku } },
          create: { campaniaId: item.campaniaId, sku: item.sku, stage: 'consolidate', updatedBy: decidedBy },
          update: { stage: 'consolidate', updatedBy: decidedBy, updatedAt: new Date() },
        });
        return item;
      }, { isolationLevel: 'Serializable' });
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

      try {
        const updated = await prisma.$transaction(async tx => {
          const campaign = await tx.campania.findUnique({ where: { id: unknown.campaniaId } });
          if (!campaign?.activa || (campaign.estado && campaign.estado !== 'ACTIVA')) {
            throw Object.assign(new Error('La campaña no está activa'), { status: 409, code: 'CAMPAIGN_NOT_ACTIVE' });
          }
          const item = await tx.unknownSku.update({
            where: { id: unknownId },
            data: { status: 'REJECTED', decidedBy, decidedAt: new Date(), decisionReason: reason },
          });
          const key = { campaniaId: item.campaniaId, sku: item.sku };
          await tx.skuStage.upsert({
            where: { campaniaId_sku: key },
            create: { ...key, stage: 'consolidate', updatedBy: decidedBy },
            update: { stage: 'consolidate', updatedBy: decidedBy, updatedAt: new Date() },
          });
          return item;
        }, { isolationLevel: 'Serializable' });
        res.json({ ok: true, item: updated });
      } catch (error) {
        if (error?.status) return res.status(error.status).json({ error: error.message, code: error.code, requestId: req.id });
        if (error?.code === 'P2034') return res.status(409).json({ error: 'El desconocido cambió en simultáneo', code: 'UNKNOWN_CONFLICT', requestId: req.id });
        throw error;
      }
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
      try {
        const updated = await prisma.$transaction(async tx => {
          const [campaign, target] = await Promise.all([
            tx.campania.findUnique({ where: { id: unknown.campaniaId } }),
            tx.maestro.findUnique({ where: { sku: mergedIntoSku } }),
          ]);
          if (!campaign?.activa || (campaign.estado && campaign.estado !== 'ACTIVA')) {
            throw Object.assign(new Error('La campaña no está activa'), { status: 409, code: 'CAMPAIGN_NOT_ACTIVE' });
          }
          if (!target) throw Object.assign(new Error('SKU destino no encontrado'), { status: 404, code: 'MERGE_TARGET_NOT_FOUND' });
          const item = await tx.unknownSku.update({
            where: { id: unknownId },
            data: { status: 'MERGED', mergedIntoSku, decidedBy, decidedAt: new Date() },
          });
          const key = { campaniaId: item.campaniaId, sku: item.sku };
          await tx.skuStage.upsert({
            where: { campaniaId_sku: key },
            create: { ...key, stage: 'consolidate', updatedBy: decidedBy },
            update: { stage: 'consolidate', updatedBy: decidedBy, updatedAt: new Date() },
          });
          return item;
        }, { isolationLevel: 'Serializable' });
        res.json({ ok: true, item: updated });
      } catch (error) {
        if (error?.status) return res.status(error.status).json({ error: error.message, code: error.code, requestId: req.id });
        if (error?.code === 'P2034') return res.status(409).json({ error: 'El desconocido cambió en simultáneo', code: 'UNKNOWN_CONFLICT', requestId: req.id });
        throw error;
      }
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
            archivada: false,
          },
          orderBy: [{ ts: "desc" }, { id: "desc" }],
        }),
        prisma.campaniaMaestro.findMany({
          where: { campaniaId, sku: { in: skus } },
        }),
        prisma.unknownSku.findMany({ where: { campaniaId, sku: { in: skus } } }),
      ]);
      const snapshotBySku = new Map(snapshots.map((snap) => [snap.sku, snap]));
      const unknownBySku = new Map(unknowns.map((u) => [u.sku, u]));
      const decisionsBySku = new Map();
      for (const decision of decisions) {
        const list = decisionsBySku.get(decision.sku) || [];
        list.push(decision);
        decisionsBySku.set(decision.sku, list);
      }

      const items = skus
        .map((sku) => {
          const skuDecisions = decisionsBySku.get(sku) || [];
          const decision = skuDecisions.find(item => item.estado !== 'rechazada') || null;
          const maestro = snapshotBySku.get(sku) || null;
          const unknown = unknownBySku.get(sku) || null;
          let changes = {};
          if (skuDecisions.length) {
            ({ changes } = buildChangeSetFromDecisions({ decisions: skuDecisions, maestro }));
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
      try {
        const result = await closureService.close({
          campaniaId,
          closedBy: req.body?.decidedBy || 'admin',
        });
        const summary = await buildSummary(campaniaId);
        const query = `campaniaId=${campaniaId}`;
        res.json({
          ok: true,
          ...result,
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
      } catch (error) {
        if (error?.status) {
          return res.status(error.status).json({ error: error.message, code: error.code, requestId: req.id });
        }
        throw error;
      }
    },
  };
}
