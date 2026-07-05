/** The full roadmap, independent of what is actually implemented. */

import type { Category } from './core/define';

export type Phase = 1 | 2 | 3 | 4;

export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly category: Category;
  readonly phase: Phase;
  readonly blurb: string;
  readonly tags: readonly string[];
}

export const CATEGORY_LABEL: Record<Category, string> = {
  sorting: 'Sorting',
  searching: 'Searching',
  arrays: 'Array techniques',
  trees: 'Trees',
  graphs: 'Graphs',
  'dynamic-programming': 'Dynamic programming',
  strings: 'Strings',
  backtracking: 'Backtracking',
};

export const CATEGORY_ORDER: readonly Category[] = [
  'sorting',
  'searching',
  'arrays',
  'trees',
  'graphs',
  'dynamic-programming',
  'strings',
  'backtracking',
];

export const PHASE_LABEL: Record<Phase, string> = {
  1: 'Phase 1 - Arrays',
  2: 'Phase 2 - Trees',
  3: 'Phase 3 - Graphs',
  4: 'Phase 4 - Advanced',
};

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'quicksort',
    name: 'Quicksort',
    category: 'sorting',
    phase: 1,
    blurb: 'Lomuto partition around a pivot, then recurse into both halves.',
    tags: ['partition', 'pivot', 'divide and conquer', 'in place'],
  },
  {
    id: 'mergesort',
    name: 'Merge sort',
    category: 'sorting',
    phase: 1,
    blurb: 'Split to single elements, then merge sorted runs back together.',
    tags: ['merge', 'divide and conquer', 'stable', 'auxiliary array'],
  },
  {
    id: 'heapsort',
    name: 'Heapsort',
    category: 'sorting',
    phase: 1,
    blurb: 'Build a max-heap in place, then pop the root n times.',
    tags: ['heap', 'sift down', 'in place', 'binary tree'],
  },
  {
    id: 'binary-search',
    name: 'Binary search',
    category: 'searching',
    phase: 1,
    blurb: 'Halve the search interval until the target is pinned down.',
    tags: ['lower bound', 'upper bound', 'sorted', 'log n'],
  },
  {
    id: 'two-pointers',
    name: 'Two pointers',
    category: 'arrays',
    phase: 1,
    blurb: 'Walk a pair of indices inward or forward to hit a target in O(n).',
    tags: ['pair sum', 'opposite ends', 'sorted'],
  },
  {
    id: 'sliding-window',
    name: 'Sliding window',
    category: 'arrays',
    phase: 1,
    blurb: 'Grow and shrink a window while maintaining a running invariant.',
    tags: ['subarray', 'longest', 'at most k', 'prefix'],
  },
  {
    id: 'kadane',
    name: "Kadane's algorithm",
    category: 'dynamic-programming',
    phase: 1,
    blurb: 'Maximum subarray sum in one pass, restarting when the run goes negative.',
    tags: ['max subarray', 'running sum', 'dp', 'one pass'],
  },

  {
    id: 'bst',
    name: 'BST insert / delete / search',
    category: 'trees',
    phase: 2,
    blurb: 'The unbalanced baseline, including the two-child delete case.',
    tags: ['binary search tree', 'successor', 'ordered'],
  },
  {
    id: 'avl',
    name: 'AVL tree',
    category: 'trees',
    phase: 2,
    blurb: 'Height-balanced BST with animated LL / LR / RL / RR rotations.',
    tags: ['rotation', 'balance factor', 'self balancing'],
  },
  {
    id: 'red-black',
    name: 'Red-black tree',
    category: 'trees',
    phase: 2,
    blurb: 'Recolour and rotate to keep every root-to-leaf path within 2x.',
    tags: ['rotation', 'recolour', 'self balancing'],
  },
  {
    id: 'binary-heap',
    name: 'Binary heap',
    category: 'trees',
    phase: 2,
    blurb: 'Push, pop and O(n) heapify, shown as a tree and as the backing array.',
    tags: ['priority queue', 'sift up', 'sift down', 'heapify'],
  },
  {
    id: 'trie',
    name: 'Trie',
    category: 'strings',
    phase: 2,
    blurb: 'Insert words and walk prefixes character by character.',
    tags: ['prefix tree', 'autocomplete', 'retrieval'],
  },
  {
    id: 'tree-traversals',
    name: 'Tree traversals',
    category: 'trees',
    phase: 2,
    blurb: 'Pre-, in-, post- and level-order with the call stack on screen.',
    tags: ['dfs', 'bfs', 'recursion', 'call stack'],
  },

  {
    id: 'bfs',
    name: 'Breadth-first search',
    category: 'graphs',
    phase: 3,
    blurb: 'Layer-by-layer expansion with the queue contents visible.',
    tags: ['queue', 'shortest path', 'unweighted', 'levels'],
  },
  {
    id: 'dfs',
    name: 'Depth-first search',
    category: 'graphs',
    phase: 3,
    blurb: 'Dive first, backtrack later, with the explicit stack shown.',
    tags: ['stack', 'recursion', 'backtracking', 'discovery time'],
  },
  {
    id: 'dijkstra',
    name: "Dijkstra's algorithm",
    category: 'graphs',
    phase: 3,
    blurb: 'Greedy shortest paths with the priority queue laid out live.',
    tags: ['priority queue', 'relaxation', 'weighted', 'shortest path'],
  },
  {
    id: 'astar',
    name: 'A* pathfinding',
    category: 'graphs',
    phase: 3,
    blurb: 'Grid search showing f, g and h per cell as the frontier expands.',
    tags: ['heuristic', 'manhattan', 'grid', 'shortest path'],
  },
  {
    id: 'bellman-ford',
    name: 'Bellman-Ford',
    category: 'graphs',
    phase: 3,
    blurb: 'Relax every edge V-1 times, then detect negative cycles.',
    tags: ['negative weights', 'relaxation', 'shortest path'],
  },
  {
    id: 'topological-sort',
    name: 'Topological sort',
    category: 'graphs',
    phase: 3,
    blurb: "Kahn's in-degree peeling next to the DFS post-order variant.",
    tags: ['dag', 'in-degree', 'ordering', 'kahn'],
  },
  {
    id: 'union-find',
    name: 'Union-Find',
    category: 'graphs',
    phase: 3,
    blurb: 'Path compression and union by rank, with the forest redrawn live.',
    tags: ['dsu', 'disjoint set', 'path compression', 'rank'],
  },
  {
    id: 'kruskal',
    name: "Kruskal's MST",
    category: 'graphs',
    phase: 3,
    blurb: 'Sort the edges, then add any edge that joins two components.',
    tags: ['mst', 'union find', 'greedy', 'spanning tree'],
  },
  {
    id: 'prim',
    name: "Prim's MST",
    category: 'graphs',
    phase: 3,
    blurb: 'Grow one tree, always taking the cheapest edge leaving it.',
    tags: ['mst', 'priority queue', 'greedy', 'spanning tree'],
  },
  {
    id: 'tarjan-scc',
    name: 'Tarjan SCC',
    category: 'graphs',
    phase: 3,
    blurb: 'Strongly connected components via low-link values in one DFS.',
    tags: ['scc', 'low link', 'dfs', 'condensation'],
  },

  {
    id: 'segment-tree',
    name: 'Segment tree',
    category: 'trees',
    phase: 4,
    blurb: 'Build, point update and range query with the recursion animated.',
    tags: ['range query', 'point update', 'divide and conquer'],
  },
  {
    id: 'fenwick',
    name: 'Fenwick tree (BIT)',
    category: 'trees',
    phase: 4,
    blurb: 'Prefix sums driven by the lowbit jumps, shown in binary.',
    tags: ['bit', 'prefix sum', 'lowbit', 'bit manipulation'],
  },
  {
    id: 'lcs',
    name: 'Longest common subsequence',
    category: 'dynamic-programming',
    phase: 4,
    blurb: 'Fill the table in computation order with dependency arrows.',
    tags: ['dp table', 'string', 'traceback'],
  },
  {
    id: 'knapsack',
    name: '0/1 knapsack',
    category: 'dynamic-programming',
    phase: 4,
    blurb: 'Weight-by-item table, plus the rolling one-dimensional version.',
    tags: ['dp table', 'capacity', 'take or skip'],
  },
  {
    id: 'edit-distance',
    name: 'Edit distance',
    category: 'dynamic-programming',
    phase: 4,
    blurb: 'Levenshtein table with insert / delete / replace arrows.',
    tags: ['dp table', 'levenshtein', 'string', 'traceback'],
  },
  {
    id: 'lis',
    name: 'Longest increasing subsequence',
    category: 'dynamic-programming',
    phase: 4,
    blurb: 'The O(n log n) patience-sorting version next to the O(n^2) table.',
    tags: ['patience', 'binary search', 'dp', 'tails'],
  },
  {
    id: 'kmp',
    name: 'KMP',
    category: 'strings',
    phase: 4,
    blurb: 'Build the failure function, then match without ever backing up.',
    tags: ['prefix function', 'string matching', 'failure', 'border'],
  },
  {
    id: 'n-queens',
    name: 'N-Queens',
    category: 'backtracking',
    phase: 4,
    blurb: 'The search tree next to the board, with pruning made visible.',
    tags: ['backtracking', 'pruning', 'search tree', 'constraints'],
  },
  {
    id: 'sudoku',
    name: 'Sudoku solver',
    category: 'backtracking',
    phase: 4,
    blurb: 'Constraint propagation and backtracking on a 9x9 grid.',
    tags: ['backtracking', 'constraints', 'grid', 'pruning'],
  },
];

export function searchCatalog(entries: readonly CatalogEntry[], query: string): readonly CatalogEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return entries;

  return entries.filter((entry) => {
    const haystack = [entry.name, entry.blurb, CATEGORY_LABEL[entry.category], ...entry.tags]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}
