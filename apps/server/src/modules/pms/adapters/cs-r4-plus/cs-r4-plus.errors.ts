import { SchedulingProviderFeatureDisabledError } from '../../domain/errors.js';

export class CsR4PlusNotConfiguredError extends SchedulingProviderFeatureDisabledError {
  public constructor(message = 'CS R4+ integration is not configured or enabled') {
    super('cs_r4_plus');
    this.name = 'CsR4PlusNotConfiguredError';
    this.message = message;
  }
}
