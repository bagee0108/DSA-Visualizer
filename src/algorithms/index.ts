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

export { getAlgorithm, listAlgorithms, isRegistered } from '../core/registry';
