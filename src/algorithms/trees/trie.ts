/** Trie: insert words, then search by prefix. */

import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { randomInt, shuffle } from '../../core/random';
import { TreeScene } from '../../core/treeScene';
import type { Frame, TreeStrip } from '../../core/types';

type TrieOp = { readonly kind: 'insert'; readonly word: string } | { readonly kind: 'search'; readonly prefix: string };

interface TrieInput {
  readonly words: readonly string[];
  readonly ops: readonly TrieOp[];
}

const CODE = `function insert(word: string): void {
  let node = root;
  for (const ch of word) {
    if (!node.children.has(ch)) node.children.set(ch, new Node());  // new branch
    node = node.children.get(ch);
  }
  node.terminal = true;                          // a word ends here
}

function startsWith(prefix: string): string[] {
  let node = root;
  for (const ch of prefix) {
    if (!node.children.has(ch)) return [];       // no stored word has this prefix
    node = node.children.get(ch);
  }
  return collect(node, prefix);                  // every terminal below here
}

function collect(node: Node, acc: string): string[] {
  const out = node.terminal ? [acc] : [];
  for (const [ch, child] of node.children) out.push(...collect(child, acc + ch));
  return out;
}`;

const LINE = {
  insertEnter: 1,
  insertStart: 2,
  insertLoop: 3,
  insertBranch: 4,
  insertStep: 5,
  insertMark: 7,
  searchEnter: 10,
  searchLoop: 12,
  searchMiss: 13,
  searchStep: 14,
  searchCollect: 16,
  collectEnter: 19,
  collectEmit: 20,
  collectRecurse: 21,
} as const;

type Gen = Generator<Frame, void, undefined>;

class Trie {
  readonly scene = new TreeScene('nary');
  readonly root: string;
  private readonly edges = new Map<string, Map<string, string>>();

  constructor() {
    this.root = this.scene.create('·');
    this.scene.setRoot(this.root);
  }

  childOf(node: string, ch: string): string | null {
    return this.edges.get(node)?.get(ch) ?? null;
  }

  addChild(node: string, ch: string): string {
    const child = this.scene.create(ch);
    this.scene.attach(node, child);
    let bucket = this.edges.get(node);
    if (bucket === undefined) {
      bucket = new Map();
      this.edges.set(node, bucket);
    }
    bucket.set(ch, child);
    return child;
  }

  charsOf(node: string): readonly string[] {
    return [...(this.edges.get(node)?.keys() ?? [])].sort();
  }
}

function outputStrip(words: readonly string[], label: string): TreeStrip {
  return { label, kind: 'output', items: words.map((word) => ({ id: word, label: word })) };
}

function* insert(trie: Trie, word: string, phase: string): Gen {
  const { scene } = trie;
  let node = trie.root;
  const path: string[] = [];

  yield scene.frame({
    codeLine: LINE.insertStart,
    explanation: `insert("${word}"): start at the root and follow one edge per character.`,
    highlights: { active: [node] },
    pointers: { node },
    phase,
  });

  for (const [index, ch] of [...word].entries()) {
    const existing = trie.childOf(node, ch);
    scene.countComparison();
    scene.visit(node);
    if (existing === null) {
      const created = trie.addChild(node, ch);
      yield scene.frame({
        codeLine: LINE.insertBranch,
        explanation: `No edge for "${ch}" under "${word.slice(0, index)}": create a new branch. Everything from here on is new.`,
        highlights: { candidate: [created], visited: [...path], active: [node] },
        pointers: { node: created },
        phase,
      });
      path.push(node);
      node = created;
    } else {
      yield scene.frame({
        codeLine: LINE.insertStep,
        explanation: `"${ch}" already exists under "${word.slice(0, index)}": follow it. The prefix "${word.slice(0, index + 1)}" is shared with an earlier word.`,
        highlights: { comparing: [existing], visited: [...path], active: [node] },
        pointers: { node: existing },
        phase,
      });
      path.push(node);
      node = existing;
    }
  }

  scene.setTerminal(node, true);
  scene.bump('words');
  yield scene.frame({
    codeLine: LINE.insertMark,
    explanation: `Mark the last node terminal: "${word}" is now a stored word, distinct from any longer word that merely passes through it.`,
    highlights: { sorted: [node], visited: [...path] },
    pointers: { node },
    phase,
  });
}

