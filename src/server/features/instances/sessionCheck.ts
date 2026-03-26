import { waitForCDP } from '../../core/browser/cdpWaiter';
import { usageMetricsManager } from '../../managers/UsageMetricsManager';
import { processManager } from './processManager';
import { cdpClient } from './cdpClient';

export async function runSessionCheck(input: {
  child: ReturnType<typeof processManager.spawn>;
  port: number;
  timeoutMs: number;
  targetUrl: string;
  proxyCleanup: (() => void) | null;
}): Promise<{ result: 'logged_in' | 'logged_out' | 'error'; reason?: string }> {
  const { child, port, timeoutMs, targetUrl, proxyCleanup } = input;

  if (!child.pid) {
    if (proxyCleanup) {
      proxyCleanup();
    }
    return { result: 'error', reason: 'spawn_failed' };
  }

  try {
    await waitForCDP(port, timeoutMs);
    const finalUrl = await cdpClient.getCurrentUrl(port, timeoutMs);
    const parsedTarget = new URL(targetUrl);
    const parsedFinal = new URL(finalUrl);
    const isLoggedOut = parsedFinal.hostname !== parsedTarget.hostname
      || parsedFinal.pathname.toLowerCase().includes('login')
      || parsedFinal.pathname.toLowerCase().includes('signin')
      || parsedFinal.pathname.toLowerCase().includes('auth');
    const result = isLoggedOut ? 'logged_out' : 'logged_in';
    await usageMetricsManager.recordSessionCheck(result);
    return { result };
  } catch (error) {
    await usageMetricsManager.recordSessionCheck('error');
    return { result: 'error', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    processManager.kill(child, 'SIGTERM');
    setTimeout(() => processManager.kill(child, 'SIGKILL'), 2000);
    if (proxyCleanup) {
      proxyCleanup();
    }
  }
}
