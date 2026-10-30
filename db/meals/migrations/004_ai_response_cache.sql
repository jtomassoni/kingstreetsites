-- Persistent cache of OpenAI search/recipe results so identical queries
-- never spend credits twice. Unfamiliar rejections are cached too.

CREATE TABLE public.ai_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_hash text NOT NULL,
  operation_type text NOT NULL,
  query_normalized text NOT NULL,
  status text NOT NULL CHECK (status IN ('familiar', 'unfamiliar')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_id uuid REFERENCES public.ai_generations (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_response_cache_hash_unique UNIQUE (request_hash)
);

COMMENT ON TABLE public.ai_response_cache IS
  'Cached OpenAI results keyed by a hash of the normalized query. Reused instead of calling OpenAI.';

CREATE INDEX idx_ai_response_cache_query
  ON public.ai_response_cache (query_normalized);

CREATE TRIGGER trg_ai_response_cache_updated_at
  BEFORE UPDATE ON public.ai_response_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
