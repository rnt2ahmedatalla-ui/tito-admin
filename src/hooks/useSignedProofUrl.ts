import { useEffect, useState } from 'react';
import { supabase, PROOFS_BUCKET } from '@/lib/supabase';

const EXPIRY_SECONDS = 60;

export function useSignedProofUrl(proofPath: string | null | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!proofPath || !enabled) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void supabase.storage
      .from(PROOFS_BUCKET)
      .createSignedUrl(proofPath, EXPIRY_SECONDS)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data?.signedUrl) {
          setError(true);
          setUrl(null);
        } else {
          setUrl(data.signedUrl);
        }
        setLoading(false);
      });

    const refresh = setInterval(() => {
      if (!proofPath) return;
      void supabase.storage
        .from(PROOFS_BUCKET)
        .createSignedUrl(proofPath, EXPIRY_SECONDS)
        .then(({ data }) => {
          if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
        });
    }, (EXPIRY_SECONDS - 10) * 1000);

    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, [proofPath, enabled]);

  return { url, loading, error };
}
