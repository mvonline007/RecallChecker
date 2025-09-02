import React, { useEffect, useMemo, useState } from "react";

// === PDF.js (browser) ===
// We load the worker from a public CDN to avoid bundler worker config hassles.
// If your network blocks CDNs, set `PDFJS_WORKER` below to a self-hosted path.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf";
pdfjs.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const API_BASE =
  "https://data.economie.gouv.fr/api/records/1.0/search/?dataset=rappelconso-v2-gtin-trie";

export default function App() {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [rawText, setRawText] = useState("");
  const [items, setItems] = useState([]); // [{label, eans: string[], lines: string[] }]
  const [results, setResults] = useState({}); // { ean: {status: 'found'|'none'|'error', matches: [], error?:string} }
  const [errors, setErrors] = useState([]);
  const [querying, setQuerying] = useState(false);

  // Auto-parse when text is pasted/edited
  useEffect(() => {
    if (!rawText.trim()) return;
    const parsed = parseReceipt(rawText);
    setItems(parsed);
  }, [rawText]);

  // Auto-check on item list changes
  useEffect(() => {
    if (items.length === 0) return;
    checkRecalls();
  }, [items]);

  const onFile = async (f) => {
    if (!f) return;
    setFile(f);
    setParsing(true);
    setErrors([]);
    setResults({});
    try {
      const abuf = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: abuf }).promise;
      let texts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((it) => it.str).join("\\n");
        texts.push(pageText);
      }
      const full = texts.join("\\n");
      setRawText(full);
      const parsed = parseReceipt(full);
      setItems(parsed);
    } catch (e) {
      console.error(e);
      setErrors((prev) => [
        ...prev,
        "Erreur de lecture PDF. Si votre reçu est scanné (image), essayez de l'exporter en PDF texte ou utilisez l'option Coller le texte ci-dessous.",
      ]);
    } finally {
      setParsing(false);
    }
  };

  const checkRecalls = async () => {
    // Query RappelConso (OpenData MEF) by GTIN/EAN for each found code
    const uniqueEans = Array.from(
      new Set(items.flatMap((it) => it.eans)).values()
    );
    if (uniqueEans.length === 0) return;
    setQuerying(true);
    const out = {};
    for (const ean of uniqueEans) {
      try {
        const url = `${API_BASE}&rows=50&q=${encodeURIComponent(ean)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const matches = Array.isArray(data.records) ? data.records : [];
        out[ean] = { status: matches.length ? "found" : "none", matches };
      } catch (err) {
        console.error(err);
        out[ean] = { status: "error", matches: [], error: `${err}` };
      }
    }
    setResults(out);
    setQuerying(false);
  };

  const addManualItem = () => {
    setItems((prev) => [
      ...prev,
      { label: "(manuel)", eans: [], lines: [] },
    ]);
  };

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const uniqueEans = useMemo(
    () => Array.from(new Set(items.flatMap((it) => it.eans))),
    [items]
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-6xl mx-auto p-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">RappelConso – Vérificateur de reçus</h1>
            <p className="text-sm text-neutral-600 mt-1">
              Chargez un reçu d'achat (PDF). Le script tente d'extraire les lignes produits et les codes EAN/GTIN, puis interroge la base officielle RappelConso (Open Data MEF) pour repérer d'éventuels rappels.
            </p>
          </div>
          <div className="text-xs text-neutral-500 text-right">
            v0.2 (auto) · Données RappelConso (MAJ hebdo)
          </div>
        </header>

        {/* Upload */}
        <section className="bg-white rounded-2xl shadow p-5 mb-6">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <label className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl hover:bg-neutral-50 cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
              />
              <span className="text-sm font-medium">📄 Importer un PDF (reçu)</span>
            </label>
            {file && (
              <div className="text-sm text-neutral-700">Fichier: <span className="font-semibold">{file.name}</span></div>
            )}
          </div>
          <div className="mt-4">
            <details>
              <summary className="text-sm font-semibold cursor-pointer">Ou collez le texte du reçu (fallback)</summary>
              <textarea
                className="mt-3 w-full h-40 p-3 border rounded-xl text-sm"
                placeholder="Collez ici le texte brut de votre reçu si l'extraction PDF échoue"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
              <p className="mt-2 text-xs text-neutral-500">Analyse automatique dès que vous collez du texte.</p>
            </details>
          </div>
          {parsing && (
            <p className="mt-3 text-sm animate-pulse">Lecture du PDF…</p>
          )}
          {errors.length > 0 && (
            <ul className="mt-3 text-sm text-red-600 list-disc pl-5 space-y-1">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Extracted items */}
        <section className="bg-white rounded-2xl shadow p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Produits détectés</h2>
            <div className="flex gap-2">
              <button
                className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-sm"
                onClick={addManualItem}
              >+ Ajouter manuellement</button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-neutral-600">Aucun produit détecté pour le moment.</p>) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-neutral-50">
                    <th className="py-2 px-2">Produit (éditable)</th>
                    <th className="py-2 px-2">EAN/GTIN (séparés par virgule)</th>
                    <th className="py-2 px-2">Rappels trouvés</th>
                    <th className="py-2 px-2">Détail</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const eans = it.eans.join(", ");
                    const allMatches = it.eans.flatMap((ean) => results[ean]?.matches || []);
                    const found = it.eans.some((ean) => results[ean]?.status === "found");
                    const statusCell = it.eans.length === 0
                      ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-100">—</span>
                      : found
                        ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 text-white">⚠️ Rappel</span>
                        : (it.eans.every((ean) => results[ean]?.status === "none")
                            ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-600 text-white">✅ Aucun</span>
                            : <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-200">—</span>);

                    return (
                      <tr key={idx} className="border-b align-top">
                        <td className="py-2 px-2 w-[32ch]">
                          <input
                            className="w-full border rounded-lg px-2 py-1"
                            value={it.label}
                            onChange={(e) => updateItem(idx, { label: cleanLabelForDisplay(e.target.value) })}
                          />
                          {it.lines?.length ? (
                            <details className="text-xs text-neutral-500 mt-1"><summary className="cursor-pointer">Voir contexte</summary>
                              <pre className="whitespace-pre-wrap break-words">{it.lines.join("\\n")}</pre>
                            </details>
                          ) : null}
                        </td>
                        <td className="py-2 px-2 w-[32ch]">
                          <input
                            className="w-full border rounded-lg px-2 py-1"
                            placeholder="ex: 3560070970067, 3017620422003"
                            value={eans}
                            onChange={(e) => updateItem(idx, { eans: sanitizeEANList(e.target.value) })}
                          />
                          <p className="text-[11px] text-neutral-500 mt-1">Astuce: collez un code-barres à 13 chiffres (EAN-13). Les codes invalides sont ignorés.</p>
                        </td>
                        <td className="py-2 px-2">
                          {statusCell}
                          {allMatches?.length ? (
                            <div className="text-[11px] text-neutral-600 mt-1">{allMatches.length} fiche(s)</div>
                          ) : null}
                        </td>
                        <td className="py-2 px-2">
                          <div className="space-y-2">
                            {allMatches?.slice(0, 3).map((rec, i) => (
                              <RappelCard key={i} rec={rec} />
                            ))}
                            {allMatches?.length > 3 && (
                              <div className="text-xs text-neutral-600">+{allMatches.length - 3} autres…</div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={() => removeItem(idx)}
                            className="px-2 py-1 rounded-lg text-sm bg-neutral-100 hover:bg-neutral-200"
                          >Supprimer</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {uniqueEans.length > 0 && (
            <p className="mt-4 text-xs text-neutral-500">{uniqueEans.length} code(s) EAN extrait(s): {uniqueEans.join(", ")}</p>
          )}
        </section>

        {/* Footer / Info */}
        <section className="text-xs text-neutral-500 leading-relaxed">
          <p>
            Sources: jeu de données <em>RappelConso V2 (produits triés par GTIN)</em> (Open Data MEF). Les données sont mises à jour régulièrement (annonce: hebdomadaire). Ce vérificateur utilise une recherche plein texte par GTIN et tente d'extraire les libellés produits des reçus PDF. En cas de doute: ouvrez la fiche officielle.
          </p>
          <p className="mt-2">Important: tous les reçus n'affichent pas le code-barres. Si aucun EAN n'est détecté, utilisez la recherche par libellé (collez/éditez le nom du produit) ou scannez le code-barres du produit physique.</p>
        </section>

        <div className="h-12" />
      </div>
    </div>
  );
}

function RappelCard({ rec }) {
  const f = rec?.fields || {};
  // Try to surface meaningful fields whatever the exact schema
  const title = f.titre || f.nom || f.nom_du_produit || f.libelle || f.produit || "Fiche rappel";
  const brand = f.marque || f.marque_du_produit || f.marques || f.brand || "";
  const pub = f.date_de_publication || f.date || f.published_at || f.publication || "";
  const risk = f.risques || f.nature_du_risque || f.motif || f.risque || "";
  const url = f.lien_vers_la_fiche_rappelconso || f.url || f.link || rec?.url || rec?.links?.[0];
  const cat = f.categorie_de_produit || f.sous_categorie_de_produit || f.categorie || "";

  return (
    <div className="border rounded-xl p-3 bg-neutral-50">
      <div className="text-sm font-semibold break-words">{title}{brand ? ` — ${brand}` : ""}</div>
      <div className="text-xs text-neutral-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {cat && <span>Cat.: {cat}</span>}
        {pub && <span>Publié: {formatDate(pub)}</span>}
      </div>
      {risk && (
        <div className="text-xs mt-2"><span className="font-medium">Risque:</span> {risk}</div>
      )}
      {url && (
        <div className="mt-2 text-xs">
          <a href={toAbsolute(url)} target="_blank" rel="noreferrer" className="underline">Voir la fiche officielle ↗</a>
        </div>
      )}
    </div>
  );
}

// === Helpers ===
function parseReceipt(fullText) {
  // Split into lines, normalize spacing
  const lines = fullText
    .split(/\r?\n|\u2028|\u2029/g)
    .map((l) => l.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

  const products = [];
  const buffer = [];

  // Simple heuristics: collect blocks of lines that look like product entries.
  // Exclude totals, payment, VAT lines.
  const EXCLUDE = /\b(TOTAL|CB|CARTE|PAIEMENT|PAYMENT|TAXE|TVA|MERCI|SUBTOTAL|RETROUVEZ|R\s?IB|RIB)\b/i;
  const PRICE = /([0-9]+,[0-9]{2})\s*(€|EUR)?/;

  // EAN candidates on any line
  const eanCandidates = new Set();

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // EAN-13 / EAN-8
    const e13 = matchAll(ln, /\b\d{13}\b/g).filter(isValidEAN13);
    const e8 = matchAll(ln, /\b\d{8}\b/g); // do not checksum EAN-8 here
    e13.forEach((x) => eanCandidates.add(x));
    e8.forEach((x) => eanCandidates.add(x));
  }

  // Try to identify label lines: lines that contain letters and maybe a price
  const labelLines = lines.filter((ln) => /[A-Za-zÀ-ÿ]/.test(ln) && !EXCLUDE.test(ln));

  // Group nearby lines into product guesses
  for (let i = 0; i < labelLines.length; i++) {
    const ln = labelLines[i];
    // Extract a label before a trailing price if present
    const m = ln.match(/^(.*?)(?:\s{0,3}{PRICE})?$/i);
    let label = ln;
    if (PRICE.test(ln)) {
      label = ln.replace(PRICE, "").trim();
    }
    label = cleanLabelForDisplay(label);
    // Associate EANs found within +/- 2 lines in the original text
    const srcIdx = lines.indexOf(ln);
    const neighborhood = lines.slice(Math.max(0, srcIdx - 2), Math.min(lines.length, srcIdx + 3));
    const eansNearby = [
      ...matchAll(neighborhood.join(" "), /\b\d{13}\b/g).filter(isValidEAN13),
      ...matchAll(neighborhood.join(" "), /\b\d{8}\b/g),
    ];
    const uniq = Array.from(new Set(eansNearby));

    if (label) {
      products.push({ label, eans: uniq, lines: neighborhood });
    }
  }

  // If we found EANs but no product labels (e.g., bare pharmacy receipts)
  if (products.length === 0 && eanCandidates.size) {
    const uniq = Array.from(eanCandidates.values());
    return uniq.map((e) => ({ label: "(inconnu)", eans: [e], lines: [] }));
  }

  // Coalesce duplicate labels (same normalized label)
  const byKey = new Map();
  for (const p of products) {
    const key = p.label.toLowerCase().replace(/\s+/g, " ");
    if (!byKey.has(key)) byKey.set(key, { ...p });
    else {
      const cur = byKey.get(key);
      byKey.set(key, { ...cur, eans: Array.from(new Set([...cur.eans, ...p.eans])) });
    }
  }

  return Array.from(byKey.values());
}

function matchAll(text, regex) {
  const m = text.match(regex);
  return m ? m : [];
}

function isValidEAN13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map((d) => parseInt(d, 10));
  const check = digits.pop();
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  const calc = (10 - (sum % 10)) % 10;
  return calc === check;
}

function sanitizeEANList(s) {
  const parts = s
    .split(/[^0-9]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => /^\d{8}$|^\d{13}$/.test(x))
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .filter((x) => x.length === 13 ? isValidEAN13(x) : true);
  return parts;
}

function toAbsolute(url) {
  try {
    const u = new URL(url);
    return u.href;
  } catch {
    // Some API fields may contain relative paths
    if (typeof url === "string" && url.startsWith("/")) {
      return `https://rappel.conso.gouv.fr${url}`;
    }
    return url;
  }
}

function formatDate(d) {
  try {
    const dt = new Date(d);
    if (!isNaN(+dt)) return dt.toLocaleDateString("fr-FR");
    // Maybe already formatted
    return String(d);
  } catch {
    return String(d);
  }
}


function cleanLabelForDisplay(s) {
  let t = String(s || '');
  const charsToSpace = new Set(['€', '$', '%', '.', ',', ';', ':', '|', '/', '-', '_', '(', ')', '[', ']', '{', '}', '=','+']);
  let out = '';
  for (const ch of t) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      out += ' ';
    } else if (charsToSpace.has(ch)) {
      out += ' ';
    } else {
      out += ch;
    }
  }
  let words = out.split(' ').filter(Boolean).filter(w => w.toLowerCase() !== 'tva');
  out = words.join(' ');
  out = out.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return out.trim();
}
