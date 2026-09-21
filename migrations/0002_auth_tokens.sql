-- Password-reset / account-invite tokens (hashed) live on the users row.
ALTER TABLE users ADD COLUMN reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN reset_expires TEXT;
