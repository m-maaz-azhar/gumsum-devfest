alter table public.pickups add column if not exists code_ciphertext text;

create or replace function public.approve_claim(
  p_claim_id uuid, p_staff_id uuid, p_code_hash text, p_code_ciphertext text,
  p_qr_token text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item_id uuid; v_org_id uuid;
begin
  select c.item_id,i.org_id into v_item_id,v_org_id
  from claims c join items i on i.id=c.item_id
  where c.id=p_claim_id and c.status='under_review' for update of c,i;
  if v_item_id is null or not exists(select 1 from staff_members where user_id=p_staff_id and org_id=v_org_id) then
    raise exception 'claim unavailable' using errcode='P0001';
  end if;
  if exists(select 1 from claims where item_id=v_item_id and status='approved') then
    raise exception 'already approved' using errcode='23505';
  end if;
  update claims set status='approved',decided_at=now(),decided_by=p_staff_id,updated_at=now() where id=p_claim_id;
  update claims set status='not_selected',decided_at=now(),decided_by=p_staff_id,updated_at=now()
    where item_id=v_item_id and id<>p_claim_id and status in ('submitted','under_review');
  update items set status='ready_for_pickup',updated_at=now() where id=v_item_id;
  insert into pickups(claim_id,code_hash,code_ciphertext,qr_token,expires_at)
    values(p_claim_id,p_code_hash,p_code_ciphertext,p_qr_token,p_expires_at);
  insert into audit_events(org_id,actor_id,type,entity_id) values(v_org_id,p_staff_id,'claim.approved',p_claim_id);
  return jsonb_build_object('claim_id',p_claim_id,'status','approved','expires_at',p_expires_at);
end $$;

create or replace function public.complete_handover(p_claim_id uuid,p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_item_id uuid; v_org_id uuid; v_pick pickups%rowtype;
begin
  select * into v_pick from pickups where claim_id=p_claim_id for update;
  select c.item_id,i.org_id into v_item_id,v_org_id from claims c join items i on i.id=c.item_id where c.id=p_claim_id;
  if v_pick.claim_id is null or v_pick.collected_at is not null or v_pick.expires_at<now()
     or not exists(select 1 from staff_members where user_id=p_staff_id and org_id=v_org_id) then return null; end if;
  update pickups set collected_at=now(),handed_over_by=p_staff_id where claim_id=p_claim_id;
  update claims set status='collected',updated_at=now() where id=p_claim_id;
  update items set status='returned',updated_at=now() where id=v_item_id;
  insert into audit_events(org_id,actor_id,type,entity_id) values(v_org_id,p_staff_id,'pickup.completed',p_claim_id);
  return jsonb_build_object('claim_id',p_claim_id,'status','collected');
end $$;

revoke all on function public.approve_claim(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.complete_handover(uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_claim(uuid,uuid,text,text,text,timestamptz) to service_role;
grant execute on function public.complete_handover(uuid,uuid) to service_role;
