import { pad2, cleanSku } from "../utils/sku.js";
import { ActualizacionesService } from "../services/actualizaciones.service.js";
import { sendAdminError } from "../utils/http.js";
export function RevisionesController(prisma) {
  const { applyUpdates } = ActualizacionesService(prisma);
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

      const buscarSku = (req.query.sku || "").trim().toUpperCase();
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
        orderBy: { ts: "desc" },
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

      const porSku = new Map();
      for (const e of escaneos) {
        if (buscarSku && !String(e.sku).toUpperCase().includes(buscarSku))
          continue;
        const snap = snapBySku.get(e.sku) || maestroBySku.get(e.sku) || null;
        const dif =
          !snap ||
          e.asum_categoria_cod !== (snap?.categoria_cod || null) ||
          e.asum_tipo_cod !== (snap?.tipo_cod || null) ||
          e.asum_clasif_cod !== (snap?.clasif_cod || null);
        if (soloConDiferencias && !dif) continue;

        const grp = porSku.get(e.sku) || {
          sku: e.sku,
          maestro: snap
            ? {
                categoria_cod: snap.categoria_cod,
                tipo_cod: snap.tipo_cod,
                clasif_cod: snap.clasif_cod,
              }
            : {
                categoria_cod: "",
                tipo_cod: "",
                clasif_cod: "",
              },
          propuestas: new Map(),
        };
        const cat = e.asum_categoria_cod || "";
        const tip = e.asum_tipo_cod || "";
        const cla = e.asum_clasif_cod || "";
        const key = `${cat}|${tip}|${cla}`;
        const p = grp.propuestas.get(key) || {
          categoria_cod: cat,
          tipo_cod: tip,
          clasif_cod: cla,
          count: 0,
          usuarios: new Set(),
          sucursales: new Set(),
        };
        p.count += 1;
        if (e.email) p.usuarios.add(e.email);
        if (e.sucursal) p.sucursales.add(e.sucursal);
        grp.propuestas.set(key, p);
        porSku.set(e.sku, grp);
      }

      const items = [];
      for (const grp of porSku.values()) {
        const unknown = unknownBySku.get(grp.sku) || null;
        const propuestasArr = Array.from(grp.propuestas.values())
          .map((p) => ({
            ...p,
            usuarios: Array.from(p.usuarios),
            sucursales: Array.from(p.sucursales),
            decision: findDecision(grp.sku, p),
          }))
          .sort((a, b) => b.count - a.count);

        const total = propuestasArr.reduce((s, p) => s + p.count, 0);
        const top = propuestasArr[0];
        const consenso = top ? top.count / Math.max(1, total) : 0;
        const hayConsenso = top
          ? top.count >= 2 && top.count > (propuestasArr[1]?.count || 0)
          : false;

        if (filtroConsenso === "true" && !hayConsenso) continue;
        if (filtroConsenso === "false" && hayConsenso) continue;

        items.push({
          sku: grp.sku,
          maestro: grp.maestro,
          skuType: unknown ? "UNKNOWN" : "KNOWN",
          unknownId: unknown?.id || null,
          unknownStatus: unknown?.status || null,
          stage: stageBySku.get(grp.sku) || null,
          decisionsByField: decisionesByField.get(grp.sku) || null,
          propuestas: propuestasArr,
          totalVotos: total,
          consensoPct: Number(consenso.toFixed(2)),
          hayConsenso,
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
        if (!campaniaId || !sku || !decision)
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

        const snap = await prisma.campaniaMaestro.findUnique({
          where: { campaniaId_sku: { campaniaId: Number(campaniaId), sku } },
        });
        const oldCat = snap?.categoria_cod ?? null;
        const oldTip = snap?.tipo_cod ?? null;
        const oldCla = snap?.clasif_cod ?? null;
        const newCat = isEmptyValue(propuesta?.categoria_cod)
          ? ""
          : pad2(propuesta.categoria_cod);
        const newTip = isEmptyValue(propuesta?.tipo_cod)
          ? ""
          : pad2(propuesta.tipo_cod);
        const newCla = isEmptyValue(propuesta?.clasif_cod)
          ? ""
          : pad2(propuesta.clasif_cod);
        const estado = decision === "aceptar" ? "pendiente" : "rechazada";

        const fieldsToArchive = [];
        if (!isEmptyValue(propuesta?.categoria_cod))
          fieldsToArchive.push("categoria_cod");
        if (!isEmptyValue(propuesta?.tipo_cod))
          fieldsToArchive.push("tipo_cod");
        if (!isEmptyValue(propuesta?.clasif_cod))
          fieldsToArchive.push("clasif_cod");
        if (fieldsToArchive.length) {
          const orConditions = [];
          if (fieldsToArchive.includes("categoria_cod")) {
            orConditions.push({
              new_categoria_cod: { not: "" },
            });
          }
          if (fieldsToArchive.includes("tipo_cod")) {
            orConditions.push({
              new_tipo_cod: { not: "" },
            });
          }
          if (fieldsToArchive.includes("clasif_cod")) {
            orConditions.push({
              new_clasif_cod: { not: "" },
            });
          }
          await prisma.actualizacion.updateMany({
            where: {
              campaniaId: Number(campaniaId),
              sku,
              estado: "pendiente",
              archivada: false,
              OR: orConditions,
            },
            data: {
              archivada: true,
              archivadaAt: new Date(),
              archivadaBy: decidedBy || "admin",
            },
          });
        }

        const act = await prisma.actualizacion.create({
          data: {
            campaniaId: Number(campaniaId),
            sku,
            old_categoria_cod: oldCat,
            old_tipo_cod: oldTip,
            old_clasif_cod: oldCla,
            new_categoria_cod: newCat,
            new_tipo_cod: newTip,
            new_clasif_cod: newCla,
            estado,
            decidedBy: decidedBy || null,
            decidedAt: new Date(),
            notas,
          },
        });

        if (decision === "aceptar") {
          const skuStage = ensureModel(prisma.skuStage, "skuStage", res);
          if (!skuStage) return;
          await skuStage.upsert({
            where: { campaniaId_sku: { campaniaId: Number(campaniaId), sku } },
            create: {
              campaniaId: Number(campaniaId),
              sku,
              stage: "confirm",
              updatedBy: decidedBy || null,
            },
            update: {
              stage: "confirm",
              updatedBy: decidedBy || null,
              updatedAt: new Date(),
            },
          });
        }

        if (decision === "aceptar" && aplicarAhora) {
          await applyUpdates({
            ids: [act.id],
            decidedBy: decidedBy || "admin",
          });
        }

        res.json({ ok: true, actualizacion: act });
      } catch (e) {
        console.error(e);
        sendAdminError(res, 500, "Error al decidir revisión");
      }
    },

    // Discrepancias vs Maestro (resumen utilizado por Admin/Auditoría)
    discrepancias: async (req, res) => {
      const minVotos = Math.max(1, Number(req.query.minVotos || 1));
      const campaniaId = Number(req.query.campaniaId);
      const filterSku = cleanSku(req.query.sku || "");
      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");
      const data = await prisma.escaneo.findMany({
        where: { campaniaId },
        orderBy: { ts: "desc" },
      });
      const snaps = await prisma.campaniaMaestro.findMany({
        where: { campaniaId },
      });
      const snapBySku = new Map(snaps.map((s) => [s.sku, s]));

      const porSku = new Map();
      for (const e of data) {
        if (filterSku && e.sku !== filterSku) continue;
        const g = porSku.get(e.sku) || {
          sku: e.sku,
          maestro: null,
          propuestas: new Map(),
          total: 0,
          updatedAt: null,
          sucursales: new Set(),
        };
        const snap = snapBySku.get(e.sku) || null;
        g.maestro = snap
          ? {
              categoria_cod: snap.categoria_cod,
              tipo_cod: snap.tipo_cod,
              clasif_cod: snap.clasif_cod,
            }
          : null;
        const key = `${e.asum_categoria_cod || ""}|${e.asum_tipo_cod || ""}|${
          e.asum_clasif_cod || ""
        }`;
        const p = g.propuestas.get(key) || {
          categoria_cod: e.asum_categoria_cod || "",
          tipo_cod: e.asum_tipo_cod || "",
          clasif_cod: e.asum_clasif_cod || "",
          count: 0,
        };
        p.count += 1;
        g.propuestas.set(key, p);
        if (e.sucursal) g.sucursales.add(e.sucursal);
        g.total += 1;
        g.updatedAt = !g.updatedAt || e.ts > g.updatedAt ? e.ts : g.updatedAt;
        porSku.set(e.sku, g);
      }

      const items = Array.from(porSku.values())
        .map((g) => {
          const arr = Array.from(g.propuestas.values())
            .filter((p) => p.count >= minVotos)
            .sort((a, b) => b.count - a.count);
          if (arr.length === 0) return null;
          return {
            sku: g.sku,
            maestro: g.maestro,
            topPropuesta: arr[0] || null,
            totalVotos: g.total,
            consensoVotos: arr[0]?.count || 0,
            sucursales: Array.from(g.sucursales),
            updatedAt: g.updatedAt,
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

      if (!campaniaId)
        return sendAdminError(res, 400, "campaniaId requerido");
      const esc = await prisma.escaneo.findMany({ where: { campaniaId } });
      const bySku = new Map();
      for (const e of esc) {
        if (filterSku && e.sku !== filterSku) continue;
        const key = `${e.asum_categoria_cod || ""}|${e.asum_tipo_cod || ""}|${
          e.asum_clasif_cod || ""
        }`;
        const grp = bySku.get(e.sku) || { sku: e.sku, firmas: new Map() };
        const f = grp.firmas.get(key) || {
          categoria_cod: e.asum_categoria_cod || "",
          tipo_cod: e.asum_tipo_cod || "",
          clasif_cod: e.asum_clasif_cod || "",
          sucursales: new Set(),
        };
        if (e.sucursal) f.sucursales.add(e.sucursal);
        grp.firmas.set(key, f);
        bySku.set(e.sku, grp);
      }
      const items = [];
      for (const { sku, firmas } of bySku.values()) {
        const arr = Array.from(firmas.values())
          .map((f) => ({ ...f, sucursales: Array.from(f.sucursales) }))
          .filter((f) => f.sucursales.length >= minSuc)
          .sort((a, b) => b.sucursales.length - a.sucursales.length);
        if (arr.length === 0) continue;
        items.push({
          sku,
          conflicto: arr.length > 1,
          mayoritaria: arr[0] || null,
          variantes: arr.slice(1),
        });
      }
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
      const snapBySku = new Map(snaps.map((s) => [s.sku, s]));

      const porSku = new Map();
      for (const e of escs) {
        const g = porSku.get(e.sku) || {
          sku: e.sku,
          maestro: snapBySku.get(e.sku) || null,
          propuestas: new Map(),
        };
        const key = `${e.asum_categoria_cod || ""}|${e.asum_tipo_cod || ""}|${
          e.asum_clasif_cod || ""
        }`;
        const p = g.propuestas.get(key) || {
          categoria_cod: e.asum_categoria_cod || "",
          tipo_cod: e.asum_tipo_cod || "",
          clasif_cod: e.asum_clasif_cod || "",
          count: 0,
        };
        p.count += 1;
        g.propuestas.set(key, p);
        porSku.set(e.sku, g);
      }

      const rows = [
        [
          "sku",
          "maestro_cat",
          "maestro_tipo",
          "maestro_clasif",
          "top_cat",
          "top_tipo",
          "top_clasif",
          "votos_top",
          "total_votos",
        ],
      ];
      for (const { sku, maestro, propuestas } of porSku.values()) {
        const arr = Array.from(propuestas.values()).sort(
          (a, b) => b.count - a.count
        );
        const top = arr[0] || {
          categoria_cod: "",
          tipo_cod: "",
          clasif_cod: "",
          count: 0,
        };
        const tot = arr.reduce((s, p) => s + p.count, 0);
        rows.push([
          sku,
          maestro?.categoria_cod || "",
          maestro?.tipo_cod || "",
          maestro?.clasif_cod || "",
          top.categoria_cod,
          top.tipo_cod,
          top.clasif_cod,
          top.count,
          tot,
        ]);
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
      const bySku = new Map();
      for (const e of esc) {
        const key = `${e.asum_categoria_cod || ""}|${e.asum_tipo_cod || ""}|${
          e.asum_clasif_cod || ""
        }`;
        const grp = bySku.get(e.sku) || { sku: e.sku, firmas: new Map() };
        const f = grp.firmas.get(key) || {
          categoria_cod: e.asum_categoria_cod || "",
          tipo_cod: e.asum_tipo_cod || "",
          clasif_cod: e.asum_clasif_cod || "",
          sucursales: new Set(),
        };
        if (e.sucursal) f.sucursales.add(e.sucursal);
        grp.firmas.set(key, f);
        bySku.set(e.sku, grp);
      }

      const rows = [
        [
          "sku",
          "conflicto",
          "mayoritaria",
          "variantes_count",
          "sucursales_count",
        ],
      ];

      for (const { sku, firmas } of bySku.values()) {
        const arr = Array.from(firmas.values())
          .map((f) => ({ ...f, sucursales: Array.from(f.sucursales) }))
          .filter((f) => f.sucursales.length >= minSuc)
          .sort((a, b) => b.sucursales.length - a.sucursales.length);
        if (arr.length === 0) continue;
        const conflicto = arr.length > 1 ? "true" : "false";
        const variantesCount = Math.max(0, arr.length - 1);
        const mayoritaria = arr[0];
        const sucursalesSet = new Set();
        for (const row of arr) {
          for (const sucursal of row.sucursales) sucursalesSet.add(sucursal);
        }
        const mayoritariaLabel = [
          mayoritaria.categoria_cod,
          mayoritaria.tipo_cod,
          mayoritaria.clasif_cod,
        ]
          .filter((v) => v !== undefined && v !== null)
          .join("|");
        rows.push([
          sku,
          conflicto,
          mayoritariaLabel,
          variantesCount,
          sucursalesSet.size,
        ]);
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
          orderBy: { ts: "desc" },
        }),
      ]);

      const snapBySku = new Map(snapshots.map((s) => [s.sku, s]));
      const skuStats = new Map();
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
        const sku = e.sku;
        const snap = snapBySku.get(sku) || null;
        const hasMaestro = Boolean(snap);
        const diff =
          !snap ||
          String(e.asum_categoria_cod || "") !== String(snap?.categoria_cod || "") ||
          String(e.asum_tipo_cod || "") !== String(snap?.tipo_cod || "") ||
          String(e.asum_clasif_cod || "") !== String(snap?.clasif_cod || "");

        const stat = skuStats.get(sku) || { hasMaestro: false, hasDiff: false };
        stat.hasMaestro = stat.hasMaestro || hasMaestro;
        stat.hasDiff = stat.hasDiff || diff;
        skuStats.set(sku, stat);

        const user = e.email || "";
        if (user) {
          scansByUser.set(user, (scansByUser.get(user) || 0) + 1);
          if (diff) {
            suggestionsByUser.set(user, (suggestionsByUser.get(user) || 0) + 1);
          }
          const accepted = acceptedBySku.get(sku);
          if (accepted) {
            const set = acceptedByUser.get(user) || new Set();
            if (
              accepted.categoria_cod &&
              String(e.asum_categoria_cod || "") === String(accepted.categoria_cod)
            ) {
              set.add(`${sku}|categoria_cod`);
            }
            if (
              accepted.tipo_cod &&
              String(e.asum_tipo_cod || "") === String(accepted.tipo_cod)
            ) {
              set.add(`${sku}|tipo_cod`);
            }
            if (
              accepted.clasif_cod &&
              String(e.asum_clasif_cod || "") === String(accepted.clasif_cod)
            ) {
              set.add(`${sku}|clasif_cod`);
            }
            acceptedByUser.set(user, set);
          }
        }
      }

      const skuEscaneados = skuStats.size;
      const skuConSugerencias = Array.from(skuStats.values()).filter((s) => s.hasDiff).length;
      const skuVerificados = Array.from(skuStats.values()).filter((s) => s.hasMaestro && !s.hasDiff).length;

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
          tasaAceptacion: acceptanceRateByUser,
        },
      });
    },
  };
}
