CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activities_lead_idx" ON "activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "activities_org_occurred_idx" ON "activities" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "leads_org_stage_idx" ON "distributor_leads" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "leads_org_assignee_idx" ON "distributor_leads" USING btree ("org_id","assigned_employee_id");--> statement-breakpoint
CREATE INDEX "leads_org_deleted_idx" ON "distributor_leads" USING btree ("org_id","deleted_at");--> statement-breakpoint
CREATE INDEX "tasks_org_status_due_idx" ON "tasks" USING btree ("org_id","status","due_date");