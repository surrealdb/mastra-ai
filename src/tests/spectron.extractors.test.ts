import type { Spectron } from '@surrealdb/spectron';
import { describe, expect, it, vi } from 'vitest';
import {
	type SpectronExtractedContext,
	spectronExtractedSink,
} from '../spectron/extractors.js';

function makeSpectron() {
	const remember = vi.fn().mockResolvedValue({ facts: [] });
	return { spectron: { remember } as unknown as Spectron, remember };
}

const context = (
	overrides: Partial<SpectronExtractedContext> = {},
): SpectronExtractedContext => ({
	source: 'observer',
	threadId: 'thread-1',
	resourceId: 'user-1',
	extractor: { name: 'User profile', slug: 'user-profile' },
	current: { preferredName: 'Ada' },
	...overrides,
});

describe('spectronExtractedSink', () => {
	it('persists structured values as literal JSON facts with default labels', async () => {
		const { spectron, remember } = makeSpectron();
		const sink = spectronExtractedSink(spectron);

		await sink(context());

		expect(remember).toHaveBeenCalledWith(
			JSON.stringify({ preferredName: 'Ada' }),
			{
				// extraction already happened client-side; store literally
				infer: 'none',
				labels: [
					'extractor=user-profile',
					'threadId=thread-1',
					'resourceId=user-1',
				],
			},
		);
	});

	it('passes string values through unchanged and omits missing resourceId', async () => {
		const { spectron, remember } = makeSpectron();
		const sink = spectronExtractedSink(spectron);

		await sink(
			context({ current: 'plain text fact', resourceId: undefined }),
		);

		expect(remember).toHaveBeenCalledWith('plain text fact', {
			infer: 'none',
			labels: ['extractor=user-profile', 'threadId=thread-1'],
		});
	});

	it('skips the write when format returns null or the value is nullish', async () => {
		const { spectron, remember } = makeSpectron();

		await spectronExtractedSink(spectron)(
			context({ current: undefined as unknown as string }),
		);
		await spectronExtractedSink(spectron, { format: () => null })(
			context(),
		);

		expect(remember).not.toHaveBeenCalled();
	});

	it('supports custom labels (static and factory) and remember options', async () => {
		const { spectron, remember } = makeSpectron();

		await spectronExtractedSink(spectron, {
			labels: ['source=om'],
			remember: { memoryCategory: 'profile', sessionId: 'sess-1' },
		})(context());
		expect(remember).toHaveBeenLastCalledWith(expect.any(String), {
			infer: 'none',
			memoryCategory: 'profile',
			sessionId: 'sess-1',
			labels: ['source=om'],
		});

		await spectronExtractedSink(spectron, {
			labels: (ctx) => [
				`slug=${ctx.extractor.slug}`,
				`src=${ctx.source}`,
			],
		})(context({ source: 'reflector' }));
		expect(remember).toHaveBeenLastCalledWith(expect.any(String), {
			infer: 'none',
			labels: ['slug=user-profile', 'src=reflector'],
		});
	});

	it('allows overriding the infer mode for server-side re-inference', async () => {
		const { spectron, remember } = makeSpectron();

		await spectronExtractedSink(spectron, {
			remember: { infer: 'full' },
		})(context());

		expect(remember).toHaveBeenLastCalledWith(expect.any(String), {
			infer: 'full',
			labels: [
				'extractor=user-profile',
				'threadId=thread-1',
				'resourceId=user-1',
			],
		});
	});

	it('never throws into the observation cycle; routes failures to onError', async () => {
		const remember = vi.fn().mockRejectedValue(new Error('spectron down'));
		const spectron = { remember } as unknown as Spectron;
		const onError = vi.fn();

		await expect(
			spectronExtractedSink(spectron, { onError })(context()),
		).resolves.toBeUndefined();

		expect(onError).toHaveBeenCalledTimes(1);
		expect((onError.mock.calls[0]?.[0] as Error).message).toBe(
			'spectron down',
		);

		// default onError only warns
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(
			spectronExtractedSink(spectron)(context()),
		).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});
