export const CONSENSUS_FIELDS = [
  {
    key: "categoria_cod",
    scanKey: "asum_categoria_cod",
    label: "categoria",
  },
  {
    key: "tipo_cod",
    scanKey: "asum_tipo_cod",
    label: "tipo",
  },
  {
    key: "clasif_cod",
    scanKey: "asum_clasif_cod",
    label: "clasif",
  },
];

const clean = (value) => String(value ?? "").trim();

const timeValue = (value) => {
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
};

const isLaterObservation = (next, current) => {
  if (!current) return true;
  const nextTime = timeValue(next.ts);
  const currentTime = timeValue(current.ts);
  if (nextTime !== currentTime) return nextTime > currentTime;
  return Number(next.id || 0) > Number(current.id || 0);
};

const snapshotShape = (row) =>
  row
    ? {
        categoria_cod: clean(row.categoria_cod),
        tipo_cod: clean(row.tipo_cod),
        clasif_cod: clean(row.clasif_cod),
      }
    : {
        categoria_cod: "",
        tipo_cod: "",
        clasif_cod: "",
      };

const summarizeAttribute = ({ sku, field, maestro, observations }) => {
  const byValue = new Map();
  for (const obs of observations) {
    const entry = byValue.get(obs.value) || {
      value: obs.value,
      count: 0,
      sucursales: new Set(),
      usuarios: new Set(),
      latestAt: null,
    };
    entry.count += 1;
    entry.sucursales.add(obs.sucursal);
    if (obs.email) entry.usuarios.add(obs.email);
    if (!entry.latestAt || isLaterObservation(obs, { ts: entry.latestAt, id: 0 })) {
      entry.latestAt = obs.ts || null;
    }
    byValue.set(obs.value, entry);
  }

  const valores = Array.from(byValue.values())
    .map((entry) => ({
      value: entry.value,
      count: entry.count,
      sucursales: Array.from(entry.sucursales).sort(),
      usuarios: Array.from(entry.usuarios).sort(),
      latestAt: entry.latestAt,
    }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));

  const totalObservantes = valores.reduce((sum, entry) => sum + entry.count, 0);
  const top = valores[0] || null;
  const second = valores[1] || null;
  const hayEmpate = Boolean(top && second && top.count === second.count);
  const hayConflicto = valores.length > 1;
  const sinObservacion = totalObservantes === 0;
  const consensoRatio = top && totalObservantes ? top.count / totalObservantes : 0;
  const consensoPorcentaje = Number((consensoRatio * 100).toFixed(2));
  const maestroValue = clean(maestro?.[field.key]);
  const ganador = top?.value || "";
  const difiereMaestro = Boolean(ganador && ganador !== maestroValue);
  const estado = sinObservacion
    ? "sin_observacion"
    : hayEmpate
      ? "empate"
      : hayConflicto
        ? "conflicto"
        : "consenso";

  return {
    sku,
    atributo: field.key,
    label: field.label,
    maestro: maestroValue,
    ganador,
    votosGanador: top?.count || 0,
    totalObservantes,
    consensoPct: Number(consensoRatio.toFixed(4)),
    consensoPorcentaje,
    hayConsenso: estado === "consenso",
    hayConflicto,
    hayEmpate,
    sinObservacion,
    difiereMaestro,
    estado,
    valores,
  };
};

