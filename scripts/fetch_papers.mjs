import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");
const COLLECTED_FILE = join(DOCS_DIR, "collected_pmids.json");

// ── API endpoints ──
const PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_FETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const CROSSREF_API = "https://api.crossref.org/works";
const SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1/paper/search";

const HEADERS = { "User-Agent": "PanicDisorderBot/2.0 (research aggregator; mailto:research@leepsyclinic.com)" };

// ── Search queries for PubMed (expanded) ──
const PUBMED_QUERIES = [
  { name: "broad", query: '("panic disorder"[Title/Abstract] OR "panic disorders"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH])' },
  { name: "agoraphobia", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND ("agoraphobia"[Title/Abstract] OR "Agoraphobia"[MeSH]))' },
  { name: "cognitive", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND ("anxiety sensitivity"[Title/Abstract] OR interoception[Title/Abstract] OR "catastrophic misinterpretation"[Title/Abstract] OR "fear of fear"[Title/Abstract] OR "safety behavior*"[Title/Abstract]))' },
  { name: "neuroimaging", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND (neuroimaging[Title/Abstract] OR fMRI[Title/Abstract] OR MRI[Title/Abstract] OR "functional connectivity"[Title/Abstract] OR amygdala[Title/Abstract] OR insula[Title/Abstract] OR "salience network"[Title/Abstract]))' },
  { name: "psychophysiology", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (respiration[Title/Abstract] OR hyperventilation[Title/Abstract] OR "CO2 sensitivity"[Title/Abstract] OR "heart rate variability"[Title/Abstract] OR autonomic[Title/Abstract] OR psychophysiology[Title/Abstract]))' },
  { name: "cbt", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND ("cognitive behavioral therapy"[Title/Abstract] OR CBT[Title/Abstract] OR "interoceptive exposure"[Title/Abstract] OR "exposure therapy"[Title/Abstract] OR "panic control treatment"[Title/Abstract]))' },
  { name: "pharmacotherapy", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND (pharmacotherapy[Title/Abstract] OR SSRI[Title/Abstract] OR SNRI[Title/Abstract] OR benzodiazepine*[Title/Abstract] OR antidepressant*[Title/Abstract]))' },
  { name: "epidemiology", query: '(("panic disorder"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND (prevalence[Title/Abstract] OR incidence[Title/Abstract] OR epidemiology[Title/Abstract] OR "population-based"[Title/Abstract] OR "risk factor*"[Title/Abstract]))' },
  { name: "emergency", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND ("emergency department"[Title/Abstract] OR "primary care"[Title/Abstract] OR "noncardiac chest pain"[Title/Abstract] OR dizziness[Title/Abstract] OR "medical utilization"[Title/Abstract]))' },
  { name: "social", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (stigma[Title/Abstract] OR "social determinant*"[Title/Abstract] OR "treatment gap"[Title/Abstract] OR "help-seeking"[Title/Abstract] OR "health service*"[Title/Abstract] OR "cross-cultural"[Title/Abstract]))' },
  { name: "child", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (child*[Title/Abstract] OR adolescent*[Title/Abstract] OR youth[Title/Abstract] OR pediatric[Title/Abstract] OR developmental[Title/Abstract]))' },
  { name: "comorbidity", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (comorbid*[Title/Abstract] OR "generalized anxiety disorder"[Title/Abstract] OR PTSD[Title/Abstract] OR "substance use"[Title/Abstract] OR "somatic symptom*"[Title/Abstract]))' },
  // New expanded queries
  { name: "treatment_resistant", query: '(("panic disorder"[Title/Abstract]) AND ("treatment-resistant"[Title/Abstract] OR "refractory"[Title/Abstract] OR "non-response"[Title/Abstract] OR relapse[Title/Abstract]))' },
  { name: "digital", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (telehealth[Title/Abstract] OR teletherapy[Title/Abstract] OR "digital intervention"[Title/Abstract] OR "internet-based"[Title/Abstract] OR "mobile app"[Title/Abstract] OR "virtual reality"[Title/Abstract]))' },
  { name: "biomarker", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (biomarker*[Title/Abstract] OR "genetic*"[Title/Abstract] OR polymorphism[Title/Abstract] OR "inflammatory marker*"[Title/Abstract] OR cortisol[Title/Abstract]))' },
  { name: "mindfulness", query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (mindfulness[Title/Abstract] OR meditation[Title/Abstract] OR "acceptance and commitment"[Title/Abstract] OR "distress tolerance"[Title/Abstract]))' },
];

