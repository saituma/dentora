import { SchedulingProviderFeatureDisabledError } from '../../domain/errors.js';

export class SoeExactNotConfiguredError extends SchedulingProviderFeatureDisabledError {
  public constructor(message = 'SOE/EXACT integration is not configured or enabled') {
    super('soe_exact');
    this.name = 'SoeExactNotConfiguredError';
    this.message = message;
  }
}
