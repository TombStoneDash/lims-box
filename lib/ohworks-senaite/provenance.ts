export const SENAITE_SOURCE_HEAD = 'bcc97cc5df73941c3e34171e67a64b552e13425e';
export const SENAITE_SOURCE_TREE = '59322a5355c32859955f3cd36d9488632df7a867';
export const RESULT_IMPORT_TRANSITION = 'submit';
export const RESULT_IMPORT_POSTCONDITION = 'to_be_verified';
export const RESULT_IMPORTER_RELATIVE_PATH = 'tools/import-results.js';
export const BUNDLE_LOADER_RELATIVE_PATH = 'tools/load-client.js';

// The established importer remains the sole result writer. This application
// intentionally has no result-write API or fallback result generator.
export function assertImporterContract(transition: string, postcondition: string): void {
  if (transition !== RESULT_IMPORT_TRANSITION || postcondition !== RESULT_IMPORT_POSTCONDITION) {
    throw new Error('Existing SENAITE importer contract mismatch');
  }
}
