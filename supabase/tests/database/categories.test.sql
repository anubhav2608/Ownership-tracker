-- Item categories.
begin;
select plan(1);
select is(
  enum_range(null::public.item_category)::text,
  '{electronics,appliances,vehicle,furniture,clothing,accessories,home,other}',
  'clothing and other are categories, in display order'
);
select * from finish();
rollback;
