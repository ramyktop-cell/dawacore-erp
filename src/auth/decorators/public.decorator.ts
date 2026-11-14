// Compatibility export for older modules. Keep one public-route metadata key
// so the global SecurityGuard and local guards make the same decision.
export { PUBLIC_ROUTE as IS_PUBLIC_KEY, Public } from '../security.policy';