function* collect(trie: Trie, node: string, acc: string, out: string[], phase: string): Gen {
  const { scene } = trie;
  scene.countCall();
  scene.pushCall({ label: `collect("${acc}")`, codeLine: LINE.collectEnter });

  const view = scene.visit(node);
  if (view.terminal) {
    out.push(acc);
    yield scene.frame({
      codeLine: LINE.collectEmit,
      explanation: `"${acc}" is terminal: emit it.`,
      highlights: { sorted: [node, `output:${acc}`] },
      pointers: { node },
      strips: [outputStrip(out, 'matches')],
      phase,
    });
  }

  for (const ch of trie.charsOf(node)) {
    const child = trie.childOf(node, ch);
    if (child === null) continue;
    yield scene.frame({
      codeLine: LINE.collectRecurse,
      explanation: `Descend into "${acc + ch}".`,
      highlights: { comparing: [child], active: [node] },
      pointers: { node: child },
      strips: [outputStrip(out, 'matches')],
      phase,
    });
    yield* collect(trie, child, acc + ch, out, phase);
  }
  scene.popCall();
}

function* startsWith(trie: Trie, prefix: string): Gen {
  const { scene } = trie;
  let node = trie.root;
  const path: string[] = [];

  yield scene.frame({
    codeLine: LINE.searchEnter,
    explanation: `startsWith("${prefix}"): walk the prefix, then harvest the subtree.`,
    highlights: { active: [node] },
    pointers: { node },
    strips: [outputStrip([], 'matches')],
    phase: 'search',
  });

  for (const [index, ch] of [...prefix].entries()) {
    const next = trie.childOf(node, ch);
    scene.countComparison();
    scene.visit(node);
    if (next === null) {
      yield scene.frame({
        codeLine: LINE.searchMiss,
        explanation: `No edge "${ch}" after "${prefix.slice(0, index)}": no stored word starts with "${prefix}". Return [].`,
        highlights: { excluded: [node], visited: [...path] },
        pointers: { node },
        strips: [outputStrip([], 'matches')],
        phase: 'search',
      });
      return;
    }
    yield scene.frame({
      codeLine: LINE.searchStep,
      explanation: `"${ch}" found: now at "${prefix.slice(0, index + 1)}".`,
      highlights: { comparing: [next], visited: [...path] },
      pointers: { node: next },
      strips: [outputStrip([], 'matches')],
      phase: 'search',
    });
    path.push(node);
    node = next;
  }

  yield scene.frame({
    codeLine: LINE.searchCollect,
    explanation: `Prefix "${prefix}" exists. Every terminal in the subtree below is a match - the number of stored words never matters for this walk, only the subtree size.`,
    highlights: { pivot: [node], visited: [...path] },
    pointers: { node },
    strips: [outputStrip([], 'matches')],
    phase: 'search',
  });

  const out: string[] = [];
  yield* collect(trie, node, prefix, out, 'search');

  yield scene.frame({
    codeLine: LINE.searchCollect,
    explanation: out.length === 0 ? `"${prefix}" is a path but no word ends at or below it.` : `${out.length} match(es): ${out.join(', ')}.`,
    highlights: { pivot: [node] },
    strips: [outputStrip(out, 'matches')],
    phase: 'search',
  });
}

const WORD = /^[a-z]+$/;

function parseWords(raw: string): ParseResult<string[]> {
  const words = raw.split(/[\s,;]+/).map((word) => word.trim().toLowerCase()).filter((word) => word.length > 0);
  if (words.length > 40) return { ok: false, error: 'At most 40 words.' };
  for (const word of words) {
    if (!WORD.test(word)) return { ok: false, error: `"${word}" - words must be letters a-z only.` };
    if (word.length > 12) return { ok: false, error: `"${word}" is longer than 12 letters.` };
  }
  return { ok: true, value: words };
}

