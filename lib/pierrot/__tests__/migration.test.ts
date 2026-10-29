/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-29_create_pierrot_conversations.sql'),
  'utf8'
);
const commercialMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-29_add_pierrot_commercial_events.sql'),
  'utf8'
);
const orderMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-29_add_pierrot_order_paid_event.sql'),
  'utf8'
);
const serviceEventsMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-29_extend_pierrot_service_events.sql'),
  'utf8'
);
const subscriptionEventsMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-29_create_subscription_events.sql'),
  'utf8'
);
const serviceLeadsMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-29_create_art_service_leads.sql'),
  'utf8'
);

describe('Pierrot conversation migration security', () => {
  it('enables RLS on every transcript table', () => {
    expect(migration).toContain(
      'ALTER TABLE public.pierrot_conversations ENABLE ROW LEVEL SECURITY;'
    );
    expect(migration).toContain('ALTER TABLE public.pierrot_messages ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('ALTER TABLE public.pierrot_events ENABLE ROW LEVEL SECURITY;');
  });

  it('revokes public/anon/authenticated direct access and grants only the server role', () => {
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public.pierrot_conversations FROM PUBLIC, anon, authenticated;'
    );
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public.pierrot_messages FROM PUBLIC, anon, authenticated;'
    );
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public.pierrot_events FROM PUBLIC, anon, authenticated;'
    );
    expect(migration).toContain('GRANT ALL ON TABLE public.pierrot_conversations TO service_role;');
  });

  it('does not create an anonymous or authenticated read policy', () => {
    expect(migration).not.toMatch(/CREATE POLICY[^;]+TO\s+(anon|authenticated)/i);
  });

  it('extends the event contract for commercial and intent analytics', () => {
    for (const eventName of [
      'intent_classified',
      'offer_viewed',
      'cta_shown',
      'offer_action_clicked',
      'commercial_declined',
      'commercial_returned',
    ]) {
      expect(commercialMigration).toContain(eventName);
    }

    expect(commercialMigration).toContain('GRANT EXECUTE ON FUNCTION public.pierrot_record_event');
  });

  it('allows only the trusted order_paid event and keeps its writer idempotent', () => {
    expect(orderMigration).toContain("'order_paid'");
    expect(orderMigration).toContain('ON CONFLICT (conversation_id, event_key) DO NOTHING');
    expect(orderMigration).toContain('AND session_id = p_session_id');
    expect(orderMigration).toContain('GRANT EXECUTE ON FUNCTION public.pierrot_record_event');
  });

  it('extends Pierrot events for service qualification and subscription CTA clicks', () => {
    for (const eventName of [
      'subscribe_cta_clicked',
      'service_inquiry_started',
      'service_need_selected',
      'service_inquiry_qualified',
      'service_contact_consent',
      'service_inquiry_submitted',
      'service_inquiry_received',
      'unframed_request_submitted',
      'unframed_purchase_confirmed',
    ]) {
      expect(serviceEventsMigration).toContain(eventName);
    }
  });

  it('keeps subscription analytics and service leads in separate private tables', () => {
    expect(subscriptionEventsMigration).toContain(
      'CREATE TABLE IF NOT EXISTS public.subscription_events'
    );
    expect(subscriptionEventsMigration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(subscriptionEventsMigration).toContain(
      'REVOKE ALL ON TABLE public.subscription_events FROM PUBLIC, anon, authenticated'
    );

    expect(serviceLeadsMigration).toContain('CREATE TABLE IF NOT EXISTS public.art_service_leads');
    expect(serviceLeadsMigration).toContain(
      "'new', 'qualified', 'contact_requested', 'contacted', 'closed'"
    );
    expect(serviceLeadsMigration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(serviceLeadsMigration).toContain(
      'REVOKE ALL ON TABLE public.art_service_leads FROM PUBLIC, anon, authenticated'
    );
    expect(serviceLeadsMigration).not.toMatch(/(CREATE|ALTER|INSERT INTO)[^;]*access_requests/i);
  });

  it('defines idempotent, session-checked write functions and retention cleanup', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.pierrot_append_message');
    expect(migration).toContain('ON CONFLICT (conversation_id, event_key) DO NOTHING');
    expect(migration).toContain('AND session_id = p_session_id');
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.purge_expired_pierrot_conversations'
    );
  });
});
