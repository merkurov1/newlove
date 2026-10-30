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
const checkoutEventsMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-29_add_pierrot_checkout_events.sql'),
  'utf8'
);
const repairMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-30_repair_pierrot_event_constraint.sql'),
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
const extractionStatusMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-30_normalize_brain_extraction_status.sql'),
  'utf8'
);
const brainRetrievalEventMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-30_add_brain_retrieval_event.sql'),
  'utf8'
);
const commercialFunnelMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-30_add_commercial_funnel_events.sql'),
  'utf8'
);
const offerPolicyMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-30_create_pierrot_offer_policies.sql'),
  'utf8'
);
const answerQualityMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-30_add_answer_quality_events.sql'),
  'utf8'
);
const analyticsViewsMigration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-10-30_create_pierrot_analytics_views.sql'),
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

  it('separates planner selection from checkout initiation and confirmed payment', () => {
    expect(checkoutEventsMigration).toContain("'offer_selected'");
    expect(checkoutEventsMigration).toContain("'checkout_started'");
    expect(checkoutEventsMigration).toContain("'order_paid'");
    expect(checkoutEventsMigration).toContain(
      'ON CONFLICT (conversation_id, event_key) DO NOTHING'
    );
    expect(checkoutEventsMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.pierrot_record_event'
    );
  });

  it('repairs the constraint without deleting historical rows', () => {
    expect(repairMigration).toContain('2026-10-30');
    expect(repairMigration).toContain("'offer_selected'");
    expect(repairMigration).toContain("'checkout_started'");
    expect(repairMigration).toContain('NOT VALID');
    expect(repairMigration).not.toMatch(/DELETE\s+FROM\s+public\.pierrot_events/i);
    expect(repairMigration).toContain('GRANT EXECUTE ON FUNCTION public.pierrot_record_event');
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

  it('normalizes legacy extraction status without deleting Brain data', () => {
    expect(extractionStatusMigration).toContain("SET extraction_status = 'complete'");
    expect(extractionStatusMigration).toContain("WHERE source_type = 'article'");
    expect(extractionStatusMigration).toContain("WHERE extraction_status = 'ok'");
    expect(extractionStatusMigration).not.toMatch(/DELETE\s+FROM\s+public\.knowledge_documents/i);
    expect(extractionStatusMigration).not.toMatch(/DELETE\s+FROM\s+public\.knowledge_chunks/i);
  });

  it('adds an owner-only Brain retrieval trace event without deleting history', () => {
    expect(brainRetrievalEventMigration).toContain("'brain_retrieval'");
    expect(brainRetrievalEventMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.pierrot_record_event'
    );
    expect(brainRetrievalEventMigration).toContain(
      'ON CONFLICT (conversation_id, event_key) DO NOTHING'
    );
    expect(brainRetrievalEventMigration).not.toMatch(/DELETE\s+FROM\s+public\.pierrot_events/i);
  });

  it('adds the commercial funnel without deleting historical events', () => {
    for (const name of [
      'interest_detected',
      'offer_eligible',
      'offer_shown',
      'offer_viewed',
      'purchase_completed',
    ]) {
      expect(commercialFunnelMigration).toContain(`'${name}'`);
    }

    expect(commercialFunnelMigration).toContain(
      'ON CONFLICT (conversation_id, event_key) DO NOTHING'
    );
    expect(commercialFunnelMigration).not.toMatch(/DELETE\s+FROM\s+public\.pierrot_events/i);
  });

  it('adds owner-only recommendation policy without duplicating product prices', () => {
    expect(offerPolicyMigration).toContain(
      'CREATE TABLE IF NOT EXISTS public.pierrot_offer_policies'
    );
    expect(offerPolicyMigration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(offerPolicyMigration).toContain(
      'REVOKE ALL ON TABLE public.pierrot_offer_policies FROM PUBLIC, anon, authenticated'
    );
    expect(offerPolicyMigration).toContain('max_shows_per_conversation');
    expect(offerPolicyMigration).toContain('cooldown_turns');
    expect(offerPolicyMigration).toContain('recommendation_copy');
    expect(offerPolicyMigration).not.toMatch(/\bprice\b/i);
    expect(offerPolicyMigration).not.toMatch(/\bcheckout_url\b/i);
  });

  it('adds answer-quality events and normalized analytics views without replacing pierrot_events', () => {
    expect(answerQualityMigration).toContain("'answer_feedback'");
    expect(answerQualityMigration).toContain("'answer_corrected'");
    expect(answerQualityMigration).not.toMatch(/DROP\s+TABLE\s+public\.pierrot_events/i);

    for (const view of [
      'pierrot_v_events',
      'pierrot_v_purchases',
      'pierrot_v_conversation_overview',
      'pierrot_v_offer_funnel',
      'pierrot_v_retrieval_failures',
      'pierrot_v_unanswered_questions',
      'pierrot_v_quality_indicators',
    ]) {
      expect(analyticsViewsMigration).toContain(`public.${view}`);
    }

    expect(analyticsViewsMigration).toContain('security_invoker = true');
    expect(analyticsViewsMigration).toContain(
      'REVOKE ALL ON public.pierrot_v_events FROM PUBLIC, anon, authenticated'
    );
  });
});
