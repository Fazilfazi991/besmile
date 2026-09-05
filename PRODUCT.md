# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

BSmile CRM serves clinical, operational, finance, CRM, management, and executive staff. Directors may be away from the office and need an immediate, truthful view of company health; general managers remain daily operational users.

## Product Purpose

BSmile CRM brings patient, lead, sales, finance, workforce, task, and internal communication workflows into one authenticated business system. Success means each role sees the work and information it is responsible for without crossing permission boundaries.

## Operating Context

The product is a responsive authenticated Next.js application backed by Supabase. It is used on desktop and mobile, with a compact 60px application header, contextual back navigation, permission-filtered modules, and a five-item mobile bottom navigation.

## Capabilities and Constraints

- Role identity and granted permissions are separate concerns.
- Director executive information must use existing repositories, RLS, and canonical CRM/Finance definitions.
- The Director receives a role-specific executive overview at the existing management landing route.
- General Manager, administrators, clinicians, employees, and interns retain their current dashboards and routes.
- Executive metrics must never use demo, placeholder, or invented values.
- Chairman support is a future extension; this work does not create or migrate roles, users, permissions, schema, RLS, or APIs.

## Brand Commitments

The product name is BSmile CRM. The approved interface uses BSmile teal, light professional surfaces, restrained supporting colors, semantic Lucide icons, compact cards, subtle borders, and minimal depth.

## Evidence on Hand

- Approved Director dashboard screenshot supplied in the request.
- Structural HTML reference supplied in the request; its demo figures, people, navigation, currency assumption, and fake icons are explicitly non-authoritative.
- Existing production UI, data access, permissions, migrations, tests, and semantic icon map in this repository.

## Product Principles

- Show role-relevant truth first.
- Preserve operational workflows while adding executive visibility.
- Reuse canonical business definitions and permission boundaries.
- Keep important information compact, scannable, and responsive.
- Make missing or unavailable data explicit instead of fabricating it.

## Accessibility & Inclusion

Interactive controls must remain keyboard accessible, status must not rely on color alone, charts require textual labels, and layouts must avoid page-level horizontal scrolling on mobile.
