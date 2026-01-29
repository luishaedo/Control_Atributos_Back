import { pad2 } from "../utils/sku.js";

export function ActualizacionesService(prisma) {
  const isEmptyValue = (value) =>
    value === undefined || value === null || String(value).trim() === "";

  const pickEffectiveValue = (newValue, oldValue) => {
    if (!isEmptyValue(newValue)) return newValue;
    return oldValue ?? "";
  };

  const applyUpdates = async ({ ids = [], decidedBy = "" } = {}) => {
    if (!Array.isArray(ids) || ids.length === 0) return { count: 0 };
    const acts = await prisma.actualizacion.findMany({
      where: { id: { in: ids }, estado: "pendiente" },
    });
    if (acts.length === 0) return { count: 0 };

    await prisma.$transaction(async (tx) => {
      for (const a of acts) {
        const existing = await tx.maestro.findUnique({
          where: { sku: a.sku },
          select: { sku: true },
        });
        if (!existing) {
          const err = new Error(`Maestro no encontrado para SKU ${a.sku}`);
          err.status = 400;
          throw err;
        }

        await tx.maestro.update({
          where: { sku: a.sku },
          data: {
            categoria_cod: pickEffectiveValue(
              a.new_categoria_cod,
              a.old_categoria_cod
            ),
            tipo_cod: pickEffectiveValue(a.new_tipo_cod, a.old_tipo_cod),
            clasif_cod: pickEffectiveValue(a.new_clasif_cod, a.old_clasif_cod),
          },
        });
        await tx.actualizacion.update({
          where: { id: a.id },
          data: {
            estado: "aplicada",
            decidedBy: decidedBy || a.decidedBy,
            appliedAt: new Date(),
          },
        });
      }
    });

    return { count: acts.length };
  };

  const normalizeCode = (value) => {
    if (isEmptyValue(value)) return "";
    return pad2(String(value).trim());
  };

  return {
    applyUpdates,
    normalizeCode,
  };
}
