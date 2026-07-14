/** The registration list. */

import { register } from '../core/registry';
import { quicksort } from './arrays/quicksort';
import { mergesort } from './arrays/mergesort';
import { heapsort } from './arrays/heapsort';

register(quicksort);
register(mergesort);
register(heapsort);

export { getAlgorithm, listAlgorithms, isRegistered } from '../core/registry';