// ── Crossref search queries ──
const CROSSREF_QUERIES = [
  "panic disorder",
  "panic attack treatment",
  "panic disorder neuroimaging",
  "panic disorder CBT",
  "agoraphobia treatment",
  "panic disorder pharmacotherapy",
  "anxiety sensitivity panic",
  "panic disorder biomarker",
  "panic disorder heart rate variability",
  "panic disorder digital intervention",
];

// ── CLI arg parsing ──
function parseArgsCLI() {
  const args = process.argv.slice(2);
  const opts = { days: 14, maxPapers: 100, output: "papers.json" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days" && args[i + 1]) opts.days = parseInt(args[++i]);
    if (args[i] === "--max-papers" && args[i + 1]) opts.maxPapers = parseInt(args[++i]);
    if (args[i] === "--output" && args[i + 1]) opts.output = args[++i];
  }
  return opts;
}

function getTaipeiDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 3600000);
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

function buildDateFilter(days) {
  const lookback = new Date(getTaipeiDate().getTime() - days * 86400000);
  const start = formatDate(lookback).replace(/-/g, "/");
  return `"${start}"[Date - Publication] : "3000"[Date - Publication]`;
}

// ── Dedup helpers ──
function loadCollectedPmids() {
  if (!existsSync(COLLECTED_FILE)) return {};
  try { return JSON.parse(readFileSync(COLLECTED_FILE, "utf-8")); } catch { return {}; }
}

function loadCollectedDois() {
  const doiFile = join(DOCS_DIR, "collected_dois.json");
  if (!existsSync(doiFile)) return {};
  try { return JSON.parse(readFileSync(doiFile, "utf-8")); } catch { return {}; }
}

function getRecentPmids(collected, days = 30) {
  const cutoff = new Date(getTaipeiDate().getTime() - days * 86400000);
  const cutoffStr = formatDate(cutoff);
  const pmids = new Set();
  for (const [date, ids] of Object.entries(collected)) {
    if (date >= cutoffStr) { for (const id of ids) pmids.add(id); }
  }
  return pmids;
}

function getRecentDois(collected, days = 30) {
  const cutoff = new Date(getTaipeiDate().getTime() - days * 86400000);
  const cutoffStr = formatDate(cutoff);
  const dois = new Set();
  for (const [date, list] of Object.entries(collected)) {
    if (date >= cutoffStr) { for (const doi of list) dois.add(doi?.toLowerCase()); }
  }
  return dois;
}

// ── PubMed search ──
async function searchPapers(query, retmax = 100) {
  const url = `${PUBMED_SEARCH}?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&sort=date&retmode=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (resp.status === 429) {
        const wait = 5000 * (attempt + 1);
        console.error(`[WARN] PubMed rate limited, waiting ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      return data?.esearchresult?.idlist || [];
    } catch (e) {
      console.error(`[ERROR] PubMed search failed: ${e.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return [];
}

// ── PubMed fetch details ──
async function fetchDetails(pmids) {
  if (!pmids.length) return [];
  const batchSize = 50;
  const allPapers = [];
  for (let i = 0; i < pmids.length; i += batchSize) {
    const batch = pmids.slice(i, i + batchSize);
    const url = `${PUBMED_FETCH}?db=pubmed&id=${batch.join(",")}&retmode=xml`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const xml = await resp.text();
        allPapers.push(...parseXmlPapers(xml));
        break;
      } catch (e) {
        console.error(`[ERROR] PubMed fetch failed (attempt ${attempt + 1}): ${e.message}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  return allPapers;
}

function parseXmlPapers(xml) {
  const papers = [];
  const articles = xml.split(/<PubmedArticle>/).slice(1);
  for (const raw of articles) {
    const block = raw.split(/<\/PubmedArticle>/)[0];
    const pmid = extractFirst(block, "PMID");
    const title = extractFirst(block, "ArticleTitle");
    const abstractParts = [];
    const absRe = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
    let am;
    while ((am = absRe.exec(block)) !== null) {
      const labelM = am[0].match(/Label="([^"]+)"/);
      const label = labelM ? labelM[1] : "";
      const text = am[1].replace(/<[^>]+>/g, "").trim();
      if (label && text) abstractParts.push(`${label}: ${text}`);
      else if (text) abstractParts.push(text);
    }
    const abstract = abstractParts.join(" ").slice(0, 2000);
    const journal = extractFirst(block, "Title");
    const year = extractFirst(block, "Year");
    const month = extractFirst(block, "Month");
    const day = extractFirst(block, "Day");
    const dateStr = [year, month, day].filter(Boolean).join(" ");
    const doi = extractDoi(block);
    const keywords = extractKeywords(block);
    const url = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";
    papers.push({ pmid, doi, title, journal, date: dateStr, abstract, url, keywords, source: "PubMed" });
  }
  return papers;
}

