-- DEMO ONLY: Run manually in Supabase SQL Editor after both migrations.
-- This script creates explicitly labeled fictional records. It does not create
-- government verification results or mark any unverified obligation compliant.
do $$
declare
  admin_id uuid;
  bakery_id uuid;
  paper_id uuid;
  chocolate_id uuid;
  bakery_branch uuid;
  paper_branch uuid;
  chocolate_branch uuid;
  employee_id uuid;
  cycle_id uuid;
  obligation_license uuid;
  obligation_safety uuid;
  obligation_wages uuid;
  task_id uuid;
  check_id uuid;
begin
  select id into admin_id from public.user_profiles
  where display_name = 'System Administrator' and active
  order by created_at limit 1;
  if admin_id is null then raise exception 'Create the System Administrator profile before running the DEMO seed.'; end if;

  insert into public.companies(name_ar,legal_name,active)
  select v.name_ar,v.legal_name,v.active from (values
    ('[DEMO] الوفرة للمخبوزات','DEMO — Al Wafra Bakery',true),
    ('[DEMO] صوافي للمنتجات الورقية','DEMO — Sawafi Paper Products',true),
    ('[DEMO] صيوان للشوكولاتة','DEMO — Siwan Chocolate',true)
  ) as v(name_ar,legal_name,active)
  where not exists (select 1 from public.companies c where c.name_ar=v.name_ar);
  select id into bakery_id from public.companies where name_ar='[DEMO] الوفرة للمخبوزات';
  select id into paper_id from public.companies where name_ar='[DEMO] صوافي للمنتجات الورقية';
  select id into chocolate_id from public.companies where name_ar='[DEMO] صيوان للشوكولاتة';

  insert into public.user_company_roles(user_id,company_id,role)
  select admin_id,id,'system_administrator'::app_role from public.companies
  where id in (bakery_id,paper_id,chocolate_id)
  on conflict do nothing;

  insert into public.branches(company_id,name_ar,active)
  values (bakery_id,'[DEMO] فرع الرياض',true),(paper_id,'[DEMO] فرع جدة',true),(chocolate_id,'[DEMO] فرع الدمام',true)
  on conflict(company_id,name_ar) do nothing;
  select id into bakery_branch from public.branches where company_id=bakery_id and name_ar='[DEMO] فرع الرياض';
  select id into paper_branch from public.branches where company_id=paper_id and name_ar='[DEMO] فرع جدة';
  select id into chocolate_branch from public.branches where company_id=chocolate_id and name_ar='[DEMO] فرع الدمام';

  insert into public.employees(employee_code,company_id,branch_id,full_name,job_title,employment_status,start_date,owner_id)
  values ('DEMO-EMP-001',bakery_id,bakery_branch,'موظف تجريبي','مسؤول امتثال','active',current_date - 180,admin_id)
  on conflict(employee_code) do nothing;
  select id into employee_id from public.employees where employee_code='DEMO-EMP-001';

  insert into public.contracts(employee_id,contract_identifier,starts_at,ends_at,status,verification_status)
  values (employee_id,'DEMO-CONTRACT-001',now() - interval '180 days',now() + interval '14 days','active','not_verified')
  on conflict(contract_identifier) do nothing;

  insert into public.licenses(company_id,branch_id,license_type,authority,license_number,issue_date,expiry_date,verified_status,verification_owner)
  values (bakery_id,bakery_branch,'[DEMO] رخصة بلدية','Balady','DEMO-BALADY-001',current_date - 330,current_date + 30,'not_verified',admin_id)
  on conflict do nothing;

  insert into public.compliance_items(company_id,branch_id,name,category,authority,applicable,owner_id,risk_level,evidence_required,weekly_required,active)
  select v.company_id,v.branch_id,v.name,v.category,v.authority,v.applicable,v.owner_id,v.risk_level,v.evidence_required,v.weekly_required,v.active from (values
    (bakery_id,bakery_branch,'[DEMO] التحقق من الرخصة البلدية','business_license','Balady',true,admin_id,'high',true,true,true),
    (bakery_id,bakery_branch,'[DEMO] فحص معدات السلامة','safety','Civil Defense',true,admin_id,'high',true,true,true),
    (paper_id,paper_branch,'[DEMO] متابعة حماية الأجور','employment','Mudad',true,null,'medium',false,true,true),
    (chocolate_id,chocolate_branch,'[DEMO] متطلب سلامة غذاء','food_safety','SFDA',true,admin_id,'high',true,true,true)
  ) as v(company_id,branch_id,name,category,authority,applicable,owner_id,risk_level,evidence_required,weekly_required,active)
  where not exists (select 1 from public.compliance_items i where i.company_id=v.company_id and i.name=v.name);
  select id into obligation_license from public.compliance_items where company_id=bakery_id and name='[DEMO] التحقق من الرخصة البلدية';
  select id into obligation_safety from public.compliance_items where company_id=bakery_id and name='[DEMO] فحص معدات السلامة';
  select id into obligation_wages from public.compliance_items where company_id=paper_id and name='[DEMO] متابعة حماية الأجور';

  insert into public.review_cycles(starts_on,ends_on,timezone)
  values (date_trunc('week',current_date)::date + 6, date_trunc('week',current_date)::date + 12, 'Asia/Riyadh')
  on conflict(starts_on,ends_on) do nothing;
  select id into cycle_id from public.review_cycles where starts_on=date_trunc('week',current_date)::date + 6 and ends_on=date_trunc('week',current_date)::date + 12;
  perform public.generate_weekly_tasks(cycle_id);

  select id into task_id from public.inspection_tasks where compliance_item_id=obligation_safety and review_cycle_id=cycle_id;
  insert into public.compliance_checks(inspection_task_id,performed_by,performed_at,compliance_status,review_status,observation,evidence_reference,submitted_at)
  values(task_id,admin_id,now(),'action_required','pending_review','[DEMO] متابعة صيانة مطلوبة؛ لا يمثل ذلك نتيجة رسمية.','DEMO-EVIDENCE-001',now())
  on conflict(inspection_task_id) do nothing;
  select id into check_id from public.compliance_checks where inspection_task_id=task_id;
  insert into public.corrective_actions(compliance_check_id,title,assigned_to,due_at,priority,status)
  select check_id,'[DEMO] توثيق صيانة معدات السلامة',admin_id,now()+interval '7 days','high','open'
  where not exists (select 1 from public.corrective_actions a where a.compliance_check_id=check_id and a.title='[DEMO] توثيق صيانة معدات السلامة');
end $$;

-- Expected overview: active weekly tasks include one intentionally unassigned Mudad task.
select c.name_ar, b.name_ar as branch, i.name as obligation, t.status as task_status,
       coalesce(ch.compliance_status::text,'not_verified') as compliance_status,
       coalesce(ch.review_status::text,'pending_review') as review_status
from public.inspection_tasks t
join public.compliance_items i on i.id=t.compliance_item_id
join public.companies c on c.id=t.company_id
left join public.branches b on b.id=t.branch_id
left join public.compliance_checks ch on ch.inspection_task_id=t.id
where c.name_ar like '[DEMO]%'
order by c.name_ar,i.name;
