/**
 * Chat Link enable conflict: archive a displaced memo as a Linear Stone.
 * memoHistory entries must be plain strings — objects break syncMemoView,
 * computeDelta, and "restore as LIVE". Keep dungeonMapHistory paired.
 */

import { unshiftMemoAndMapHistory } from '../../state/dungeon-map-history.js';

/**
 * @param {object} targetSettings Settings (or chatStates partition) receiving the stone.
 * @param {unknown} memo Displaced memo text. Non-strings are refused.
 * @param {{ max?: number }} [opts]
 * @returns {boolean} true when a stone was archived
 */
export function archiveDisplacedChatLinkMemo(targetSettings, memo, { max = 50 } = {}) {
    if (!targetSettings || typeof memo !== 'string' || !memo) return false;
    unshiftMemoAndMapHistory(targetSettings, memo, null, { max });
    return true;
}
