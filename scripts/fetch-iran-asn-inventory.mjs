import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compareCuratedAsnCoverage, getIranAsnInventory, getIranAsnRoutingSummary } from '../lib/iran-asn-inventory.mjs';
import { buildIranAsnCandidateQueue, enrichIranAsnInventory, getIpverseAsMetadata } from '../lib/ipverse-as-metadata.mjs';
import { buildAsnCoverageSnapshot, writeAsnCoverageSnapshot } from '../lib/asn-coverage-snapshot.mjs';
import { buildAsnDirectory, writeAsnDirectory } from '../lib/asn-directory.mjs';

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (arg !== '--write') throw new Error(`Unsupported argument: ${arg}`);
}

const curated = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));
const [inventory, routingSummary] = await Promise.all([
  getIranAsnInventory(),
  getIranAsnRoutingSummary()
]);
const secondaryMetadata = await getIpverseAsMetadata({ asnFilter: inventory.asns });
const coverage = compareCuratedAsnCoverage(inventory, curated);
const enrichment = enrichIranAsnInventory(inventory, curated, secondaryMetadata.entries);
const candidateQueue = buildIranAsnCandidateQueue(enrichment, {
  limit: Number(process.env.ASN_CANDIDATE_LIMIT || 100)
});
const generatedAt = new Date().toISOString();

const result = {
  generatedAt,
  inventory,
  routingSummary,
  curatedCoverage: coverage,
  secondaryMetadata: {
    source: secondaryMetadata.source,
    sourceUrl: secondaryMetadata.sourceUrl,
    sourceLicense: secondaryMetadata.sourceLicense,
    fetchedAt: secondaryMetadata.fetchedAt,
    sha256: secondaryMetadata.sha256,
    matchedInventoryAsnCount: secondaryMetadata.entries.length,
    evidenceRole: secondaryMetadata.evidenceRole,
    independentCensorshipVote: false,
    note: secondaryMetadata.note
  },
  enrichment,
  candidateQueue,
  methodology: {
    inventoryMeaning: 'ASNs associated with IR according to RIR Statistics files exposed by RIPEstat Country Resource List.',
    routingSummaryMeaning: 'Country-level registered and routed ASN counts from RIPEstat Country ASNs; routed means observed through RIPE RIS control-plane data.',
    routedListMeaning: 'Not evaluated by this command. The current parser intentionally consumes lod=0 counts only and does not infer an ASN-by-ASN routed set from undocumented detail fields.',
    secondaryMeaning: 'ipverse/as-metadata is a secondary enrichment dataset used only to prioritize review of ASNs already present in the RIPE/RIR Iran inventory.',
    candidateQueueMeaning: 'A bounded analyst-review queue ordered by explicit review class and documented topology metadata; it is not a censorship score or country-membership authority.',
    curatedMeaning: 'Reviewed monitoring/topology profiles in data/asns.json.',
    independentCensorshipVote: false
  }
};

if (args.has('--write')) {
  const snapshot = buildAsnCoverageSnapshot(result);
  const snapshotPath = fileURLToPath(new URL('../var/asn-coverage/latest.json', import.meta.url));
  await writeAsnCoverageSnapshot(snapshotPath, snapshot);
  // Name and kind of every Iranian network, for the dashboard's access overview.
  await writeAsnDirectory(buildAsnDirectory(inventory, secondaryMetadata.entries, curated));
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
