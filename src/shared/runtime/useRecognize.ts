// Runtime vision recognition — describe a photo as structured labels.
// POST https://chat.aiwaves.tech/aigram/api/recognize
//
// Body:  { image_url: string, mode?: 'object' | 'face' | 'scene' }
// 200:   { ok: true,  mode, labels[], attributes[], parts[], caption, confidence }
//        { ok: false, reason }
//
// The platform proxy is the canonical entry — same shape as gen-image / chat.
// Backend is a single GPU worker on a SeetaCloud per-instance URL; never
// hardcode that direct host in a game.

import { useCallback, useState } from 'react';

const RECOGNIZE_URL = 'https://chat.aiwaves.tech/aigram/api/recognize';

export type RecognizeMode = 'object' | 'face' | 'scene';

export interface RecognizeOptions {
  /** Public HTTPS URL of the photo. Upload first via useUpload. */
  image_url: string;
  /** Domain hint. Defaults to 'object'. */
  mode?: RecognizeMode;
}

export interface RecognizeResult {
  ok: true;
  mode: RecognizeMode;
  labels: string[];
  attributes: string[];
  parts: string[];
  caption: string;
  confidence: number;
}

export interface RecognizeFailure {
  ok: false;
  reason: string;
}

export interface UseRecognize {
  recognize: (opts: RecognizeOptions) => Promise<RecognizeResult>;
  loading: boolean;
  error: Error | null;
  lastResult: RecognizeResult | null;
}

export function useRecognize(): UseRecognize {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastResult, setLastResult] = useState<RecognizeResult | null>(null);

  const recognize = useCallback(
    async (opts: RecognizeOptions): Promise<RecognizeResult> => {
      if (!opts.image_url) throw new Error('recognize: image_url is required');
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(RECOGNIZE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: opts.image_url,
            mode: opts.mode ?? 'object',
          }),
        });
        if (!res.ok) throw new Error(`recognize failed: HTTP ${res.status}`);
        const json = (await res.json()) as RecognizeResult | RecognizeFailure;
        if (!json.ok) {
          throw new Error(`recognize: ${(json as RecognizeFailure).reason || 'unrecognized'}`);
        }
        setLastResult(json);
        return json;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { recognize, loading, error, lastResult };
}
