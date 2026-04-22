import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "..", "docs");
const COLLECTED_FILE = join(DOCS_DIR, "collected_pmids.json");

const PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_FETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

const HEADERS = { "User-Agent": "PanicDisorderBot/1.0 (research aggregator)" };

const SEARCH_QUERIES = [
  {
    name: "broad",
    query: '("panic disorder"[Title/Abstract] OR "panic disorders"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH])',
  },
  {
    name: "agoraphobia",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND ("agoraphobia"[Title/Abstract] OR "Agoraphobia"[MeSH]))',
  },
  {
    name: "cognitive",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND ("anxiety sensitivity"[Title/Abstract] OR interoception[Title/Abstract] OR "catastrophic misinterpretation"[Title/Abstract] OR "fear of fear"[Title/Abstract] OR "safety behavior*"[Title/Abstract]))',
  },
  {
    name: "neuroimaging",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND (neuroimaging[Title/Abstract] OR fMRI[Title/Abstract] OR MRI[Title/Abstract] OR "functional connectivity"[Title/Abstract] OR amygdala[Title/Abstract] OR insula[Title/Abstract] OR "salience network"[Title/Abstract]))',
  },
  {
    name: "psychophysiology",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (respiration[Title/Abstract] OR hyperventilation[Title/Abstract] OR "CO2 sensitivity"[Title/Abstract] OR "heart rate variability"[Title/Abstract] OR autonomic[Title/Abstract] OR psychophysiology[Title/Abstract]))',
  },
  {
    name: "cbt",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND ("cognitive behavioral therapy"[Title/Abstract] OR CBT[Title/Abstract] OR "interoceptive exposure"[Title/Abstract] OR "exposure therapy"[Title/Abstract] OR "panic control treatment"[Title/Abstract]))',
  },
  {
    name: "pharmacotherapy",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND (pharmacotherapy[Title/Abstract] OR SSRI[Title/Abstract] OR SNRI[Title/Abstract] OR benzodiazepine*[Title/Abstract] OR antidepressant*[Title/Abstract]))',
  },
  {
    name: "epidemiology",
    query: '(("panic disorder"[Title/Abstract] OR "Panic Disorder"[MeSH]) AND (prevalence[Title/Abstract] OR incidence[Title/Abstract] OR epidemiology[Title/Abstract] OR "population-based"[Title/Abstract] OR "risk factor*"[Title/Abstract]))',
  },
  {
    name: "emergency",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND ("emergency department"[Title/Abstract] OR "primary care"[Title/Abstract] OR "noncardiac chest pain"[Title/Abstract] OR dizziness[Title/Abstract] OR "medical utilization"[Title/Abstract]))',
  },
  {
    name: "social",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (stigma[Title/Abstract] OR "social determinant*"[Title/Abstract] OR "treatment gap"[Title/Abstract] OR "help-seeking"[Title/Abstract] OR "health service*"[Title/Abstract] OR "cross-cultural"[Title/Abstract]))',
  },
  {
    name: "child",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (child*[Title/Abstract] OR adolescent*[Title/Abstract] OR youth[Title/Abstract] OR pediatric[Title/Abstract] OR developmental[Title/Abstract]))',
  },
  {
    name: "comorbidity",
    query: '(("panic disorder"[Title/Abstract] OR "panic attack*"[Title/Abstract]) AND (comorbid*[Title/Abstract] OR depression[Title/Abstract] OR "generalized anxiety disorder"[Title/Abstract] OR PTSD[Title/Abstract] OR "substance use"[Title/Abstract] OR "somatic symptom*"[Title/Abstract]))',
  },
];

