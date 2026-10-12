import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleDispatch, sendDispatch } from '../src/hooks/dispatchContentPublished';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('sendDispatch()', () => {
  it('does nothing without a token (local development)', async () => {
    const fetchImpl = vi.fn();
    expect(await sendDispatch({} as never, fetchImpl as never)).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts the content-published event to the repository, with the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 204 });
    const out = await sendDispatch({ GITHUB_DISPATCH_TOKEN: 't0ken', GITHUB_REPOSITORY: 'me/blog' } as never, fetchImpl as never);
    expect(out).toBe('sent');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/me/blog/dispatches');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer t0ken');
    expect(JSON.parse(init.body)).toEqual({ event_type: 'content-published' });
  });

  it('fails loudly when GitHub refuses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404 });
    await expect(sendDispatch({ GITHUB_DISPATCH_TOKEN: 't' } as never, fetchImpl as never)).rejects.toThrow(/404/);
  });
});

describe('scheduleDispatch()', () => {
  const log = () => ({ info: vi.fn(), error: vi.fn() });

  it('logs and does nothing without a token', () => {
    vi.stubEnv('GITHUB_DISPATCH_TOKEN', '');
    const l = log();
    scheduleDispatch(l, 10);
    expect(l.info).toHaveBeenCalledWith(expect.stringContaining('GITHUB_DISPATCH_TOKEN is not set'));
  });

  it('turns a burst of publishes into one dispatch', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GITHUB_DISPATCH_TOKEN', 'tok');
    const fetchMock = vi.fn().mockResolvedValue({ status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    const l = log();
    scheduleDispatch(l, 1000);
    scheduleDispatch(l, 1000);
    scheduleDispatch(l, 1000);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
