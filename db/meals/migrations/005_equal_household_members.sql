-- JT and Mary are equal household members; no admin/member split in v1.

UPDATE public.household_members SET role = 'admin' WHERE role <> 'admin';
