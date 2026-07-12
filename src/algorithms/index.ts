/** The registration list. */

import { register } from '../core/registry';
import { quicksort } from './arrays/quicksort';
import { mergesort } from './arrays/mergesort';

register(quicksort);
register(mergesort);

export { getAlgorithm, listAlgorithms, isRegistered } from '../core/registry';
