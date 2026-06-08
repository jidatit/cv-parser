
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create HNSW indexes for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_candidates_embedding_hnsw ON candidates USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_embedding_hnsw ON jobs USING hnsw (embedding vector_cosine_ops);
