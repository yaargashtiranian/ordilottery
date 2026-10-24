-- The owner's shorter-copy request also covers this previously edited intro (extra trailing dots).
-- Compare the reviewed value per field and increment the CMS revision to reject stale open editors.
update public.cms_pages set
 draft_content=case when draft_content->>'description'='برای یک فرصت تازه، لازم نیست مسیر را تنها بروید. از شناخت لاتاری تا آماده‌سازی و بررسی درخواست، قدم‌به‌قدم همراه شما هستیم....'
 then jsonb_set(draft_content,'{description}',to_jsonb('انتخاب خدمت، آماده‌سازی مدارک و پیگیری ثبت‌نام.'::text)) else draft_content end,
 published_content=case when published_content->>'description'='برای یک فرصت تازه، لازم نیست مسیر را تنها بروید. از شناخت لاتاری تا آماده‌سازی و بررسی درخواست، قدم‌به‌قدم همراه شما هستیم....'
 then jsonb_set(published_content,'{description}',to_jsonb('انتخاب خدمت، آماده‌سازی مدارک و پیگیری ثبت‌نام.'::text)) else published_content end,
 revision=revision+1,updated_at=now(),published_at=now()
where slug='home' and (
 draft_content->>'description'='برای یک فرصت تازه، لازم نیست مسیر را تنها بروید. از شناخت لاتاری تا آماده‌سازی و بررسی درخواست، قدم‌به‌قدم همراه شما هستیم....'
 or published_content->>'description'='برای یک فرصت تازه، لازم نیست مسیر را تنها بروید. از شناخت لاتاری تا آماده‌سازی و بررسی درخواست، قدم‌به‌قدم همراه شما هستیم....');
