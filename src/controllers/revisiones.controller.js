import { pad2, cleanSku, parseSku } from "../utils/sku.js";
import { ActualizacionesService } from "../services/actualizaciones.service.js";
import { CONSENSUS_FIELDS, buildConsensusReport } from "../services/consenso.service.js";
import { sendAdminError } from "../utils/http.js";
export function RevisionesController(prisma) {
  const { recordDecision } = ActualizacionesService(prisma);
  const isEmptyValue = (value) => value === undefined || value === null || String(value).trim() === "";
  const formatDecision = (decision) => ({
    estado: decision.estado,
    id: decision.id,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
    new_categoria_cod: decision.new_categoria_cod || "",
    new_tipo_cod: decision.new_tipo_cod || "",
    new_clasif_cod: decision.new_clasif_cod || "",
  });
  const ensureModel = (model, name, res) => {
    if (!model) {
      sendAdminError(res, 500, `Prisma client missing ${name}. Run prisma:generate.`);
      return null;
    }
    return model;
  };
  const toTopList = (map, limit = 5) =>
    Array.from(map.entries())
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

  return {
    listar: async (req, res) => {
      let campaniaId = Number(req.query.campaniaId || 0);
      
      if (!campaniaId) {
        const activa = await prisma.campania.findFirst({
          where: { activa: true },
        });
        if (activa) campaniaId = activa.id;
      }
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");

      const rawFilterSku = String(req.query.sku || "").trim();
      const parsedFilterSku = parseSku(rawFilterSku);
      if (rawFilterSku && !parsedFilterSku.valid)
        return sendAdminError(res, 400, "SKU de filtro inválido");
      const buscarSku = parsedFilterSku.normalized;
      const filtroConsenso = req.query.consenso; // 'true' | 'false' | undefined
      const soloConDiferencias =
        (req.query.soloConDiferencias ?? "true") === "true";

      const escaneos = await prisma.escaneo.findMany({ where: { campaniaId } });
      const snapBySku = new Map(
        (await prisma.campaniaMaestro.findMany({ where: { campaniaId } })).map(
          (m) => [m.sku, m]
        )
      );
      const escaneoSkus = Array.from(new Set(escaneos.map((e) => e.sku)));
      const maestroBySku = new Map(
        (escaneoSkus.length
          ? await prisma.maestro.findMany({ where: { sku: { in: escaneoSkus } } })
          : []
        ).map((m) => [m.sku, m])
      );
      const unknownBySku = new Map(
        (await prisma.unknownSku.findMany({ where: { campaniaId } })).map((u) => [
          u.sku,
          u,
        ])
      );
      const stageBySku = new Map(
        (await prisma.skuStage.findMany({ where: { campaniaId } })).map((s) => [
          s.sku,
          s.stage,
        ])
      );

      const decisiones = await prisma.actualizacion.findMany({
        where: { campaniaId, archivada: false },
        orderBy: [{ ts: "desc" }, { id: "desc" }],
      });
      const decisionesBySku = new Map();
      const decisionesByField = new Map();
      for (const dec of decisiones) {
        const list = decisionesBySku.get(dec.sku) || [];
        list.push(dec);
        decisionesBySku.set(dec.sku, list);
        const fieldEntry = decisionesByField.get(dec.sku) || {
          categoria_cod: null,
          tipo_cod: null,
          clasif_cod: null,
        };
        if (!fieldEntry.categoria_cod && dec.new_categoria_cod) {
          fieldEntry.categoria_cod = {
            code: dec.new_categoria_cod,
            id: dec.id,
            estado: dec.estado,
            decidedBy: dec.decidedBy,
            decidedAt: dec.decidedAt,
          };
        }
        if (!fieldEntry.tipo_cod && dec.new_tipo_cod) {
          fieldEntry.tipo_cod = {
            code: dec.new_tipo_cod,
            id: dec.id,
            estado: dec.estado,
            decidedBy: dec.decidedBy,
            decidedAt: dec.decidedAt,
          };
        }
        if (!fieldEntry.clasif_cod && dec.new_clasif_cod) {
          fieldEntry.clasif_cod = {
            code: dec.new_clasif_cod,
            id: dec.id,
            estado: dec.estado,
            decidedBy: dec.decidedBy,
            decidedAt: dec.decidedAt,
          };
        }
        decisionesByField.set(dec.sku, fieldEntry);
      }

      const findDecision = (sku, propuesta) => {
        const list = decisionesBySku.get(sku) || [];
        let best = null;
        let bestScore = -1;
        for (const decision of list) {
          let score = 0;
          let match = true;
          const fields = [
            {
              decision: decision.new_categoria_cod,
              propuesta: propuesta.categoria_cod,
            },
            { decision: decision.new_tipo_cod, propuesta: propuesta.tipo_cod },
            {
              decision: decision.new_clasif_cod,
              propuesta: propuesta.clasif_cod,
            },
          ];
          for (const field of fields) {
            if (isEmptyValue(field.decision)) continue;
            if (String(field.decision) !== String(field.propuesta || "")) {
              match = false;
              break;
            }
            score += 1;
          }
          if (match && score > bestScore) {
            best = decision;
            bestScore = score;
          }
        }
        return best ? formatDecision(best) : null;
      };

      const filteredEscaneos = buscarSku
        ? escaneos.filter((e) => String(e.sku).toUpperCase().includes(buscarSku))
        : escaneos;
      const filteredSkus = new Set(filteredEscaneos.map((e) => e.sku));
      const consensus = buildConsensusReport({
        escaneos: filteredEscaneos,
        snapshots: Array.from(snapBySku.values()).filter((row) => filteredSkus.has(row.sku)),
        maestro: Array.from(maestroBySku.values()).filter((row) => filteredSkus.has(row.sku)),
      });
      const items = [];
      for (const item of consensus.items) {
        if (soloConDiferencias && !item.hayDiferencias) continue;
        if (!item.propuestas.length && !snapBySku.has(item.sku)) continue;
        const unknown = unknownBySku.get(item.sku) || null;
        const propuestasArr = item.propuestas.map((p) => ({
          ...p,
          decision: findDecision(item.sku, p),
        }));

        if (filtroConsenso === "true" && !item.hayConsenso) continue;
        if (filtroConsenso === "false" && item.hayConsenso) continue;

        items.push({
          sku: item.sku,
          maestro: item.maestro,
          skuType: unknown ? "UNKNOWN" : "KNOWN",
          unknownId: unknown?.id || null,
          unknownStatus: unknown?.status || null,
          stage: stageBySku.get(item.sku) || null,
          decisionsByField: decisionesByField.get(item.sku) || null,
          consensoAtributos: item.consensoAtributos,
          atributosConsenso: item.atributosConsenso,
          estadoConsenso: item.estadoConsenso,
          hayConflicto: item.hayConflicto,
          hayEmpate: item.hayEmpate,
          sinObservacion: item.sinObservacion,
          propuestas: propuestasArr,
          totalVotos: item.totalVotos,
          totalObservantes: item.totalObservantes,
          consensoPct: item.consensoPct,
          consensoPorcentaje: item.consensoPorcentaje,
          hayConsenso: item.hayConsenso,
        });
      }
      res.json({ items });
    },

    decidir: async (req, res) => {
      try {
        const {
          campaniaId,
          sku,
          propuesta,
          decision,
          decidedBy,
          aplicarAhora = false,
          notas = "",
        } = req.body || {};
        const parsedSku = parseSku(sku || "");
        if (!campaniaId || !parsedSku.valid || !decision)
          return sendAdminError(res, 400, "Faltan campos");
        if (!["aceptar", "rechazar"].includes(decision))
          return sendAdminError(res, 400, "decision inválida");
        const hasPropuesta =
          !isEmptyValue(propuesta?.categoria_cod) ||
          !isEmptyValue(propuesta?.tipo_cod) ||
          !isEmptyValue(propuesta?.clasif_cod);
        if (decision === "aceptar" && !hasPropuesta) {
          return sendAdminError(res, 400, "propuesta requerida para aceptar");
        }

        const act = await recordDecision({
          campaniaId: Number(campaniaId), sku: parsedSku.normalized, propuesta, decision,
          decidedBy, aplicarAhora, notas,
        });
        res.json({
          ok: true,
          actualizacion: act,
          warnings: parsedSku.hadSuffix ? [{ code: 'SKU_SUFFIX_IGNORED', skuNormalized: parsedSku.normalized }] : [],
        });
      } catch (e) {
        if (e.code === 'UPDATE_CONFLICT') {
          return res.status(409).json({ error: e.message, code: e.code, requestId: req.id });
        }
        if (e.status) {
          return res.status(e.status).json({ error: e.message, code: e.code, ...(e.details ? { errors: e.details } : {}), requestId: req.id });
        }
        console.error({ event: 'decision_error', code: e.code || 'INTERNAL_ERROR' });
        sendAdminError(res, 500, "Error al decidir revisión");
      }
    },

    // Discrepancias vs Maestro (resumen utilizado por Admin/Auditoría)
    discrepancias: async (req, res) => {
      const minVotos = Math.max(1, Number(req.query.minVotos || 1));
      const campaniaId = Number(req.query.campaniaId);
      const filterSku = cleanSku(req.query.sku || "");
      if (String(req.query.sku || '').trim() && !filterSku)
        return sendAdminError(res, 400, "SKU de filtro inválido");
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");
      const data = await prisma.escaneo.findMany({
        where: { campaniaId },
        orderBy: { ts: "desc" },
      });
      const snaps = await prisma.campaniaMaestro.findMany({
        where: { campaniaId },
      });
      const consensus = buildConsensusReport({ escaneos: data, snapshots: snaps, filterSku });
      const items = consensus.items
        .map((item) => {
          const atributos = item.atributosConsenso
            .filter((attr) => attr.votosGanador >= minVotos && (attr.difiereMaestro || attr.hayConflicto))
            .map((attr) => ({ ...attr }));
          if (atributos.length === 0) return null;
          const topPropuesta = Object.fromEntries(
            atributos.map((attr) => [attr.atributo, attr.ganador])
          );
          return {
            sku: item.sku,
            maestro: item.maestro,
            topPropuesta,
            atributos,
            totalVotos: item.totalVotos,
            totalObservantes: item.totalObservantes,
            consensoVotos: Math.max(0, ...atributos.map((attr) => attr.votosGanador)),
            consensoPct: item.consensoPct,
            consensoPorcentaje: item.consensoPorcentaje,
            estadoConsenso: item.estadoConsenso,
            sucursales: Array.from(
              new Set(atributos.flatMap((attr) => attr.valores.flatMap((v) => v.sucursales)))
            ).sort(),
            updatedAt: atributos
              .flatMap((attr) => attr.valores.map((v) => v.latestAt).filter(Boolean))
              .sort()
              .at(-1) || null,
          };
        })
        .filter(Boolean);

      res.json({ items });
    },

    // Entre sucursales (si todavía no lo tenés, devolvé estructura mínima)
    discrepanciasSuc: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId);
      const minSuc = Math.max(1, Number(req.query.minSucursales || 1));
      const filterSku = cleanSku(req.query.sku || "");
      if (String(req.query.sku || '').trim() && !filterSku)
        return sendAdminError(res, 400, "SKU de filtro inválido");

      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");
      const esc = await prisma.escaneo.findMany({ where: { campaniaId } });
      const consensus = buildConsensusReport({ escaneos: esc, filterSku });
      const items = consensus.items
        .map((item) => {
          const conflictos = item.atributosConsenso.filter(
            (attr) => attr.totalObservantes >= minSuc && (attr.hayConflicto || attr.hayEmpate)
          );
          if (!conflictos.length) return null;
          const mayoritaria = Object.fromEntries(
            conflictos.map((attr) => [attr.atributo, attr.ganador])
          );
          return {
            sku: item.sku,
            conflicto: conflictos.some((attr) => attr.hayConflicto),
            empate: conflictos.some((attr) => attr.hayEmpate),
            atributos: conflictos,
            mayoritaria,
            variantes: conflictos.flatMap((attr) => attr.valores.slice(1)),
          };
        })
        .filter(Boolean);
      res.json({ items });
    },

    exportDiscrepanciasCSV: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId);
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");

      // Reutilizamos la lógica de "discrepancias"
      const escs = await prisma.escaneo.findMany({
        where: { campaniaId },
        orderBy: { ts: "desc" },
      });
      const snaps = await prisma.campaniaMaestro.findMany({
        where: { campaniaId },
      });
      const consensus = buildConsensusReport({ escaneos: escs, snapshots: snaps });
      const rows = [
        [
          "sku",
          "atributo",
          "maestro",
          "ganador",
          "votos_ganador",
          "total_observantes",
          "consenso_pct",
          "estado",
          "alternativas",
        ],
      ];
      for (const item of consensus.items) {
        for (const attr of item.atributosConsenso) {
          if (attr.sinObservacion) continue;
          rows.push([
            item.sku,
            attr.atributo,
            attr.maestro,
            attr.ganador,
            attr.votosGanador,
            attr.totalObservantes,
            attr.consensoPorcentaje,
            attr.estado,
            attr.valores.map((v) => `${v.value}:${v.count}`).join("|"),
          ]);
        }
      }

      const { toCSV } = await import("../utils/csv.js");
      const csv = toCSV(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="discrepancias.csv"'
      );
      res.send(csv);
    },

    exportDiscrepanciasSucCSV: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId);
      const minSuc = Math.max(1, Number(req.query.minSucursales || 1));

      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");

      const esc = await prisma.escaneo.findMany({ where: { campaniaId } });
      const consensus = buildConsensusReport({ escaneos: esc });
      const rows = [
        [
          "sku",
          "atributo",
          "estado",
          "ganador",
          "sucursales_ganador",
          "variantes_count",
          "sucursales_observantes",
        ],
      ];

      for (const item of consensus.items) {
        for (const attr of item.atributosConsenso) {
          if (attr.totalObservantes < minSuc || (!attr.hayConflicto && !attr.hayEmpate)) continue;
          rows.push([
            item.sku,
            attr.atributo,
            attr.estado,
            attr.ganador,
            attr.valores[0]?.sucursales.length || 0,
            Math.max(0, attr.valores.length - 1),
            attr.totalObservantes,
          ]);
        }
      }

      const { toCSV } = await import("../utils/csv.js");
      const csv = toCSV(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="discrepancias_sucursales.csv"'
      );
      res.send(csv);
    },

    resumenAuditoria: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0);
      if (!campaniaId) {
        return sendAdminError(res, 400, "campaniaId requerido");
      }

      const [escaneos, snapshots, actualizaciones] = await Promise.all([
        prisma.escaneo.findMany({ where: { campaniaId } }),
        prisma.campaniaMaestro.findMany({ where: { campaniaId } }),
        prisma.actualizacion.findMany({
          where: {
            campaniaId,
            estado: { in: ["pendiente", "aplicada"] },
            archivada: false,
          },
          orderBy: [{ ts: "desc" }, { id: "desc" }],
        }),
      ]);

      const consensus = buildConsensusReport({ escaneos, snapshots });
      const scansByUser = new Map();
      const suggestionsByUser = new Map();

      const acceptedBySku = new Map();
      for (const act of actualizaciones) {
        const entry = acceptedBySku.get(act.sku) || {
          categoria_cod: "",
          tipo_cod: "",
          clasif_cod: "",
        };
        if (!entry.categoria_cod && act.new_categoria_cod) entry.categoria_cod = act.new_categoria_cod;
        if (!entry.tipo_cod && act.new_tipo_cod) entry.tipo_cod = act.new_tipo_cod;
        if (!entry.clasif_cod && act.new_clasif_cod) entry.clasif_cod = act.new_clasif_cod;
        acceptedBySku.set(act.sku, entry);
      }

      const acceptedByUser = new Map(); // user => Set<sku|field>

      for (const e of escaneos) {
        const user = e.email || "";
        if (user) {
          scansByUser.set(user, (scansByUser.get(user) || 0) + 1);
        }
      }

      for (const obs of consensus.latestObservations) {
        const user = obs.email || "";
        if (!user) continue;
        const item = consensus.bySku.get(obs.sku);
        const attr = item?.consensoAtributos?.[obs.field];
        if (attr?.difiereMaestro) {
          suggestionsByUser.set(user, (suggestionsByUser.get(user) || 0) + 1);
        }
        const accepted = acceptedBySku.get(obs.sku);
        if (accepted && accepted[obs.field] && String(obs.value) === String(accepted[obs.field])) {
          const set = acceptedByUser.get(user) || new Set();
          set.add(`${obs.sku}|${obs.field}`);
          acceptedByUser.set(user, set);
        }
      }

      const observedItems = consensus.items.filter((item) => item.totalObservantes > 0);
      const skuEscaneados = observedItems.length;
      const skuConSugerencias = observedItems.filter((item) => item.hayDiferencias).length;
      const skuVerificados = observedItems.filter((item) => !item.hayDiferencias && !item.sinObservacion).length;
      const atributosResumen = consensus.items.flatMap((item) => item.atributosConsenso);

      let atributosAceptados = 0;
      for (const act of actualizaciones) {
        if (act.new_categoria_cod) atributosAceptados += 1;
        if (act.new_tipo_cod) atributosAceptados += 1;
        if (act.new_clasif_cod) atributosAceptados += 1;
      }

      const acceptedCountByUser = new Map(
        Array.from(acceptedByUser.entries()).map(([user, set]) => [user, set.size])
      );

      const acceptanceRateByUser = Array.from(acceptedCountByUser.entries())
        .map(([user, count]) => {
          const base = suggestionsByUser.get(user) || 0;
          const rate = base ? count / base : 0;
          return { user, count, base, rate };
        })
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 5);

      res.json({
        kpis: {
          skuEscaneados,
          skuVerificados,
          skuConSugerencias,
          atributosAceptados,
        },
        top: {
          escaneos: toTopList(scansByUser, 5),
          sugerencias: toTopList(suggestionsByUser, 5),
          aceptadas: toTopList(acceptedCountByUser, 5),
          tasaAceptacion: acceptanceRateByUser.map((entry) => ({
            ...entry,
            rate: Number(Math.min(1, entry.rate).toFixed(4)),
            ratePct: Number((Math.min(1, entry.rate) * 100).toFixed(2)),
          })),
        },
        consenso: {
          eventosAuditados: consensus.eventosAuditados,
          atributosObservados: atributosResumen.filter((attr) => !attr.sinObservacion).length,
          atributosSinObservacion: atributosResumen.filter((attr) => attr.sinObservacion).length,
          atributosConConsenso: atributosResumen.filter((attr) => attr.hayConsenso).length,
          atributosConConflicto: atributosResumen.filter((attr) => attr.hayConflicto).length,
          atributosConEmpate: atributosResumen.filter((attr) => attr.hayEmpate).length,
        },
      });
    },
  };
}
