/** The registration list. */

import { register } from '../core/registry';
import { quicksort } from './arrays/quicksort';

register(quicksort);

export { getAlgorithm, listAlgorithms, isRegistered } from '../core/registry';
