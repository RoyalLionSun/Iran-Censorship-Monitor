import { readFile } from 'node:fs/promises';
import { compareCuratedAsnCoverage, getIranAsnInventory, getIranAsnRoutingSummary } from '../lib/iran-asn-inventory.mjs';

const curated = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));
const [inventory, routingSummary] = await Promise.all([
  getIranAsnInventory(),
  getIranAsnRoutingSummary()
]);
const coverage = compareCuratedAsnCoverage(inventory, curated);

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  inventory,
  routingSummary,
  curatedCoverage: coverage,
  methodology: {
    inventoryMeaning: 'ASNs associated with IR according to RIR Statistics files exposed by RIPEstat Country Resource List.',
    routingSummaryMeaning: 'Country-level registered and routed ASN counts from RIPEstat Country ASNs; routed means observed through RIPE RIS control-plane data.',
    routedListMeaning: 'Not evaluated by this command. The current parser intentionally consumes lod=0 counts only and does not infer an ASN-by-ASN routed set from undocumented detail fields.',
    curatedMeaning: 'Reviewed monitoring/topology profiles in data/asns.json.',
    independentCensorshipVote: false
  }
}, null, 2)}\n`);