function extractFirst(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

function extractDoi(block) {
  const m = block.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
  return m ? m[1].trim() : "";
}

function extractKeywords(block) {
  const kws = [];
  const re = /<Keyword>([\s\S]*?)<\/Keyword>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const t = m[1].trim();
    if (t) kws.push(t);
  }
  return kws;
}

// ══════════════════════════════════════════
// Crossref search (new source)
// ══════════════════════════════════════════
async function searchCrossref(query, rows = 50) {
  const today = getTaipeiDate();
  const lookback = new Date(today.getTime() - 14 * 86400000);
  const fromDate = formatDate(lookback);
  const params = new URLSearchParams({
    query: query,
    filter: `from-pub-date:${fromDate},type:journal-article`,
    rows: rows,
    sort: "published",
    order: "desc",
    select: "DOI,title,author,published-print,published-online,abstract,URL,container-title",
  });
  const url = `${CROSSREF_API}?${params}`;
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const items = data?.message?.items || [];
    return items.map((item) => ({
      doi: item.DOI || "",
      title: (item.title || []).join(" ").slice(0, 500),
      journal: (item["container-title"] || []).join(", "),
      date: item["published-print"]?.["date-parts"]?.[0]?.join("-") || item["published-online"]?.["date-parts"]?.[0]?.join("-") || "",
      abstract: (item.abstract || "").replace(/<[^>]+>/g, "").slice(0, 2000),
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ""),
      keywords: [],
      source: "Crossref",
      pmid: "",
    }));
  } catch (e) {
    console.error(`[ERROR] Crossref search "${query}" failed: ${e.message}`);
    return [];
  }
}

// ══════════════════════════════════════════
// Semantic Scholar search (new source)
// ══════════════════════════════════════════
async function searchSemanticScholar(query, limit = 50) {
  const today = getTaipeiDate();
  const lookback = new Date(today.getTime() - 30 * 86400000);
  const params = new URLSearchParams({
    query: query,
    limit: limit,
    fields: "paperId,externalIds,title,abstract,journal,publicationDate,url,isOpenAccess",
    year: `${lookback.getFullYear()}-`,
  });
  const url = `${SEMANTIC_SCHOLAR_API}?${params}`;
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const items = data?.data || [];
    return items.map((item) => ({
      doi: item.externalIds?.DOI || "",
      pmid: item.externalIds?.PubMed || "",
      title: (item.title || "").slice(0, 500),
      journal: item.journal?.name || "",
      date: item.publicationDate || "",
      abstract: (item.abstract || "").slice(0, 2000),
      url: item.url || (item.externalIds?.DOI ? `https://doi.org/${item.externalIds.DOI}` : ""),
      keywords: [],
      source: "SemanticScholar",
    }));
  } catch (e) {
    console.error(`[ERROR] Semantic Scholar search "${query}" failed: ${e.message}`);
    return [];
  }
}

// ══════════════════════════════════════════
// Fallback: fetch older papers from PubMed (expand to 60 days)
// ══════════════════════════════════════════
async function fetchFallbackPapers(recentPmids, recentDois) {
  console.error("[INFO] Fetching fallback papers (60-day window)...");
  const broadQuery = PUBMED_QUERIES[0].query;
  const lookback60 = new Date(getTaipeiDate().getTime() - 60 * 86400000);
  const start60 = formatDate(lookback60).replace(/-/g, "/");
  const dateFilter60 = `"${start60}"[Date - Publication] : "3000"[Date - Publication]`;
  const fullQuery = `${broadQuery} AND ${dateFilter60}`;
  const ids = await searchPapers(fullQuery, 200);
  const newIds = ids.filter((id) => !recentPmids.has(id));
  if (!newIds.length) return [];
  console.error(`[INFO] Fallback: ${newIds.length} older candidates`);
  const papers = await fetchDetails(newIds.slice(0, 30));
  // Filter: only keep those not already in recentDois
  return papers.filter((p) => !p.doi || !recentDois.has(p.doi.toLowerCase()));
}

