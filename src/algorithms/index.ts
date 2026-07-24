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

register(quicksort);
register(mergesort);
register(heapsort);
register(binarySearch);
register(twoPointers);
register(slidingWindow);
register(kadane);

register(bst);

export { getAlgorithm, listAlgorithms, isRegistered } from '../core/registry';
