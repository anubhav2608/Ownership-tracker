-- Toys, and baby and kids' gear, get their own category (a "Baby Car Toy"
-- isn't a vehicle).
alter type public.item_category add value if not exists 'toys' before 'other';
