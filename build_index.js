// Genera incendios_espana_2026.json: para cada activacion EMSR de incendio en Espana
// durante 2026, calcula por cada AOI la mejor capa "observedEventA" (perimetro quemado)
// siguiendo la prioridad DEL (monitoreo mas reciente) > FEP > GRA (ultimo recurso).
const fs = require("fs");
const path = require("path");

const CODES = [
  "EMSR925", "EMSR921", "EMSR913", "EMSR908", "EMSR906", "EMSR905",
  "EMSR900", "EMSR898", "EMSR896", "EMSR892", "EMSR888", "EMSR887",
  "EMSR885", "EMSR881",
];

const API = "https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=";

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

function pickBestProduct(products) {
  const withEvent = products
    .map((pr) => {
      const layer = pr.layers.find((l) => /observedEventA_v\d+_VT$/.test(l.name));
      return layer ? { pr, jsonUrl: layer.json } : null;
    })
    .filter(Boolean);

  if (withEvent.length === 0) return null;

  const byType = (t) => withEvent.filter((w) => w.pr.type === t)
    .sort((a, b) => b.pr.monitoringNumber - a.pr.monitoringNumber);

  const del = byType("DEL");
  if (del.length) return { ...del[0], type: "DEL" };
  const fep = byType("FEP");
  if (fep.length) return { ...fep[0], type: "FEP" };
  const gra = byType("GRA");
  if (gra.length) return { ...gra[0], type: "GRA" };
  return null;
}

async function main() {
  const fires = [];
  for (const code of CODES) {
    console.log("Procesando", code, "...");
    const data = await fetchJSON(API + code);
    const r = data.results[0];
    if (!r) {
      console.warn("  sin resultados para", code);
      continue;
    }
    const aois = [];
    for (const aoi of r.aois) {
      const best = pickBestProduct(aoi.products);
      aois.push({
        name: aoi.name,
        extent: aoi.extent,
        productType: best ? best.type : null,
        monitoringNumber: best ? best.pr.monitoringNumber : null,
        jsonUrl: best ? best.jsonUrl : null,
      });
    }
    fires.push({
      code: r.code,
      name: r.name,
      eventTime: r.eventTime,
      activationTime: r.activationTime,
      closed: r.closed,
      centroid: r.centroid,
      extent: r.extent,
      countries: r.countries.map((c) => c.name),
      aois,
    });
    // pequena pausa para no machacar la API
    await new Promise((res) => setTimeout(res, 300));
  }

  fires.sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));

  const outPath = path.join(__dirname, "incendios_espana_2026.json");
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), fires }, null, 2));
  console.log("Escrito", outPath, "con", fires.length, "incendios");

  const totalAois = fires.reduce((s, f) => s + f.aois.length, 0);
  const sinPerimetro = fires.reduce((s, f) => s + f.aois.filter((a) => !a.jsonUrl).length, 0);
  console.log(`Total AOIs: ${totalAois}, sin perimetro disponible: ${sinPerimetro}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
