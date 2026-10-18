/** The registration list. */

import { register } from '../core/registry';
import { binarySearch } from './arrays/binarySearch';
import { heapsort } from './arrays/heapsort';
import { kadane } from './arrays/kadane';
import { mergesort } from './arrays/mergesort';
import { quicksort } from './arrays/quicksort';
import { slidingWindow } from './arrays/slidingWindow';
import { twoPointers } from './arrays/twoPointers';
import { bst } from './trees/bst';
import { avl } from './trees/avl';
import { redBlack } from './trees/redBlack';
import { binaryHeap } from './trees/binaryHeap';
import { trie } from './trees/trie';
import { treeTraversals } from './trees/traversals';
import { bfs } from './graphs/bfs';
import { dfs } from './graphs/dfs';
import { dijkstra } from './graphs/dijkstra';
import { unionFind } from './graphs/unionFind';
import { tarjanScc } from './graphs/tarjan';
import { topologicalSort } from './graphs/topoSort';
import { lcs } from './dp/lcs';
import { editDistance } from './dp/editDistance';
import { knapsack } from './dp/knapsack';
import { lis } from './dp/lis';
import { kmp } from './strings/kmp';
import { segmentTree } from './trees/segmentTree';
import { fenwick } from './trees/fenwick';
import { nQueens } from './backtracking/nQueens';
import { sudoku } from './backtracking/sudoku';

register(quicksort);
register(mergesort);
register(heapsort);
register(binarySearch);
register(twoPointers);
register(slidingWindow);
register(kadane);

register(bst);
register(avl);
register(redBlack);
register(binaryHeap);
register(trie);
register(treeTraversals);

// Phase 3 - graphs
register(bfs);
register(dfs);
register(dijkstra);
register(unionFind);
register(topologicalSort);
register(tarjanScc);

// Phase 4 - dynamic programming
register(lcs);
register(editDistance);
register(knapsack);
register(lis);

// Phase 4 - strings
register(kmp);

// Phase 4 - range structures
register(segmentTree);
register(fenwick);

// Phase 4 - backtracking
register(nQueens);
register(sudoku);

export { getAlgorithm, listAlgorithms, isRegistered } from '../core/registry';
