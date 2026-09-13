import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routerSource = readFileSync(new URL('../router.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

function sliceRunRouterPass() {
    const start = routerSource.indexOf('export async function runRouterPass(');
    expect(start).toBeGreaterThan(-1);
    const end = routerSource.indexOf('\nasync function applyAction(', start);
    expect(end).toBeGreaterThan(start);
    return routerSource.slice(start, end);
}

describe('Lorebook Agent chat ownership', () => {
    it('pins passChatId and refuses commits after abort or chat switch', () => {
        const fn = sliceRunRouterPass();
        expect(routerSource).toContain("import { canCommitPassForChat } from './src/state/pass-affinity.js'");
        expect(fn).toContain('const passChatId = getActiveChatId()');
        expect(fn).toContain('canCommitPassForChat(passChatId, getActiveChatId(), { aborted: _routerSignal.aborted })');
        expect(fn).toContain('async function commitOwnedAction(action)');
        expect(fn).toContain('{ canCommit: ownsChat }');
        expect(fn).toContain("result?.status === 'chat_changed'");
        expect(fn).toContain('assertOwnsChat()');

        // Every commit path goes through the ownership wrapper — no bare applyAction call sites.
        expect(fn).toContain('await commitOwnedAction(cleanupAction)');
        expect(fn).toContain('await commitOwnedAction(args)');
        expect(fn).toContain('await commitOwnedAction(basicAction)');
        expect(fn).toContain('await commitOwnedAction(ordinaryAction)');
        const bareApply = [...fn.matchAll(/await applyAction\(/g)];
        expect(bareApply).toHaveLength(1); // only inside commitOwnedAction
        expect(fn).toContain('await applyAction(action, archiveBooks, currentTime, breadcrumb, isManual, { canCommit: ownsChat })');

        // Post-LLM / post-await windows re-check before watermark and history finalization.
        const watermarkAt = fn.indexOf('persistRouterLastRunWatermark(ctx.chat.length)');
        expect(watermarkAt).toBeGreaterThan(-1);
        expect(fn.lastIndexOf('assertOwnsChat()', watermarkAt)).toBeGreaterThan(-1);
        const finalizeAt = fn.indexOf('await finalizeRouterHistorySnapshot(_routerSnapshotRunId)');
        expect(finalizeAt).toBeGreaterThan(watermarkAt);
        expect(fn.indexOf('assertOwnsChat()', finalizeAt)).toBeGreaterThan(finalizeAt);
    });

    it('aborts the Lorebook Agent before onChatChanged flips the live projection', () => {
        expect(indexSource).toContain('stopRouterPass()');
        const abortMarker = '// Lorebook Agent and World Progression both commit via live prefix';
        const abortAt = indexSource.indexOf(abortMarker);
        expect(abortAt).toBeGreaterThan(-1);
        const stopAt = indexSource.indexOf('stopRouterPass()', abortAt);
        const flipAt = indexSource.indexOf('runtimeState.currentChatId = resolvedId', stopAt);
        expect(stopAt).toBeGreaterThan(-1);
        expect(flipAt).toBeGreaterThan(stopAt);
    });
});