function parseOps(raw: string): ParseResult<TrieOp[]> {
  const ops: TrieOp[] = [];
  const tokens = raw.split(/[;\n,]+/).map((token) => token.trim()).filter((token) => token.length > 0);
  for (const token of tokens) {
    let kind: 'insert' | 'search';
    let rest: string;
    if (token.startsWith('+')) [kind, rest] = ['insert', token.slice(1)];
    else if (token.startsWith('?')) [kind, rest] = ['search', token.slice(1)];
    else {
      const match = /^([a-z]+)\s+([a-z]+)$/i.exec(token);
      if (match === null) return { ok: false, error: `Cannot read "${token}". Use "insert word", "search prefix", +word or ?prefix.` };
      const verb = (match[1] ?? '').toLowerCase();
      if (verb.startsWith('ins') || verb.startsWith('add')) kind = 'insert';
      else if (verb.startsWith('sea') || verb.startsWith('find') || verb.startsWith('pre')) kind = 'search';
      else return { ok: false, error: `Unknown operation "${verb}".` };
      rest = match[2] ?? '';
    }
    const word = rest.trim().toLowerCase();
    if (!WORD.test(word)) return { ok: false, error: `"${word}" must be letters a-z only.` };
    ops.push(kind === 'insert' ? { kind, word } : { kind, prefix: word });
  }
  return { ok: true, value: ops };
}

function parse(params: ParamMap): ParseResult<TrieInput> {
  const words = parseWords(params.input ?? '');
  if (!words.ok) return words;
  const ops = parseOps(params.ops ?? '');
  if (!ops.ok) return ops;
  if (words.value.length === 0 && ops.value.length === 0) return { ok: false, error: 'Give some words or some operations.' };
  return { ok: true, value: { words: words.value, ops: ops.value } };
}

const wordsField: FieldSpec = {
  key: 'input',
  label: 'Words',
  kind: 'text',
  defaultValue: 'car, card, care, cart, cat, dog, dot',
  placeholder: 'car, card, cat',
  help: 'Letters a-z, separated by spaces or commas. Inserted in order.',
};

const opsSpec: FieldSpec = {
  key: 'ops',
  label: 'Operations',
  kind: 'text',
  defaultValue: 'search car; insert do; search do; search x',
  placeholder: 'insert cap; search ca',
  help: 'insert word / search prefix, separated by ; or newlines. Shorthand: +cap ?ca',
};

const WORD_POOL = ['apple', 'app', 'apt', 'ape', 'bat', 'batch', 'bath', 'bar', 'bark', 'barn', 'cat', 'cap', 'car', 'cart', 'card', 'dog', 'dot', 'dove', 'ear', 'earth', 'eat', 'inn', 'ink', 'into', 'sun', 'sung', 'sunk', 'tea', 'team', 'tear'];

const presets: readonly PresetSpec[] = [
  {
    id: 'random',
    label: 'Random words',
    build: (size, rng) => {
      const pool = shuffle([...WORD_POOL], rng).slice(0, Math.max(3, Math.min(size, WORD_POOL.length)));
      const probe = pool[randomInt(rng, 0, pool.length - 1)] ?? 'ca';
      return { input: pool.join(', '), ops: `search ${probe.slice(0, 2)}; search ${probe}` };
    },
  },
  {
    id: 'shared',
    label: 'Heavy sharing',
    build: () => ({ input: 'inter, internet, internal, interval, intern, into, in', ops: 'search inter; search int; search x' }),
  },
];

export const trie = defineAlgorithm<TrieInput>({
  meta: {
    id: 'trie',
    name: 'Trie',
    category: 'strings',
    structureKind: 'tree',
    blurb: 'Insert words and walk prefixes character by character.',
    complexity: {
      time: { best: 'O(L)', average: 'O(L)', worst: 'O(L + k)' },
      space: 'O(total characters)',
      notes: [
        'Insert and prefix lookup cost the length of the string, L, independent of how many words are stored.',
        'Listing matches adds the size of the subtree, k, which is why "search a" is expensive and "search app" is not.',
        'Memory is the trade-off: every node holds a child table, so sparse alphabets waste space and a compressed (radix) trie fixes that.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads', 'writes', 'recursiveCalls'],
  },
  fields: [wordsField, opsSpec],
  presets,
  sizeRange: { min: 3, max: 20, step: 1 },
  parse,
  *run(input) {
    const trieTree = new Trie();
    const { scene } = trieTree;

    if (input.words.length > 0) {
      yield scene.frame({
        codeLine: LINE.insertEnter,
        explanation: `Insert ${input.words.length} words in order. Shared prefixes share nodes.`,
        phase: 'build',
      });
      for (const word of input.words) yield* insert(trieTree, word, 'build');
    }

    for (const op of input.ops) {
      if (op.kind === 'insert') yield* insert(trieTree, op.word, 'insert');
      else yield* startsWith(trieTree, op.prefix);
    }

    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Done: ${counters.extra.words ?? 0} words stored in ${scene.size - 1} nodes.`,
      phase: 'done',
    });
  },
});