function parseArgsCLI() {
  const args = process.argv.slice(2);
  const opts = { days: 7, maxPapers: 50, output: "papers.json" };
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

function loadCollectedPmids() {
  if (!existsSync(COLLECTED_FILE)) return {};
  try {
    return JSON.parse(readFileSync(COLLECTED_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function getRecentPmids(collected, days = 7) {
  const cutoff = new Date(getTaipeiDate().getTime() - days * 86400000);
  const cutoffStr = formatDate(cutoff);
  const pmids = new Set();
  for (const [date, ids] of Object.entries(collected)) {
    if (date >= cutoffStr) {
      for (const id of ids) pmids.add(id);
    }
  }
  return pmids;
}

async function searchPapers(query, retmax = 50) {
  const url = `${PUBMED_SEARCH}?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&sort=date&retmode=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (resp.status === 429) {
        const wait = 5000 * (attempt + 1);
        console.error(`[WARN] Rate limited on search, waiting ${wait}ms...`);
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

async function fetchDetails(pmids) {
  if (!pmids.length) return [];
  const batchSize = 50;
  const allPapers = [];
  for (let i = 0; i < pmids.length; i += batchSize) {
    const batch = pmids.slice(i, i + batchSize);
    const ids = batch.join(",");
    const url = `${PUBMED_FETCH}?db=pubmed&id=${ids}&retmode=xml`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) });
        if (resp.status === 429) {
          const wait = 5000 * (attempt + 1);
          console.error(`[WARN] Rate limited on fetch, waiting ${wait}ms...`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const xml = await resp.text();
        allPapers.push(...parseXml(xml));
        break;
      } catch (e) {
        console.error(`[ERROR] PubMed fetch failed (attempt ${attempt + 1}): ${e.message}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (i + batchSize < pmids.length) await new Promise((r) => setTimeout(r, 1500));
  }
  return allPapers;
}

function parseXml(xml) {
  const papers = [];
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match;
  while ((match = articleRegex.exec(xml)) !== null) {
    const block = match[1];
    const pmid = extractTag(block, "PMID") || "";
    const title = extractTag(block, "ArticleTitle") || "";
    const journal = extractTag(block, "<Title>", "</Title>") || extractJournal(block) || "";
    const abstract = extractAbstract(block);
    const date = extractPubDate(block);
    const keywords = extractKeywords(block);
    const link = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "";
    if (title) {
      papers.push({ pmid, title, journal, date, abstract, url: link, keywords });
    }
  }
  return papers;
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag.split(" ")[0]}>`, "m");
  const m = block.match(re);
  if (!m) return "";
  return m[1].replace(/<[^>]+>/g, "").trim();
}

function extractJournal(block) {
  const m = block.match(/<Title>([\\s\\S]*?)<\/Title>/);
  return m ? m[1].trim() : "";
}

function extractAbstract(block) {
  const parts = [];
  const re = /<AbstractText[^>]*Label="([^"]*)"[^>]*>([\s\S]*?)<\/AbstractText>/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const label = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text) parts.push(label ? `${label}: ${text}` : text);
  }
  if (!parts.length) {
    const re2 = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
    while ((m = re2.exec(block)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, "").trim();
      if (text) parts.push(text);
    }
  }
  return parts.join(" ").slice(0, 2000);
}

function extractPubDate(block) {
  const y = block.match(/<Year>(\d+)<\/Year>/)?.[1] || "";
  const m = block.match(/<Month>(\w+)<\/Month>/)?.[1] || "";
  const d = block.match(/<Day>(\d+)<\/Day>/)?.[1] || "";
  return [y, m, d].filter(Boolean).join(" ");
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

async function main() {
  const opts = parseArgsCLI();
  const today = formatDate(getTaipeiDate());
  const dateFilter = buildDateFilter(opts.days);

  console.error(`[INFO] Searching PubMed for last ${opts.days} days...`);

  const allPmids = new Set();
  for (const sq of SEARCH_QUERIES) {
    const fullQuery = `${sq.query} AND ${dateFilter}`;
    const ids = await searchPapers(fullQuery, 20);
    for (const id of ids) allPmids.add(id);
    console.error(`  [${sq.name}] found ${ids.length} PMIDs`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.error(`[INFO] Unique PMIDs: ${allPmids.size}`);

  const collected = loadCollectedPmids();
  const recentPmids = getRecentPmids(collected, 7);
  const newPmids = [...allPmids].filter((id) => !recentPmids.has(id));
  console.error(`[INFO] After dedup (7-day): ${newPmids.length} new PMIDs`);

  const pmidsToFetch = newPmids.slice(0, opts.maxPapers);
  console.error(`[INFO] Fetching details for ${pmidsToFetch.length} papers...`);

  const papers = await fetchDetails(pmidsToFetch);
  console.error(`[INFO] Got details for ${papers.length} papers`);

  const output = {
    date: today,
    count: papers.length,
    papers,
  };

  const outPath = opts.output;
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.error(`[INFO] Saved to ${outPath}`);

  if (papers.length > 0) {
    if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });
    collected[today] = papers.map((p) => p.pmid).filter(Boolean);
    writeFileSync(COLLECTED_FILE, JSON.stringify(collected, null, 2), "utf-8");
    console.error(`[INFO] Updated collected_pmids.json with ${papers.length} PMIDs`);
  }
}

main().catch((e) => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
