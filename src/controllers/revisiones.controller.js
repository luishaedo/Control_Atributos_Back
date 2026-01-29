import { pad2 } from "../utils/sku.js";
export function RevisionesController(prisma) {
  const { applyUpdates } = ActualizacionesService(prisma);
  const isEmptyValue = (value) => value === undefined || value === null || String(value).trim() === "";
  const formatDecision = (decision) => ({
    estado: decision.estado,
    id: decision.id,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
  });

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
        return res.status(400).json({ error: "campaniaId requerido" });

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

      const decisiones = await prisma.actualizacion.findMany({
        where: { campaniaId },
        orderBy: { ts: "desc" },
      });
      const decisionesBySku = new Map();
      for (const dec of decisiones) {
        const list = decisionesBySku.get(dec.sku) || [];
        list.push(dec);
        decisionesBySku.set(dec.sku, list);
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
        const snap = snapBySku.get(e.sku) || null;
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
            : null,
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
          return res.status(400).json({ error: "Faltan campos" });
        if (!["aceptar", "rechazar"].includes(decision))
          return res.status(400).json({ error: "decision inválida" });
        const hasPropuesta =
          !isEmptyValue(propuesta?.categoria_cod) ||
          !isEmptyValue(propuesta?.tipo_cod) ||
          !isEmptyValue(propuesta?.clasif_cod);
        if (decision === "aceptar" && !hasPropuesta) {
          return res
            .status(400)
            .json({ error: "propuesta requerida para aceptar" });
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

        await prisma.actualizacion.updateMany({
          where: {
            campaniaId: Number(campaniaId),
            sku,
            estado: "pendiente",
            archivada: false,
          },
          data: {
            archivada: true,
            archivadaAt: new Date(),
            archivadaBy: decidedBy || "admin",
          },
        });

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
          await prisma.skuStage.upsert({
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

        res.json({ ok: true, actualizacion: act });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Error al decidir revisión" });
      }
    },

    // Discrepancias vs Maestro (resumen utilizado por Admin/Auditoría)
    discrepancias: async (req, res) => {
      const minVotos = Math.max(1, Number(req.query.minVotos || 1));
      const campaniaId = Number(req.query.campaniaId);
      if (!campaniaId)
        return res.status(400).json({ error: "campaniaId requerido" });
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

      if (!campaniaId)
        return res.status(400).json({ error: "campaniaId requerido" });
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
        return res.status(400).json({ error: "campaniaId requerido" });

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
        return res.status(400).json({ error: "campaniaId requerido" });

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
  };
}
