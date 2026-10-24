-- Clothing gets its own category, and "other" is there for anything that fits
-- none (the review screen's default when it can't tell).
alter type public.item_category add value if not exists 'clothing' before 'accessories';
alter type public.item_category add value if not exists 'other';