// ══════════════════════════════════════════
// Main
// ══════════════════════════════════════════
async function main() {
  const opts = parseArgsCLI();
  const today = formatDate(getTaipeiDate());
  const dateFilter = buildDateFilter(opts.days);

  // Dedup data
  const collected = loadCollectedPmids();
  const collectedDois = loadCollectedDois();
  const recentPmids = getRecentPmids(collected, 30);
  const recentDois = getRecentDois(collectedDois, 30);
  const seenDois = new Set(recentDois);
  const seenPmids = new Set(recentPmids);

  const allPapers = [];

  // ── Source 1: PubMed ──
  console.error(`\n[Source 1] PubMed — ${PUBMED_QUERIES.length} queries, ${opts.days}-day window`);
  const allPmids = new Set();
  for (const sq of PUBMED_QUERIES) {
    const fullQuery = `${sq.query} AND ${dateFilter}`;
    const ids = await searchPapers(fullQuery, 100);
    for (const id of ids) allPmids.add(id);
    console.error(`  [${sq.name}] found ${ids.length} PMIDs`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.error(`  PubMed unique PMIDs: ${allPmids.size}`);
  const newPmids = [...allPmids].filter((id) => !seenPmids.has(id));
  console.error(`  After dedup: ${newPmids.length} new`);
  const pubmedPapers = await fetchDetails(newPmids.slice(0, opts.maxPapers));
  for (const p of pubmedPapers) {
    seenPmids.add(p.pmid);
    if (p.doi) seenDois.add(p.doi.toLowerCase());
    allPapers.push(p);
  }
  console.error(`  PubMed papers added: ${pubmedPapers.length}`);

  // ── Source 2: Crossref ──
  console.error(`\n[Source 2] Crossref — ${CROSSREF_QUERIES.length} queries`);
  for (const q of CROSSREF_QUERIES) {
    const cr = await searchCrossref(q, 50);
    let added = 0;
    for (const p of cr) {
      const doiKey = p.doi?.toLowerCase();
      if (doiKey && seenDois.has(doiKey)) continue;
      if (!p.title || p.title.length < 20) continue;
      // Relevance filter: title must mention panic or agoraphobia
      const tLower = p.title.toLowerCase();
      if (!tLower.includes("panic") && !tLower.includes("agoraphobia") && !tLower.includes("anxiety")) continue;
      if (doiKey) seenDois.add(doiKey);
      allPapers.push(p);
      added++;
    }
    console.error(`  [${q}] ${added} new papers`);
    await new Promise((r) => setTimeout(r, 500));
  }

  // ── Source 3: Semantic Scholar ──
  console.error(`\n[Source 3] Semantic Scholar — 4 queries`);
  const ssQueries = [
    "panic disorder treatment",
    "panic attack neuroimaging",
    "agoraphobia exposure therapy",
    "panic disorder biomarker",
  ];
  for (const q of ssQueries) {
    const ss = await searchSemanticScholar(q, 50);
    let added = 0;
    for (const p of ss) {
      const doiKey = p.doi?.toLowerCase();
      if (doiKey && seenDois.has(doiKey)) continue;
      if (p.pmid && seenPmids.has(p.pmid)) continue;
      if (!p.title || p.title.length < 20) continue;
      const tLower = p.title.toLowerCase();
      if (!tLower.includes("panic") && !tLower.includes("agoraphobia") && !tLower.includes("anxiety")) continue;
      if (doiKey) seenDois.add(doiKey);
      if (p.pmid) seenPmids.add(p.pmid);
      allPapers.push(p);
      added++;
    }
    console.error(`  [${q}] ${added} new papers`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  // ── Fallback: if still empty, expand to 60-day window ──
  if (allPapers.length === 0) {
    console.error(`\n[FALLBACK] No papers from any source. Expanding to 60-day window...`);
    const fallbackPapers = await fetchFallbackPapers(seenPmids, seenDois);
    for (const p of fallbackPapers) {
      seenPmids.add(p.pmid);
      if (p.doi) seenDois.add(p.doi.toLowerCase());
      allPapers.push(p);
    }
    console.error(`  Fallback added: ${fallbackPapers.length}`);
  }

  // ── Sort by date, limit ──
  const limited = allPapers.slice(0, opts.maxPapers);

  const output = { date: today, count: limited.length, papers: limited };
  writeFileSync(opts.output, JSON.stringify(output, null, 2), "utf-8");
  console.error(`\n[RESULT] Total unique papers: ${allPapers.length}, output: ${limited.length}`);
  console.error(`[INFO] Saved to ${opts.output}`);

  // ── Update collected IDs ──
  if (limited.length > 0) {
    if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });
    collected[today] = limited.map((p) => p.pmid).filter(Boolean);
    writeFileSync(COLLECTED_FILE, JSON.stringify(collected, null, 2), "utf-8");
    // Also save DOIs for cross-source dedup
    const doiEntry = limited.filter((p) => p.doi).map((p) => p.doi);
    collectedDois[today] = doiEntry;
    writeFileSync(join(DOCS_DIR, "collected_dois.json"), JSON.stringify(collectedDois, null, 2), "utf-8");
    console.error(`[INFO] Updated collected_pmids.json + collected_dois.json`);
  }
}

main().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
