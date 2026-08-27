import type { DecodedHandle } from './codec.js';
import { bytesEqual } from './bytes.js';
import type { PluginContext } from './plugin-context.js';
import type { ActiveConversation, HandlePresentation } from './presentation.js';
import type { ConversationRecord } from './store.js';

export function stateCommitmentChanged(
  ctx: PluginContext,
  record: ConversationRecord,
  decoded?: DecodedHandle,
): boolean {
  if (!ctx.stateCommitment) {
    return false;
  }
  const current = ctx.stateCommitment(record);
  const previous = decoded?.state ?? new Uint8Array(0);
  return !bytesEqual(current, previous);
}

function isNearExpiry(ctx: PluginContext, decoded: DecodedHandle): boolean {
  const remaining = decoded.exp - ctx.nowSec();
  return remaining < ctx.settings.handleLifetimeSeconds! / 2;
}

/**
 * Rotation triggers (§4.2):
 * - new conversation or fork (always mint)
 * - `stateCommitment(record)` differs from presented handle bytes
 * - valid handle is within half of configured lifetime (SHOULD)
 */
export function shouldRotateHandle(
  ctx: PluginContext,
  presentation: HandlePresentation,
  active: ActiveConversation,
): boolean {
  if (presentation.kind === 'absent' || presentation.kind === 'fork') {
    return true;
  }
  if (stateCommitmentChanged(ctx, active.record, active.decoded)) {
    return true;
  }
  if (presentation.kind === 'valid' && isNearExpiry(ctx, presentation.decoded)) {
    return true;
  }
  return false;
}
