import type { RememberOptions, Spectron } from '@surrealdb/spectron';

/**
 * Structural mirror of `@mastra/memory`'s `ExtractorOnExtractedContext`, so
 * the sink can be passed to an `Extractor`'s `onExtracted` hook without this
 * package depending on `@mastra/memory`.
 */
export interface SpectronExtractedContext<T = unknown> {
	/** Which observational-memory agent produced the value. */
	source: 'observer' | 'reflector';
	threadId: string;
	resourceId?: string;
	/** The extractor that produced the value (only name/slug are read). */
	extractor: { name: string; slug: string };
	/** Previously persisted value, when includePreviousExtraction is on. */
	previous?: T;
	/** The newly extracted value. */
	current: T;
}

export interface SpectronExtractedSinkOptions<T = unknown> {
	/**
	 * Labels attached to the persisted Spectron rows, either as a static
	 * `key=value` list or a per-extraction factory. Defaults to
	 * `extractor=<slug>`, `threadId=<threadId>` and, when present,
	 * `resourceId=<resourceId>`.
	 */
	labels?: string[] | ((context: SpectronExtractedContext<T>) => string[]);
	/**
	 * Formats the extracted value into the text passed to
	 * `spectron.remember`. Return null/empty to skip the write. Defaults to
	 * passing strings through and JSON-stringifying everything else.
	 */
	format?: (context: SpectronExtractedContext<T>) => string | null;
	/**
	 * Extra options forwarded to `spectron.remember` (scopes, sessionId,
	 * memoryCategory, infer, ...). `infer` defaults to `'none'`: the value
	 * was already extracted client-side by the Mastra extractor, so it is
	 * stored as a literal fact instead of running Spectron's server-side
	 * inference over it again. Pass `infer: 'full'` to re-infer anyway.
	 */
	remember?: Omit<RememberOptions, 'labels'>;
	/**
	 * Called when the Spectron write fails. The sink never throws into the
	 * observation cycle. Defaults to `console.warn`.
	 */
	onError?: (error: unknown, context: SpectronExtractedContext<T>) => void;
}

function defaultFormat(context: SpectronExtractedContext): string | null {
	const value = context.current;
	if (value == null) return null;
	if (typeof value === 'string') return value;
	return JSON.stringify(value);
}

function defaultLabels(context: SpectronExtractedContext): string[] {
	const labels = [
		`extractor=${context.extractor.slug}`,
		`threadId=${context.threadId}`,
	];
	if (context.resourceId) labels.push(`resourceId=${context.resourceId}`);
	return labels;
}

/**
 * Bridges Mastra memory extractors to Spectron: returns an
 * `onExtracted`-compatible callback that persists each extracted value via
 * `spectron.remember`. Values are stored as literal facts (`infer: 'none'`)
 * since extraction already happened client-side — override via
 * `options.remember.infer`. Failures are swallowed (routed to `onError`) so a
 * Spectron outage never breaks the observation cycle, and the callback
 * returns undefined so the extracted value is persisted unchanged by Mastra.
 *
 * ```ts
 * new Extractor({
 *   name: 'User profile',
 *   instructions: 'Extract stable user profile facts.',
 *   onExtracted: spectronExtractedSink(spectron),
 * });
 * ```
 */
export function spectronExtractedSink<T = unknown>(
	spectron: Spectron,
	options: SpectronExtractedSinkOptions<T> = {},
): (context: SpectronExtractedContext<T>) => Promise<void> {
	const {
		format = defaultFormat,
		labels = defaultLabels,
		remember,
		onError = (error, context) =>
			console.warn(
				`[spectronExtractedSink] failed to persist extraction "${context.extractor.slug}":`,
				error,
			),
	} = options;

	return async (context) => {
		try {
			const text = format(context);
			if (!text) return;
			const resolvedLabels = Array.isArray(labels)
				? labels
				: labels(context);
			await spectron.remember(text, {
				infer: 'none',
				...remember,
				labels: resolvedLabels,
			});
		} catch (error) {
			onError(error, context);
		}
	};
}
