/** The registration list. */

import { register } from '../core/registry';
import { quicksort } from './arrays/quicksort';
import { mergesort } from './arrays/mergesort';
import { heapsort } from './arrays/heapsort';
import { binarySearch } from './arrays/binarySearch';
import { twoPointers } from './arrays/twoPointers';

register(quicksort);
register(mergesort);
register(heapsort);
register(binarySearch);
register(twoPointers);

export { getAlgorithm, listAlgorithms, isRegistered } from '../core/registry';
