import { readFile } from 'node:fs/promises';
import { compareCuratedAsnCoverage, getIranAsnInventory } from '../lib/iran-asn-inventory.mjs';

const curated = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));
const inventory = await getIranAsnInventory();
const coverage = compareCuratedAsnCoverage(inventory, curated);

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  inventory,
  curatedCoverage: coverage,
  methodology: {
    inventoryMeaning: 'ASNs associated with IR according to RIR Statistics files exposed by RIPEstat.',
    curatedMeaning: 'Reviewed monitoring/topology profiles in data/asns.json.',
    routingMeaning: 'Not evaluated by this command; use RIPEstat Country ASNs/RIS separately for routed-vs-registered state.',
    independentCensorshipVote: false
  }
}, null, 2)}\n`);