export function buildConsensusReport({ escaneos = [], snapshots = [], maestro = [], filterSku = "" } = {}) {
  const normalizedFilterSku = clean(filterSku).toUpperCase();
  const snapBySku = new Map(snapshots.map((row) => [row.sku, snapshotShape(row)]));
  const maestroBySku = new Map(maestro.map((row) => [row.sku, snapshotShape(row)]));
  const latestByKey = new Map();
  const skus = new Set();
  let eventosAuditados = 0;

  for (const scan of escaneos) {
    const sku = clean(scan.sku).toUpperCase();
    if (!sku) continue;
    if (normalizedFilterSku && sku !== normalizedFilterSku) continue;
    skus.add(sku);
    eventosAuditados += 1;

    const sucursal = clean(scan.sucursal);
    if (!sucursal) continue;

    for (const field of CONSENSUS_FIELDS) {
      const value = clean(scan[field.scanKey]);
      if (!value) continue;
      const key = `${sku}|${sucursal}|${field.key}`;
      const candidate = {
        sku,
        sucursal,
        field: field.key,
        value,
        email: clean(scan.email),
        ts: scan.ts || null,
        id: scan.id || 0,
      };
      if (isLaterObservation(candidate, latestByKey.get(key))) {
        latestByKey.set(key, candidate);
      }
    }
  }

  for (const row of snapshots) skus.add(clean(row.sku).toUpperCase());
  for (const row of maestro) skus.add(clean(row.sku).toUpperCase());

  const observationsBySkuField = new Map();
  const compositeBySkuSucursal = new Map();
  for (const obs of latestByKey.values()) {
    const attrKey = `${obs.sku}|${obs.field}`;
    const attrList = observationsBySkuField.get(attrKey) || [];
    attrList.push(obs);
    observationsBySkuField.set(attrKey, attrList);

    const compositeKey = `${obs.sku}|${obs.sucursal}`;
    const composite = compositeBySkuSucursal.get(compositeKey) || {
      sku: obs.sku,
      sucursal: obs.sucursal,
      email: obs.email,
      categoria_cod: "",
      tipo_cod: "",
      clasif_cod: "",
      latestAt: null,
    };
    composite[obs.field] = obs.value;
    if (obs.email) composite.email = obs.email;
    if (!composite.latestAt || timeValue(obs.ts) > timeValue(composite.latestAt)) {
      composite.latestAt = obs.ts || null;
    }
    compositeBySkuSucursal.set(compositeKey, composite);
  }

  const compositesBySku = new Map();
  for (const composite of compositeBySkuSucursal.values()) {
    const list = compositesBySku.get(composite.sku) || [];
    list.push(composite);
    compositesBySku.set(composite.sku, list);
  }

  const bySku = new Map();
  const items = [];
  for (const sku of Array.from(skus).sort()) {
    if (!sku) continue;
    const maestroRow = snapBySku.get(sku) || maestroBySku.get(sku) || snapshotShape(null);
    const atributos = {};
    const atributosArr = CONSENSUS_FIELDS.map((field) => {
      const summary = summarizeAttribute({
        sku,
        field,
        maestro: maestroRow,
        observations: observationsBySkuField.get(`${sku}|${field.key}`) || [],
      });
      atributos[field.key] = summary;
      return summary;
    });

    const propuestasMap = new Map();
    for (const composite of compositesBySku.get(sku) || []) {
      const key = [
        composite.categoria_cod || "",
        composite.tipo_cod || "",
        composite.clasif_cod || "",
      ].join("|");
      const proposal = propuestasMap.get(key) || {
        categoria_cod: composite.categoria_cod || "",
        tipo_cod: composite.tipo_cod || "",
        clasif_cod: composite.clasif_cod || "",
        count: 0,
        usuarios: new Set(),
        sucursales: new Set(),
        latestAt: null,
      };
      proposal.count += 1;
      if (composite.email) proposal.usuarios.add(composite.email);
      if (composite.sucursal) proposal.sucursales.add(composite.sucursal);
      if (!proposal.latestAt || timeValue(composite.latestAt) > timeValue(proposal.latestAt)) {
        proposal.latestAt = composite.latestAt;
      }
      propuestasMap.set(key, proposal);
    }

    const propuestas = Array.from(propuestasMap.values())
      .map((proposal) => ({
        ...proposal,
        usuarios: Array.from(proposal.usuarios).sort(),
        sucursales: Array.from(proposal.sucursales).sort(),
      }))
      .sort((a, b) => b.count - a.count);

    const observedAttributes = atributosArr.filter((attr) => !attr.sinObservacion);
    const hayEmpate = atributosArr.some((attr) => attr.hayEmpate);
    const hayConflicto = atributosArr.some((attr) => attr.hayConflicto);
    const sinObservacion = atributosArr.some((attr) => attr.sinObservacion);
    const hayDiferencias = atributosArr.some((attr) => attr.difiereMaestro);
    const hayConsenso =
      observedAttributes.length > 0 &&
      observedAttributes.every((attr) => attr.hayConsenso);
    const consensoPct = observedAttributes.length
      ? Math.min(...observedAttributes.map((attr) => attr.consensoPct))
      : 0;
    const consensoPorcentaje = Number((consensoPct * 100).toFixed(2));
    const totalObservantes = Math.max(0, ...atributosArr.map((attr) => attr.totalObservantes));
    const estadoConsenso = hayEmpate
      ? "empate"
      : hayConflicto
        ? "conflicto"
        : sinObservacion
          ? "sin_observacion"
          : hayConsenso
            ? "consenso"
            : "sin_observacion";

    const item = {
      sku,
      maestro: maestroRow,
      atributos,
      consensoAtributos: atributos,
      atributosConsenso: atributosArr,
      propuestas,
      totalVotos: totalObservantes,
      totalObservantes,
      consensoPct: Number(consensoPct.toFixed(4)),
      consensoPorcentaje,
      hayConsenso,
      hayConflicto,
      hayEmpate,
      sinObservacion,
      hayDiferencias,
      estadoConsenso,
    };
    bySku.set(sku, item);
    items.push(item);
  }

  return {
    bySku,
    items,
    latestObservations: Array.from(latestByKey.values()),
    eventosAuditados,
  };
}
